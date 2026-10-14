import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type Session = { db: SupabaseClient; organizationId: string; user: { id: string }; profile: { role: "admin" | "staff" } };
const session = vi.hoisted(() => ({ current: null as null | Session }));
vi.mock("@/lib/supabase/auth", () => ({ getClinicContext: async () => session.current }));

import { GET as settingsGet, PATCH as settingsPatch } from "@/app/api/agents/settings/route";
import { GET as countRoute } from "@/app/api/agents/pending-count/route";
import { GET as detailRoute } from "@/app/api/agents/actions/[id]/route";
import { GET as activitiesRoute } from "@/app/api/activities/route";
import { executeToolGoverned } from "@/lib/agents/governance";
import { handleMessage } from "@/lib/agents/orchestrator";
import { applyAgentConfigUpdate, resolveAgentConfig } from "@/lib/agents/settings";
import { classificationResponse, createMockLlm, textResponse } from "./mockLlm";
import { IDS, NOW, ORG_A, ORG_B, createFakeDb, uid, type FakeDb, type FakeRow } from "./fakeDb";

let fake: FakeDb;
const login = (org: string, role: "admin" | "staff" = "admin") => {
  session.current = { db: fake.asClient(), organizationId: org, user: { id: uid(901) }, profile: { role } };
};
const setSettings = (org: string, settings: Record<string, unknown>) => {
  const row = fake.tables.organizations.find((o) => o.id === org)!;
  row.settings = { ...(row.settings as object), ...settings };
};
const ctxOf = (org = ORG_A) => ({ organizationId: org, db: fake.asClient(), now: NOW });
const patch = (body: unknown) => settingsPatch(new NextRequest("http://localhost/api/agents/settings", { method: "PATCH", body: JSON.stringify(body) }));
const get = (url: string) => new NextRequest(`http://localhost${url}`);
const note = { contact_id: IDS.contactA1, note: "Prefiere WhatsApp" };

beforeEach(() => {
  fake = createFakeDb();
  login(ORG_A);
});
afterEach(() => {
  session.current = null;
});

describe("resolveAgentConfig", () => {
  it("sin ajustes: todos habilitados con el nivel global (compatibilidad Fase 2)", () => {
    const cfg = resolveAgentConfig({ agent_autonomy: "conservative" });
    expect(cfg.autonomy).toBe("conservative");
    for (const agent of Object.values(cfg.agents)) expect(agent).toEqual({ enabled: true, autonomy: "conservative" });
  });

  it("el ajuste por agente gana al global y los valores invalidos se ignoran", () => {
    const cfg = resolveAgentConfig({
      agent_autonomy: "balanced",
      agents: { sales: { enabled: false, autonomy: "autonomous" }, booking: { autonomy: "root", enabled: "no" } },
    });
    expect(cfg.agents.sales).toEqual({ enabled: false, autonomy: "autonomous" });
    expect(cfg.agents.booking).toEqual({ enabled: true, autonomy: "balanced" });
    expect(cfg.agents.analyst).toEqual({ enabled: true, autonomy: "balanced" });
  });

  it("applyAgentConfigUpdate conserva el resto de claves", () => {
    const next = applyAgentConfigUpdate({ business_hours: { start: "09:00" }, agent_autonomy: "balanced" }, { sales: { enabled: false } });
    expect(next).toMatchObject({ business_hours: { start: "09:00" }, agent_autonomy: "balanced", agents: { sales: { enabled: false } } });
  });
});

describe("autonomia por agente en el interceptor", () => {
  it("un agente conservador frena su escritura y otro autonomo la ejecuta", async () => {
    setSettings(ORG_A, { agent_autonomy: "balanced", agents: { receptionist: { autonomy: "conservative" }, sales: { autonomy: "autonomous" } } });
    const frenada = await executeToolGoverned("receptionist", "update_contact_notes", note, ctxOf());
    expect(frenada.ok && (frenada.data as { status: string }).status).toBe("pending_approval");
    expect(fake.tables.agent_actions[0]).toMatchObject({ agent_name: "receptionist", status: "pending" });
    expect(String(fake.tables.contacts.find((c) => c.id === IDS.contactA1)!.notes)).not.toContain("WhatsApp");

    // sales en autonomous crea oportunidad sin aprobacion (receptionist en conservador la frenaria).
    const libre = await executeToolGoverned("sales", "create_opportunity", { contact_id: IDS.contactA1, title: "Plan anual", value: 900 }, ctxOf());
    expect(libre.ok && (libre.data as { status?: string }).status).toBeUndefined();
    expect(fake.tables.opportunities.some((o) => o.title === "Plan anual")).toBe(true);
  });

  it("un agente deshabilitado no ejecuta ni crea acciones; los demas siguen", async () => {
    setSettings(ORG_A, { agents: { receptionist: { enabled: false } } });
    const before = fake.writes;
    const res = await executeToolGoverned("receptionist", "search_contact", { query: "Maria" }, ctxOf());
    expect(res).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(fake.writes).toBe(before);
    expect(fake.tables.agent_actions).toHaveLength(0);
    const otro = await executeToolGoverned("booking", "search_contact", { query: "Maria" }, ctxOf());
    expect(otro.ok).toBe(true);
  });

  it("las criticas siguen exigiendo aprobacion aunque el agente sea autonomo", async () => {
    setSettings(ORG_A, { agents: { sales: { autonomy: "autonomous" } } });
    const res = await executeToolGoverned("sales", "update_stage", { opportunity_id: IDS.oppA1, stage: "won" }, ctxOf());
    expect(res.ok && (res.data as { status: string }).status).toBe("pending_approval");
  });

  it("el ajuste de una organizacion no afecta a otra", async () => {
    setSettings(ORG_B, { agents: { receptionist: { enabled: false } } });
    const res = await executeToolGoverned("receptionist", "search_contact", { query: "Maria" }, ctxOf(ORG_A));
    expect(res.ok).toBe(true);
  });
});

describe("el orquestador no ejecuta agentes deshabilitados", () => {
  it("responde con aviso y no llama al especialista", async () => {
    setSettings(ORG_A, { agents: { booking: { enabled: false } } });
    const llm = createMockLlm([classificationResponse("booking"), textResponse("no deberia verse")]);
    const out = await handleMessage("quiero agendar una cita", { llm, organizationId: ORG_A, db: fake.asClient(), now: NOW });
    expect(out).toMatchObject({ agent: "booking", disabled: true, tools: [] });
    expect(out.reply).toMatch(/deshabilitado/);
    expect(llm.calls).toHaveLength(1); // solo la clasificacion
  });
});

describe("GET/PATCH /api/agents/settings", () => {
  it("sin sesion 401; staff puede leer pero no cambiar (403)", async () => {
    session.current = null;
    expect((await settingsGet()).status).toBe(401);
    expect((await patch({ agents: {} })).status).toBe(401);
    login(ORG_A, "staff");
    const read = await settingsGet();
    expect(read.status).toBe(200);
    expect((await read.json()).is_admin).toBe(false);
    expect((await patch({ agents: { sales: { enabled: false } } })).status).toBe(403);
    expect(resolveAgentConfig(fake.tables.organizations[0].settings).agents.sales.enabled).toBe(true);
  });

  it("admin guarda, el cambio persiste y solo afecta a su organizacion", async () => {
    const res = await patch({ agents: { sales: { enabled: false, autonomy: "conservative" } } });
    expect(res.status).toBe(200);
    expect((await res.json()).config.agents.sales).toEqual({ enabled: false, autonomy: "conservative" });
    expect(resolveAgentConfig(fake.tables.organizations.find((o) => o.id === ORG_A)!.settings).agents.sales.enabled).toBe(false);
    expect(resolveAgentConfig(fake.tables.organizations.find((o) => o.id === ORG_B)!.settings).agents.sales.enabled).toBe(true);
    expect((fake.tables.organizations[0].settings as { business_hours?: unknown }).business_hours).toBeTruthy();
  });

  it("rechaza agentes, niveles y claves desconocidas", async () => {
    expect((await patch({ agents: { hacker: { enabled: false } } })).status).toBe(400);
    expect((await patch({ agents: { sales: { autonomy: "root" } } })).status).toBe(400);
    expect((await patch({ agents: { sales: { enabled: false, extra: 1 } } })).status).toBe(400);
    expect((await patch({ organization_id: ORG_B, agents: {} })).status).toBe(400);
  });
});

describe("pending-count y detalle con diff", () => {
  async function propose(input: Record<string, unknown>, tool = "update_stage"): Promise<string> {
    const res = await executeToolGoverned("sales", tool, input, ctxOf());
    if (!res.ok) throw new Error("no se pudo proponer");
    return (res.data as { action_id: string }).action_id;
  }

  it("cuenta solo pendientes de la organizacion de la sesion", async () => {
    await propose({ opportunity_id: IDS.oppA1, stage: "won" });
    await propose({ opportunity_id: IDS.oppA2, stage: "lost" });
    fake.tables.agent_actions.push({ id: uid(999), organization_id: ORG_B, agent_name: "sales", action_type: "update_stage", payload: {}, requires_approval: true, status: "pending", proposed_at: NOW.toISOString() } as FakeRow);
    expect(await (await countRoute()).json()).toEqual({ count: 2 });
    login(ORG_B);
    expect(await (await countRoute()).json()).toEqual({ count: 1 });
    session.current = null;
    expect((await countRoute()).status).toBe(401);
  });

  it("el detalle trae estado actual vs propuesto y motivo", async () => {
    const id = await propose({ opportunity_id: IDS.oppA1, stage: "won" });
    const res = await detailRoute(get(`/api/agents/actions/${id}`), { params: { id } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.diff).toMatchObject({ kind: "update", entity: "Oportunidad", target: "Opp vieja A" });
    expect(body.diff.rows[0]).toMatchObject({ field: "stage", current: "proposal", proposed: "won" });
    expect(body.action.payload.reason).toBeTruthy();
  });

  it("un id de otra organizacion es 404 y no filtra datos", async () => {
    const id = await propose({ opportunity_id: IDS.oppA1, stage: "won" });
    login(ORG_B);
    expect((await detailRoute(get(`/api/agents/actions/${id}`), { params: { id } })).status).toBe(404);
  });

  it("el diff de una entidad ajena no revela su estado", async () => {
    const id = await propose({ opportunity_id: IDS.oppB1, stage: "won" });
    const body = await (await detailRoute(get(`/api/agents/actions/${id}`), { params: { id } })).json();
    expect(body.diff.target).toBeNull();
    expect(body.diff.rows[0].current).toBeNull();
  });
});

describe("GET /api/activities", () => {
  it("devuelve el historial del contacto con autor, solo de la organizacion", async () => {
    fake.tables.activities.push({ id: uid(150), organization_id: ORG_A, contact_id: IDS.contactA1, type: "agent_interaction", title: "Atendido por agente", status: "completed", performed_by_type: "agent", performed_by_id: "receptionist", created_at: "2026-10-14T09:00:00.000Z" });
    const res = await activitiesRoute(get(`/api/activities?contact_id=${IDS.contactA1}`));
    expect(res.status).toBe(200);
    const { activities } = await res.json();
    expect(activities.length).toBeGreaterThanOrEqual(3);
    expect(activities.every((a: FakeRow) => a.organization_id === ORG_A)).toBe(true);
    expect(activities[0]).toMatchObject({ performed_by_type: "agent", performed_by_id: "receptionist" });
    login(ORG_B);
    const other = await (await activitiesRoute(get(`/api/activities?contact_id=${IDS.contactA1}`))).json();
    expect(other.activities).toEqual([]);
  });

  it("exige filtro valido y sesion", async () => {
    expect((await activitiesRoute(get("/api/activities"))).status).toBe(400);
    expect((await activitiesRoute(get("/api/activities?contact_id=nope"))).status).toBe(400);
    session.current = null;
    expect((await activitiesRoute(get(`/api/activities?contact_id=${IDS.contactA1}`))).status).toBe(401);
  });
});
