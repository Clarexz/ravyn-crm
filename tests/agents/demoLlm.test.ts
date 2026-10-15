import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoLlmClient } from "@/lib/agents/demoLlm";
import { approveAction, executeToolGoverned } from "@/lib/agents/governance";
import { createLlmClient } from "@/lib/agents/llm";
import { handleMessage } from "@/lib/agents/orchestrator";
import { IDS, NOW, ORG_A, createFakeDb, type FakeDb, type FakeRow } from "./fakeDb";

let fake: FakeDb;
const USER = "00000000-0000-4000-8000-0000000000a1";
const run = (text: string) =>
  handleMessage(text, { llm: new DemoLlmClient(), organizationId: ORG_A, db: fake.asClient(), now: NOW });
const actions = (): FakeRow[] => fake.tables.agent_actions;

beforeEach(() => {
  fake = createFakeDb();
});
afterEach(() => vi.unstubAllEnvs());

describe("createLlmClient segun el modo", () => {
  it("modo demo devuelve el LLM de demo aunque no haya clave", () => {
    vi.stubEnv("RAVYN_DATA_MODE", "demo");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(createLlmClient()).toBeInstanceOf(DemoLlmClient);
  });
  it("modo live sin clave falla; con clave usa Anthropic", () => {
    vi.stubEnv("RAVYN_DATA_MODE", "live");
    expect(() => createLlmClient({} as NodeJS.ProcessEnv)).toThrow();
    expect(createLlmClient({ ANTHROPIC_API_KEY: "sk-test" } as unknown as NodeJS.ProcessEnv)).not.toBeInstanceOf(DemoLlmClient);
  });
});

describe("demoLlm: flujo completo mensaje -> tool_calls -> pending -> approve", () => {
  it("descuento del 20%: busca al contacto, propone y queda pendiente", async () => {
    const before = fake.snapshot();
    const out = await run("Dale un 20% de descuento a Maria Lopez en el blanqueamiento de $4,800");
    expect(out.agent).toBe("sales");
    expect(out.tools.map((t) => t.name)).toEqual(["search_contact", "create_opportunity"]);
    expect(out.reply).toMatch(/espera de aprobacion/);
    expect(fake.tables.opportunities).toEqual(before.opportunities);
    expect(actions()).toHaveLength(2); // traza de la busqueda + la accion pendiente
    const pending = actions().find((a) => a.status === "pending")!;
    expect(pending).toMatchObject({
      organization_id: ORG_A,
      agent_name: "sales",
      action_type: "create_opportunity",
      requires_approval: true,
      payload: { input: { contact_id: IDS.contactA1, discount_percent: 20, value: 4800 } },
    });

    const approved = await approveAction({ db: fake.asClient(), organizationId: ORG_A, userId: USER, actionId: pending.id as string, isAdmin: true });
    expect(approved.status).toBe(200);
    expect(fake.tables.opportunities.find((o) => o.title === "Propuesta para Maria Lopez")).toMatchObject({
      contact_id: IDS.contactA1,
      value: 4800,
    });
  });

  it("es determinista: la misma conversacion produce las mismas llamadas", async () => {
    const a = new DemoLlmClient();
    const req = { tier: "specialist" as const, system: "Eres el agente de Ventas", messages: [{ role: "user" as const, content: "Cotiza 15% a Maria Lopez" }] };
    expect(await a.complete(req)).toEqual(await new DemoLlmClient().complete(req));
  });

  it("agendar: consulta disponibilidad y propone la cita (queda pendiente en balanced)", async () => {
    const out = await run("Agenda una cita para Maria Lopez manana");
    expect(out.agent).toBe("booking");
    expect(out.tools.map((t) => t.name)).toEqual(["search_contact", "check_availability", "create_booking"]);
    expect(out.reply).toMatch(/espera de aprobacion/);
    const pending = actions().find((a) => a.status === "pending")!;
    expect(pending.action_type).toBe("create_booking");
    expect((pending.payload as { input: { scheduled_at: string } }).input.scheduled_at).toBe("2026-10-15T09:00:00.000Z");
    expect(fake.tables.bookings).toHaveLength(3);
    const res = await approveAction({ db: fake.asClient(), organizationId: ORG_A, userId: USER, actionId: pending.id as string, isAdmin: true, now: NOW });
    expect(res.status).toBe(200);
    expect(fake.tables.bookings).toHaveLength(4);
  });

  it("seguimiento: detecta oportunidades estancadas y crea una tarea", async () => {
    const out = await run("Dame seguimiento de los prospectos sin respuesta");
    expect(out.agent).toBe("follow_up");
    expect(out.tools.map((t) => t.name)).toEqual(["find_stale_opportunities", "create_task"]);
    expect(fake.tables.activities.some((a) => String(a.title).startsWith("Dar seguimiento a"))).toBe(true);
    expect(out.reply).toMatch(/tarea/);
  });

  it("metricas: entrega el briefing del Analista con las cifras de la base", async () => {
    const out = await run("Dame el reporte de metricas del mes");
    expect(out.agent).toBe("analyst");
    expect(out.tools.map((t) => t.name)).toEqual(["generate_briefing"]);
    expect(out.reply).toMatch(/Briefing de los últimos 30 días/);
    expect(out.reply).toMatch(/Acciones recomendadas/);
  });

  it("alta de cliente: crea el contacto si no existe y no lo duplica si existe", async () => {
    const created = await run("Quiero dar de alta a Pedro Ramirez, tel 55 1234 5678");
    expect(created.agent).toBe("receptionist");
    expect(created.tools.map((t) => t.name)).toEqual(["search_contact", "create_contact"]);
    expect(fake.tables.contacts.find((c) => c.full_name === "Pedro Ramirez")).toMatchObject({ organization_id: ORG_A, phone: "55 1234 5678" });
    const dup = await run("Quiero dar de alta a Maria Lopez");
    expect(dup.tools.map((t) => t.name)).toEqual(["search_contact"]);
    expect(dup.reply).toMatch(/ya esta registrado/);
  });

  it("contacto inexistente o sin nombre: responde sin proponer acciones", async () => {
    const missing = await run("Dale 20% de descuento a Zacarias Inexistente");
    expect(missing.reply).toMatch(/No encontre/);
    expect(actions().filter((a) => a.status === "pending")).toHaveLength(0);
    const noName = await run("Quiero una cotizacion con descuento");
    expect(noName.reply).toMatch(/nombre/);
    expect(noName.tools).toEqual([]);
  });

  it("un contacto de otra organizacion no se encuentra", async () => {
    const out = await run("Dale 20% de descuento a Maria Ajena");
    expect(out.reply).toMatch(/No encontre/);
  });

  it("el especialista sin permiso no recibe llamadas de otro agente", async () => {
    const res = await executeToolGoverned("analyst", "create_task", { title: "x" }, { organizationId: ORG_A, db: fake.asClient(), now: NOW });
    expect(res).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  });
});

describe("extractName: prefijos fuertes y ultima coincidencia", () => {
  it("prefiere el nombre tras 'para' sobre el servicio tras 'de'", async () => {
    const { extractName } = await import("@/lib/agents/demoLlm");
    expect(extractName("Aplica 20% de descuento en una cotizacion de Blanqueamiento para Andrea Solis Montoya")).toBe(
      "Andrea Solis Montoya",
    );
  });
});
