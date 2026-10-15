import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_ORG_ID, DEMO_OTHER_ORG_ID, DEMO_USER_ID } from "@/lib/demo/config";
import { DemoDb, SCHEMA, getDemoDb, resetDemoDb, seedDemoData, type Row } from "@/lib/demo";
import { zonedParts } from "@/lib/industry/time";

const DAY = 86_400_000;
// Distintos dias de la semana y horas (incluye fin de semana y borde de anio).
const NOWS = [
  "2026-10-14T12:00:00.000Z",
  "2026-10-17T09:00:00.000Z",
  "2026-10-18T20:00:00.000Z",
  "2026-10-19T00:30:00.000Z",
  "2026-12-31T23:59:00.000Z",
  "2027-01-04T16:45:00.000Z",
];

function seeded(nowIso: string): { db: DemoDb; now: Date } {
  const now = new Date(nowIso);
  const db = new DemoDb({ now: () => now });
  seedDemoData(db, now);
  return { db, now };
}

const rows = (db: DemoDb, table: string, org?: string): Row[] =>
  db.tables[table].filter((r) => org === undefined || r.organization_id === org);
const ms = (v: unknown): number => Date.parse(v as string);

describe.each(NOWS)("invariantes de la siembra (now = %s)", (nowIso) => {
  const { db, now } = seeded(nowIso);
  const t0 = now.getTime();

  it("tiene los volumenes esperados", () => {
    expect(rows(db, "organizations")).toHaveLength(2);
    expect(rows(db, "contacts", DEMO_ORG_ID)).toHaveLength(14);
    expect(rows(db, "items", DEMO_ORG_ID).filter((i) => i.active)).toHaveLength(8);
    expect(rows(db, "bookings", DEMO_ORG_ID)).toHaveLength(35);
    expect(rows(db, "opportunities", DEMO_ORG_ID)).toHaveLength(10);
    expect(rows(db, "activities", DEMO_ORG_ID).length).toBeGreaterThanOrEqual(25);
    expect(rows(db, "activities", DEMO_ORG_ID).length).toBeLessThanOrEqual(40);
    expect(rows(db, "agent_actions")).toHaveLength(3);
    expect(rows(db, "budgets", DEMO_ORG_ID)).toHaveLength(4);
  });

  it("todas las claves foraneas apuntan a filas existentes", () => {
    for (const def of Object.values(SCHEMA)) {
      for (const fk of def.fks) {
        for (const row of db.tables[def.name]) {
          const v = row[fk.col];
          if (v === null) continue;
          expect(db.tables[fk.ref].some((r) => r.id === v), `${def.name}.${fk.col}=${String(v)}`).toBe(true);
        }
      }
    }
  });

  it("las referencias entre tablas nunca cruzan organizaciones", () => {
    const orgOf = (table: string, id: unknown): unknown => db.tables[table].find((r) => r.id === id)?.organization_id;
    const refs: Array<[string, string, string]> = [
      ["bookings", "contact_id", "contacts"],
      ["bookings", "item_id", "items"],
      ["opportunities", "contact_id", "contacts"],
      ["activities", "contact_id", "contacts"],
      ["activities", "opportunity_id", "opportunities"],
      ["activities", "booking_id", "bookings"],
      ["budgets", "responsible_id", "contacts"],
      ["budget_members", "budget_id", "budgets"],
      ["budget_services", "budget_member_id", "budget_members"],
      ["budget_services", "service_id", "items"],
    ];
    for (const [table, col, target] of refs) {
      for (const r of db.tables[table]) {
        if (r[col] === null) continue;
        expect(orgOf(target, r[col]), `${table}.${col}`).toBe(r.organization_id);
      }
    }
    for (const u of db.tables.users) expect(u.clinic_id).toBe(u.organization_id);
    const orgs = new Set(db.tables.organizations.map((o) => o.id));
    for (const t of Object.keys(db.tables)) {
      if (t === "organizations" || t === "users") continue;
      for (const r of db.tables[t]) expect(orgs.has(r.organization_id as string), t).toBe(true);
    }
  });

  it("las dos organizaciones tienen datos propios y aislados", () => {
    for (const t of ["contacts", "items", "bookings", "opportunities", "activities", "budgets"]) {
      expect(rows(db, t, DEMO_ORG_ID).length, t).toBeGreaterThan(0);
      expect(rows(db, t, DEMO_OTHER_ORG_ID).length, t).toBeGreaterThan(0);
      expect(rows(db, t, DEMO_ORG_ID).length + rows(db, t, DEMO_OTHER_ORG_ID).length, t).toBe(db.tables[t].length);
    }
    expect(rows(db, "budgets", DEMO_OTHER_ORG_ID)[0].budget_number).toBe("PRES-0001");
    expect(rows(db, "budgets", DEMO_ORG_ID).map((b) => b.budget_number).sort()).toEqual(["PRES-0001", "PRES-0002", "PRES-0003", "PRES-0004"]);
  });

  it("organizacion principal: industria, nombre y settings", () => {
    const org = db.tables.organizations.find((o) => o.id === DEMO_ORG_ID)!;
    expect(org).toMatchObject({ name: "Clinica Demo", industry: "health" });
    const settings = org.settings as { active_modules: string[]; business_hours: Row; agent_autonomy: string };
    expect(settings.business_hours).toEqual({ start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] });
    expect(settings.agent_autonomy).toBe("balanced");
    expect(settings.active_modules).toEqual(expect.arrayContaining(["contacts", "bookings", "pipeline", "activities"]));
  });

  it("bookings: sin solapes dentro de la organizacion, en dias habiles y horario laboral (hora local de la organizacion)", () => {
    for (const org of [DEMO_ORG_ID, DEMO_OTHER_ORG_ID]) {
      const tz = org === DEMO_ORG_ID ? "America/Mexico_City" : "America/Monterrey";
      const hours = org === DEMO_ORG_ID ? [9 * 60, 18 * 60, [1, 2, 3, 4, 5]] : [10 * 60, 14 * 60, [1, 2, 3, 4, 5, 6]];
      const list = rows(db, "bookings", org)
        .map((b) => ({ start: ms(b.scheduled_at), end: ms(b.scheduled_at) + (b.duration_minutes as number) * 60_000 }))
        .sort((a, b) => a.start - b.start);
      for (let i = 1; i < list.length; i++) expect(list[i].start).toBeGreaterThanOrEqual(list[i - 1].end);
      for (const b of list) {
        const s = zonedParts(new Date(b.start), tz);
        const e = zonedParts(new Date(b.end), tz);
        expect((hours[2] as number[]).includes(s.isoWeekday)).toBe(true);
        expect(s.date).toBe(e.date);
        expect(s.minutes).toBeGreaterThanOrEqual(hours[0] as number);
        expect(e.minutes).toBeLessThanOrEqual(hours[1] as number);
      }
    }
  });

  it("bookings: rango -30 a +14 dias, todos los estados y estado coherente con la fecha", () => {
    const list = rows(db, "bookings", DEMO_ORG_ID);
    for (const b of list) {
      expect(ms(b.scheduled_at)).toBeGreaterThanOrEqual(t0 - 31 * DAY);
      expect(ms(b.scheduled_at)).toBeLessThanOrEqual(t0 + 15 * DAY);
      expect(ms(b.created_at)).toBeLessThanOrEqual(t0);
      if (ms(b.scheduled_at) < t0) expect(["completed", "no_show", "cancelled"]).toContain(b.status);
      else expect(["pending", "confirmed", "cancelled"]).toContain(b.status);
    }
    expect(new Set(list.map((b) => b.status))).toEqual(new Set(["pending", "confirmed", "cancelled", "completed", "no_show"]));
    expect(list.some((b) => ms(b.scheduled_at) < t0 - 20 * DAY)).toBe(true);
    expect(list.filter((b) => ms(b.scheduled_at) > t0).length).toBeGreaterThanOrEqual(8);
    expect(new Set(list.map((b) => b.source)).size).toBeGreaterThanOrEqual(3);
  });

  it("bookings: service_snapshot, item_id y cost_at_booking coinciden con el item", () => {
    for (const b of rows(db, "bookings")) {
      const item = db.tables.items.find((i) => i.id === b.item_id)!;
      expect(b.service_snapshot).toBe(item.name);
      expect(b.cost_at_booking).toBe(item.price);
      expect(item.active).toBe(true);
      expect(db.tables.contacts.some((c) => c.id === b.contact_id)).toBe(true);
    }
  });

  it("oportunidades: todas las etapas, abiertas estancadas (>15 dias sin actividad) y cerradas coherentes", () => {
    const opps = rows(db, "opportunities", DEMO_ORG_ID);
    expect(new Set(opps.map((o) => o.stage))).toEqual(new Set(["lead", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]));
    const lastActivity = (id: unknown): number =>
      Math.max(0, ...db.tables.activities.filter((a) => a.opportunity_id === id).map((a) => ms(a.created_at)));
    const open = opps.filter((o) => o.stage !== "won" && o.stage !== "lost");
    const stale = open.filter((o) => (t0 - (lastActivity(o.id) || ms(o.created_at))) / DAY > 15);
    const fresh = open.filter((o) => (t0 - (lastActivity(o.id) || ms(o.created_at))) / DAY <= 15);
    expect(stale.length).toBeGreaterThanOrEqual(3);
    expect(fresh.length).toBeGreaterThanOrEqual(3);
    for (const o of opps) {
      expect(ms(o.created_at)).toBeLessThanOrEqual(t0);
      if (o.stage === "won") expect(o.probability).toBe(100);
      if (o.stage === "lost") expect(o.probability).toBe(0);
      expect(o.closed_at !== null).toBe(o.stage === "won" || o.stage === "lost");
    }
  });

  it("actividades: tipos variados, autoria humana y de agente, tareas pendientes y cambios de estado", () => {
    const acts = rows(db, "activities", DEMO_ORG_ID);
    expect(new Set(acts.map((a) => a.performed_by_type))).toEqual(new Set(["human", "agent"]));
    for (const t of ["note", "call", "message", "meeting", "task", "stage_change", "agent_interaction"]) {
      expect(acts.some((a) => a.type === t), t).toBe(true);
    }
    expect(acts.some((a) => /^Cambio de estado: \w+ -> \w+$/.test(a.title as string) && a.booking_id !== null)).toBe(true);
    const tasks = acts.filter((a) => a.type === "task" && a.status === "pending");
    expect(tasks.length).toBeGreaterThanOrEqual(4);
    expect(tasks.some((t) => ms(t.due_date) < t0)).toBe(true);
    expect(tasks.some((t) => ms(t.due_date) > t0)).toBe(true);
    for (const a of acts) {
      expect(ms(a.created_at), String(a.title)).toBeLessThanOrEqual(t0);
      if (a.performed_by_type === "human") expect(db.tables.users.some((u) => u.id === a.performed_by_id)).toBe(true);
      else expect(["receptionist", "sales", "follow_up", "booking", "analyst", "orchestrator"]).toContain(a.performed_by_id);
    }
  });

  it("agent_actions: 2 pendientes con payload realista y 1 ejecutada", () => {
    const list = rows(db, "agent_actions", DEMO_ORG_ID);
    expect(list.filter((a) => a.status === "pending")).toHaveLength(2);
    const executed = list.filter((a) => a.status === "executed");
    expect(executed).toHaveLength(1);
    expect(executed[0].reviewed_by).toBe(DEMO_USER_ID);
    for (const a of list) {
      const payload = a.payload as { tool: string; input: Row };
      expect(payload.tool).toBe(a.action_type);
      expect(Object.keys(payload.input).length).toBeGreaterThan(0);
    }
    const resched = list.find((a) => a.action_type === "reschedule_booking")!;
    const input = (resched.payload as { input: { booking_id: string } }).input;
    expect(db.tables.bookings.some((b) => b.id === input.booking_id)).toBe(true);
  });

  it("presupuestos: subtotal, descuento y total correctos, estados variados y vigencia", () => {
    const budgets = rows(db, "budgets");
    expect(new Set(rows(db, "budgets", DEMO_ORG_ID).map((b) => b.status))).toEqual(new Set(["draft", "active", "accepted", "expired"]));
    for (const b of budgets) {
      const members = db.tables.budget_members.filter((m) => m.budget_id === b.id);
      expect(members.length).toBeGreaterThan(0);
      const services = db.tables.budget_services.filter((s) => members.some((m) => m.id === s.budget_member_id));
      expect(services.length).toBeGreaterThan(0);
      const subtotal = services.reduce((acc, s) => acc + (s.sessions as number) * (s.unit_price as number), 0);
      expect(b.subtotal).toBeCloseTo(subtotal, 2);
      const discount = b.discount_type === "percentage" ? ((b.subtotal as number) * (b.discount_value as number)) / 100 : (b.discount_value as number);
      expect(b.total).toBeCloseTo((b.subtotal as number) - discount, 2);
      expect(b.total as number).toBeGreaterThan(0);
      expect(ms(b.expires_at)).toBe(ms(b.created_at) + (b.validity_days as number) * DAY);
      expect(members.some((m) => m.relationship === "responsible")).toBe(true);
      if (b.status === "expired") expect(ms(b.expires_at)).toBeLessThan(t0);
      if (b.status === "active") expect(ms(b.expires_at)).toBeGreaterThan(t0);
      const contact = db.tables.contacts.find((c) => c.id === b.responsible_id)!;
      expect(b.responsible_name).toBe(contact.full_name);
    }
    for (const s of db.tables.budget_services.filter((x) => x.service_id !== null)) {
      const item = db.tables.items.find((i) => i.id === s.service_id)!;
      expect(s.unit_price).toBe(item.price);
      expect(s.is_manual_price).toBe(false);
    }
  });

  it("usuarios: admin y 2 staff con email accesible via auth.admin", async () => {
    const users = rows(db, "users").filter((u) => u.organization_id === DEMO_ORG_ID);
    expect(users).toHaveLength(3);
    expect(users.filter((u) => u.role === "admin").map((u) => u.id)).toEqual([DEMO_USER_ID]);
    expect(users.find((u) => u.id === DEMO_USER_ID)!.full_name).toBe("Dra. Demo");
    for (const u of db.tables.users) {
      const { data, error } = await db.auth.admin.getUserById(u.id as string);
      expect(error).toBeNull();
      expect(data.user?.email).toMatch(/@.+\./);
    }
  });

  it("contactos: nombres, telefonos y correos ficticios, fuentes variadas, sin duplicados", () => {
    const list = rows(db, "contacts", DEMO_ORG_ID);
    expect(new Set(list.map((c) => c.source)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(list.map((c) => c.full_name)).size).toBe(list.length);
    expect(new Set(list.map((c) => c.phone)).size).toBe(list.length);
    for (const c of list) {
      expect(c.phone).toMatch(/^\+52 55 5550 \d{4}$/);
      expect(c.email).toMatch(/@correo-demo\.mx$/);
      expect(ms(c.created_at)).toBeLessThan(t0);
    }
  });

  it("items: servicios con precio y color validos", () => {
    for (const i of rows(db, "items")) {
      expect(i.type).toBe("service");
      expect(i.price as number).toBeGreaterThan(0);
      expect(i.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("determinismo", () => {
  // Quita lo que depende de "ahora" (timestamps y fechas) y compara el resto.
  const normalize = (db: DemoDb): string =>
    JSON.stringify(db.dump()).replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, "<TS>").replace(/"\d{4}-\d{2}-\d{2}"/g, '"<D>"');

  it("dos siembras con el mismo ahora son identicas", () => {
    const a = seeded(NOWS[0]).db;
    const b = seeded(NOWS[0]).db;
    expect(a.dump()).toEqual(b.dump());
  });

  it("un ahora distinto solo cambia las fechas (7 dias despues, mismo dia de la semana)", () => {
    const a = seeded("2026-10-14T12:00:00.000Z").db;
    const b = seeded("2026-10-21T12:00:00.000Z").db;
    expect(normalize(a)).toBe(normalize(b));
    const aBookings = a.tables.bookings.map((x) => ms(x.scheduled_at));
    const bBookings = b.tables.bookings.map((x) => ms(x.scheduled_at));
    expect(bBookings.map((t, i) => t - aBookings[i])).toEqual(bBookings.map(() => 7 * DAY));
  });

  it("no usa Math.random", () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error("Math.random no permitido en la siembra");
    };
    try {
      expect(() => seeded(NOWS[0])).not.toThrow();
    } finally {
      Math.random = original;
    }
  });
});

describe("getDemoDb y resetDemoDb", () => {
  beforeEach(() => resetDemoDb());

  it("getDemoDb es un singleton ya sembrado", async () => {
    expect(getDemoDb()).toBe(getDemoDb());
    const { data, error } = await getDemoDb().from("organizations").select("id, name").eq("id", DEMO_ORG_ID).single();
    expect(error).toBeNull();
    expect(data).toEqual({ id: DEMO_ORG_ID, name: "Clinica Demo" });
  });

  it("resetDemoDb restaura los datos originales conservando la misma instancia", async () => {
    const db = getDemoDb();
    await db.from("contacts").delete().eq("organization_id", DEMO_ORG_ID);
    await db.from("organizations").update({ name: "Cambiada" }).eq("id", DEMO_ORG_ID);
    await db.auth.admin.createUser({ email: "otro@ejemplo.mx", password: "secreto1", user_metadata: { role: "staff", clinic_id: DEMO_ORG_ID } });
    resetDemoDb();
    expect(getDemoDb()).toBe(db);
    const contacts = await db.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", DEMO_ORG_ID);
    expect(contacts.count).toBe(14);
    const org = await db.from("organizations").select("name").eq("id", DEMO_ORG_ID).single();
    expect((org.data as Row).name).toBe("Clinica Demo");
    const users = await db.auth.admin.listUsers();
    expect((users.data as { total: number }).total).toBe(4);
  });

  it("un cambio de una prueba no contamina a la siguiente despues del reset", async () => {
    const r = await getDemoDb().from("contacts").insert({ organization_id: DEMO_ORG_ID, full_name: "Temporal" });
    expect(r.error).toBeNull();
    resetDemoDb();
    const { count } = await getDemoDb().from("contacts").select("id", { count: "exact", head: true }).eq("full_name", "Temporal");
    expect(count).toBe(0);
  });
});
