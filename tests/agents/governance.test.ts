import { beforeEach, describe, expect, it } from "vitest";
import { approveAction, decideApproval, executeToolGoverned, listActions, rejectAction } from "@/lib/agents/governance";
import type { ToolName } from "@/lib/agents/permissions";
import type { AgentAutonomy } from "@/lib/agents/types";
import { IDS, NOW, ORG_A, ORG_B, createFakeDb, type FakeDb, type FakeRow } from "./fakeDb";

let fake: FakeDb;
const USER = "00000000-0000-4000-8000-0000000000a1";

function setAutonomy(org: string, level: AgentAutonomy | undefined | string) {
  const row = fake.tables.organizations.find((o) => o.id === org)!;
  row.settings = { ...(row.settings as object), ...(level === undefined ? {} : { agent_autonomy: level }) };
}
const ctxOf = (org = ORG_A) => ({ organizationId: org, db: fake.asClient(), now: NOW });
const actions = (): FakeRow[] => fake.tables.agent_actions;
const discountOpp = (pct = 20) => ({ contact_id: IDS.contactA1, title: "Blanqueamiento", value: 4800, discount_percent: pct });

beforeEach(() => {
  fake = createFakeDb();
});

describe("HITL-01: una accion critica queda pendiente", () => {
  it("un descuento del 20% no toca las tablas de negocio y crea agent_actions pending", async () => {
    const before = fake.snapshot();
    const res = await executeToolGoverned("sales", "create_opportunity", discountOpp(), ctxOf());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({ status: "pending_approval", summary: expect.stringContaining("20%") });
    const after = fake.snapshot();
    for (const table of ["opportunities", "contacts", "activities", "bookings", "items"]) {
      expect(after[table]).toEqual(before[table]);
    }
    expect(actions()).toHaveLength(1);
    expect(actions()[0]).toMatchObject({
      organization_id: ORG_A,
      agent_name: "sales",
      action_type: "create_opportunity",
      requires_approval: true,
      status: "pending",
      payload: { tool: "create_opportunity", risk: "high", input: { discount_percent: 20 } },
    });
    expect((actions()[0].payload as { reason: string; summary: string }).reason).toMatch(/10%/);
    expect((res.data as { action_id: string }).action_id).toBe(actions()[0].id);
  });

  it("calculate_quote con descuento mayor al 10% tambien queda pendiente", async () => {
    const res = await executeToolGoverned("sales", "calculate_quote", { items: [{ item_id: IDS.itemA1, quantity: 1 }], discount_percent: 20 }, ctxOf());
    expect(res.ok && (res.data as { status: string }).status).toBe("pending_approval");
  });

  it("las criticas siempre piden aprobacion, incluso en autonomous", async () => {
    setAutonomy(ORG_A, "autonomous");
    const w = await executeToolGoverned("sales", "update_stage", { opportunity_id: IDS.oppA1, stage: "won" }, ctxOf());
    expect(w.ok && (w.data as { status: string }).status).toBe("pending_approval");
    const d = await executeToolGoverned("sales", "create_opportunity", discountOpp(), ctxOf());
    expect(d.ok && (d.data as { status: string }).status).toBe("pending_approval");
    expect(fake.tables.opportunities.find((o) => o.id === IDS.oppA1)!.stage).toBe("proposal");
  });
});

describe("permisos y validacion primero", () => {
  it("sin permiso o con entrada invalida no crea accion", async () => {
    const denied = await executeToolGoverned("analyst", "create_opportunity", discountOpp(), ctxOf());
    expect(denied).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    const invalid = await executeToolGoverned("sales", "create_opportunity", { ...discountOpp(), extra: 1 }, ctxOf());
    expect(invalid).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    const unknown = await executeToolGoverned("sales", "no_existe", {}, ctxOf());
    expect(unknown).toMatchObject({ ok: false, error: { code: "UNKNOWN_TOOL" } });
    expect(actions()).toHaveLength(0);
    expect(fake.writes).toBe(0);
  });

  it("nunca lanza si la base falla", async () => {
    fake.throwTables.add("agent_actions");
    const res = await executeToolGoverned("sales", "create_opportunity", discountOpp(), ctxOf());
    expect(res.ok).toBe(false);
    expect(fake.tables.opportunities).toHaveLength(3);
  });

  it("si no puede registrar la accion pendiente no ejecuta nada", async () => {
    fake.failTables.add("agent_actions");
    const res = await executeToolGoverned("sales", "create_opportunity", discountOpp(), ctxOf());
    expect(res).toMatchObject({ ok: false, error: { code: "EXECUTION_FAILED" } });
    expect(fake.tables.opportunities).toHaveLength(3);
  });
});

describe("niveles de autonomia", () => {
  const T: Array<[string, ToolName, unknown]> = [
    ["lectura", "search_contact", { query: "ma" }],
    ["disponibilidad", "check_availability", {}],
    ["metricas", "get_org_metrics", {}],
    ["log_message", "log_message", {}],
    ["create_contact", "create_contact", {}],
    ["update_contact_notes", "update_contact_notes", {}],
    ["create_task", "create_task", {}],
    ["set_reminder", "set_reminder", {}],
    ["create_booking", "create_booking", {}],
    ["reschedule_booking", "reschedule_booking", {}],
    ["create_opportunity", "create_opportunity", { discount_percent: 5 }],
    ["update_stage a negotiation", "update_stage", { stage: "negotiation" }],
    ["update_stage a won", "update_stage", { stage: "won" }],
    ["update_stage a lost", "update_stage", { stage: "lost" }],
    ["descuento 20%", "create_opportunity", { discount_percent: 20 }],
    ["descuento exacto 10%", "create_opportunity", { discount_percent: 10 }],
  ];
  // [conservative, balanced, autonomous]
  const EXPECT: Record<string, [boolean, boolean, boolean]> = {
    lectura: [false, false, false],
    disponibilidad: [false, false, false],
    metricas: [false, false, false],
    log_message: [false, false, false],
    create_contact: [true, false, false],
    update_contact_notes: [true, false, false],
    create_task: [true, false, false],
    set_reminder: [true, false, false],
    create_booking: [true, true, false],
    reschedule_booking: [true, true, false],
    create_opportunity: [true, true, false],
    "update_stage a negotiation": [true, false, false],
    "update_stage a won": [true, true, true],
    "update_stage a lost": [true, true, true],
    "descuento 20%": [true, true, true],
    "descuento exacto 10%": [true, true, false],
  };
  const levels: AgentAutonomy[] = ["conservative", "balanced", "autonomous"];
  for (const [label, tool, input] of T) {
    it(`matriz: ${label}`, () => {
      levels.forEach((level, i) => {
        expect(decideApproval(level, tool, input).required, `${label} / ${level}`).toBe(EXPECT[label][i]);
      });
    });
  }

  it("el defecto es balanced y un valor invalido tambien", async () => {
    // balanced: crear oportunidad sin descuento queda pendiente; crear contacto se ejecuta.
    const opp = await executeToolGoverned("sales", "create_opportunity", { contact_id: IDS.contactA1, title: "x" }, ctxOf());
    expect(opp.ok && (opp.data as { status: string }).status).toBe("pending_approval");
    setAutonomy(ORG_A, "libertad-total");
    const contact = await executeToolGoverned("receptionist", "create_contact", { full_name: "Nuevo Cliente" }, ctxOf());
    expect(contact.ok && (contact.data as { created: boolean }).created).toBe(true);
  });

  it("conservative frena create_contact; log_message sigue libre", async () => {
    setAutonomy(ORG_A, "conservative");
    const c = await executeToolGoverned("receptionist", "create_contact", { full_name: "Pendiente" }, ctxOf());
    expect(c.ok && (c.data as { status: string }).status).toBe("pending_approval");
    expect(fake.tables.contacts.some((x) => x.full_name === "Pendiente")).toBe(false);
    const log = await executeToolGoverned("sales", "log_message", { contact_id: IDS.contactA1, direction: "inbound", content: "hola" }, ctxOf());
    expect(log.ok).toBe(true);
  });

  it("autonomous ejecuta y deja traza executed sin aprobacion; la autonomia es por organizacion", async () => {
    setAutonomy(ORG_A, "autonomous");
    setAutonomy(ORG_B, "conservative");
    const res = await executeToolGoverned("sales", "create_opportunity", { contact_id: IDS.contactA1, title: "Directa" }, ctxOf());
    expect(res.ok && (res.data as { opportunity: { title: string } }).opportunity.title).toBe("Directa");
    const trace = actions().at(-1)!;
    expect(trace).toMatchObject({ organization_id: ORG_A, requires_approval: false, status: "executed" });
    expect(trace.execution_result).toBeTruthy();
  });

  it("una ejecucion automatica fallida deja traza failed", async () => {
    setAutonomy(ORG_A, "autonomous");
    const res = await executeToolGoverned("sales", "create_opportunity", { contact_id: IDS.contactB1, title: "Ajena" }, ctxOf());
    expect(res.ok).toBe(false);
    expect(actions().at(-1)).toMatchObject({ requires_approval: false, status: "failed" });
  });
});

describe("aprobar y rechazar (nucleo)", () => {
  async function propose(): Promise<string> {
    const res = await executeToolGoverned("sales", "create_opportunity", discountOpp(), ctxOf());
    if (!res.ok) throw new Error("no se pudo proponer");
    return (res.data as { action_id: string }).action_id;
  }
  const base = (id: string, org = ORG_A) => ({ db: fake.asClient(), organizationId: org, userId: USER, actionId: id, isAdmin: true });

  it("HITL-02: aprobar ejecuta una sola vez y refleja el efecto", async () => {
    const id = await propose();
    const out = await approveAction({ ...base(id), notes: "ok", now: new Date(NOW.getTime() + 90_000) });
    expect(out.status).toBe(200);
    expect(out.body.action).toMatchObject({ status: "executed", reviewed_by: USER, review_notes: "ok", review_seconds: 90 });
    const opp = fake.tables.opportunities.find((o) => o.title === "Blanqueamiento");
    expect(opp).toMatchObject({ organization_id: ORG_A, value: 4800 });
    expect(String(opp!.notes)).toContain("20%");
    const again = await approveAction(base(id));
    expect(again.status).toBe(409);
    expect(fake.tables.opportunities.filter((o) => o.title === "Blanqueamiento")).toHaveLength(1);
  });

  it("HITL-03: rechazar deja los datos intactos", async () => {
    const id = await propose();
    const before = fake.snapshot();
    const out = await rejectAction({ ...base(id), notes: "Descuento excesivo", now: new Date(NOW.getTime() + 5_000) });
    expect(out.status).toBe(200);
    expect(out.body.action).toMatchObject({ status: "rejected", review_notes: "Descuento excesivo", reviewed_by: USER, review_seconds: 5 });
    const after = fake.snapshot();
    for (const t of ["opportunities", "contacts", "activities", "bookings", "items"]) expect(after[t]).toEqual(before[t]);
    expect((await approveAction(base(id))).status).toBe(409);
    expect((await rejectAction(base(id))).status).toBe(409);
  });

  it("entrada modificada: valida se aplica; invalida = 400 y sigue pendiente", async () => {
    const id = await propose();
    const bad = await approveAction({ ...base(id), input: { ...discountOpp(), discount_percent: 500 } });
    expect(bad.status).toBe(400);
    expect(actions()[0].status).toBe("pending");
    expect(fake.tables.opportunities).toHaveLength(3);
    const ok = await approveAction({ ...base(id), input: { ...discountOpp(), discount_percent: 8 } });
    expect(ok.status).toBe(200);
    const opp = fake.tables.opportunities.find((o) => o.title === "Blanqueamiento")!;
    expect(String(opp.notes)).toContain("8%");
    expect(actions()[0].payload).toMatchObject({ modified_by_reviewer: true, original_input: { discount_percent: 20 }, input: { discount_percent: 8 } });
  });

  it("si la herramienta falla al aprobar, queda failed con mensaje generico", async () => {
    const id = await propose();
    fake.tables.contacts = fake.tables.contacts.filter((c) => c.id !== IDS.contactA1); // el contacto ya no existe
    const out = await approveAction(base(id));
    expect(out.status).toBe(200);
    expect(out.body.action).toMatchObject({ status: "failed", error_message: expect.stringContaining("NOT_FOUND") });
    expect(fake.tables.opportunities).toHaveLength(3);
  });

  it("doble aprobacion concurrente: una sola ejecucion", async () => {
    const id = await propose();
    const [a, b] = await Promise.all([approveAction(base(id)), approveAction(base(id))]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(fake.tables.opportunities.filter((o) => o.title === "Blanqueamiento")).toHaveLength(1);
  });

  it("aislamiento: otra organizacion no puede ver, aprobar ni rechazar", async () => {
    const id = await propose();
    expect((await approveAction(base(id, ORG_B))).status).toBe(404);
    expect((await rejectAction(base(id, ORG_B))).status).toBe(404);
    expect(actions()[0].status).toBe("pending");
    const listB = await listActions(fake.asClient(), ORG_B);
    expect(listB.body.actions).toEqual([]);
    const listA = await listActions(fake.asClient(), ORG_A, { status: "pending" });
    expect((listA.body.actions as FakeRow[]).map((a) => a.id)).toEqual([id]);
  });

  it("lista: filtra por estado, mas recientes primero y limite", async () => {
    const first = await propose();
    actions()[0].proposed_at = "2026-10-14T10:00:00.000Z";
    const second = await propose();
    actions()[1].proposed_at = "2026-10-14T11:00:00.000Z";
    await rejectAction(base(first));
    const all = (await listActions(fake.asClient(), ORG_A)).body.actions as FakeRow[];
    expect(all.map((a) => a.id)).toEqual([second, first]);
    const pending = (await listActions(fake.asClient(), ORG_A, { status: "pending" })).body.actions as FakeRow[];
    expect(pending.map((a) => a.id)).toEqual([second]);
    expect(((await listActions(fake.asClient(), ORG_A, { limit: 1 })).body.actions as FakeRow[])).toHaveLength(1);
  });
});
