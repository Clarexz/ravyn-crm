import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DemoDb, seedDemoData, type Row } from "@/lib/demo";
import { DEMO_ORG_ID, DEMO_OTHER_ORG_ID, DEMO_USER_ID } from "@/lib/demo/config";
import { DEMO_STAFF_IDS } from "@/lib/demo/seed";
import { executeToolGoverned } from "@/lib/agents/governance";
import { moveOpportunityStage } from "@/lib/pipeline/board";

const session = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
vi.mock("@/lib/supabase/auth", () => ({ getClinicContext: async () => session.current }));

import { GET as boardRoute } from "@/app/api/pipeline/route";
import { POST as moveRoute } from "@/app/api/pipeline/[id]/move/route";
import { GET as briefingRoute } from "@/app/api/briefing/route";

let db: DemoDb;
const login = (role: "admin" | "staff", org = DEMO_ORG_ID, client: SupabaseClient = db.asClient()) => {
  session.current = { db: client, organizationId: org, user: { id: role === "admin" ? DEMO_USER_ID : DEMO_STAFF_IDS.reception }, profile: { role } };
};
const rows = (table: string, org = DEMO_ORG_ID): Row[] => db.tables[table].filter((r) => r.organization_id === org);
const opp = (stage: string, org = DEMO_ORG_ID) => {
  const o = rows("opportunities", org).find((r) => r.stage === stage);
  if (!o) throw new Error(`sin oportunidad en ${stage}`);
  return o;
};
const stageOf = (id: unknown) => db.tables.opportunities.find((r) => r.id === id)?.stage;
const move = (id: unknown, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  moveRoute(new NextRequest(`http://localhost/api/pipeline/${id}/move`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }), { params: { id: String(id) } });
const stageChanges = (oppId: unknown) => rows("activities").filter((a) => a.opportunity_id === oppId && a.type === "stage_change");

beforeEach(() => {
  db = new DemoDb();
  seedDemoData(db);
  login("admin");
});

describe("Kanban: movimiento humano de etapa", () => {
  it("mover entre etapas abiertas persiste y crea la actividad stage_change con autor persona", async () => {
    const o = opp("qualified");
    const before = stageChanges(o.id).length;
    const res = await move(o.id, { stage: "proposal", from: "qualified" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, changed: true, from: "qualified", to: "proposal" });
    expect(stageOf(o.id)).toBe("proposal");
    const acts = stageChanges(o.id);
    expect(acts).toHaveLength(before + 1);
    const last = acts.find((a) => a.title === "Etapa: qualified a proposal");
    expect(last).toMatchObject({ performed_by_type: "human", performed_by_id: DEMO_USER_ID, contact_id: o.contact_id, organization_id: DEMO_ORG_ID, status: "completed" });
  });

  it("el tablero devuelve tarjetas con contacto, valor y dias sin actividad; solo de la organizacion", async () => {
    const body = await (await boardRoute()).json();
    expect(body.is_admin).toBe(true);
    expect(body.cards.length).toBe(rows("opportunities").length);
    expect(body.cards.every((c: { id: string }) => rows("opportunities").some((r) => r.id === c.id))).toBe(true);
    const c = body.cards[0];
    expect(c).toEqual(expect.objectContaining({ title: expect.any(String), value: expect.any(Number), days_since_activity: expect.any(Number), stale: expect.any(Boolean) }));
    expect(body.cards.some((c2: { contact_name: string | null }) => c2.contact_name)).toBe(true);
    login("admin", DEMO_OTHER_ORG_ID);
    const other = await (await boardRoute()).json();
    expect(other.cards.map((x: { id: string }) => x.id).sort()).toEqual(rows("opportunities", DEMO_OTHER_ORG_ID).map((r) => r.id).sort());
  });

  it("una tarjeta tras moverse tiene 0 dias sin actividad y deja de estar estancada", async () => {
    const stale = (await (await boardRoute()).json()).cards.find((c: { stale: boolean }) => c.stale);
    expect(stale, "la demo trae oportunidades estancadas").toBeTruthy();
    await move(stale.id, { stage: stale.stage === "lead" ? "contacted" : "lead" });
    const after = (await (await boardRoute()).json()).cards.find((c: { id: string }) => c.id === stale.id);
    expect(after).toMatchObject({ days_since_activity: 0, stale: false });
  });

  it("staff no puede cerrar como ganado/perdido ni reabrir; el estado y la bitacora no cambian", async () => {
    login("staff");
    const open = opp("negotiation");
    const acts = rows("activities").length;
    for (const to of ["won", "lost"]) {
      const res = await move(open.id, { stage: to });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/administrador/);
    }
    const closed = opp("won");
    expect((await move(closed.id, { stage: "lead" })).status).toBe(403);
    expect(stageOf(open.id)).toBe("negotiation");
    expect(stageOf(closed.id)).toBe("won");
    expect(rows("activities").length).toBe(acts);
    // Staff si mueve entre etapas abiertas.
    expect((await move(open.id, { stage: "qualified" })).status).toBe(200);
    expect(stageOf(open.id)).toBe("qualified");
    expect((await (await boardRoute()).json()).is_admin).toBe(false);
  });

  it("admin cierra como ganado: fija closed_at y probabilidad 100; reabrir limpia closed_at", async () => {
    const o = opp("negotiation");
    expect((await move(o.id, { stage: "won", reason: "Firmo contrato" })).status).toBe(200);
    const won = db.tables.opportunities.find((r) => r.id === o.id)!;
    expect(won).toMatchObject({ stage: "won", probability: 100 });
    expect(won.closed_at).toBeTruthy();
    expect(stageChanges(o.id).some((a) => a.description === "Firmo contrato")).toBe(true);
    expect((await move(o.id, { stage: "proposal" })).status).toBe(200);
    expect(db.tables.opportunities.find((r) => r.id === o.id)!.closed_at).toBeNull();
  });

  it("otra organizacion no se ve afectada: un id ajeno es 404 y no cambia nada", async () => {
    const foreign = opp("qualified", DEMO_OTHER_ORG_ID);
    const snapshot = JSON.stringify(db.dump());
    const res = await move(foreign.id, { stage: "lead" });
    expect(res.status).toBe(404);
    expect(JSON.stringify(db.dump())).toBe(snapshot);
    // Y moverse en la propia organizacion no toca las filas de la otra.
    await move(opp("lead").id, { stage: "contacted" });
    expect(JSON.stringify(rows("opportunities", DEMO_OTHER_ORG_ID))).toBe(JSON.stringify(JSON.parse(snapshot).opportunities.filter((r: Row) => r.organization_id === DEMO_OTHER_ORG_ID)));
  });

  it("el cuerpo no puede fijar organizacion ni autor; claves extra, etapa y id invalidos dan 400", async () => {
    const o = opp("lead");
    for (const body of [{ stage: "contacted", organization_id: DEMO_OTHER_ORG_ID }, { stage: "contacted", performed_by_id: "x" }, { stage: "archivada" }, {}, "no-json"]) {
      expect((await move(o.id, body)).status).toBe(400);
    }
    expect((await move("no-es-uuid", { stage: "contacted" })).status).toBe(400);
    expect(stageOf(o.id)).toBe("lead");
  });

  it("CSRF: exige JSON y rechaza otro Origin; sin sesion es 401", async () => {
    const o = opp("lead");
    expect((await move(o.id, { stage: "contacted" }, { "content-type": "text/plain" })).status).toBe(415);
    expect((await move(o.id, { stage: "contacted" }, { "content-type": "application/json", origin: "https://evil.example" })).status).toBe(403);
    expect((await move(o.id, { stage: "contacted" }, { "content-type": "application/json", origin: "http://localhost" })).status).toBe(200);
    session.current = null;
    expect((await move(o.id, { stage: "lead" })).status).toBe(401);
    expect((await boardRoute()).status).toBe(401);
  });

  it("tablero desactualizado: from distinto de la etapa real da 409 con la etapa actual", async () => {
    const o = opp("proposal");
    const res = await move(o.id, { stage: "contacted", from: "lead" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ current_stage: "proposal" });
    expect(stageOf(o.id)).toBe("proposal");
  });

  it("mover a la misma etapa no cambia nada ni registra actividad", async () => {
    const o = opp("lead");
    const n = rows("activities").length;
    const res = await move(o.id, { stage: "lead" });
    expect(await res.json()).toMatchObject({ ok: true, changed: false });
    expect(rows("activities").length).toBe(n);
  });

  it("si falla registrar la actividad, la etapa se restaura (sin cambio sin rastro)", async () => {
    const o = opp("qualified");
    const real = db.asClient();
    const failing = new Proxy(real, {
      get(target, prop) {
        if (prop === "from") {
          return (table: string) => {
            const builder = (target as unknown as { from: (t: string) => Record<string, unknown> }).from(table);
            if (table !== "activities") return builder;
            return { ...builder, insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "fallo simulado" } }) }) }) };
          };
        }
        return Reflect.get(target, prop);
      },
    });
    const res = await moveOpportunityStage(failing, { organizationId: DEMO_ORG_ID, opportunityId: o.id as string, toStage: "proposal", actor: { id: DEMO_USER_ID, role: "admin" } });
    expect(res).toMatchObject({ ok: false, status: 500 });
    expect(stageOf(o.id)).toBe("qualified");
    expect(stageChanges(o.id).some((a) => a.title === "Etapa: qualified a proposal")).toBe(false);
  });

  it("la aprobacion de agentes sigue intacta: update_stage a won de un agente queda pendiente", async () => {
    const o = opp("negotiation");
    const res = await executeToolGoverned("sales", "update_stage", { opportunity_id: o.id, stage: "won" }, { organizationId: DEMO_ORG_ID, db: db.asClient() });
    expect(res.ok && (res.data as { status?: string }).status).toBe("pending_approval");
    expect(stageOf(o.id)).toBe("negotiation");
  });
});

describe("Briefing: ruta GET", () => {
  const get = (qs = "") => briefingRoute(new NextRequest(`http://localhost/api/briefing${qs}`));

  it("devuelve el briefing de la organizacion de la sesion (y no el de la otra)", async () => {
    const a = (await (await get()).json()).briefing;
    login("admin", DEMO_OTHER_ORG_ID);
    const b = (await (await get()).json()).briefing;
    expect(a.metrics.pipeline.open_count).toBe(rows("opportunities").filter((o) => !["won", "lost"].includes(o.stage as string)).length);
    expect(b.metrics.pipeline.open_count).toBe(rows("opportunities", DEMO_OTHER_ORG_ID).filter((o) => !["won", "lost"].includes(o.stage as string)).length);
    expect(a.sections.actions.length).toBeGreaterThan(0);
    expect(a.metrics.stale.items.every((i: { id: string }) => rows("opportunities").some((o) => o.id === i.id))).toBe(true);
  });

  it("valida parametros, exige sesion y no modifica la base", async () => {
    const snap = JSON.stringify(db.dump());
    expect((await get("?days=0")).status).toBe(400);
    expect((await get("?days=abc")).status).toBe(400);
    expect((await get("?days=7")).status).toBe(200);
    expect(JSON.stringify(db.dump())).toBe(snap);
    session.current = null;
    expect((await get()).status).toBe(401);
  });

  it("staff tambien puede leerlo (solo lectura)", async () => {
    login("staff");
    expect((await get()).status).toBe(200);
  });
});
