// Fase 6: TODAS las herramientas del catalogo (TOOL_NAMES) se ejercitan por el flujo completo
//   mensaje -> orquestador (clasificacion) -> especialista (bucle del LLM) -> interceptor de gobernanza -> herramienta -> base,
// y cada una se prueba contra la otra organizacion (aislamiento multi-tenant). Si se agrega una herramienta al catalogo
// sin caso de flujo o sin sonda de aislamiento, las pruebas de cobertura de abajo fallan.
//
// Dos tipos de LLM: el preprogramado de la demo (DemoLlmClient, el mismo que usa la app) para las herramientas que alcanza,
// y un LLM con guion (createMockLlm) para el resto; en ambos el orquestador, el especialista y la gobernanza son los reales.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoLlmClient } from "@/lib/agents/demoLlm";
import { executeToolGoverned } from "@/lib/agents/governance";
import type { LlmClient } from "@/lib/agents/llm";
import { handleMessage } from "@/lib/agents/orchestrator";
import { AGENT_TOOL_PERMISSIONS, TOOL_NAMES, canUseTool, type ToolName } from "@/lib/agents/permissions";
import type { SpecialistName } from "@/lib/agents/prompts";
import { TOOL_REGISTRY } from "@/lib/agents/tools";
import type { AgentName } from "@/types/database";
import { createMockLlm, classificationResponse, textResponse, toolCallResponse } from "../agents/mockLlm";
import { DAY, DEMO_ORG_ID, DEMO_OTHER_ORG_ID, World, setAutonomy, type Row } from "./world";

vi.mock("@/lib/supabase/auth", async () => (await import("./world")).authMock);

let w: World;
beforeEach(() => {
  w = new World();
});
afterEach(() => w.dispose());

type Run = Awaited<ReturnType<typeof handleMessage>>;
type FlowCase = {
  id: string;
  covers: ToolName[];
  agent: SpecialistName;
  message: (w: World) => string;
  llm: "demo" | ((w: World) => LlmClient);
  setup?: (w: World) => void | Promise<void>;
  // true: la accion queda en espera y una persona la aprueba (administrador) para ver el efecto en la base.
  approve?: boolean;
  verify: (w: World, run: Run) => void | Promise<void>;
};

const A = DEMO_ORG_ID;
const B = DEMO_OTHER_ORG_ID;
const mariana = (w: World) => w.contactByName("Mariana Vega Torres");
const oppOf = (w: World, title: string) => w.rows("opportunities").find((o) => o.title === title)!;
const futureBooking = (w: World) =>
  w.rows("bookings").find((b) => ["pending", "confirmed"].includes(b.status as string) && Date.parse(String(b.scheduled_at)) > w.clock.getTime() + DAY)!;
const nameOf = (w: World, id: unknown) => String(w.rows("contacts").find((c) => c.id === id)!.full_name);
const itemOf = (w: World, name: string) => w.rows("items").find((i) => i.name === name)!;

function scripted(agent: SpecialistName, calls: (w: World) => Array<{ name: string; input: unknown }>): (w: World) => LlmClient {
  return (world) => {
    const planned = calls(world);
    return createMockLlm((request) => {
      if (request.tier === "classifier") return classificationResponse(agent);
      return request.messages.some((m) => m.role === "tool") ? textResponse("Listo.") : toolCallResponse(planned.map((c, i) => ({ id: `t${i}`, ...c })));
    });
  };
}
const lastResult = (w: World, tool: string): Row => {
  const a = [...w.rows("agent_actions")].reverse().find((r) => r.action_type === tool)!;
  return a;
};

const FLOWS: FlowCase[] = [
  {
    id: "recepcion: paciente ya registrado (solo busca)",
    covers: ["search_contact"],
    agent: "receptionist",
    message: () => "Registra un nuevo paciente llamado Mariana Vega Torres",
    llm: "demo",
    verify: (w, run) => {
      expect(run.tools.map((t) => t.name)).toEqual(["search_contact"]);
      expect(run.reply).toMatch(/ya esta registrado/);
      expect(w.rows("contacts").filter((c) => c.full_name === "Mariana Vega Torres")).toHaveLength(1);
    },
  },
  {
    id: "recepcion: alta de un prospecto nuevo",
    covers: ["search_contact", "create_contact"],
    agent: "receptionist",
    message: () => "Registra un nuevo paciente llamado Ximena Roldan Pais, telefono +52 55 5550 9999",
    llm: "demo",
    verify: (w) => {
      expect(w.contactByName("Ximena Roldan Pais")).toMatchObject({ organization_id: A, source: "agent_receptionist", phone: "+52 55 5550 9999" });
      expect(w.rows("activities").some((a) => a.title === "Contacto creado por agente")).toBe(true);
    },
  },
  {
    id: "recepcion: nota en el expediente (guion)",
    covers: ["update_contact_notes"],
    agent: "receptionist",
    message: () => "Hola, agrega una nota: prefiere citas por la tarde",
    llm: scripted("receptionist", (w) => [{ name: "update_contact_notes", input: { contact_id: mariana(w).id, note: "Prefiere citas por la tarde" } }]),
    verify: (w) => {
      expect(String(mariana(w).notes)).toContain("Prefiere citas por la tarde");
      expect(w.rows("activities").some((a) => a.type === "note" && a.title === "Nota agregada por agente")).toBe(true);
    },
  },
  {
    id: "recepcion: consulta de disponibilidad (guion)",
    covers: ["check_availability"],
    agent: "receptionist",
    message: () => "Hola, que horarios hay el 2026-11-03?",
    llm: scripted("receptionist", () => [{ name: "check_availability", input: { date_from: "2026-11-03", date_to: "2026-11-03", duration_minutes: 30 } }]),
    verify: (w, run) => {
      expect(run.tools).toEqual([{ name: "check_availability", ok: true }]);
      const result = (lastResult(w, "check_availability").execution_result as { data: { total_slots: number } }).data;
      expect(result.total_slots).toBeGreaterThan(0);
    },
  },
  {
    id: "ventas: cotizacion que se vuelve oportunidad",
    covers: ["search_contact", "create_opportunity"],
    agent: "sales",
    message: () => "Cotiza para Mariana Vega Torres un plan de $5,000",
    llm: "demo",
    approve: true,
    verify: (w) => {
      const created = w.rows("opportunities").find((o) => o.title === "Propuesta para Mariana Vega Torres");
      expect(created).toMatchObject({ organization_id: A, contact_id: mariana(w).id, value: 5000, stage: "lead" });
    },
  },
  {
    id: "ventas: mover una oportunidad a calificada (guion)",
    covers: ["update_stage"],
    agent: "sales",
    message: () => "Mueve la oportunidad de Mariana a calificada",
    llm: scripted("sales", (w) => [{ name: "update_stage", input: { opportunity_id: oppOf(w, "Ortodoncia completa - Mariana Vega").id, stage: "qualified", reason: "Confirmo presupuesto" } }]),
    verify: (w) => {
      expect(oppOf(w, "Ortodoncia completa - Mariana Vega").stage).toBe("qualified");
      expect(w.rows("activities").some((a) => a.type === "stage_change" && a.title === "Etapa: negotiation a qualified")).toBe(true);
    },
  },
  {
    id: "ventas: calculo de cotizacion con descuento permitido (guion)",
    covers: ["calculate_quote"],
    agent: "sales",
    message: () => "Cotiza 2 limpiezas con 5% de descuento",
    llm: scripted("sales", (w) => [{ name: "calculate_quote", input: { items: [{ item_id: itemOf(w, "Limpieza dental").id, quantity: 2 }], discount_percent: 5 } }]),
    verify: (w) => {
      const data = (lastResult(w, "calculate_quote").execution_result as { data: { subtotal: number; total: number } }).data;
      expect(data).toMatchObject({ subtotal: 1600, total: 1520 });
    },
  },
  {
    id: "ventas: registro de un mensaje enviado (guion)",
    covers: ["log_message"],
    agent: "sales",
    message: () => "Registra que le envie la cotizacion a Mariana por correo",
    llm: scripted("sales", (w) => [{ name: "log_message", input: { contact_id: mariana(w).id, direction: "outbound", content: "Se envio la cotizacion por correo" } }]),
    verify: (w) => {
      const m = w.rows("activities").find((a) => a.type === "message" && a.description === "Se envio la cotizacion por correo");
      expect(m).toMatchObject({ organization_id: A, performed_by_type: "agent", performed_by_id: "sales", contact_id: mariana(w).id });
    },
  },
  {
    id: "agenda: cita nueva con aprobacion",
    covers: ["search_contact", "check_availability", "create_booking"],
    agent: "booking",
    message: () => "Agenda una cita para Mariana Vega Torres el 2026-11-03",
    llm: "demo",
    approve: true,
    verify: (w) => {
      const b = w.rows("bookings").find((x) => x.contact_id === mariana(w).id && String(x.scheduled_at).startsWith("2026-11-03"));
      expect(b).toMatchObject({ organization_id: A, source: "agent_booking", status: "pending" });
    },
  },
  {
    id: "agenda: reprogramar una cita con aprobacion",
    covers: ["search_contact", "check_availability", "reschedule_booking"],
    agent: "booking",
    message: (w) => `Reprograma la cita de ${nameOf(w, futureBooking(w).contact_id)} para el 2026-11-04`,
    llm: "demo",
    approve: true,
    verify: (w) => {
      const moved = w.rows("bookings").filter((b) => String(b.scheduled_at).startsWith("2026-11-04"));
      expect(moved).toHaveLength(1);
      expect(w.rows("activities").some((a) => a.title === "Cita reprogramada por agente" && a.booking_id === moved[0].id)).toBe(true);
    },
  },
  {
    id: "agenda: cancelar una cita (critica, la aprueba el administrador)",
    covers: ["search_contact", "cancel_booking"],
    agent: "booking",
    message: (w) => `Cancela la cita de ${nameOf(w, futureBooking(w).contact_id)}`,
    llm: "demo",
    approve: true,
    verify: (w) => {
      const cancelled = w.rows("bookings").filter((b) => b.status === "cancelled" && Date.parse(String(b.updated_at)) >= w.clock.getTime());
      expect(cancelled).toHaveLength(1);
    },
  },
  {
    id: "seguimiento: prospectos sin actividad -> tarea",
    covers: ["find_stale_opportunities", "create_task"],
    agent: "follow_up",
    message: () => "Dame seguimiento de los prospectos sin respuesta",
    llm: "demo",
    verify: (w) => {
      const task = w.rows("activities").find((a) => a.type === "task" && String(a.title).startsWith("Dar seguimiento a"));
      expect(task).toMatchObject({ organization_id: A, performed_by_type: "agent", performed_by_id: "follow_up", status: "pending" });
    },
  },
  {
    id: "seguimiento: recordatorio programado (guion)",
    covers: ["set_reminder"],
    agent: "follow_up",
    message: () => "Recuerdame llamar a Mariana en dos dias",
    llm: scripted("follow_up", (w) => [{ name: "set_reminder", input: { title: "Llamar a Mariana", remind_at: new Date(w.clock.getTime() + 2 * DAY).toISOString(), contact_id: mariana(w).id } }]),
    verify: (w) => {
      const r = w.rows("activities").find((a) => a.title === "Recordatorio: Llamar a Mariana");
      expect(r).toMatchObject({ organization_id: A, status: "pending", contact_id: mariana(w).id, performed_by_type: "agent" });
    },
  },
  {
    id: "analista: metricas (guion)",
    covers: ["get_org_metrics"],
    agent: "analyst",
    message: () => "Dame las metricas del mes",
    llm: scripted("analyst", () => [{ name: "get_org_metrics", input: { days: 30 } }]),
    verify: (w) => {
      const data = (lastResult(w, "get_org_metrics").execution_result as { data: { contacts: { total: number }; opportunities: { by_stage: Record<string, number> } } }).data;
      expect(data.contacts.total).toBe(w.rows("contacts").length); // solo la organizacion
      expect(Object.values(data.opportunities.by_stage).reduce((a, b) => a + b, 0)).toBe(w.rows("opportunities").length);
    },
  },
  {
    id: "analista: briefing diario",
    covers: ["generate_briefing"],
    agent: "analyst",
    message: () => "Dame un reporte del dia",
    llm: "demo",
    verify: (w, run) => {
      expect(run.reply.length).toBeGreaterThan(50);
      expect(run.reply).not.toMatch(/NaN|undefined|Infinity/);
      // Ningun nombre ni titulo de la otra organizacion en el texto.
      for (const c of w.rows("contacts", B)) expect(run.reply).not.toContain(String(c.full_name));
    },
  },
];

async function runCase(world: World, c: FlowCase): Promise<{ run: Run; before: string }> {
  await c.setup?.(world);
  const before = world.snapshot(B);
  const llm = c.llm === "demo" ? new DemoLlmClient() : c.llm(world);
  const run = await handleMessage(c.message(world), { llm, organizationId: A, db: world.db.asClient(), now: world.clock });
  if (c.approve) {
    world.login("admin");
    for (const t of run.tools) {
      if (t.pending) {
        const res = await world.approve(t.pending.actionId);
        expect(res.status, `${c.id}: la aprobacion debe ser 200`).toBe(200);
        expect(world.action(t.pending.actionId).status).toBe("executed");
      }
    }
  }
  return { run, before };
}

// Estado de TODA la base por fila, para detectar que filas cambiaron o aparecieron.
function rowIndex(world: World): Map<string, string> {
  const m = new Map<string, string>();
  for (const [table, rows] of Object.entries(world.db.tables)) for (const r of rows) m.set(`${table}:${String(r.id ?? r.organization_id)}`, JSON.stringify(r));
  return m;
}

describe("Cobertura: cada herramienta del catalogo tiene un flujo completo", () => {
  it("toda herramienta de TOOL_NAMES aparece en al menos un caso de flujo (falla si se agrega una sin caso)", () => {
    const covered = new Set(FLOWS.flatMap((f) => f.covers));
    const missing = TOOL_NAMES.filter((t) => !covered.has(t));
    expect(missing, `herramientas sin caso de integracion por flujo completo: ${missing.join(", ")}`).toEqual([]);
    expect(Array.from(covered).filter((t) => !(TOOL_NAMES as readonly string[]).includes(t))).toEqual([]);
  });

  it("cada caso usa un especialista que tiene permiso para todas las herramientas que dice cubrir", () => {
    for (const f of FLOWS) {
      for (const t of f.covers) expect(canUseTool(f.agent as AgentName, t), `${f.id}: ${f.agent} no puede usar ${t}`).toBe(true);
    }
  });

  it("el catalogo no cambio de tamano sin actualizar la matriz (16 herramientas)", () => {
    expect(TOOL_NAMES).toHaveLength(16);
    expect(Object.keys(TOOL_REGISTRY)).toHaveLength(16);
  });

  for (const f of FLOWS) {
    it(`flujo: ${f.id}`, async () => {
      const beforeAll = rowIndex(w);
      const { run, before } = await runCase(w, f);
      // El orquestador eligio al especialista del caso y cada herramienta cubierta paso por la gobernanza.
      expect(run.agent).toBe(f.agent);
      expect(run.disabled).toBeUndefined();
      const traced = run.tools.map((t) => t.name);
      for (const t of f.covers) expect(traced, `${f.id}: no se llamo a ${t}`).toContain(t);
      expect(run.tools.every((t) => t.ok), `${f.id}: ${JSON.stringify(run.tools)}`).toBe(true);
      await f.verify(w, run);

      // Aislamiento: la otra organizacion no cambio, y todo lo nuevo o modificado pertenece a la organizacion A.
      expect(w.snapshot(B), `${f.id}: la otra organizacion cambio`).toBe(before);
      const afterAll = rowIndex(w);
      const foreign: string[] = [];
      for (const [key, json] of Array.from(afterAll.entries())) {
        if (beforeAll.get(key) === json) continue;
        const row = JSON.parse(json) as Row;
        const org = key.startsWith("organizations:") ? row.id : row.organization_id;
        if (org !== A) foreign.push(key);
      }
      expect(foreign, `${f.id}: filas de otra organizacion modificadas`).toEqual([]);
    });
  }
});

// --- Sondas de aislamiento: la organizacion B intenta usar cada herramienta con ids de la organizacion A ---

type Ids = { contact: Row; opp: Row; booking: Row; item: Row; user: Row };
type Attack = { outcome: "ok"; data: unknown } | { outcome: "error"; code: string } | { outcome: "approved"; status: string; code?: string };

async function attackAsB(world: World, tool: ToolName, input: unknown): Promise<Attack> {
  setAutonomy(world, "autonomous", B);
  const agent = Object.entries(AGENT_TOOL_PERMISSIONS).find(([, tools]) => (tools as readonly string[]).includes(tool))![0] as AgentName;
  const res = await executeToolGoverned(agent, tool, input, { organizationId: B, db: world.db.asClient(), now: world.clock });
  if (!res.ok) return { outcome: "error", code: res.error.code };
  const data = res.data as { status?: string; action_id?: string };
  if (data?.status === "pending_approval" && data.action_id) {
    world.login("admin", B); // el administrador de B aprueba: aun asi la ejecucion falla por pertenecer a otra organizacion
    await world.approve(data.action_id);
    const a = world.action(data.action_id);
    return { outcome: "approved", status: String(a.status), code: (a.execution_result as { error?: { code?: string } } | null)?.error?.code };
  }
  return { outcome: "ok", data: res.data };
}

const mustNotFind = (a: Attack) => {
  if (a.outcome === "error") expect(a.code).toBe("NOT_FOUND");
  else if (a.outcome === "approved") expect({ status: a.status, code: a.code }).toEqual({ status: "failed", code: "NOT_FOUND" });
  else throw new Error(`la herramienta funciono con un id de otra organizacion: ${JSON.stringify(a)}`);
};

const PROBES: Record<ToolName, (world: World, ids: Ids) => Promise<void>> = {
  search_contact: async (world, ids) => {
    const a = await attackAsB(world, "search_contact", { query: "Mariana", limit: 20 });
    expect(a.outcome).toBe("ok");
    expect(JSON.stringify(a)).not.toContain(String(ids.contact.full_name));
    expect(JSON.stringify(a)).not.toContain(String(ids.contact.email));
  },
  create_contact: async (world, ids) => {
    const a = await attackAsB(world, "create_contact", { full_name: "Mariana Vega Torres", email: ids.contact.email, phone: ids.contact.phone });
    expect(a.outcome).toBe("ok");
    const c = (a as { data: { created: boolean; contact: Row } }).data;
    expect(c.created).toBe(true); // no se deduplica contra datos de otra organizacion
    expect(c.contact.id).not.toBe(ids.contact.id);
    expect(world.rows("contacts", B).some((r) => r.id === c.contact.id)).toBe(true);
  },
  update_contact_notes: async (world, ids) => mustNotFind(await attackAsB(world, "update_contact_notes", { contact_id: ids.contact.id, note: "intruso" })),
  create_opportunity: async (world, ids) => mustNotFind(await attackAsB(world, "create_opportunity", { contact_id: ids.contact.id, title: "Intruso" })),
  update_stage: async (world, ids) => mustNotFind(await attackAsB(world, "update_stage", { opportunity_id: ids.opp.id, stage: "qualified" })),
  calculate_quote: async (world, ids) => mustNotFind(await attackAsB(world, "calculate_quote", { items: [{ item_id: ids.item.id, quantity: 1 }] })),
  check_availability: async (world, ids) => {
    // Una cita de A en un horario libre de B no debe bloquear a B.
    const input = { date_from: "2026-11-03", date_to: "2026-11-03", duration_minutes: 30 };
    const before = await attackAsB(world, "check_availability", input);
    world.db.updateRow("bookings", ids.booking, { scheduled_at: "2026-11-03T16:00:00.000Z" });
    const after = await attackAsB(world, "check_availability", input);
    expect(after).toEqual(before);
  },
  create_booking: async (world, ids) => {
    mustNotFind(await attackAsB(world, "create_booking", { contact_id: ids.contact.id, scheduled_at: "2026-11-03T17:00:00.000Z" }));
    const ownContact = world.rows("contacts", B)[0];
    mustNotFind(await attackAsB(world, "create_booking", { contact_id: ownContact.id, item_id: ids.item.id, scheduled_at: "2026-11-03T18:00:00.000Z" }));
  },
  reschedule_booking: async (world, ids) => mustNotFind(await attackAsB(world, "reschedule_booking", { booking_id: ids.booking.id, new_scheduled_at: "2026-11-03T18:00:00.000Z" })),
  cancel_booking: async (world, ids) => mustNotFind(await attackAsB(world, "cancel_booking", { booking_id: ids.booking.id })),
  create_task: async (world, ids) => {
    mustNotFind(await attackAsB(world, "create_task", { title: "Intruso", contact_id: ids.contact.id }));
    mustNotFind(await attackAsB(world, "create_task", { title: "Intruso", opportunity_id: ids.opp.id }));
    // El responsable tampoco puede ser una persona de otra organizacion.
    mustNotFind(await attackAsB(world, "create_task", { title: "Intruso", assigned_to: ids.user.id }));
  },
  log_message: async (world, ids) => mustNotFind(await attackAsB(world, "log_message", { contact_id: ids.contact.id, direction: "inbound", content: "intruso" })),
  set_reminder: async (world, ids) => {
    const remind_at = new Date(world.clock.getTime() + DAY).toISOString();
    mustNotFind(await attackAsB(world, "set_reminder", { title: "Intruso", remind_at, booking_id: ids.booking.id }));
    mustNotFind(await attackAsB(world, "set_reminder", { title: "Intruso", remind_at, opportunity_id: ids.opp.id }));
  },
  find_stale_opportunities: async (world) => {
    const a = await attackAsB(world, "find_stale_opportunities", { days: 1, limit: 50 });
    expect(a.outcome).toBe("ok");
    const ids = ((a as { data: { opportunities: Array<{ id: string }> } }).data.opportunities).map((o) => o.id);
    const own = new Set(world.rows("opportunities", B).map((o) => o.id));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => own.has(id))).toBe(true);
  },
  get_org_metrics: async (world) => {
    const a = await attackAsB(world, "get_org_metrics", { days: 365 });
    const data = (a as { data: { contacts: { total: number }; opportunities: { by_stage: Record<string, number> } } }).data;
    expect(data.contacts.total).toBe(world.rows("contacts", B).length);
    expect(Object.values(data.opportunities.by_stage).reduce((x, y) => x + y, 0)).toBe(world.rows("opportunities", B).length);
  },
  generate_briefing: async (world) => {
    const a = await attackAsB(world, "generate_briefing", { days: 90 });
    expect(a.outcome).toBe("ok");
    const text = JSON.stringify(a);
    for (const c of world.rows("contacts", A)) expect(text).not.toContain(String(c.full_name));
    for (const o of world.rows("opportunities", A)) expect(text).not.toContain(String(o.title));
  },
};

describe("Aislamiento multi-tenant por herramienta (la organizacion B ataca con datos de A)", () => {
  it("hay una sonda de aislamiento por cada herramienta del catalogo (falla si se agrega una sin sonda)", () => {
    expect(Object.keys(PROBES).sort()).toEqual([...TOOL_NAMES].sort());
  });

  for (const tool of TOOL_NAMES) {
    it(`${tool}: no ve ni modifica datos de la otra organizacion`, async () => {
      const ids: Ids = {
        contact: mariana(w),
        opp: oppOf(w, "Ortodoncia completa - Mariana Vega"),
        booking: futureBooking(w),
        item: itemOf(w, "Limpieza dental"),
        user: w.db.tables.users.find((u) => u.organization_id === A)!,
      };
      const snapshotA = w.snapshot(A);
      await PROBES[tool](w, ids);
      if (tool === "check_availability") return; // la sonda modifica una cita de A a proposito
      // Los datos de negocio de A siguen igual (solo pueden aparecer acciones de B en agent_actions de B).
      expect(w.snapshot(A), `${tool}: datos de A modificados desde B`).toBe(snapshotA);
    });
  }
});
