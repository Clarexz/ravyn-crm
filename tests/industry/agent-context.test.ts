import { describe, expect, it } from "vitest";
import { DemoDb, seedDemoData } from "@/lib/demo";
import { DEMO_ORG_ID, DEMO_OTHER_ORG_ID } from "@/lib/demo/config";
import { switchDemoVertical } from "@/lib/demo/verticals";
import { DemoLlmClient } from "@/lib/agents/demoLlm";
import { executeTool } from "@/lib/agents/executor";
import { executeToolGoverned } from "@/lib/agents/governance";
import { handleMessage } from "@/lib/agents/orchestrator";
import type { LlmRequest } from "@/lib/agents/llm";
import { createMockLlm, textResponse } from "../agents/mockLlm";

const NOW = new Date("2026-10-15T15:30:00Z"); // jueves 09:30 en Ciudad de Mexico

function setup(industry?: Parameters<typeof switchDemoVertical>[2]) {
  const db = new DemoDb({ now: () => NOW });
  seedDemoData(db, NOW);
  if (industry) switchDemoVertical(db, DEMO_ORG_ID, industry, NOW);
  return db;
}

// Mensaje de saludo: el orquestador lo envia a la recepcionista.
const greet = async (db: DemoDb, org = DEMO_ORG_ID) =>
  (await handleMessage("Hola, buenos dias", { llm: new DemoLlmClient(), organizationId: org, db: db.asClient(), now: NOW })).reply;

describe("IND-02: el contexto de industria llega al prompt y cambia el vocabulario del agente", () => {
  it("el prompt del especialista incluye vocabulario, zona horaria y reglas de la industria activa", async () => {
    const db = setup("real_estate");
    const requests: LlmRequest[] = [];
    const llm = createMockLlm((req) => {
      requests.push(req);
      return textResponse(req.tier === "classifier" ? '{"agent":"receptionist","reason":"saludo"}' : "ok");
    });
    await handleMessage("Hola", { llm, organizationId: DEMO_ORG_ID, db: db.asClient(), now: NOW });
    const specialist = requests.find((r) => r.tier === "specialist");
    expect(specialist?.system).toContain("Contexto de la organizacion:");
    expect(specialist?.system).toContain("(industria: real_estate)");
    expect(specialist?.system).toContain('"prospecto"');
    expect(specialist?.system).toContain("compra");
    expect(specialist?.system).toContain("America/Mexico_City");
    expect(specialist?.system).toContain("15/10/2026 09:30");
    // El clasificador no recibe el contexto de industria (solo clasifica).
    expect(requests.find((r) => r.tier === "classifier")?.system).not.toContain("Contexto de la organizacion");
  });

  it("cada organizacion recibe SU contexto: la otra clinica no se contamina", async () => {
    const db = setup("restaurant");
    const seen: string[] = [];
    const llm = createMockLlm((req) => {
      if (req.tier === "specialist") seen.push(req.system);
      return textResponse(req.tier === "classifier" ? '{"agent":"receptionist","reason":"x"}' : "ok");
    });
    await handleMessage("Hola", { llm, organizationId: DEMO_OTHER_ORG_ID, db: db.asClient(), now: NOW });
    expect(seen[0]).toContain("(industria: health)");
    expect(seen[0]).toContain("America/Monterrey");
    expect(seen[0]).not.toContain("restaurante");
  });

  it("Recepcionista: saluda y pregunta segun el giro (inmobiliaria orienta a compra o renta)", async () => {
    const real = await greet(setup("real_estate"));
    expect(real).toMatch(/comprar o rentar/);
    expect(real).toMatch(/visita/i);
    expect(real).not.toMatch(/paciente|cita|clinica/i);

    const restaurant = await greet(setup("restaurant"));
    expect(restaurant).toMatch(/reservacion/i);
    expect(restaurant).toMatch(/personas/);
    expect(restaurant).not.toMatch(/paciente|clinica/i);

    const health = await greet(setup());
    expect(health).toMatch(/pacientes?/i);

    const pro = await greet(setup("professional_services"));
    expect(pro).toMatch(/reunion|cotizacion/i);
    expect(new Set([real, restaurant, health, pro]).size).toBe(4);
  });

  it("el LLM de demo usa el vocabulario de la industria al pedir el nombre", async () => {
    const db = setup("restaurant");
    const out = await handleMessage("Quiero cotizar", { llm: new DemoLlmClient(), organizationId: DEMO_ORG_ID, db: db.asClient(), now: NOW });
    expect(out.reply).toMatch(/comensal/);
  });
});

describe("zona horaria en las herramientas de agentes", () => {
  it("check_availability devuelve horas locales de la organizacion y respeta su horario", async () => {
    const db = setup();
    const res = await executeToolGoverned(
      "booking",
      "check_availability",
      { date_from: "2026-12-07", date_to: "2026-12-07", duration_minutes: 60, slot_step_minutes: 60 },
      { organizationId: DEMO_ORG_ID, db: db.asClient(), now: NOW },
    );
    expect(res.ok).toBe(true);
    const data = (res as { ok: true; data: { timezone: string; days: Array<{ slots: Array<{ start: string; start_local: string }> }> } }).data;
    expect(data.timezone).toBe("America/Mexico_City");
    expect(data.days[0].slots[0]).toMatchObject({ start: "2026-12-07T15:00:00.000Z", start_local: "2026-12-07T09:00" });
    expect(data.days[0].slots.at(-1)?.start_local).toBe("2026-12-07T17:00");
  });

  it("restaurante: horario 13:00-23:00 local todos los dias (domingo incluido)", async () => {
    const db = setup("restaurant");
    const res = await executeToolGoverned(
      "booking",
      "check_availability",
      { date_from: "2026-10-18", date_to: "2026-10-18", duration_minutes: 120, slot_step_minutes: 120 },
      { organizationId: DEMO_ORG_ID, db: db.asClient(), now: NOW },
    );
    const data = (res as { ok: true; data: { days: Array<{ slots: Array<{ start: string; start_local: string }> }> } }).data;
    expect(data.days[0].slots[0]).toMatchObject({ start: "2026-10-18T19:00:00.000Z", start_local: "2026-10-18T13:00" });
  });

  it("crear una cita a las 08:00 locales se rechaza, a las 09:00 locales se acepta", async () => {
    const db = setup();
    const contact = db.tables.contacts.find((c) => c.organization_id === DEMO_ORG_ID)!;
    const ctx = { organizationId: DEMO_ORG_ID, db: db.asClient(), now: NOW };
    // Lunes 7 dic 2026: 14:00Z = 08:00 en Ciudad de Mexico (fuera de horario); 15:00Z = 09:00 (dentro).
    const early = await executeTool("booking", "create_booking", { contact_id: contact.id, scheduled_at: "2026-12-07T14:00:00Z", duration_minutes: 30 }, ctx);
    expect(early).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    const ok = await executeTool("booking", "create_booking", { contact_id: contact.id, scheduled_at: "2026-12-07T15:00:00Z", duration_minutes: 30 }, ctx);
    expect(ok.ok).toBe(true);
  });
});
