// D-21: restablecer los datos de ejemplo de un giro (solo demo, solo administrador, solo la organizacion de la sesion).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DemoDb, seedDemoData } from "@/lib/demo";
import { DEMO_ORG_ID, DEMO_OTHER_ORG_ID, DEMO_USER_ID } from "@/lib/demo/config";
import { DEMO_STAFF_IDS } from "@/lib/demo/seed";

const session = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
vi.mock("@/lib/supabase/auth", () => ({ getClinicContext: async () => session.current }));

import { PATCH } from "@/app/api/organization/schema/route";

let db: DemoDb;
const login = (role: "admin" | "staff") => {
  session.current = { db: db.asClient(), organizationId: DEMO_ORG_ID, user: { id: role === "admin" ? DEMO_USER_ID : DEMO_STAFF_IDS.reception }, profile: { role } };
};
const patch = (body: unknown) =>
  PATCH(new NextRequest("http://localhost/api/organization/schema", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const rows = (table: string, org = DEMO_ORG_ID) => db.tables[table].filter((r) => r.organization_id === org);
const snapshot = (org: string) => JSON.stringify(Object.keys(db.tables).map((t) => db.tables[t].filter((r) => (t === "organizations" ? r.id : r.organization_id) === org)));

beforeEach(() => {
  db = new DemoDb();
  seedDemoData(db);
  login("admin");
});

describe("restablecer datos de un giro (demo)", () => {
  it("descarta los cambios del giro actual y vuelve a los datos de ejemplo", async () => {
    expect((await patch({ industry: "real_estate" })).status).toBe(200);
    const before = rows("contacts").length;
    await db.asClient().from("contacts").insert({ organization_id: DEMO_ORG_ID, full_name: "Contacto Temporal" });
    for (const o of rows("opportunities")) db.updateRow("opportunities", o, { stage: "lost" });
    expect(rows("contacts")).toHaveLength(before + 1);

    const res = await patch({ industry: "real_estate", reset: true });
    expect(res.status).toBe(200);
    expect(rows("contacts")).toHaveLength(before);
    expect(rows("contacts").some((c) => c.full_name === "Contacto Temporal")).toBe(false);
    expect(rows("opportunities").some((o) => o.stage !== "lost")).toBe(true);
    expect((await res.json()).industry).toBe("real_estate");
  });

  it("si el giro no es el actual, tambien lo regenera y no toca la otra organizacion", async () => {
    await patch({ industry: "restaurant" });
    await db.asClient().from("contacts").insert({ organization_id: DEMO_ORG_ID, full_name: "Comensal Temporal" });
    await patch({ industry: "health" }); // el restaurante queda guardado con el cambio
    const other = snapshot(DEMO_OTHER_ORG_ID);
    expect((await patch({ industry: "restaurant", reset: true })).status).toBe(200);
    expect(rows("contacts").some((c) => c.full_name === "Comensal Temporal")).toBe(false);
    expect(snapshot(DEMO_OTHER_ORG_ID)).toBe(other);
    expect(rows("contacts", DEMO_OTHER_ORG_ID).length).toBeGreaterThan(0);
  });

  it("salud no se restablece (400), staff recibe 403, y reset exige industry", async () => {
    expect((await patch({ industry: "health", reset: true })).status).toBe(400);
    expect((await patch({ reset: true })).status).toBe(400);
    expect((await patch({ industry: "restaurant", reset: false })).status).toBe(400);
    login("staff");
    expect((await patch({ industry: "restaurant", reset: true })).status).toBe(403);
    expect(db.tables.organizations.find((o) => o.id === DEMO_ORG_ID)?.industry).toBe("health");
  });
});

describe("fuera del modo demo", () => {
  it("restablecer no existe en modo live (400) y no toca los datos", async () => {
    const before = JSON.stringify(rows("contacts"));
    process.env.RAVYN_DATA_MODE = "live";
    try {
      expect((await patch({ industry: "restaurant", reset: true })).status).toBe(400);
    } finally {
      delete process.env.RAVYN_DATA_MODE;
    }
    expect(JSON.stringify(rows("contacts"))).toBe(before);
    expect(db.tables.organizations.find((o) => o.id === DEMO_ORG_ID)?.industry).toBe("health");
  });
});
