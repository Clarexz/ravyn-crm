import { z } from "zod";
import type { ToolContext, ToolDefinition } from "@/lib/agents/types";
import { assertOwned, check, insertActivity, nowOf, invalid, notFound } from "./shared";

const dateTime = z.iso.datetime({ offset: true });

// El responsable debe ser un usuario de la MISMA organizacion; uno ajeno se comporta como inexistente.
async function assertAssignee(ctx: ToolContext, userId: string | undefined): Promise<void> {
  if (!userId) return;
  const res = await ctx.db.from("users").select("id").eq("organization_id", ctx.organizationId).eq("id", userId).maybeSingle();
  if (!check(res)) throw notFound("la persona responsable");
}

const taskInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(2000).optional(),
    due_date: dateTime.optional(),
    contact_id: z.uuid().optional(),
    opportunity_id: z.uuid().optional(),
    // Persona de la organizacion responsable de la tarea (p. ej. el asesor de la oportunidad).
    assigned_to: z.uuid().optional(),
  })
  .strict();

export const createTask: ToolDefinition<z.infer<typeof taskInput>> = {
  name: "create_task",
  description: "Crea una tarea pendiente (opcionalmente con fecha limite) ligada a un contacto u oportunidad. Con assigned_to queda asignada a una persona de la organizacion (por ejemplo el asesor de la oportunidad).",
  input: taskInput,
  risk: "low",
  critical: false,
  async run(ctx, input) {
    await assertOwned(ctx, "contacts", input.contact_id, "el contacto");
    await assertOwned(ctx, "opportunities", input.opportunity_id, "la oportunidad");
    await assertAssignee(ctx, input.assigned_to);
    const task = await insertActivity(ctx, {
      type: "task",
      title: input.title,
      description: input.description,
      status: "pending",
      contact_id: input.contact_id,
      opportunity_id: input.opportunity_id,
      due_date: input.due_date ? new Date(input.due_date).toISOString() : null,
      assigned_to: input.assigned_to ?? null,
    });
    return { task };
  },
};

const messageInput = z
  .object({
    contact_id: z.uuid(),
    direction: z.enum(["inbound", "outbound"]),
    content: z.string().trim().min(1).max(4000),
    opportunity_id: z.uuid().optional(),
  })
  .strict();

export const logMessage: ToolDefinition<z.infer<typeof messageInput>> = {
  name: "log_message",
  description: "Registra en el historial un mensaje recibido (inbound) o enviado (outbound) a un contacto.",
  input: messageInput,
  risk: "low",
  critical: false,
  async run(ctx, input) {
    await assertOwned(ctx, "contacts", input.contact_id, "el contacto");
    await assertOwned(ctx, "opportunities", input.opportunity_id, "la oportunidad");
    const activity = await insertActivity(ctx, {
      type: "message",
      title: input.direction === "inbound" ? "Mensaje recibido" : "Mensaje enviado",
      description: input.content,
      contact_id: input.contact_id,
      opportunity_id: input.opportunity_id,
    });
    return { activity };
  },
};

const reminderInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    remind_at: dateTime,
    contact_id: z.uuid().optional(),
    opportunity_id: z.uuid().optional(),
    booking_id: z.uuid().optional(),
  })
  .strict();

export const setReminder: ToolDefinition<z.infer<typeof reminderInput>> = {
  name: "set_reminder",
  description: "Programa un recordatorio futuro (actividad pendiente con fecha) ligado a un contacto, oportunidad o cita.",
  input: reminderInput,
  risk: "low",
  critical: false,
  async run(ctx, input) {
    const when = new Date(input.remind_at);
    if (when <= nowOf(ctx)) throw invalid("La fecha del recordatorio debe ser futura.");
    await assertOwned(ctx, "contacts", input.contact_id, "el contacto");
    await assertOwned(ctx, "opportunities", input.opportunity_id, "la oportunidad");
    await assertOwned(ctx, "bookings", input.booking_id, "la cita");
    const reminder = await insertActivity(ctx, {
      type: "task",
      title: `Recordatorio: ${input.title}`,
      status: "pending",
      contact_id: input.contact_id,
      opportunity_id: input.opportunity_id,
      booking_id: input.booking_id,
      due_date: when.toISOString(),
    });
    return { reminder };
  },
};
