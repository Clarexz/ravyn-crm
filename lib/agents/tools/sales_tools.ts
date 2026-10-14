import { z } from "zod";
import type { ToolDefinition } from "@/lib/agents/types";
import { check, assertOwned, getOwned, insertActivity, invalid, nowOf, roundMoney, notFound, type Row } from "./shared";

export const OPEN_STAGES = ["lead", "contacted", "qualified", "proposal", "negotiation"] as const;
export const ALL_STAGES = [...OPEN_STAGES, "won", "lost"] as const;
export const DISCOUNT_APPROVAL_THRESHOLD = 10;

const createInput = z
  .object({
    contact_id: z.uuid(),
    title: z.string().trim().min(1).max(200),
    stage: z.enum(OPEN_STAGES).default("lead"),
    value: z.number().min(0).max(1_000_000_000).default(0),
    currency: z.string().trim().length(3).toUpperCase().default("MXN"),
    probability: z.number().int().min(0).max(100).default(0),
    expected_close_date: z.iso.date().optional(),
    discount_percent: z.number().min(0).max(100).optional(),
    notes: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export const createOpportunity: ToolDefinition<z.infer<typeof createInput>> = {
  name: "create_opportunity",
  description:
    "Crea una oportunidad de venta abierta para un contacto. No permite crearla ya ganada o perdida. Un descuento mayor al 10% requiere aprobacion.",
  input: createInput,
  risk: "medium",
  // Critica solo con descuento > 10% (ver isCriticalCall); marcada true para que la Fase 2 la revise.
  critical: true,
  async run(ctx, input) {
    await assertOwned(ctx, "contacts", input.contact_id, "el contacto");
    const notes = [input.notes, input.discount_percent ? `Descuento propuesto: ${input.discount_percent}%` : null]
      .filter(Boolean)
      .join("\n");
    const res = await ctx.db
      .from("opportunities")
      .insert({
        organization_id: ctx.organizationId,
        contact_id: input.contact_id,
        title: input.title,
        stage: input.stage,
        value: input.value,
        currency: input.currency,
        probability: input.probability,
        expected_close_date: input.expected_close_date ?? null,
        notes: notes || null,
      })
      .select()
      .single();
    const opportunity = check(res) as Row;
    await insertActivity(ctx, {
      type: "agent_interaction",
      title: "Oportunidad creada por agente",
      contact_id: input.contact_id,
      opportunity_id: opportunity.id as string,
    });
    return { opportunity };
  },
};

const stageInput = z
  .object({
    opportunity_id: z.uuid(),
    stage: z.enum(ALL_STAGES),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const updateStage: ToolDefinition<z.infer<typeof stageInput>> = {
  name: "update_stage",
  description:
    "Cambia la etapa de una oportunidad y registra el cambio en el historial. Pasar a won o lost fija closed_at y requiere aprobacion.",
  input: stageInput,
  risk: "high",
  critical: true,
  async run(ctx, input) {
    const opp = await getOwned(ctx, "opportunities", input.opportunity_id, "la oportunidad");
    const from = opp.stage as string;
    if (from === input.stage) return { changed: false, opportunity_id: input.opportunity_id, stage: from };
    const closing = input.stage === "won" || input.stage === "lost";
    const patch: Row = {
      stage: input.stage,
      closed_at: closing ? nowOf(ctx).toISOString() : null,
    };
    if (input.stage === "won") patch.probability = 100;
    if (input.stage === "lost") patch.probability = 0;
    const res = await ctx.db
      .from("opportunities")
      .update(patch)
      .eq("organization_id", ctx.organizationId)
      .eq("id", input.opportunity_id)
      .select()
      .single();
    const opportunity = check(res) as Row;
    await insertActivity(ctx, {
      type: "stage_change",
      title: `Etapa: ${from} a ${input.stage}`,
      description: input.reason ?? null,
      contact_id: (opp.contact_id as string | null) ?? null,
      opportunity_id: input.opportunity_id,
    });
    return { changed: true, from, to: input.stage, opportunity };
  },
};

const quoteInput = z
  .object({
    items: z
      .array(
        z
          .object({
            item_id: z.uuid(),
            quantity: z.number().int().min(1).max(10_000),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    discount_percent: z.number().min(0).max(100).default(0),
  })
  .strict();

export const calculateQuote: ToolDefinition<z.infer<typeof quoteInput>> = {
  name: "calculate_quote",
  description:
    "Calcula una cotizacion con items del catalogo de la organizacion: subtotal, descuento y total. Solo calcula, no guarda nada. Un descuento mayor al 10% requiere aprobacion.",
  input: quoteInput,
  risk: "low",
  // Critica solo con descuento > 10% (ver isCriticalCall); marcada true para que la Fase 2 la revise.
  critical: true,
  async run(ctx, input) {
    const ids = Array.from(new Set(input.items.map((i) => i.item_id)));
    const res = await ctx.db
      .from("items")
      .select("id, name, price, active")
      .eq("organization_id", ctx.organizationId)
      .in("id", ids);
    const found = (check(res) ?? []) as Array<{ id: string; name: string; price: number | string; active: boolean }>;
    const byId = new Map(found.map((r) => [r.id, r]));
    const lines = input.items.map((line) => {
      const item = byId.get(line.item_id);
      if (!item) throw notFound("el item del catalogo");
      if (!item.active) throw invalid(`El item "${item.name}" no esta activo.`);
      const unit = Number(item.price);
      return {
        item_id: item.id,
        name: item.name,
        quantity: line.quantity,
        unit_price: roundMoney(unit),
        line_total: roundMoney(unit * line.quantity),
      };
    });
    const subtotal = roundMoney(lines.reduce((s, l) => s + l.line_total, 0));
    const discount = roundMoney((subtotal * input.discount_percent) / 100);
    return {
      lines,
      subtotal,
      discount_percent: input.discount_percent,
      discount_amount: discount,
      total: roundMoney(subtotal - discount),
      requires_approval: input.discount_percent > DISCOUNT_APPROVAL_THRESHOLD,
    };
  },
};
