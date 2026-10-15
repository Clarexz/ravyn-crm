// Agente Analista (Fase 5): metricas consolidadas calculadas SOLO desde la base y resumen ejecutivo
// determinista. Ninguna cifra del texto sale de un modelo: todas provienen de AnalystMetrics (D-15).
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext, ToolDefinition } from "@/lib/agents/types";
import { check, nowOf, type Row } from "@/lib/agents/tools/shared";
import { findStaleOpportunities, getOrgMetrics } from "@/lib/agents/tools/analytics_tools";
import { resolveTenantConfig, type Labels } from "@/lib/industry/packs";
import { STAGE_LABELS, STALE_DAYS, isStage } from "@/lib/pipeline/stages";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MAX_ROWS = 10_000;
const MAX_STALE_LISTED = 50;
const MAX_ACTIONS_LISTED = 5;
// Umbral de la regla de alerta (no es una cifra del reporte): a partir de este porcentaje de inasistencias se avisa.
export const NO_SHOW_ALERT_PCT = 20;
// Actividades que cuentan como "primera atencion" a un contacto nuevo.
const ATTENTION_TYPES = ["call", "message", "meeting", "note", "agent_interaction"];

export type StaleItem = {
  id: string;
  title: string;
  stage: string;
  contact_name: string | null;
  value: number;
  currency: string;
  days_since_activity: number;
};

export type AnalystMetrics = {
  period_days: number;
  since: string;
  generated_at: string;
  first_response: { new_contacts: number; attended: number; unattended: number; avg_hours: number | null };
  opportunity_conversion: { won: number; lost: number; closed: number; rate_pct: number | null };
  quote_conversion: { issued: number; accepted: number; rate_pct: number | null };
  no_show: { completed: number; no_show: number; rate_pct: number | null };
  pipeline: { open_count: number; open_value: number; won_in_period: { count: number; value: number } };
  stale: { days: number; count: number; value: number; truncated: boolean; items: StaleItem[] };
  pending_approvals: number;
};

export type BriefingLine = { key: string; label: string; value: string };
export type BriefingAlert = { kind: "stale_opportunities" | "pending_approvals" | "unattended_contacts" | "high_no_show"; severity: "high" | "medium"; text: string; href?: string };
export type BriefingAction = { text: string; opportunity_id?: string; href?: string };

export type Briefing = {
  generated_at: string;
  period_days: number;
  headline: string;
  metrics: AnalystMetrics;
  sections: { metrics: BriefingLine[]; alerts: BriefingAlert[]; actions: BriefingAction[] };
  summary: string;
};

const pct = (num: number, den: number): number | null => (den === 0 ? null : Math.round((num / den) * 1000) / 10);
const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

async function countWhere(db: SupabaseClient, table: string, orgId: string, status: string): Promise<number> {
  const res = await db.from(table).select("id").eq("organization_id", orgId).eq("status", status).limit(MAX_ROWS);
  return (check(res) as unknown[] | null)?.length ?? 0;
}

export async function computeAnalystMetrics(ctx: ToolContext, days = 30, staleDays = STALE_DAYS): Promise<AnalystMetrics> {
  const now = nowOf(ctx);
  const since = new Date(now.getTime() - days * DAY_MS).toISOString();
  const nowIso = now.toISOString();
  const org = ctx.organizationId;

  // Reutiliza las herramientas de lectura ya probadas (cada una filtra por organizacion).
  const base = (await getOrgMetrics.run(ctx, { days })) as {
    opportunities: { by_stage: Record<string, number>; open_value: number; won_in_period: { count: number; value: number } };
  };
  const staleRes = (await findStaleOpportunities.run(ctx, { days: staleDays, limit: MAX_STALE_LISTED })) as {
    count: number;
    opportunities: Array<Row & { id: string; title: string; stage: string; contact_id: string | null; value: number | string; currency: string; days_since_activity: number }>;
  };

  // Primera atencion a contactos nuevos del periodo.
  const contactsRes = await ctx.db.from("contacts").select("id, created_at").eq("organization_id", org).gte("created_at", since).lte("created_at", nowIso).limit(MAX_ROWS);
  const newContacts = (check(contactsRes) ?? []) as Array<{ id: string; created_at: string }>;
  const firstAt = new Map<string, number>();
  if (newContacts.length > 0) {
    const actRes = await ctx.db
      .from("activities")
      .select("contact_id, created_at, type")
      .eq("organization_id", org)
      .in("type", ATTENTION_TYPES)
      .eq("status", "completed")
      .gte("created_at", since)
      .limit(MAX_ROWS);
    const created = new Map(newContacts.map((c) => [c.id, Date.parse(c.created_at)]));
    for (const a of (check(actRes) ?? []) as Array<{ contact_id: string | null; created_at: string }>) {
      if (!a.contact_id || !created.has(a.contact_id)) continue;
      const t = Date.parse(a.created_at);
      if (t < (created.get(a.contact_id) as number)) continue;
      if (t < (firstAt.get(a.contact_id) ?? Infinity)) firstAt.set(a.contact_id, t);
    }
  }
  const waits = newContacts.filter((c) => firstAt.has(c.id)).map((c) => (firstAt.get(c.id) as number) - Date.parse(c.created_at));

  // Conversion de oportunidades cerradas en el periodo.
  const closedRes = await ctx.db.from("opportunities").select("stage").eq("organization_id", org).in("stage", ["won", "lost"]).gte("closed_at", since).lte("closed_at", nowIso).limit(MAX_ROWS);
  const closed = (check(closedRes) ?? []) as Array<{ stage: string }>;
  const won = closed.filter((o) => o.stage === "won").length;
  const lost = closed.length - won;

  // Conversion de cotizaciones emitidas (no borradores) en el periodo.
  const budgetsRes = await ctx.db.from("budgets").select("status").eq("organization_id", org).neq("status", "draft").gte("created_at", since).lte("created_at", nowIso).limit(MAX_ROWS);
  const budgets = (check(budgetsRes) ?? []) as Array<{ status: string }>;
  const accepted = budgets.filter((b) => b.status === "accepted").length;

  // Inasistencias: citas del periodo ya resueltas (completadas o no_show).
  const bookingsRes = await ctx.db.from("bookings").select("status").eq("organization_id", org).in("status", ["completed", "no_show"]).gte("scheduled_at", since).lte("scheduled_at", nowIso).limit(MAX_ROWS);
  const resolved = (check(bookingsRes) ?? []) as Array<{ status: string }>;
  const noShow = resolved.filter((b) => b.status === "no_show").length;

  const staleContactIds = Array.from(new Set(staleRes.opportunities.map((o) => o.contact_id).filter((c): c is string => !!c)));
  const names = new Map<string, string>();
  if (staleContactIds.length > 0) {
    const nRes = await ctx.db.from("contacts").select("id, full_name").eq("organization_id", org).in("id", staleContactIds);
    for (const c of (check(nRes) ?? []) as Array<{ id: string; full_name: string }>) names.set(c.id, c.full_name);
  }
  const items: StaleItem[] = staleRes.opportunities.map((o) => ({
    id: o.id,
    title: o.title,
    stage: o.stage,
    contact_name: o.contact_id ? (names.get(o.contact_id) ?? null) : null,
    value: Number(o.value) || 0,
    currency: o.currency,
    days_since_activity: o.days_since_activity,
  }));

  const openCount = Object.entries(base.opportunities.by_stage).filter(([s]) => s !== "won" && s !== "lost").reduce((a, [, n]) => a + n, 0);

  return {
    period_days: days,
    since,
    generated_at: nowIso,
    first_response: {
      new_contacts: newContacts.length,
      attended: waits.length,
      unattended: newContacts.length - waits.length,
      avg_hours: waits.length === 0 ? null : round1(waits.reduce((a, w) => a + w, 0) / waits.length / HOUR_MS),
    },
    opportunity_conversion: { won, lost, closed: closed.length, rate_pct: pct(won, closed.length) },
    quote_conversion: { issued: budgets.length, accepted, rate_pct: pct(accepted, budgets.length) },
    no_show: { completed: resolved.length - noShow, no_show: noShow, rate_pct: pct(noShow, resolved.length) },
    pipeline: { open_count: openCount, open_value: base.opportunities.open_value, won_in_period: base.opportunities.won_in_period },
    stale: {
      days: staleDays,
      count: staleRes.count,
      value: round2(items.reduce((a, i) => a + i.value, 0)),
      truncated: staleRes.count >= MAX_STALE_LISTED,
      items,
    },
    pending_approvals: await countWhere(ctx.db, "agent_actions", org, "pending"),
  };
}

// ---------------------------------------------------------------- redaccion determinista

const group = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
export function fmtMoney(n: number): string {
  const [int, dec] = Math.abs(round2(n)).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}$${group(int)}${dec === "00" ? "" : `.${dec}`}`;
}
export const fmtPct = (n: number | null): string => (n === null ? "sin datos" : `${String(n).replace(/\.0$/, "")}%`);
const fmtHours = (n: number): string => `${String(n).replace(/\.0$/, "")} h`;
const clean = (s: string, max = 80): string => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
};
const lower = (s: string): string => s.toLocaleLowerCase("es");
const times = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function buildBriefing(m: AnalystMetrics, labels: Labels): Briefing {
  const pipe = lower(labels.pipeline.plural);
  const contacts = lower(labels.contact.plural);
  const bookings = lower(labels.booking.plural);
  const budgets = lower(labels.budget.plural);
  const fr = m.first_response;
  const oc = m.opportunity_conversion;
  const qc = m.quote_conversion;
  const ns = m.no_show;

  const lines: BriefingLine[] = [
    {
      key: "first_response",
      label: `Primera atención a ${contacts} nuevos`,
      value: fr.new_contacts === 0 ? "sin datos (no hubo registros nuevos)" : fr.avg_hours === null ? `ninguno atendido de ${fr.new_contacts}` : `promedio ${fmtHours(fr.avg_hours)} (${fr.attended} de ${fr.new_contacts} atendidos)`,
    },
    { key: "opportunity_conversion", label: `Conversión de ${pipe} cerrados`, value: oc.closed === 0 ? "sin datos (ningún cierre)" : `${fmtPct(oc.rate_pct)} (ganados: ${oc.won} de ${oc.closed} cierres)` },
    { key: "quote_conversion", label: `Conversión de ${budgets}`, value: qc.issued === 0 ? "sin datos (ninguna emitida)" : `${fmtPct(qc.rate_pct)} (aceptadas: ${qc.accepted} de ${qc.issued} emitidas)` },
    { key: "no_show", label: `Inasistencias en ${bookings}`, value: ns.no_show + ns.completed === 0 ? "sin datos (ninguna resuelta)" : `${fmtPct(ns.rate_pct)} (${ns.no_show} de ${ns.no_show + ns.completed})` },
    { key: "pipeline_value", label: `Valor del embudo (${pipe})`, value: `${fmtMoney(m.pipeline.open_value)} en ${m.pipeline.open_count} abiertos` },
    { key: "won", label: `Ganado en el periodo`, value: `${fmtMoney(m.pipeline.won_in_period.value)} (${m.pipeline.won_in_period.count} cierres)` },
    { key: "stale", label: `${labels.pipeline.plural} sin actividad ${m.stale.days}+ días`, value: `${m.stale.count}${m.stale.truncated ? "+" : ""}${m.stale.count > 0 ? ` (${fmtMoney(m.stale.value)} en juego)` : ""}` },
  ];

  const alerts: BriefingAlert[] = [];
  if (m.stale.count > 0) {
    alerts.push({
      kind: "stale_opportunities",
      severity: "high",
      text: `Sin actividad desde hace ${m.stale.days} días o más: ${m.stale.count} ${m.stale.count === 1 ? lower(labels.pipeline.singular) : pipe}${m.stale.truncated ? " (se listan los primeros " + MAX_STALE_LISTED + ")" : ""}.`,
      href: "/pipeline",
    });
  }
  if (m.pending_approvals > 0) {
    alerts.push({ kind: "pending_approvals", severity: "high", text: `${times(m.pending_approvals, "acción de agente espera", "acciones de agentes esperan")} aprobación.`, href: "/agents/inbox" });
  }
  if (fr.unattended > 0) {
    alerts.push({ kind: "unattended_contacts", severity: "medium", text: `Sin ninguna atención registrada: ${fr.unattended} de ${fr.new_contacts} ${contacts} nuevos del periodo.` });
  }
  if (ns.rate_pct !== null && ns.rate_pct >= NO_SHOW_ALERT_PCT) {
    alerts.push({ kind: "high_no_show", severity: "medium", text: `Las inasistencias en ${bookings} son ${fmtPct(ns.rate_pct)} (${ns.no_show} de ${ns.no_show + ns.completed}), por encima del umbral de ${NO_SHOW_ALERT_PCT}%.` });
  }

  const actions: BriefingAction[] = [];
  for (const o of m.stale.items.slice(0, MAX_ACTIONS_LISTED)) {
    const who = o.contact_name ? ` con ${clean(o.contact_name, 60)}` : "";
    actions.push({
      text: `Dar seguimiento a «${clean(o.title)}»${who} (${STAGE_LABELS[isStage(o.stage) ? o.stage : "lead"]}, ${fmtMoney(o.value)}): ${times(o.days_since_activity, "día", "días")} sin actividad.`,
      opportunity_id: o.id,
      href: "/pipeline",
    });
  }
  if (m.stale.count > actions.length) actions.push({ text: `Revisar en el tablero los ${m.stale.count - actions.length} ${pipe} restantes sin actividad.`, href: "/pipeline" });
  if (m.pending_approvals > 0) actions.push({ text: `Revisar ${times(m.pending_approvals, "acción pendiente", "acciones pendientes")} en la bandeja de aprobaciones.`, href: "/agents/inbox" });
  if (fr.unattended > 0) actions.push({ text: `Dar primera atención a ${fr.unattended} de los ${contacts} nuevos que no tienen contacto registrado.` });
  if (ns.rate_pct !== null && ns.rate_pct >= NO_SHOW_ALERT_PCT) actions.push({ text: `Reforzar recordatorios y confirmaciones de ${bookings} para reducir inasistencias.` });
  if (actions.length === 0) actions.push({ text: "Sin acciones urgentes: no hay alertas con los datos del periodo." });

  const headline = alerts.length === 0 ? `Sin alertas en los últimos ${m.period_days} días.` : `${times(alerts.length, "alerta requiere", "alertas requieren")} atención (últimos ${m.period_days} días).`;
  const summary = [
    `Briefing de los últimos ${m.period_days} días`,
    "",
    "Métricas",
    ...lines.map((l) => `- ${l.label}: ${l.value}`),
    "",
    "Alertas de atención prioritaria",
    ...(alerts.length === 0 ? ["- Ninguna."] : alerts.map((a) => `- ${a.text}`)),
    "",
    "Acciones recomendadas",
    ...actions.map((a) => `- ${a.text}`),
  ].join("\n");

  return { generated_at: m.generated_at, period_days: m.period_days, headline, metrics: m, sections: { metrics: lines, alerts, actions }, summary };
}

export async function loadLabels(db: SupabaseClient, organizationId: string): Promise<Labels> {
  const res = await db.from("organizations").select("name, industry, settings").eq("id", organizationId).maybeSingle();
  return resolveTenantConfig(res.error ? null : (res.data as Record<string, unknown> | null)).labels;
}

export async function generateBriefing(ctx: ToolContext, days = 30): Promise<Briefing> {
  const [metrics, labels] = await Promise.all([computeAnalystMetrics(ctx, days), loadLabels(ctx.db, ctx.organizationId)]);
  return buildBriefing(metrics, labels);
}

const briefingInput = z.object({ days: z.number().int().min(1).max(365).default(30) }).strict();

export const generateBriefingTool: ToolDefinition<z.infer<typeof briefingInput>> = {
  name: "generate_briefing",
  description:
    "Genera el briefing ejecutivo de la organizacion: metricas (primera atencion, conversion, inasistencias, valor del embudo, estancadas), alertas y acciones recomendadas. Todas las cifras salen de la base de datos.",
  input: briefingInput,
  risk: "low",
  critical: false,
  async run(ctx, input) {
    return generateBriefing(ctx, input.days);
  },
};
