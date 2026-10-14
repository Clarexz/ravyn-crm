import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const session = vi.hoisted(() => ({ current: null as null | { db: SupabaseClient; organizationId: string; user: { id: string } } }));
vi.mock("@/lib/supabase/auth", () => ({ getClinicContext: async () => session.current }));

import { GET as listRoute } from "@/app/api/agents/actions/route";
import { POST as approveRoute } from "@/app/api/agents/actions/[id]/approve/route";
import { POST as rejectRoute } from "@/app/api/agents/actions/[id]/reject/route";
import { executeToolGoverned } from "@/lib/agents/governance";
import { IDS, NOW, ORG_A, ORG_B, createFakeDb, uid, type FakeDb, type FakeRow } from "./fakeDb";

const USER_A = uid(901);
const USER_B = uid(902);
let fake: FakeDb;

const login = (org: string, userId: string) => {
  session.current = { db: fake.asClient(), organizationId: org, user: { id: userId } };
};
const post = (url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const idParams = (id: string) => ({ params: { id } });
const approve = (id: string, body?: unknown) => approveRoute(post(`/api/agents/actions/${id}/approve`, body), idParams(id));
const reject = (id: string, body?: unknown) => rejectRoute(post(`/api/agents/actions/${id}/reject`, body), idParams(id));
const list = (qs = "") => listRoute(new NextRequest(`http://localhost/api/agents/actions${qs}`));

async function propose(): Promise<string> {
  const res = await executeToolGoverned(
    "sales",
    "create_opportunity",
    { contact_id: IDS.contactA1, title: "Blanqueamiento", value: 4800, discount_percent: 20 },
    { organizationId: ORG_A, db: fake.asClient(), now: NOW },
  );
  if (!res.ok) throw new Error("no se pudo proponer");
  return (res.data as { action_id: string }).action_id;
}
const opps = (): FakeRow[] => fake.tables.opportunities.filter((o) => o.title === "Blanqueamiento");

beforeEach(() => {
  fake = createFakeDb();
  login(ORG_A, USER_A);
});
afterEach(() => {
  vi.useRealTimers();
  session.current = null;
});

describe("rutas: autenticacion", () => {
  it("sin sesion responde 401 y no toca nada", async () => {
    const id = await propose();
    session.current = null;
    const writes = fake.writes;
    expect((await list()).status).toBe(401);
    expect((await approve(id)).status).toBe(401);
    expect((await reject(id)).status).toBe(401);
    expect(fake.writes).toBe(writes);
    expect(fake.tables.agent_actions[0].status).toBe("pending");
  });
});

describe("HITL-02 por ruta", () => {
  it("approve ejecuta, audita al usuario y mide review_seconds", async () => {
    const id = await propose();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW.getTime() + 125_000));
    const res = await approve(id, { notes: "Autorizado por gerencia" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toMatchObject({
      id,
      status: "executed",
      reviewed_by: USER_A,
      review_notes: "Autorizado por gerencia",
      review_seconds: 125,
    });
    expect(body.action.execution_result).toBeTruthy();
    expect(opps()).toHaveLength(1);
    expect(String(opps()[0].notes)).toContain("20%");
  });

  it("la segunda aprobacion es 409 y no duplica", async () => {
    const id = await propose();
    expect((await approve(id)).status).toBe(200);
    expect((await approve(id)).status).toBe(409);
    expect((await reject(id)).status).toBe(409);
    expect(opps()).toHaveLength(1);
  });

  it("aprobaciones simultaneas: una ejecucion", async () => {
    const id = await propose();
    const [a, b] = await Promise.all([approve(id), approve(id)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(opps()).toHaveLength(1);
  });

  it("valores modificados invalidos: 400 y sigue pendiente; validos: se aplican", async () => {
    const id = await propose();
    const bad = await approve(id, { input: { contact_id: IDS.contactA1, title: "Blanqueamiento", discount_percent: 150 } });
    expect(bad.status).toBe(400);
    expect(fake.tables.agent_actions[0].status).toBe("pending");
    expect(opps()).toHaveLength(0);
    const good = await approve(id, { input: { contact_id: IDS.contactA1, title: "Blanqueamiento", value: 4800, discount_percent: 5 } });
    expect(good.status).toBe(200);
    expect(String(opps()[0].notes)).toContain("5%");
  });

  it("cuerpo invalido: 400; id no uuid: 404", async () => {
    const id = await propose();
    const res = await approveRoute(
      new NextRequest("http://localhost/x", { method: "POST", body: "{no json" }),
      idParams(id),
    );
    expect(res.status).toBe(400);
    expect((await approve("no-es-uuid")).status).toBe(404);
    expect(fake.tables.agent_actions[0].status).toBe("pending");
  });
});

describe("HITL-03 por ruta", () => {
  it("reject no ejecuta nada y guarda notas, usuario y tiempo", async () => {
    const id = await propose();
    const before = fake.snapshot();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW.getTime() + 30_000));
    const res = await reject(id, { notes: "Descuento fuera de politica" });
    expect(res.status).toBe(200);
    const { action } = await res.json();
    expect(action).toMatchObject({ status: "rejected", review_notes: "Descuento fuera de politica", reviewed_by: USER_A, review_seconds: 30 });
    const after = fake.snapshot();
    for (const t of ["opportunities", "contacts", "activities", "bookings", "items"]) expect(after[t]).toEqual(before[t]);
  });
});

describe("rutas: aislamiento entre organizaciones", () => {
  it("otra organizacion obtiene 404 al aprobar/rechazar y no ve la accion", async () => {
    const id = await propose();
    login(ORG_B, USER_B);
    expect((await approve(id)).status).toBe(404);
    expect((await reject(id, { notes: "x" })).status).toBe(404);
    const listed = await (await list()).json();
    expect(listed.actions).toEqual([]);
    expect(fake.tables.agent_actions[0]).toMatchObject({ status: "pending" });
    expect(fake.tables.agent_actions[0].reviewed_by).toBeUndefined();
    expect(opps()).toHaveLength(0);
    login(ORG_A, USER_A);
    expect((await (await list("?status=pending")).json()).actions).toHaveLength(1);
  });
});

describe("GET /api/agents/actions", () => {
  it("filtra por estado, valida parametros y trae campos de auditoria", async () => {
    const a = await propose();
    await propose();
    await reject(a, { notes: "no" });
    const pending = await (await list("?status=pending")).json();
    expect(pending.actions).toHaveLength(1);
    const rejected = await (await list("?status=rejected")).json();
    expect(rejected.actions[0]).toMatchObject({ id: a, reviewed_by: USER_A, review_notes: "no" });
    expect(typeof rejected.actions[0].review_seconds).toBe("number");
    expect((await list("?status=otro")).status).toBe(400);
    expect((await list("?limit=0")).status).toBe(400);
    expect((await (await list("?limit=1")).json()).actions).toHaveLength(1);
  });
});
