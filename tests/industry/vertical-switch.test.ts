import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DemoDb, seedDemoData } from "@/lib/demo";
import { DEMO_ORG_ID, DEMO_OTHER_ORG_ID, DEMO_USER_ID } from "@/lib/demo/config";
import { DEMO_STAFF_IDS } from "@/lib/demo/seed";
import { switchDemoVertical, SAMPLE_INDUSTRIES } from "@/lib/demo/verticals";
import { packFor } from "@/lib/industry/packs";
import { zonedParts } from "@/lib/industry/time";

const session = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
vi.mock("@/lib/supabase/auth", () => ({ getClinicContext: async () => session.current }));

import { GET, PATCH } from "@/app/api/organization/schema/route";

let db: DemoDb;
const login = (role: "admin" | "staff", org = DEMO_ORG_ID) => {
  session.current = { db: db.asClient(), organizationId: org, user: { id: role === "admin" ? DEMO_USER_ID : DEMO_STAFF_IDS.reception }, profile: { role } };
};
const patch = (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  PATCH(new NextRequest("http://localhost/api/organization/schema", { method: "PATCH", headers, body: JSON.stringify(body) }));
const rowsOf = (table: string, org: string) => db.tables[table].filter((r) => r.organization_id === org);
const schema = async () => (await GET()).json();

beforeEach(() => {
  db = new DemoDb();
  seedDemoData(db);
  login("admin");
});

describe("IND-01: cambiar la industria altera menu, etiquetas y datos", () => {
  it("GET devuelve el esquema de salud con sus modulos y etiquetas", async () => {
    const s = await schema();
    expect(s.industry).toBe("health");
    expect(s.labels.contact.plural).toBe("Pacientes");
    expect(s.modules.filter((m: { active: boolean }) => m.active).map((m: { id: string }) => m.id)).toEqual(
      expect.arrayContaining(["contacts", "bookings", "items", "budgets", "reports"]),
    );
    expect(s.timezone).toBe("America/Mexico_City");
    expect(s.is_admin).toBe(true);
  });

  it("de salud a inmobiliaria: pipeline activo, modulos medicos fuera, etiquetas nuevas", async () => {
    const res = await patch({ industry: "real_estate" });
    expect(res.status).toBe(200);
    const s = await res.json();
    expect(s.industry).toBe("real_estate");
    const active = (id: string) => s.modules.find((m: { id: string }) => m.id === id).active;
    expect(active("pipeline")).toBe(true);
    expect(active("budgets")).toBe(false);
    expect(s.labels.contact.plural).toBe("Prospectos");
    expect(s.labels.booking.plural).toBe("Visitas");
    expect(s.labels.item.plural).toBe("Propiedades");
    expect(s.organization_name).toContain("Inmobiliaria");
    // La persistencia es real: otra lectura devuelve lo mismo.
    expect((await schema()).industry).toBe("real_estate");
  });

  it("de salud a restaurante: oculta presupuestos y muestra reservaciones y mesas", async () => {
    const s = await (await patch({ industry: "restaurant" })).json();
    expect(s.modules.find((m: { id: string }) => m.id === "budgets").active).toBe(false);
    expect(s.labels.booking.plural).toBe("Reservaciones");
    expect(s.labels.item.plural).toBe("Mesas");
    expect(s.labels.contact.plural).toBe("Comensales");
  });

  it.each(SAMPLE_INDUSTRIES)("%s: datos de ejemplo propios, reservas en horario laboral local y sin solapes", async (industry) => {
    await patch({ industry });
    const pack = packFor(industry);
    expect(rowsOf("contacts", DEMO_ORG_ID).length).toBeGreaterThanOrEqual(8);
    expect(rowsOf("items", DEMO_ORG_ID).length).toBeGreaterThanOrEqual(5);
    // El modulo de catalogo (/services y /api/services) solo gestiona items de tipo service.
    expect(new Set(rowsOf("items", DEMO_ORG_ID).map((i) => i.type))).toEqual(new Set(["service"]));
    expect(rowsOf("opportunities", DEMO_ORG_ID).length).toBeGreaterThanOrEqual(4);
    const bookings = rowsOf("bookings", DEMO_ORG_ID);
    expect(bookings.length).toBeGreaterThanOrEqual(12);
    const [sh, sm] = pack.businessHours.start.split(":").map(Number);
    const [eh, em] = pack.businessHours.end.split(":").map(Number);
    const list = bookings
      .map((b) => ({ start: Date.parse(b.scheduled_at as string), end: Date.parse(b.scheduled_at as string) + (b.duration_minutes as number) * 60_000 }))
      .sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i += 1) expect(list[i].start).toBeGreaterThanOrEqual(list[i - 1].end);
    for (const b of list) {
      const s = zonedParts(new Date(b.start), pack.timezone);
      const e = zonedParts(new Date(b.end), pack.timezone);
      expect(pack.businessHours.days).toContain(s.isoWeekday);
      expect(s.minutes).toBeGreaterThanOrEqual(sh * 60 + sm);
      expect(e.minutes).toBeLessThanOrEqual(eh * 60 + em);
    }
    // Pasado y futuro, y todas las filas apuntan a contactos/items de la propia organizacion.
    const now = Date.now();
    expect(list.some((b) => b.start < now)).toBe(true);
    expect(list.some((b) => b.start > now)).toBe(true);
    const contactIds = new Set(rowsOf("contacts", DEMO_ORG_ID).map((c) => c.id));
    const itemIds = new Set(rowsOf("items", DEMO_ORG_ID).map((i) => i.id));
    for (const b of bookings) {
      expect(contactIds.has(b.contact_id as string)).toBe(true);
      expect(itemIds.has(b.item_id as string)).toBe(true);
    }
  });

  it("servicios profesionales incluye cotizaciones con numeracion propia", async () => {
    await patch({ industry: "professional_services" });
    const budgets = rowsOf("budgets", DEMO_ORG_ID);
    expect(budgets.length).toBe(2);
    expect(budgets.map((b) => b.budget_number)).toEqual(["PRES-0001", "PRES-0002"]);
  });

  it("aislamiento: la otra organizacion no cambia ni de datos ni de configuracion", async () => {
    const before = structuredClone({
      org: db.tables.organizations.find((o) => o.id === DEMO_OTHER_ORG_ID),
      contacts: rowsOf("contacts", DEMO_OTHER_ORG_ID),
      bookings: rowsOf("bookings", DEMO_OTHER_ORG_ID),
      budgets: rowsOf("budgets", DEMO_OTHER_ORG_ID),
      items: rowsOf("items", DEMO_OTHER_ORG_ID),
    });
    await patch({ industry: "restaurant" });
    await patch({ industry: "real_estate" });
    expect(db.tables.organizations.find((o) => o.id === DEMO_OTHER_ORG_ID)).toEqual(before.org);
    expect(rowsOf("contacts", DEMO_OTHER_ORG_ID)).toEqual(before.contacts);
    expect(rowsOf("bookings", DEMO_OTHER_ORG_ID)).toEqual(before.bookings);
    expect(rowsOf("budgets", DEMO_OTHER_ORG_ID)).toEqual(before.budgets);
    expect(rowsOf("items", DEMO_OTHER_ORG_ID)).toEqual(before.items);
    // Y su esquema sigue siendo el suyo (salud, plan starter, sin presupuestos en el menu).
    login("admin", DEMO_OTHER_ORG_ID);
    const s = await schema();
    expect(s.industry).toBe("health");
    expect(s.modules.find((m: { id: string }) => m.id === "budgets").active).toBe(false);
    expect(s.timezone).toBe("America/Monterrey");
  });

  it("volver a salud restaura los datos originales y conserva los cambios hechos en cada giro", async () => {
    const healthContacts = rowsOf("contacts", DEMO_ORG_ID).map((c) => c.id);
    const healthBudgets = rowsOf("budgets", DEMO_ORG_ID).length;
    await patch({ industry: "restaurant" });
    db.insertRow("contacts", { organization_id: DEMO_ORG_ID, full_name: "Nuevo Comensal" });
    await patch({ industry: "health" });
    expect(rowsOf("contacts", DEMO_ORG_ID).map((c) => c.id)).toEqual(healthContacts);
    expect(rowsOf("budgets", DEMO_ORG_ID).length).toBe(healthBudgets);
    expect((await schema()).organization_name).toBe("Clinica Demo");
    await patch({ industry: "restaurant" });
    expect(rowsOf("contacts", DEMO_ORG_ID).some((c) => c.full_name === "Nuevo Comensal")).toBe(true);
    // Ninguna fila queda duplicada entre giros.
    const ids = rowsOf("contacts", DEMO_ORG_ID).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cambiar a la misma industria no toca nada", () => {
    const snap = db.dump();
    expect(switchDemoVertical(db, DEMO_ORG_ID, "health")).toMatchObject({ restored: false });
    expect(db.dump()).toEqual(snap);
  });

  it("solo admin cambia la industria; staff recibe 403 y nada cambia", async () => {
    login("staff");
    const snap = db.dump();
    const res = await patch({ industry: "restaurant" });
    expect(res.status).toBe(403);
    expect(db.dump()).toEqual(snap);
    expect((await schema()).is_admin).toBe(false);
  });

  it("cuerpo estricto, JSON obligatorio y Origin del mismo host", async () => {
    expect((await patch({ industry: "nave-espacial" })).status).toBe(400);
    expect((await patch({ industry: "restaurant", organization_id: DEMO_OTHER_ORG_ID })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    expect((await patch({ industry: "restaurant" }, { "content-type": "text/plain" })).status).toBe(415);
    expect((await patch({ industry: "restaurant" }, { "content-type": "application/json", origin: "https://evil.example" })).status).toBe(403);
    expect((await schema()).industry).toBe("health");
  });

  it("sin sesion: 401", async () => {
    session.current = null;
    expect((await GET()).status).toBe(401);
    expect((await patch({ industry: "restaurant" })).status).toBe(401);
  });

  it("zona horaria: solo valida, solo admin y por organizacion", async () => {
    const ok = await patch({ timezone: "America/Bogota" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).timezone).toBe("America/Bogota");
    expect((await patch({ timezone: "Marte/Olimpo" })).status).toBe(400);
    login("admin", DEMO_OTHER_ORG_ID);
    expect((await schema()).timezone).toBe("America/Monterrey");
  });
});
