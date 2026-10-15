import { z } from "zod";
import type { ToolContext, ToolDefinition } from "@/lib/agents/types";
import { check, nowOf, roundMoney, type Row } from "./shared";
import { ALL_STAGES, OPEN_STAGES } from "./sales_tools";

const DAY_MS = 86_400_000;

const staleInput = z
  .object({
    days: z.number().int().min(1).max(365).default(7),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();

export const findStaleOpportunities: ToolDefinition<z.infer<typeof staleInput>> = {
  name: "find_stale_opportunities",
  description:
    "Lista oportunidades abiertas sin ninguna actividad en los ultimos N dias (si nunca tuvieron actividad, cuenta desde su creacion), de la mas antigua a la mas reciente.",
  input: staleInput,
  risk: "low",
  critical: false,
  async run(ctx, input) {
    const now = nowOf(ctx);
    const cutoff = new Date(now.getTime() - input.days * DAY_MS);
    const oppRes = await ctx.db
      .from("opportunities")
      .select("id, contact_id, title, stage, value, currency, created_at")
      .eq("organization_id", ctx.organizationId)
      .in("stage", [...OPEN_STAGES])
      .limit(1000);
    const opps = (check(oppRes) ?? []) as Array<Row & { id: string; created_at: string }>;
    if (opps.length === 0) return { days: input.days, count: 0, opportunities: [] };

    const actRes = await ctx.db
      .from("activities")
      .select("opportunity_id, created_at")
      .eq("organization_id", ctx.organizationId)
      .in("opportunity_id", opps.map((o) => o.id))
      .order("created_at", { ascending: false })
      .limit(10_000);
    const last = new Map<string, number>();
    for (const a of (check(actRes) ?? []) as Array<{ opportunity_id: string; created_at: string }>) {
      const t = Date.parse(a.created_at);
      if (t > (last.get(a.opportunity_id) ?? 0)) last.set(a.opportunity_id, t);
    }
    const stale = opps
      .map((o) => {
        const lastAt = last.get(o.id) ?? Date.parse(o.created_at);
        return { ...o, last_activity_at: new Date(lastAt).toISOString(), lastAt };
      })
      .filter((o) => o.lastAt <= cutoff.getTime())
      .sort((a, b) => a.lastAt - b.lastAt)
      .slice(0, input.limit)
      .map(({ lastAt, ...o }) => ({ ...o, days_since_activity: Math.floor((now.getTime() - lastAt) / DAY_MS) }));
    return { days: input.days, count: stale.length, opportunities: stale };
  },
};

type CountResult = { count: number | null; error: { message: string } | null };
interface CountQuery extends PromiseLike<CountResult> {
  eq(column: string, value: string): CountQuery;
  gte(column: string, value: string): CountQuery;
  lte(column: string, value: string): CountQuery;
  in(column: string, values: readonly string[]): CountQuery;
}

async function countRows(
  ctx: ToolContext,
  table: string,
  refine: (q: CountQuery) => CountQuery = (q) => q,
): Promise<number> {
  const base = (
    ctx.db.from(table).select("id", { count: "exact", head: true }) as unknown as CountQuery
  ).eq("organization_id", ctx.organizationId);
  const res = await refine(base);
  if (res.error) throw new Error(`db: ${res.error.message}`);
  return res.count ?? 0;
}

const metricsInput = z.object({ days: z.number().int().min(1).max(365).default(30) }).strict();

export const getOrgMetrics: ToolDefinition<z.infer<typeof metricsInput>> = {
  name: "get_org_metrics",
  description:
    "Devuelve metricas reales de la organizacion: contactos, pipeline por etapa, valor abierto y ganado, citas y tareas pendientes. 'days' define el periodo de las metricas recientes.",
  input: metricsInput,
  risk: "low",
  critical: false,
  async run(ctx, input) {
    const now = nowOf(ctx);
    const since = new Date(now.getTime() - input.days * DAY_MS).toISOString();
    const nowIso = now.toISOString();

    const [totalContacts, newContacts, pendingTasks, upcomingBookings] = await Promise.all([
      countRows(ctx, "contacts"),
      countRows(ctx, "contacts", (q) => q.gte("created_at", since)),
      countRows(ctx, "activities", (q) => q.eq("type", "task").eq("status", "pending")),
      countRows(ctx, "bookings", (q) => q.gte("scheduled_at", nowIso).in("status", ["pending", "confirmed"])),
    ]);

    const byStage: Record<string, number> = {};
    for (const stage of ALL_STAGES) byStage[stage] = await countRows(ctx, "opportunities", (q) => q.eq("stage", stage));

    const bookingsByStatus: Record<string, number> = {};
    for (const status of ["pending", "confirmed", "cancelled", "completed", "no_show"]) {
      bookingsByStatus[status] = await countRows(ctx, "bookings", (q) =>
        q.eq("status", status).gte("scheduled_at", since).lte("scheduled_at", nowIso),
      );
    }

    // Sumas de valor: se leen las columnas necesarias y se suman aqui.
    const oppRes = await ctx.db
      .from("opportunities")
      .select("stage, value, closed_at")
      .eq("organization_id", ctx.organizationId)
      .limit(10_000);
    const opps = (check(oppRes) ?? []) as Array<{ stage: string; value: number | string; closed_at: string | null }>;
    let openValue = 0;
    let wonValue = 0;
    let wonCount = 0;
    for (const o of opps) {
      const v = Number(o.value) || 0;
      if ((OPEN_STAGES as readonly string[]).includes(o.stage)) openValue += v;
      if (o.stage === "won" && o.closed_at && o.closed_at >= since) {
        wonValue += v;
        wonCount++;
      }
    }

    return {
      period_days: input.days,
      generated_at: nowIso,
      contacts: { total: totalContacts, new_in_period: newContacts },
      opportunities: {
        by_stage: byStage,
        open_value: roundMoney(openValue),
        won_in_period: { count: wonCount, value: roundMoney(wonValue) },
      },
      bookings: { upcoming: upcomingBookings, in_period_by_status: bookingsByStatus },
      tasks: { pending: pendingTasks },
    };
  },
};
