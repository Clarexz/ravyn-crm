import { beforeEach, describe, expect, it } from "vitest";
import { executeTool } from "@/lib/agents/executor";
import { TOOL_NAMES, type ToolName } from "@/lib/agents/permissions";
import { TOOL_REGISTRY, isCriticalCall } from "@/lib/agents/tools";
import type { AgentName, ToolResult } from "@/lib/agents/types";
import { IDS, NOW, ORG_A, ORG_B, createFakeDb, uid, type FakeDb, type FakeRow } from "./fakeDb";

// Un agente autorizado para cada herramienta (la matriz se prueba aparte).
const AGENT_FOR: Record<ToolName, AgentName> = {
  search_contact: "receptionist",
  create_contact: "receptionist",
  update_contact_notes: "receptionist",
  create_opportunity: "sales",
  update_stage: "sales",
  calculate_quote: "sales",
  check_availability: "booking",
  create_booking: "booking",
  reschedule_booking: "booking",
  cancel_booking: "booking",
  create_task: "sales",
  log_message: "sales",
  set_reminder: "follow_up",
  find_stale_opportunities: "follow_up",
  get_org_metrics: "analyst",
  generate_briefing: "analyst",
};

let db: FakeDb;
beforeEach(() => {
  db = createFakeDb();
});

function run(tool: ToolName, input: unknown, org: string = ORG_A, agent: AgentName = AGENT_FOR[tool]): Promise<ToolResult> {
  return executeTool(agent, tool, input, { organizationId: org, db: db.asClient(), now: NOW });
}

async function ok<T = Record<string, unknown>>(tool: ToolName, input: unknown, org: string = ORG_A): Promise<T> {
  const res = await run(tool, input, org);
  if (!res.ok) throw new Error(`${tool} fallo: ${res.error.code} ${res.error.message}`);
  return res.data as T;
}

function expectError(res: ToolResult, code: string): void {
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.error.code).toBe(code);
}

const rows = (table: string): FakeRow[] => db.tables[table];

describe("registro", () => {
  it("tiene una herramienta por cada nombre y los metadatos del plan", () => {
    expect(Object.keys(TOOL_REGISTRY).sort()).toEqual([...TOOL_NAMES].sort());
    for (const name of TOOL_NAMES) expect(TOOL_REGISTRY[name].name).toBe(name);
    expect(TOOL_REGISTRY.update_stage.critical).toBe(true);
    expect(TOOL_REGISTRY.reschedule_booking.risk).toBe("medium");
    for (const n of ["search_contact", "check_availability", "log_message", "get_org_metrics", "find_stale_opportunities"] as const) {
      expect(TOOL_REGISTRY[n].risk).toBe("low");
      expect(TOOL_REGISTRY[n].critical).toBe(false);
    }
  });

  it("isCriticalCall: won/lost y descuento > 10%", () => {
    expect(isCriticalCall("update_stage", { stage: "won" })).toBe(true);
    expect(isCriticalCall("update_stage", { stage: "lost" })).toBe(true);
    expect(isCriticalCall("update_stage", { stage: "qualified" })).toBe(false);
    expect(isCriticalCall("calculate_quote", { discount_percent: 10 })).toBe(false);
    expect(isCriticalCall("calculate_quote", { discount_percent: 10.5 })).toBe(true);
    expect(isCriticalCall("create_opportunity", { discount_percent: 20 })).toBe(true);
    expect(isCriticalCall("create_opportunity", {})).toBe(false);
    expect(isCriticalCall("search_contact", { discount_percent: 99 })).toBe(false);
  });
});

describe("entrada invalida (cada herramienta)", () => {
  const BAD: Record<ToolName, unknown[]> = {
    search_contact: [{}, { query: "a" }, { query: "x".repeat(101) }, { query: "ok", limit: 0 }, { query: "ok", extra: 1 }],
    create_contact: [{}, { full_name: "" }, { full_name: "A", email: "no-es-correo" }, { full_name: "A", phone: "abc" }, { full_name: "A", extra: 1 }],
    update_contact_notes: [{}, { contact_id: "no-uuid", note: "x" }, { contact_id: IDS.contactA1, note: "" }, { contact_id: IDS.contactA1, note: "x".repeat(2001) }],
    create_opportunity: [
      {},
      { contact_id: IDS.contactA1, title: "T", stage: "won" },
      { contact_id: IDS.contactA1, title: "T", value: -1 },
      { contact_id: IDS.contactA1, title: "T", discount_percent: 101 },
      { contact_id: IDS.contactA1, title: "T", currency: "PESOS" },
    ],
    update_stage: [{}, { opportunity_id: IDS.oppA1, stage: "inventada" }, { opportunity_id: "x", stage: "won" }],
    calculate_quote: [{}, { items: [] }, { items: [{ item_id: IDS.itemA1, quantity: 0 }] }, { items: [{ item_id: IDS.itemA1, quantity: 1.5 }] }, { items: [{ item_id: IDS.itemA1, quantity: 1 }], discount_percent: -5 }],
    check_availability: [
      {},
      { date_from: "2026-10-15", date_to: "2026-10-14" },
      { date_from: "2026-10-14", date_to: "2026-12-30" },
      { date_from: "14/10/2026", date_to: "15/10/2026" },
      { date_from: "2026-10-14", date_to: "2026-10-15", duration_minutes: 1 },
    ],
    create_booking: [{}, { contact_id: IDS.contactA1, scheduled_at: "mañana" }, { contact_id: IDS.contactA1, scheduled_at: "2026-10-15T10:00:00Z", duration_minutes: 9999 }],
    reschedule_booking: [{}, { booking_id: IDS.bookingA1 }, { booking_id: IDS.bookingA1, new_scheduled_at: "ayer" }],
    cancel_booking: [{}, { booking_id: "x" }, { booking_id: IDS.bookingA1, reason: "" }, { booking_id: IDS.bookingA1, extra: 1 }],
    create_task: [{}, { title: "" }, { title: "T", due_date: "pronto" }, { title: "T", contact_id: "x" }],
    log_message: [{}, { contact_id: IDS.contactA1, direction: "sideways", content: "x" }, { contact_id: IDS.contactA1, direction: "inbound", content: "" }],
    set_reminder: [{}, { title: "T" }, { title: "T", remind_at: "nunca" }],
    find_stale_opportunities: [{ days: 0 }, { days: 366 }, { limit: 51 }, { dias: 3 }],
    get_org_metrics: [{ days: 0 }, { days: 1000 }, { x: 1 }],
    generate_briefing: [{ days: 0 }, { days: 1000 }, { x: 1 }],
  };

  for (const name of TOOL_NAMES) {
    it(`${name} rechaza entradas invalidas con INVALID_INPUT y sin tocar la base`, async () => {
      for (const input of BAD[name]) {
        expectError(await run(name, input), "INVALID_INPUT");
      }
      expect(db.calls).toEqual([]);
    });
  }

  it("el mensaje de INVALID_INPUT es legible", async () => {
    const res = await run("search_contact", { query: "a" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/search_contact.*query/);
  });
});

describe("contactos", () => {
  it("busca parcialmente por nombre, telefono y correo, solo en la organizacion", async () => {
    const byName = await ok<{ contacts: FakeRow[] }>("search_contact", { query: "mar" });
    expect(byName.contacts.map((c) => c.id)).toEqual([IDS.contactA1]);
    const byPhone = await ok<{ contacts: FakeRow[] }>("search_contact", { query: "3333" });
    expect(byPhone.contacts.map((c) => c.id)).toEqual([IDS.contactA2]);
    const byEmail = await ok<{ contacts: FakeRow[] }>("search_contact", { query: "JUAN@a" });
    expect(byEmail.contacts.map((c) => c.id)).toEqual([IDS.contactA2]);
    const asB = await ok<{ contacts: FakeRow[] }>("search_contact", { query: "maria" }, ORG_B);
    expect(asB.contacts.map((c) => c.id)).toEqual([IDS.contactB1]);
    expect(JSON.stringify(byName)).not.toContain("Secreto de B");
  });

  it("escapa comodines y caracteres de .or()", async () => {
    const lit = await ok<{ contacts: FakeRow[] }>("search_contact", { query: "100%" });
    expect(lit.contacts.map((c) => c.id)).toEqual([IDS.contactA2]);
    const under = await ok<{ contacts: FakeRow[] }>("search_contact", { query: "Perez_Jr" });
    expect(under.contacts).toHaveLength(1);
    const noWildcard = await ok<{ contacts: FakeRow[] }>("search_contact", { query: "Pe_ez" });
    expect(noWildcard.contacts).toHaveLength(0);
    const percentOnly = await ok<{ contacts: FakeRow[] }>("search_contact", { query: "%%" });
    expect(percentOnly.contacts).toHaveLength(0);
    for (const evil of ['x",phone.ilike.%', "a),(b", "x,email.eq.maria@a.mx", "\\\\"]) {
      const r = await ok<{ contacts: FakeRow[] }>("search_contact", { query: `${evil}` });
      expect(r.contacts).toHaveLength(0);
    }
  });

  it("create_contact inserta con organizacion, source y autoria del agente", async () => {
    const data = await ok<{ created: boolean; contact: FakeRow }>("create_contact", { full_name: "Nuevo Cliente", phone: "+52 55 0000 1111" });
    expect(data.created).toBe(true);
    const row = rows("contacts").find((c) => c.id === data.contact.id);
    expect(row).toMatchObject({ organization_id: ORG_A, source: "agent_receptionist", full_name: "Nuevo Cliente" });
    const act = rows("activities").find((a) => a.contact_id === data.contact.id);
    expect(act).toMatchObject({ organization_id: ORG_A, performed_by_type: "agent", performed_by_id: "receptionist" });
  });

  it("create_contact no duplica por correo o telefono, pero ignora los de otra organizacion", async () => {
    const before = rows("contacts").length;
    const dup = await ok<{ created: boolean; contact: FakeRow }>("create_contact", { full_name: "Otra Maria", email: "maria@a.mx" });
    expect(dup).toMatchObject({ created: false });
    expect(dup.contact.id).toBe(IDS.contactA1);
    expect(rows("contacts")).toHaveLength(before);
    const other = await ok<{ created: boolean }>("create_contact", { full_name: "Maria Nueva", email: "maria@b.mx" });
    expect(other.created).toBe(true);
  });

  it("update_contact_notes agrega sin sobrescribir", async () => {
    await ok("update_contact_notes", { contact_id: IDS.contactA1, note: "Prefiere tardes" });
    const notes = rows("contacts").find((c) => c.id === IDS.contactA1)?.notes as string;
    expect(notes).toContain("Cliente frecuente");
    expect(notes).toContain("Prefiere tardes");
    expect(notes.split("\n")).toHaveLength(2);
    await ok("update_contact_notes", { contact_id: IDS.contactA2, note: "Primera nota" });
    expect(rows("contacts").find((c) => c.id === IDS.contactA2)?.notes).toContain("Primera nota");
  });
});

describe("ventas", () => {
  it("create_opportunity crea abierta con organizacion y registra autoria", async () => {
    const data = await ok<{ opportunity: FakeRow }>("create_opportunity", { contact_id: IDS.contactA1, title: "Nueva", value: 500, discount_percent: 15 });
    expect(data.opportunity).toMatchObject({ organization_id: ORG_A, stage: "lead", contact_id: IDS.contactA1 });
    expect(String(data.opportunity.notes)).toContain("15%");
    expect(rows("activities").some((a) => a.opportunity_id === data.opportunity.id && a.performed_by_id === "sales" && a.performed_by_type === "agent")).toBe(true);
  });

  it("update_stage a won fija closed_at y registra stage_change; salir de won lo limpia", async () => {
    const won = await ok<{ changed: boolean; from: string }>("update_stage", { opportunity_id: IDS.oppA1, stage: "won", reason: "Cerro" });
    expect(won).toMatchObject({ changed: true, from: "proposal" });
    const opp = rows("opportunities").find((o) => o.id === IDS.oppA1);
    expect(opp).toMatchObject({ stage: "won", closed_at: NOW.toISOString(), probability: 100 });
    const act = rows("activities").find((a) => a.type === "stage_change");
    expect(act).toMatchObject({ organization_id: ORG_A, opportunity_id: IDS.oppA1, performed_by_type: "agent", performed_by_id: "sales" });
    await ok("update_stage", { opportunity_id: IDS.oppA1, stage: "negotiation" });
    expect(rows("opportunities").find((o) => o.id === IDS.oppA1)).toMatchObject({ stage: "negotiation", closed_at: null });
  });

  it("update_stage a lost fija closed_at; misma etapa no escribe", async () => {
    await ok("update_stage", { opportunity_id: IDS.oppA2, stage: "lost" });
    expect(rows("opportunities").find((o) => o.id === IDS.oppA2)).toMatchObject({ stage: "lost", closed_at: NOW.toISOString() });
    const writes = db.writes;
    const same = await ok<{ changed: boolean }>("update_stage", { opportunity_id: IDS.oppA1, stage: "proposal" });
    expect(same.changed).toBe(false);
    expect(db.writes).toBe(writes);
  });

  it("calculate_quote suma, aplica descuento y no escribe", async () => {
    const q = await ok<Record<string, number | boolean>>("calculate_quote", {
      items: [{ item_id: IDS.itemA1, quantity: 2 }, { item_id: IDS.itemA2, quantity: 3 }],
      discount_percent: 10,
    });
    expect(q).toMatchObject({ subtotal: 1751.5, discount_amount: 175.15, total: 1576.35, requires_approval: false });
    const big = await ok<Record<string, number | boolean>>("calculate_quote", { items: [{ item_id: IDS.itemA1, quantity: 1 }], discount_percent: 20 });
    expect(big).toMatchObject({ subtotal: 500, total: 400, requires_approval: true });
    expect(db.writes).toBe(0);
  });

  it("calculate_quote rechaza items inactivos y de otra organizacion", async () => {
    expectError(await run("calculate_quote", { items: [{ item_id: IDS.itemAInactive, quantity: 1 }] }), "INVALID_INPUT");
    expectError(await run("calculate_quote", { items: [{ item_id: IDS.itemB1, quantity: 1 }] }), "NOT_FOUND");
    expectError(await run("calculate_quote", { items: [{ item_id: uid(999), quantity: 1 }] }), "NOT_FOUND");
  });
});

describe("agenda", () => {
  const range = { date_from: "2026-10-14", date_to: "2026-10-16", duration_minutes: 60, slot_step_minutes: 60 };
  type Avail = { total_slots: number; days: Array<{ date: string; slots: Array<{ start: string; end: string }> }>; business_hours: { start: string; end: string } };

  it("AGT-01: check_availability devuelve slots libres estructurados respetando horario y citas", async () => {
    const data = await ok<Avail>("check_availability", range);
    expect(data.business_hours).toMatchObject({ start: "09:00", end: "18:00" });
    expect(data.days.map((d) => d.date)).toEqual(["2026-10-14", "2026-10-15", "2026-10-16"]);
    const hoursOf = (i: number) => data.days[i].slots.map((s) => s.start.slice(11, 16));
    // Hoy (12:00 UTC ya paso la manana); 14:00-15:00 esta ocupado; 15:00 cancelado no bloquea.
    expect(hoursOf(0)).toEqual(["12:00", "13:00", "15:00", "16:00", "17:00"]);
    expect(hoursOf(1)).toEqual(["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"]);
    expect(data.total_slots).toBe(5 + 9 + 9);
    for (const d of data.days) for (const s of d.slots) {
      expect(Date.parse(s.end) - Date.parse(s.start)).toBe(60 * 60_000);
    }
  });

  it("no genera slots que se solapen con citas ni con fines de semana", async () => {
    const data = await ok<Avail>("check_availability", { date_from: "2026-10-14", date_to: "2026-10-14", duration_minutes: 30, slot_step_minutes: 30 });
    const starts = data.days[0].slots.map((s) => s.start.slice(11, 16));
    expect(starts).toContain("13:30");
    expect(starts).not.toContain("14:00");
    expect(starts).not.toContain("14:30");
    expect(starts).toContain("15:00");
    const weekend = await ok<Avail>("check_availability", { date_from: "2026-10-17", date_to: "2026-10-18" });
    expect(weekend.total_slots).toBe(0);
  });

  it("usa el horario de cada organizacion y no ve citas de la otra", async () => {
    const b = await ok<Avail>("check_availability", { date_from: "2026-10-15", date_to: "2026-10-15", duration_minutes: 60, slot_step_minutes: 60 }, ORG_B);
    expect(b.business_hours).toMatchObject({ start: "10:00", end: "14:00" });
    expect(b.days[0].slots.map((s) => s.start.slice(11, 16))).toEqual(["11:00", "12:00", "13:00"]);
    const a = await ok<Avail>("check_availability", { date_from: "2026-10-15", date_to: "2026-10-15", duration_minutes: 60, slot_step_minutes: 60 });
    expect(a.days[0].slots[0].start.slice(11, 16)).toBe("09:00");
    // Sabado: abierto en B, cerrado en A.
    expect((await ok<Avail>("check_availability", { date_from: "2026-10-17", date_to: "2026-10-17" }, ORG_B)).total_slots).toBeGreaterThan(0);
  });

  it("create_booking agenda con source agent_booking y snapshot del item", async () => {
    const { booking } = await ok<{ booking: FakeRow }>("create_booking", {
      contact_id: IDS.contactA1, item_id: IDS.itemA1, scheduled_at: "2026-10-15T09:00:00Z", duration_minutes: 45,
    });
    expect(booking).toMatchObject({
      organization_id: ORG_A, source: "agent_booking", service_snapshot: "Consulta", cost_at_booking: 500, status: "pending",
    });
    const act = rows("activities").find((a) => a.booking_id === booking.id);
    expect(act).toMatchObject({ performed_by_type: "agent", performed_by_id: "booking" });
    // Ya ocupado: un segundo intento solapado falla.
    expectError(await run("create_booking", { contact_id: IDS.contactA1, scheduled_at: "2026-10-15T09:30:00Z" }), "INVALID_INPUT");
  });

  it("create_booking rechaza solape, fuera de horario, fin de semana y pasado", async () => {
    const base = { contact_id: IDS.contactA1 };
    for (const scheduled_at of [
      "2026-10-14T14:30:00Z", // solape con bookingA1
      "2026-10-14T13:45:00Z", // termina 14:15 y se solapa
      "2026-10-15T08:30:00Z", // antes de abrir
      "2026-10-15T17:45:00Z", // termina despues de cerrar
      "2026-10-17T10:00:00Z", // sabado
      "2026-10-13T10:00:00Z", // pasado
    ]) {
      const res = await run("create_booking", { ...base, scheduled_at });
      expectError(res, "INVALID_INPUT");
    }
    expect(rows("bookings")).toHaveLength(3);
    // Justo al lado de una cita y la cancelada si se permite.
    await ok("create_booking", { ...base, scheduled_at: "2026-10-14T15:00:00Z" });
    await ok("create_booking", { ...base, scheduled_at: "2026-10-14T13:00:00Z" });
  });

  it("reschedule_booking mueve la cita, valida solape y estado", async () => {
    const moved = await ok<{ booking: FakeRow }>("reschedule_booking", { booking_id: IDS.bookingA1, new_scheduled_at: "2026-10-14T14:30:00Z" });
    expect(moved.booking.scheduled_at).toBe("2026-10-14T14:30:00.000Z");
    const other = await ok<{ booking: FakeRow }>("create_booking", { contact_id: IDS.contactA2, scheduled_at: "2026-10-15T10:00:00Z" });
    expectError(await run("reschedule_booking", { booking_id: String(other.booking.id), new_scheduled_at: "2026-10-14T15:00:00Z" }), "INVALID_INPUT");
    expectError(await run("reschedule_booking", { booking_id: IDS.bookingACancelled, new_scheduled_at: "2026-10-16T10:00:00Z" }), "INVALID_INPUT");
    expectError(await run("reschedule_booking", { booking_id: IDS.bookingA1, new_scheduled_at: "2026-10-16T22:00:00Z" }), "INVALID_INPUT");
  });
});

describe("actividades", () => {
  it("create_task crea pendiente con due_date y autoria", async () => {
    const { task } = await ok<{ task: FakeRow }>("create_task", { title: "Llamar", due_date: "2026-10-20T15:00:00Z", contact_id: IDS.contactA1, opportunity_id: IDS.oppA1 });
    expect(task).toMatchObject({ organization_id: ORG_A, type: "task", status: "pending", due_date: "2026-10-20T15:00:00.000Z", performed_by_type: "agent", performed_by_id: "sales" });
  });

  it("log_message registra mensajes entrantes y salientes", async () => {
    const a = await ok<{ activity: FakeRow }>("log_message", { contact_id: IDS.contactA1, direction: "inbound", content: "Hola" });
    expect(a.activity).toMatchObject({ type: "message", title: "Mensaje recibido", status: "completed", performed_by_id: "sales" });
    const b = await ok<{ activity: FakeRow }>("log_message", { contact_id: IDS.contactA1, direction: "outbound", content: "Respuesta" });
    expect(b.activity.title).toBe("Mensaje enviado");
  });

  it("set_reminder crea actividad pendiente con fecha futura; rechaza pasado", async () => {
    const { reminder } = await ok<{ reminder: FakeRow }>("set_reminder", { title: "Dar seguimiento", remind_at: "2026-10-21T10:00:00Z", contact_id: IDS.contactA1 });
    expect(reminder).toMatchObject({ status: "pending", due_date: "2026-10-21T10:00:00.000Z", performed_by_id: "follow_up", organization_id: ORG_A });
    expectError(await run("set_reminder", { title: "x", remind_at: "2026-10-01T10:00:00Z" }), "INVALID_INPUT");
  });
});

describe("analitica", () => {
  it("find_stale_opportunities lista solo abiertas de la organizacion sin actividad reciente", async () => {
    const week = await ok<{ opportunities: Array<{ id: string; days_since_activity: number }> }>("find_stale_opportunities", { days: 7 });
    expect(week.opportunities.map((o) => o.id)).toEqual([IDS.oppA1]);
    expect(week.opportunities[0].days_since_activity).toBe(43);
    const day = await ok<{ opportunities: Array<{ id: string }> }>("find_stale_opportunities", { days: 1 });
    expect(day.opportunities.map((o) => o.id)).toEqual([IDS.oppA1, IDS.oppA2]);
    const b = await ok<{ opportunities: Array<{ id: string }> }>("find_stale_opportunities", { days: 7 }, ORG_B);
    expect(b.opportunities.map((o) => o.id)).toEqual([IDS.oppB1]);
  });

  it("find_stale_opportunities excluye ganadas y perdidas", async () => {
    await ok("update_stage", { opportunity_id: IDS.oppA1, stage: "lost" });
    const r = await ok<{ opportunities: Array<{ id: string }> }>("find_stale_opportunities", { days: 7 });
    expect(r.opportunities).toEqual([]);
  });

  it("get_org_metrics calcula cifras reales por organizacion", async () => {
    type M = {
      contacts: { total: number; new_in_period: number };
      opportunities: { by_stage: Record<string, number>; open_value: number; won_in_period: { count: number; value: number } };
      bookings: { upcoming: number };
      tasks: { pending: number };
    };
    const a = await ok<M>("get_org_metrics", { days: 30 });
    expect(a.contacts).toEqual({ total: 2, new_in_period: 1 });
    expect(a.opportunities.by_stage).toMatchObject({ lead: 1, proposal: 1, won: 0, lost: 0 });
    expect(a.opportunities.open_value).toBe(3000);
    expect(a.bookings.upcoming).toBe(1);
    expect(a.tasks.pending).toBe(1);
    const b = await ok<M>("get_org_metrics", { days: 30 }, ORG_B);
    expect(b.contacts.total).toBe(1);
    expect(b.opportunities.open_value).toBe(77777);
    // Una venta ganada hoy aparece en el periodo.
    await ok("update_stage", { opportunity_id: IDS.oppA1, stage: "won" });
    const after = await ok<M>("get_org_metrics", { days: 30 });
    expect(after.opportunities.won_in_period).toEqual({ count: 1, value: 1000 });
    expect(after.opportunities.open_value).toBe(2000);
  });
});

describe("aislamiento entre organizaciones", () => {
  // Cada caso usa un id de ORG_B desde ORG_A.
  const FOREIGN: Array<[ToolName, unknown]> = [
    ["update_contact_notes", { contact_id: IDS.contactB1, note: "intruso" }],
    ["create_opportunity", { contact_id: IDS.contactB1, title: "Intruso" }],
    ["update_stage", { opportunity_id: IDS.oppB1, stage: "won" }],
    ["create_booking", { contact_id: IDS.contactB1, scheduled_at: "2026-10-15T10:00:00Z" }],
    ["create_booking", { contact_id: IDS.contactA1, item_id: IDS.itemB1, scheduled_at: "2026-10-15T10:00:00Z" }],
    ["reschedule_booking", { booking_id: IDS.bookingB1, new_scheduled_at: "2026-10-16T10:00:00Z" }],
    ["create_task", { title: "x", contact_id: IDS.contactB1 }],
    ["create_task", { title: "x", opportunity_id: IDS.oppB1 }],
    ["log_message", { contact_id: IDS.contactB1, direction: "inbound", content: "x" }],
    ["set_reminder", { title: "x", remind_at: "2026-10-21T10:00:00Z", booking_id: IDS.bookingB1 }],
    ["calculate_quote", { items: [{ item_id: IDS.itemB1, quantity: 1 }] }],
  ];

  it.each(FOREIGN.map((f, i) => [i, f[0], f[1]] as const))("caso %i: %s con id ajeno da NOT_FOUND y no modifica nada", async (_i, tool, input) => {
    const before = db.snapshot();
    expectError(await run(tool, input), "NOT_FOUND");
    expect(db.snapshot()).toEqual(before);
  });

  it("los resultados nunca incluyen datos de la otra organizacion", async () => {
    const outputs = [
      await ok("search_contact", { query: "ma" }),
      await ok("find_stale_opportunities", { days: 1 }),
      await ok("get_org_metrics", { days: 365 }),
      await ok("check_availability", { date_from: "2026-10-14", date_to: "2026-10-20" }),
    ];
    const text = JSON.stringify(outputs);
    for (const leak of [IDS.contactB1, IDS.oppB1, IDS.bookingB1, "Secreto de B", "77777"]) expect(text).not.toContain(leak);
  });

  it("toda escritura lleva organization_id de la sesion", async () => {
    await ok("create_contact", { full_name: "X Persona" });
    await ok("create_task", { title: "t" });
    await ok("create_booking", { contact_id: IDS.contactA1, scheduled_at: "2026-10-16T10:00:00Z" });
    await ok("create_opportunity", { contact_id: IDS.contactA1, title: "o" });
    for (const table of ["contacts", "activities", "bookings", "opportunities"]) {
      for (const r of rows(table)) expect([ORG_A, ORG_B]).toContain(r.organization_id);
    }
    const seed = createFakeDb();
    for (const table of ["contacts", "activities", "bookings", "opportunities"]) {
      const created = rows(table).filter((r) => !seed.tables[table].some((s) => s.id === r.id));
      expect(created.length).toBeGreaterThan(0);
      for (const r of created) expect(r.organization_id).toBe(ORG_A);
    }
  });

  it("el organizationId del modelo no puede inyectarse: campos extra se rechazan", async () => {
    expectError(await run("create_contact", { full_name: "Hack", organization_id: ORG_B }), "INVALID_INPUT");
    expectError(await run("create_task", { title: "Hack", organization_id: ORG_B }), "INVALID_INPUT");
  });
});

describe("errores capturados", () => {
  it("un error de la base se devuelve como EXECUTION_FAILED sin filtrar detalles", async () => {
    db.failTables.add("contacts");
    const res = await run("search_contact", { query: "maria" });
    expectError(res, "EXECUTION_FAILED");
    if (!res.ok) expect(res.error.message).not.toMatch(/simulado|db:|contacts/);
  });

  it("una excepcion lanzada se captura (nunca lanza)", async () => {
    for (const table of ["contacts", "opportunities", "bookings", "activities", "items", "organizations"]) db.throwTables.add(table);
    const inputs: Array<[ToolName, unknown]> = [
      ["search_contact", { query: "maria" }],
      ["create_contact", { full_name: "Zed" }],
      ["update_stage", { opportunity_id: IDS.oppA1, stage: "won" }],
      ["calculate_quote", { items: [{ item_id: IDS.itemA1, quantity: 1 }] }],
      ["check_availability", { date_from: "2026-10-14", date_to: "2026-10-15" }],
      ["create_task", { title: "t" }],
      ["find_stale_opportunities", {}],
      ["get_org_metrics", {}],
      ["generate_briefing", {}],
    ];
    for (const [tool, input] of inputs) {
      const res = await run(tool, input);
      expectError(res, "EXECUTION_FAILED");
      if (!res.ok) expect(res.error.message).not.toMatch(/simulado/);
    }
  });

  it("un fallo al registrar la activity tambien se captura", async () => {
    db.failTables.add("activities");
    expectError(await run("log_message", { contact_id: IDS.contactA1, direction: "inbound", content: "x" }), "EXECUTION_FAILED");
  });

  it("entradas no objeto o nulas no lanzan", async () => {
    for (const bad of [null, undefined, 42, "texto", [], () => 1]) {
      const res = await run("search_contact", bad);
      expectError(res, "INVALID_INPUT");
    }
  });
});
