// Fase 6, escenario 3: Inmobiliario / B2B. El agente de seguimiento detecta prospectos sin actividad
// tras 48 horas y deja una tarea de recordatorio asignada al asesor humano (D-19, D-20).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_OTHER_ORG_ID, DEMO_ORG_ID, DEMO_OTHER_USER_ID, DEMO_STAFF_IDS, HOUR, World, setAutonomy, type Row } from "./world";

vi.mock("@/lib/supabase/auth", async () => (await import("./world")).authMock);

let w: World;
beforeEach(() => {
  w = new World({ vertical: "real_estate" });
});
afterEach(() => w.dispose());

const MESSAGE = "Revisa los prospectos sin respuesta despues de 48 horas y deja un recordatorio para el asesor";

type Lead = { contact: Row; opp: Row };
// Crea un prospecto (contacto + oportunidad en lead) cuya unica actividad ocurrio hace `hoursAgo` horas.
async function lead(name: string, hoursAgo: number, opts: { org?: string; advisor?: string | null; stage?: string } = {}): Promise<Lead> {
  const org = opts.org ?? DEMO_ORG_ID;
  const at = new Date(w.clock.getTime() - hoursAgo * HOUR).toISOString();
  const client = w.db.asClient();
  const c = await client.from("contacts").insert({ organization_id: org, full_name: name, source: "web", created_at: at }).select().single();
  const o = await client
    .from("opportunities")
    .insert({
      organization_id: org,
      contact_id: c.data.id,
      title: `Prospecto ${name}`,
      stage: opts.stage ?? "lead",
      assigned_to: opts.advisor === undefined ? DEMO_STAFF_IDS.assistant : opts.advisor,
      created_at: at,
    })
    .select()
    .single();
  expect(c.error).toBeNull();
  expect(o.error).toBeNull();
  await client.from("activities").insert({
    organization_id: org,
    contact_id: c.data.id,
    opportunity_id: o.data.id,
    type: "message",
    title: "Mensaje enviado",
    performed_by_type: "human",
    performed_by_id: DEMO_STAFF_IDS.assistant,
    created_at: at,
  });
  return { contact: c.data, opp: o.data };
}
const tasksFor = (oppId: unknown) => w.rows("activities").filter((a) => a.type === "task" && a.opportunity_id === oppId);

describe("Escenario Inmobiliario", () => {
  it("lead sin respuesta tras 48 h: tarea de recordatorio asignada al asesor; los demas no se tocan", async () => {
    const stale = await lead("Alonso Rangel Peña", 50);
    const staleOtherAdvisor = await lead("Beatriz Mora Cantu", 100, { advisor: DEMO_STAFF_IDS.reception });
    const fresh = await lead("Camilo Duran Soto", 47);
    const wrongStage = await lead("Diana Fuentes Lara", 90, { stage: "proposal" });
    // Una oportunidad de OTRA organizacion tambien vencida: jamas debe aparecer ni recibir tareas.
    const foreign = await lead("Esteban Lozano Ruiz", 200, { org: DEMO_OTHER_ORG_ID, advisor: DEMO_OTHER_USER_ID });
    const otherSnapshot = w.snapshot(DEMO_OTHER_ORG_ID);

    const r = await w.chat(MESSAGE);
    expect(r.status).toBe(200);
    expect(r.body.agent).toBe("follow_up");
    const names = r.body.tools.map((t) => t.name);
    expect(names[0]).toBe("find_stale_opportunities");
    expect(names.slice(1).every((n) => n === "create_task")).toBe(true);
    expect(r.body.tools.every((t) => t.ok && !t.pending)).toBe(true); // tarea de bajo riesgo: nivel equilibrado la ejecuta sola

    // 48 h exactas: la de 50 h y la de 100 h si; la de 47 h, la de otra etapa y la ajena no.
    const t1 = tasksFor(stale.opp.id);
    const t2 = tasksFor(staleOtherAdvisor.opp.id);
    expect(t1).toHaveLength(1);
    expect(t2).toHaveLength(1);
    expect(tasksFor(fresh.opp.id)).toHaveLength(0);
    expect(tasksFor(wrongStage.opp.id)).toHaveLength(0);
    expect(w.rows("activities", DEMO_OTHER_ORG_ID).filter((a) => a.type === "task" && a.opportunity_id === foreign.opp.id)).toHaveLength(0);

    // La tarea queda asignada al asesor HUMANO de cada oportunidad, creada por el agente de seguimiento.
    expect(t1[0]).toMatchObject({
      status: "pending",
      performed_by_type: "agent",
      performed_by_id: "follow_up",
      assigned_to: DEMO_STAFF_IDS.assistant,
      contact_id: stale.contact.id,
      organization_id: DEMO_ORG_ID,
    });
    expect(t2[0].assigned_to).toBe(DEMO_STAFF_IDS.reception);
    expect(String(t1[0].title)).toContain("Alonso Rangel");
    expect(String(t1[0].description)).toContain("48 horas");
    expect(Date.parse(String(t1[0].due_date))).toBeGreaterThan(w.clock.getTime());
    expect(r.body.reply).toMatch(/recordatorio/);

    // El historial muestra el nombre del asesor.
    const acts = await w.activities(stale.contact.id as string);
    const task = acts.find((a) => a.type === "task")!;
    expect(task.assignee_name).toMatch(/Karla Duran/);

    // La OTRA organizacion no cambio en nada.
    expect(w.snapshot(DEMO_OTHER_ORG_ID)).toBe(otherSnapshot);

    // Idempotencia: la tarea cuenta como actividad, asi que una segunda corrida no duplica.
    const again = await w.chat(MESSAGE);
    expect(again.body.tools.every((t) => t.name !== "create_task")).toBe(true);
    expect(tasksFor(stale.opp.id)).toHaveLength(1);
  });

  it("con nivel conservador la tarea espera aprobacion y no se crea hasta que una persona la aprueba", async () => {
    setAutonomy(w, "conservative");
    const stale = await lead("Fernando Gil Ortega", 72);
    const r = await w.chat(MESSAGE);
    const pending = r.body.tools.filter((t) => t.pending);
    expect(pending.length).toBeGreaterThan(0);
    expect(tasksFor(stale.opp.id)).toHaveLength(0);
    const action = w.rows("agent_actions").find((a) => a.action_type === "create_task" && a.status === "pending" && (a.payload as { input: { opportunity_id: string } }).input.opportunity_id === stale.opp.id)!;
    expect((action.payload as { critical: boolean }).critical).toBe(false);
    w.login("staff"); // no critica: cualquier persona de la organizacion puede aprobarla
    expect((await w.approve(action.id as string)).status).toBe(200);
    expect(tasksFor(stale.opp.id)).toHaveLength(1);
    expect(tasksFor(stale.opp.id)[0].assigned_to).toBe(DEMO_STAFF_IDS.assistant);
  });

  it("sin prospectos vencidos el agente lo dice y no crea tareas", async () => {
    for (const o of w.rows("opportunities")) w.db.updateRow("opportunities", o, { stage: "won", closed_at: w.clock.toISOString() });
    const r = await w.chat(MESSAGE);
    expect(r.body.tools.map((t) => t.name)).toEqual(["find_stale_opportunities"]);
    expect(r.body.reply).toMatch(/Todo al dia/);
  });

  it("un prospecto sin asesor genera la tarea sin asignar (no inventa responsable)", async () => {
    const stale = await lead("Gabriela Ibarra Neri", 60, { advisor: null });
    await w.chat(MESSAGE);
    expect(tasksFor(stale.opp.id)).toHaveLength(1);
    expect(tasksFor(stale.opp.id)[0].assigned_to).toBeNull();
  });
});
