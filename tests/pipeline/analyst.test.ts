import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { buildBriefing, computeAnalystMetrics, generateBriefing, loadLabels } from "@/lib/agents/analyst";
import { executeTool } from "@/lib/agents/executor";
import { DemoDb, seedDemoData, type Row } from "@/lib/demo";
import { DEMO_ORG_ID, DEMO_OTHER_ORG_ID } from "@/lib/demo/config";
import { switchDemoVertical } from "@/lib/demo/verticals";
import { resolveTenantConfig } from "@/lib/industry/packs";

const NOW = new Date("2026-10-14T18:00:00.000Z");
const DAY = 86_400_000;
const HOUR = 3_600_000;
const ago = (ms: number): string => new Date(NOW.getTime() - ms).toISOString();

let db: DemoDb;
const ctxFor = (org: string) => ({ organizationId: org, db: db.asClient(), agent: "analyst" as const, now: NOW });

async function ins(table: string, row: Row): Promise<string> {
  const id = (row.id as string | undefined) ?? randomUUID();
  const res = await db.from(table).insert({ ...row, id });
  if (res.error) throw new Error(`${table}: ${res.error.message}`);
  return id;
}
const wipe = (org: string) => {
  for (const t of ["activities", "agent_actions", "budget_services", "budget_members", "budgets", "bookings", "opportunities", "contacts", "items"]) {
    db.tables[t] = db.tables[t].filter((r) => r.organization_id !== org);
  }
};

beforeEach(() => {
  db = new DemoDb({ now: () => NOW });
  seedDemoData(db, NOW);
});

// Conjunto de datos de 30 dias con cifras conocidas, escrito en la segunda organizacion.
async function handcrafted(org: string) {
  wipe(org);
  const contact = (ageMs: number) => ins("contacts", { organization_id: org, full_name: "Contacto Prueba", created_at: ago(ageMs) });
  const c1 = await contact(10 * DAY);
  const c2 = await contact(5 * DAY);
  await contact(3 * DAY); // sin atencion
  await contact(40 * DAY); // fuera del periodo
  const act = (contact_id: string, type: string, at: string, extra: Row = {}) =>
    ins("activities", { organization_id: org, contact_id, type, title: "x", status: "completed", performed_by_type: "human", performed_by_id: "u", created_at: at, ...extra });
  await act(c1, "note", ago(10 * DAY - 2 * HOUR));
  await act(c1, "call", ago(8 * DAY)); // la primera es la de +2 h
  await act(c2, "call", ago(5 * DAY - 6 * HOUR));

  const opp = (stage: string, value: number, createdAgo: number, closedAgo: number | null) =>
    ins("opportunities", { organization_id: org, contact_id: c1, title: `Opp ${stage} ${value}`, stage, value, created_at: ago(createdAgo), closed_at: closedAgo === null ? null : ago(closedAgo) });
  await opp("won", 1000, 30 * DAY, 5 * DAY);
  await opp("won", 2000, 40 * DAY, 20 * DAY);
  await opp("lost", 900, 25 * DAY, 10 * DAY);
  await opp("lost", 800, 80 * DAY, 45 * DAY); // fuera del periodo
  const fresh = await opp("lead", 500, 2 * DAY, null);
  const stale16 = await opp("negotiation", 700, 30 * DAY, null);
  const stale14 = await opp("proposal", 300, 30 * DAY, null);
  const never = await opp("contacted", 100, 20 * DAY, null);
  await act(c1, "note", ago(1 * DAY), { opportunity_id: fresh });
  await act(c1, "note", ago(16 * DAY), { opportunity_id: stale16 });
  await act(c1, "note", ago(14 * DAY), { opportunity_id: stale14 });

  const budget = (status: string, createdAgo: number) =>
    ins("budgets", { organization_id: org, budget_number: `P-${randomUUID().slice(0, 6)}`, responsible_name: "R", status, expires_at: ago(-5 * DAY), created_at: ago(createdAgo) });
  await budget("accepted", 3 * DAY);
  await budget("active", 4 * DAY);
  await budget("expired", 6 * DAY);
  await budget("draft", 2 * DAY); // los borradores no cuentan
  await budget("accepted", 50 * DAY); // fuera del periodo

  const booking = (status: string, scheduledAgo: number) =>
    ins("bookings", { organization_id: org, scheduled_at: ago(scheduledAgo), status, created_at: ago(scheduledAgo + DAY) });
  await booking("completed", 2 * DAY);
  await booking("completed", 4 * DAY);
  await booking("completed", 6 * DAY);
  await booking("no_show", 8 * DAY);
  await booking("no_show", 60 * DAY); // fuera del periodo
  await booking("pending", 1 * DAY); // sin resolver: no cuenta

  const action = (status: string) => ins("agent_actions", { organization_id: org, agent_name: "sales", action_type: "update_stage", payload: {}, requires_approval: true, status });
  await action("pending");
  await action("pending");
  await action("approved");
  return { fresh, stale16, stale14, never };
}

describe("ANL-01: las cifras del reporte coinciden con calculos de control", () => {
  it("conjunto de 30 dias con resultados conocidos (en otra organizacion, sin fugas)", async () => {
    const ids = await handcrafted(DEMO_OTHER_ORG_ID);
    const m = await computeAnalystMetrics(ctxFor(DEMO_OTHER_ORG_ID), 30);
    expect(m.first_response).toEqual({ new_contacts: 3, attended: 2, unattended: 1, avg_hours: 4 });
    expect(m.opportunity_conversion).toEqual({ won: 2, lost: 1, closed: 3, rate_pct: 66.7 });
    expect(m.quote_conversion).toEqual({ issued: 3, accepted: 1, rate_pct: 33.3 });
    expect(m.no_show).toEqual({ completed: 3, no_show: 1, rate_pct: 25 });
    expect(m.pipeline.open_count).toBe(4);
    expect(m.pipeline.open_value).toBe(1600);
    expect(m.pipeline.won_in_period).toEqual({ count: 2, value: 3000 });
    expect(m.stale.count).toBe(2);
    expect(m.stale.value).toBe(800);
    expect(m.stale.items.map((i) => i.id)).toEqual([ids.never, ids.stale16]);
    expect(m.stale.items.map((i) => i.days_since_activity)).toEqual([20, 16]);
    expect(m.pending_approvals).toBe(2);
  });

  it("el texto usa exactamente los numeros calculados", async () => {
    await handcrafted(DEMO_OTHER_ORG_ID);
    const labels = await loadLabels(db.asClient(), DEMO_OTHER_ORG_ID);
    const b = buildBriefing(await computeAnalystMetrics(ctxFor(DEMO_OTHER_ORG_ID), 30), labels);
    const text = b.summary;
    expect(text).toContain("promedio 4 h (2 de 3 atendidos)");
    expect(text).toContain("66.7% (ganados: 2 de 3 cierres)");
    expect(text).toContain("33.3% (aceptadas: 1 de 3 emitidas)");
    expect(text).toContain("25% (1 de 4)");
    expect(text).toContain("$1,600 en 4 abiertos");
    expect(text).toContain("$3,000 (2 cierres)");
    // Todo numero del texto proviene de las metricas o de las fechas/etiquetas: no hay cifras ajenas.
    const allowed = new Set(["30", "4", "2", "3", "1", "66.7", "33.3", "25", "1,600", "3,000", "800", "15", "20", "16", "700", "100", "0", "10"]);
    const numbers = text.match(/\d[\d,]*\.?\d*/g) ?? [];
    for (const n of numbers) expect(allowed.has(n.replace(/\.$/, "")), `numero inesperado: ${n}\n${text}`).toBe(true);
    expect(b.sections.alerts.map((a) => a.kind)).toEqual(["stale_opportunities", "pending_approvals", "unattended_contacts", "high_no_show"]);
  });

  it("datos demo de la organizacion principal contra consultas de control independientes", async () => {
    const m = await computeAnalystMetrics(ctxFor(DEMO_ORG_ID), 30);
    const t = (name: string) => db.tables[name].filter((r) => r.organization_id === DEMO_ORG_ID);
    const since = NOW.getTime() - 30 * DAY;
    const inPeriod = (v: unknown) => typeof v === "string" && Date.parse(v) >= since && Date.parse(v) <= NOW.getTime();

    const closed = t("opportunities").filter((o) => (o.stage === "won" || o.stage === "lost") && inPeriod(o.closed_at));
    const won = closed.filter((o) => o.stage === "won").length;
    expect(m.opportunity_conversion.won).toBe(won);
    expect(m.opportunity_conversion.closed).toBe(closed.length);
    expect(m.opportunity_conversion.rate_pct).toBe(closed.length ? Math.round((won / closed.length) * 1000) / 10 : null);

    const open = t("opportunities").filter((o) => !["won", "lost"].includes(o.stage as string));
    expect(m.pipeline.open_count).toBe(open.length);
    expect(m.pipeline.open_value).toBe(open.reduce((a, o) => a + Number(o.value), 0));

    const resolved = t("bookings").filter((b) => inPeriod(b.scheduled_at) && ["completed", "no_show"].includes(b.status as string));
    const ns = resolved.filter((b) => b.status === "no_show").length;
    expect(m.no_show).toEqual({ completed: resolved.length - ns, no_show: ns, rate_pct: resolved.length ? Math.round((ns / resolved.length) * 1000) / 10 : null });

    const issued = t("budgets").filter((b) => b.status !== "draft" && inPeriod(b.created_at));
    const acc = issued.filter((b) => b.status === "accepted").length;
    expect(m.quote_conversion).toEqual({ issued: issued.length, accepted: acc, rate_pct: issued.length ? Math.round((acc / issued.length) * 1000) / 10 : null });

    const fresh = t("contacts").filter((c) => inPeriod(c.created_at));
    const waits = fresh.flatMap((c) => {
      const mine = t("activities")
        .filter((a) => a.contact_id === c.id && a.status === "completed" && ["call", "message", "meeting", "note", "agent_interaction"].includes(a.type as string) && Date.parse(a.created_at as string) >= Date.parse(c.created_at as string))
        .map((a) => Date.parse(a.created_at as string));
      return mine.length ? [Math.min(...mine) - Date.parse(c.created_at as string)] : [];
    });
    expect(m.first_response.new_contacts).toBe(fresh.length);
    expect(m.first_response.attended).toBe(waits.length);
    expect(m.first_response.avg_hours).toBe(waits.length ? Math.round((waits.reduce((a, w) => a + w, 0) / waits.length / HOUR) * 10) / 10 : null);

    const staleIds = open
      .filter((o) => {
        const times = t("activities").filter((a) => a.opportunity_id === o.id).map((a) => Date.parse(a.created_at as string));
        const last = times.length ? Math.max(...times) : Date.parse(o.created_at as string);
        return NOW.getTime() - last >= 15 * DAY;
      })
      .map((o) => o.id)
      .sort();
    expect(m.stale.items.map((i) => i.id).sort()).toEqual(staleIds);
    expect(m.pending_approvals).toBe(t("agent_actions").filter((a) => a.status === "pending").length);
  });

  it("bordes: sin datos y division por cero (no inventa cifras)", async () => {
    wipe(DEMO_OTHER_ORG_ID);
    const m = await computeAnalystMetrics(ctxFor(DEMO_OTHER_ORG_ID), 30);
    expect(m.first_response).toEqual({ new_contacts: 0, attended: 0, unattended: 0, avg_hours: null });
    expect(m.opportunity_conversion.rate_pct).toBeNull();
    expect(m.quote_conversion.rate_pct).toBeNull();
    expect(m.no_show.rate_pct).toBeNull();
    expect(m.pipeline).toEqual({ open_count: 0, open_value: 0, won_in_period: { count: 0, value: 0 } });
    expect(m.stale.count).toBe(0);
    const b = buildBriefing(m, resolveTenantConfig({ industry: "health" }).labels);
    expect(b.summary).toContain("sin datos");
    expect(b.sections.alerts).toEqual([]);
    expect(b.sections.actions[0].text).toMatch(/Sin acciones urgentes/);
    expect(b.summary).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("organizacion distinta no filtra datos: los numeros de una no cambian por la otra", async () => {
    const before = await computeAnalystMetrics(ctxFor(DEMO_ORG_ID), 30);
    await handcrafted(DEMO_OTHER_ORG_ID);
    const after = await computeAnalystMetrics(ctxFor(DEMO_ORG_ID), 30);
    expect(after).toEqual(before);
    const other = await generateBriefing(ctxFor(DEMO_OTHER_ORG_ID), 30);
    expect(other.summary).not.toContain(String(before.pipeline.open_value));
  });
});

describe("ANL-02: oportunidades estancadas en las acciones recomendadas", () => {
  it("una abierta con 15 dias sin actividad aparece de forma explicita; una reciente no", async () => {
    wipe(DEMO_OTHER_ORG_ID);
    const c = await ins("contacts", { organization_id: DEMO_OTHER_ORG_ID, full_name: "Laura Prueba", created_at: ago(40 * DAY) });
    const mk = async (title: string, daysAgo: number) => {
      const id = await ins("opportunities", { organization_id: DEMO_OTHER_ORG_ID, contact_id: c, title, stage: "proposal", value: 1234, created_at: ago(60 * DAY) });
      await ins("activities", { organization_id: DEMO_OTHER_ORG_ID, contact_id: c, opportunity_id: id, type: "note", title: "n", status: "completed", performed_by_type: "human", performed_by_id: "u", created_at: ago(daysAgo * DAY) });
      return id;
    };
    const stale = await mk("Plan estancado", 15);
    await mk("Plan reciente", 14);
    await mk("Plan de ayer", 1);

    const b = await generateBriefing(ctxFor(DEMO_OTHER_ORG_ID), 30);
    const actions = b.sections.actions.map((a) => a.text).join("\n");
    expect(actions).toContain("Plan estancado");
    expect(actions).toContain("15 días sin actividad");
    expect(actions).toContain("Laura Prueba");
    expect(actions).not.toContain("Plan reciente");
    expect(actions).not.toContain("Plan de ayer");
    expect(b.sections.actions.find((a) => a.text.includes("Plan estancado"))?.opportunity_id).toBe(stale);
    expect(b.summary).toContain("Acciones recomendadas");
  });

  it("una oportunidad ganada o perdida sin actividad no es estancada", async () => {
    wipe(DEMO_OTHER_ORG_ID);
    const c = await ins("contacts", { organization_id: DEMO_OTHER_ORG_ID, full_name: "Ana", created_at: ago(90 * DAY) });
    await ins("opportunities", { organization_id: DEMO_OTHER_ORG_ID, contact_id: c, title: "Cerrada vieja", stage: "won", value: 10, created_at: ago(90 * DAY), closed_at: ago(80 * DAY) });
    const b = await generateBriefing(ctxFor(DEMO_OTHER_ORG_ID), 30);
    expect(b.metrics.stale.count).toBe(0);
    expect(b.summary).not.toContain("Cerrada vieja");
  });
});

describe("vocabulario por vertical y herramienta del agente", () => {
  it("el texto usa las etiquetas de la vertical activa (D-13)", async () => {
    switchDemoVertical(db, DEMO_ORG_ID, "real_estate");
    const b = await generateBriefing(ctxFor(DEMO_ORG_ID), 30);
    expect(b.summary).toContain("prospectos");
    expect(b.summary).toContain("operaciones");
    expect(b.summary).not.toMatch(/pacientes|tratamientos/i);
  });

  it("generate_briefing pasa por el ejecutor: solo el analista la tiene y es de solo lectura", async () => {
    const before = JSON.stringify(db.dump());
    const ok = await executeTool("analyst", "generate_briefing", { days: 30 }, ctxFor(DEMO_ORG_ID));
    expect(ok.ok).toBe(true);
    const denied = await executeTool("sales", "generate_briefing", {}, ctxFor(DEMO_ORG_ID));
    expect(denied.ok).toBe(false);
    expect(JSON.stringify(db.dump())).toBe(before);
  });
});
