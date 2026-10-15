import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const session = vi.hoisted(() => ({ current: null as null | { db: SupabaseClient; organizationId: string; user: { id: string }; profile: { role: "admin" | "staff" } } }));
vi.mock("@/lib/supabase/auth", () => ({ getClinicContext: async () => session.current }));

import { GET as listRoute } from "@/app/api/agents/actions/route";
import { POST as approveRoute } from "@/app/api/agents/actions/[id]/approve/route";
import { POST as rejectRoute } from "@/app/api/agents/actions/[id]/reject/route";
import { executeToolGoverned } from "@/lib/agents/governance";
import { IDS, NOW, ORG_A, ORG_B, createFakeDb, uid, type FakeDb, type FakeRow } from "./fakeDb";

const USER_A = uid(901);
const USER_B = uid(902);
let fake: FakeDb;

const login = (org: string, userId: string, role: "admin" | "staff" = "admin") => {
  session.current = { db: fake.asClient(), organizationId: org, user: { id: userId }, profile: { role } };
};
// Como la UI: siempre JSON; sin cuerpo se envia {}.
const post = (url: string, body: unknown = {}, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
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
      new NextRequest("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{no json" }),
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

// --- R-01: rol para aprobar acciones criticas ---
async function proposeNonCritical(): Promise<string> {
  const res = await executeToolGoverned(
    "sales",
    "create_opportunity",
    { contact_id: IDS.contactA1, title: "Limpieza", value: 900 },
    { organizationId: ORG_A, db: fake.asClient(), now: NOW },
  );
  if (!res.ok) throw new Error("no se pudo proponer");
  return (res.data as { action_id: string }).action_id;
}
const statusOf = (id: string) => fake.tables.agent_actions.find((a) => a.id === id)?.status;

describe("R-01: aprobar acciones criticas exige admin", () => {
  it("staff recibe 403 con mensaje claro y la accion sigue pendiente sin tocar datos", async () => {
    const id = await propose();
    login(ORG_A, USER_A, "staff");
    const before = fake.snapshot();
    const res = await approve(id);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Solo un administrador puede aprobar acciones criticas");
    expect(statusOf(id)).toBe("pending");
    expect(fake.snapshot()).toEqual(before);
    expect(opps()).toHaveLength(0);
  });

  it("staff no puede volver critica una accion modificando valores, pero si aprobar la que sigue no critica", async () => {
    const id = await proposeNonCritical();
    login(ORG_A, USER_A, "staff");
    const bumped = await approve(id, { input: { contact_id: IDS.contactA1, title: "Limpieza", value: 900, discount_percent: 40 } });
    expect(bumped.status).toBe(403);
    expect(statusOf(id)).toBe("pending");
  });

  it("admin aprueba la critica (200)", async () => {
    const id = await propose();
    login(ORG_A, USER_A, "admin");
    expect((await approve(id)).status).toBe(200);
    expect(statusOf(id)).toBe("executed");
  });

  it("staff aprueba una accion no critica", async () => {
    const id = await proposeNonCritical();
    login(ORG_A, USER_A, "staff");
    expect((await approve(id)).status).toBe(200);
    expect(statusOf(id)).toBe("executed");
  });

  it("staff puede rechazar una critica", async () => {
    const id = await propose();
    login(ORG_A, USER_A, "staff");
    expect((await reject(id, { notes: "no" })).status).toBe(200);
    expect(statusOf(id)).toBe("rejected");
  });

  it("otra organizacion no cambia nada, ni siendo admin", async () => {
    const id = await propose();
    login(ORG_B, USER_B, "admin");
    const before = fake.snapshot();
    expect((await approve(id)).status).toBe(404);
    expect(fake.snapshot()).toEqual(before);
  });

  it("la lista y el detalle informan is_admin para la UI", async () => {
    await propose();
    login(ORG_A, USER_A, "staff");
    expect((await (await list("?status=pending")).json()).is_admin).toBe(false);
    login(ORG_A, USER_A, "admin");
    expect((await (await list("?status=pending")).json()).is_admin).toBe(true);
  });
});

// --- R-02: CSRF ---
describe("R-02: JSON obligatorio y Origin del mismo host", () => {
  it("text/plain se rechaza con 415 y no cambia nada", async () => {
    const id = await propose();
    const req = new NextRequest(`http://localhost/api/agents/actions/${id}/reject`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    });
    expect((await rejectRoute(req, idParams(id))).status).toBe(415);
    const noType = new NextRequest(`http://localhost/api/agents/actions/${id}/approve`, { method: "POST" });
    expect((await approveRoute(noType, idParams(id))).status).toBe(415);
    expect(statusOf(id)).toBe("pending");
  });

  it("Origin ajeno se rechaza con 403; el mismo host y sin Origin pasan", async () => {
    const id = await propose();
    const evil = post(`/api/agents/actions/${id}/reject`, {}, { origin: "http://evil.example" });
    expect((await rejectRoute(evil, idParams(id))).status).toBe(403);
    expect(statusOf(id)).toBe("pending");
    const same = post(`/api/agents/actions/${id}/reject`, {}, { origin: "http://localhost" });
    expect((await rejectRoute(same, idParams(id))).status).toBe(200);
  });

  it("chat y settings aplican la misma guardia", async () => {
    const { POST: chat } = await import("@/app/api/agents/chat/route");
    const { PATCH: settings } = await import("@/app/api/agents/settings/route");
    const plain = (url: string, method: string) =>
      new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "text/plain" }, body: "{}" });
    expect((await chat(plain("/api/agents/chat", "POST"))).status).toBe(415);
    expect((await settings(plain("/api/agents/settings", "PATCH"))).status).toBe(415);
    const foreign = new NextRequest("http://localhost/api/agents/chat", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ text: "hola" }),
    });
    expect((await chat(foreign)).status).toBe(403);
  });
});
