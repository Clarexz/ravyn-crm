import { z } from "zod";
import type { ToolContext, ToolDefinition } from "@/lib/agents/types";
import { check, escapeLike, getOwned, insertActivity, nowOf, quoteOrValue, type Row } from "./shared";

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[\d\s\-().]{6,25}$/, "Telefono invalido");

const searchInput = z
  .object({
    query: z.string().trim().min(2, "La busqueda necesita al menos 2 caracteres").max(100),
    limit: z.number().int().min(1).max(20).default(5),
  })
  .strict();

const CONTACT_COLUMNS = "id, full_name, phone, email, company_name, tags, notes, source, created_at";

const RELATED_PER_CONTACT = 3;

// D-17: los agentes no tienen herramienta para listar citas ni oportunidades; sin sus ids no podrian cancelar,
// reprogramar ni cerrar. Cada contacto trae sus proximas citas vivas y sus oportunidades mas recientes
// (siempre filtradas por organizacion; solo lectura).
async function attachRelated(ctx: ToolContext, contacts: Row[]): Promise<Row[]> {
  if (contacts.length === 0) return contacts;
  const ids = contacts.map((c) => c.id as string);
  const [bookRes, oppRes] = await Promise.all([
    ctx.db
      .from("bookings")
      .select("id, contact_id, scheduled_at, duration_minutes, status")
      .eq("organization_id", ctx.organizationId)
      .in("contact_id", ids)
      .in("status", ["pending", "confirmed"])
      .gte("scheduled_at", nowOf(ctx).toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(200),
    ctx.db
      .from("opportunities")
      .select("id, contact_id, title, stage, value, created_at")
      .eq("organization_id", ctx.organizationId)
      .in("contact_id", ids)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  const bookings = (check(bookRes) ?? []) as Row[];
  const opps = (check(oppRes) ?? []) as Row[];
  return contacts.map((c) => ({
    ...c,
    upcoming_bookings: bookings.filter((b) => b.contact_id === c.id).slice(0, RELATED_PER_CONTACT),
    opportunities: opps
      .filter((o) => o.contact_id === c.id)
      .slice(0, RELATED_PER_CONTACT)
      .map((o) => ({ id: o.id, title: o.title, stage: o.stage, value: o.value })),
  }));
}

export const searchContact: ToolDefinition<z.infer<typeof searchInput>> = {
  name: "search_contact",
  description:
    "Busca contactos de la organizacion por nombre, telefono o correo (coincidencia parcial, sin distinguir mayusculas). Cada contacto incluye sus proximas citas (upcoming_bookings con id) y sus oportunidades recientes (opportunities con id).",
  input: searchInput,
  risk: "low",
  critical: false,
  async run(ctx, input) {
    const pattern = quoteOrValue(`%${escapeLike(input.query)}%`);
    const res = await ctx.db
      .from("contacts")
      .select(CONTACT_COLUMNS)
      .eq("organization_id", ctx.organizationId)
      .or(`full_name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`)
      .order("full_name", { ascending: true })
      .limit(input.limit);
    const contacts = (check(res) ?? []) as Row[];
    return { count: contacts.length, contacts: await attachRelated(ctx, contacts) };
  },
};

const createInput = z
  .object({
    full_name: z.string().trim().min(1).max(200),
    phone: phoneSchema.optional(),
    email: z.string().trim().max(254).pipe(z.email()).optional(),
    company_name: z.string().trim().min(1).max(200).optional(),
    notes: z.string().trim().min(1).max(2000).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  })
  .strict();

export const createContact: ToolDefinition<z.infer<typeof createInput>> = {
  name: "create_contact",
  description:
    "Crea un contacto nuevo. Si ya existe uno con el mismo telefono o correo en la organizacion, lo devuelve sin duplicarlo.",
  input: createInput,
  risk: "low",
  critical: false,
  async run(ctx, input) {
    for (const [column, value] of [
      ["email", input.email],
      ["phone", input.phone],
    ] as const) {
      if (!value) continue;
      const dup = await ctx.db
        .from("contacts")
        .select(CONTACT_COLUMNS)
        .eq("organization_id", ctx.organizationId)
        .eq(column, value)
        .limit(1);
      const found = (check(dup) ?? []) as Row[];
      if (found.length > 0) return { created: false, contact: found[0] };
    }
    const res = await ctx.db
      .from("contacts")
      .insert({
        organization_id: ctx.organizationId,
        full_name: input.full_name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        company_name: input.company_name ?? null,
        notes: input.notes ?? null,
        tags: input.tags ?? [],
        source: "agent_receptionist",
      })
      .select(CONTACT_COLUMNS)
      .single();
    const contact = check(res) as Row;
    await insertActivity(ctx, {
      type: "agent_interaction",
      title: "Contacto creado por agente",
      contact_id: contact.id as string,
    });
    return { created: true, contact };
  },
};

const notesInput = z
  .object({
    contact_id: z.uuid(),
    note: z.string().trim().min(1).max(2000),
  })
  .strict();

export const updateContactNotes: ToolDefinition<z.infer<typeof notesInput>> = {
  name: "update_contact_notes",
  description: "Agrega una nota al final de las notas del contacto (no sobrescribe las existentes).",
  input: notesInput,
  risk: "low",
  critical: false,
  async run(ctx, input) {
    const contact = await getOwned(ctx, "contacts", input.contact_id, "el contacto");
    const stamp = nowOf(ctx).toISOString().slice(0, 10);
    const line = `[${stamp} ${ctx.agent}] ${input.note}`;
    const previous = typeof contact.notes === "string" && contact.notes.length > 0 ? contact.notes : null;
    const notes = previous ? `${previous}\n${line}` : line;
    const res = await ctx.db
      .from("contacts")
      .update({ notes })
      .eq("organization_id", ctx.organizationId)
      .eq("id", input.contact_id)
      .select("id, notes")
      .single();
    const updated = check(res) as Row;
    await insertActivity(ctx, {
      type: "note",
      title: "Nota agregada por agente",
      description: input.note,
      contact_id: input.contact_id,
    });
    return { contact_id: updated.id, notes: updated.notes };
  },
};
