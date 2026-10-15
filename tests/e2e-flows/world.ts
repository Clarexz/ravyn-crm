// Mundo de pruebas de integracion de extremo a extremo (Fase 6). Dueno: agente maestro.
// Una base de demo real (DemoDb), una sesion simulada y las rutas HTTP reales de la app
// (chat, bandeja, aprobar/rechazar, pipeline...). Solo se simula la sesion (getClinicContext) y el reloj.
//
// Uso en cada archivo de prueba:
//   vi.mock("@/lib/supabase/auth", async () => (await import("./world")).authMock);
import { vi } from "vitest";
import { NextRequest } from "next/server";
import { DemoDb, seedDemoData, type Row } from "@/lib/demo";
import { DEMO_ORG_ID, DEMO_OTHER_ORG_ID, DEMO_USER_ID } from "@/lib/demo/config";
import { DEMO_OTHER_USER_ID, DEMO_STAFF_IDS } from "@/lib/demo/seed";
import { switchDemoVertical } from "@/lib/demo/verticals";
import type { IndustryType } from "@/types/database";

export { DEMO_ORG_ID, DEMO_OTHER_ORG_ID, DEMO_USER_ID, DEMO_STAFF_IDS, DEMO_OTHER_USER_ID };
export type { Row };

export const session = { current: null as null | Record<string, unknown> };
export const authMock = { getClinicContext: async () => session.current };

// Miercoles 14-oct-2026 10:00 hora de Ciudad de Mexico.
export const T0 = new Date("2026-10-14T16:00:00.000Z");
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export const JSON_HEADERS = { "content-type": "application/json" };
const BASE = "http://localhost";

export type Role = "admin" | "staff";
export type ChatBody = {
  agent: string;
  reply: string;
  tools: Array<{ name: string; ok: boolean; errorCode?: string; pending?: { actionId: string; summary: string } }>;
  disabled: boolean;
};

export class World {
  readonly db: DemoDb;
  clock: Date;

  constructor(opts: { vertical?: IndustryType; now?: Date } = {}) {
    this.clock = opts.now ?? T0;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(this.clock);
    this.db = new DemoDb({ now: () => new Date(this.clock) });
    seedDemoData(this.db, this.clock);
    if (opts.vertical && opts.vertical !== "health") switchDemoVertical(this.db, DEMO_ORG_ID, opts.vertical, this.clock);
    this.login("admin");
  }

  dispose(): void {
    vi.useRealTimers();
    session.current = null;
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
    vi.setSystemTime(this.clock);
  }

  login(role: Role, org: string = DEMO_ORG_ID): void {
    const userId = org === DEMO_ORG_ID ? (role === "admin" ? DEMO_USER_ID : DEMO_STAFF_IDS.reception) : DEMO_OTHER_USER_ID;
    session.current = {
      db: this.db.asClient(),
      supabase: null,
      organizationId: org,
      clinicId: org,
      user: { id: userId },
      profile: { id: userId, role, organization_id: org, clinic_id: org, full_name: "Prueba" },
    };
  }

  logout(): void {
    session.current = null;
  }

  rows(table: string, org: string = DEMO_ORG_ID): Row[] {
    return this.db.tables[table].filter((r) => r.organization_id === org);
  }

  // Copia profunda de TODO lo que pertenece a una organizacion (para probar que no cambia).
  snapshot(org: string): string {
    const out: Record<string, Row[]> = {};
    for (const table of Object.keys(this.db.tables)) {
      if (table === "organizations") {
        out[table] = this.db.tables[table].filter((r) => r.id === org);
      } else {
        out[table] = this.db.tables[table].filter((r) => r.organization_id === org);
      }
    }
    return JSON.stringify(out);
  }

  // Todas las filas de una tabla de OTRA organizacion que mencionan un texto (no debe haber fugas).
  contactByName(name: string, org: string = DEMO_ORG_ID): Row {
    const c = this.rows("contacts", org).find((r) => r.full_name === name);
    if (!c) throw new Error(`contacto no encontrado: ${name}`);
    return c;
  }

  // --- rutas HTTP reales ---

  async chat(text: string, init: { headers?: Record<string, string> } = {}): Promise<{ status: number; body: ChatBody }> {
    const { POST } = await import("@/app/api/agents/chat/route");
    const res = await POST(
      new NextRequest(`${BASE}/api/agents/chat`, { method: "POST", headers: init.headers ?? JSON_HEADERS, body: JSON.stringify({ text }) }),
    );
    return { status: res.status, body: (await res.json()) as ChatBody };
  }

  async inbox(query = "status=pending"): Promise<{ status: number; body: { actions: Row[]; is_admin?: boolean } }> {
    const { GET } = await import("@/app/api/agents/actions/route");
    const res = await GET(new NextRequest(`${BASE}/api/agents/actions?${query}`));
    return { status: res.status, body: await res.json() };
  }

  async approve(id: string, body: unknown = {}): Promise<{ status: number; body: Record<string, unknown> }> {
    const { POST } = await import("@/app/api/agents/actions/[id]/approve/route");
    const res = await POST(
      new NextRequest(`${BASE}/api/agents/actions/${id}/approve`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) }),
      { params: { id } },
    );
    return { status: res.status, body: await res.json() };
  }

  async reject(id: string, body: unknown = {}): Promise<{ status: number; body: Record<string, unknown> }> {
    const { POST } = await import("@/app/api/agents/actions/[id]/reject/route");
    const res = await POST(
      new NextRequest(`${BASE}/api/agents/actions/${id}/reject`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) }),
      { params: { id } },
    );
    return { status: res.status, body: await res.json() };
  }

  async activities(contactId: string): Promise<Array<Row & { author_name: string | null; assignee_name: string | null }>> {
    const { GET } = await import("@/app/api/activities/route");
    const res = await GET(new NextRequest(`${BASE}/api/activities?contact_id=${contactId}&limit=200`));
    return (await res.json()).activities;
  }

  action(id: string): Row {
    const a = this.db.tables.agent_actions.find((r) => r.id === id);
    if (!a) throw new Error(`accion no encontrada: ${id}`);
    return a;
  }
}

// Fija la autonomia de la organizacion (nivel global) o de un agente.
export function setAutonomy(world: World, level: "conservative" | "balanced" | "autonomous", org: string = DEMO_ORG_ID): void {
  const row = world.db.tables.organizations.find((o) => o.id === org);
  if (!row) throw new Error("organizacion no encontrada");
  const settings = { ...((row.settings as Row | null) ?? {}), agent_autonomy: level };
  delete (settings as Row).agents;
  world.db.updateRow("organizations", row, { settings });
}
