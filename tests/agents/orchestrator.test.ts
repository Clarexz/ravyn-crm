import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agents/executor", () => ({
  executeTool: vi.fn(async () => ({ ok: true, data: {} })),
  listToolsForAgent: vi.fn(() => []),
}));

vi.mock("@/lib/agents/governance", () => ({
  executeToolGoverned: vi.fn(async () => ({ ok: true, data: {} })),
}));

import { classifyByKeywords, classifyIntent, handleMessage } from "@/lib/agents/orchestrator";
import { classificationResponse, createMockLlm, textResponse } from "./mockLlm";
import type { SupabaseClient } from "@supabase/supabase-js";

const db = {} as SupabaseClient;

describe("orquestador: respaldo por palabras clave", () => {
  const cases: Array<[string, string]> = [
    ["Necesito una cotizacion con descuento", "sales"],
    ["Quiero agendar una cita, que disponibilidad hay?", "booking"],
    ["El prospecto no ha respondido, hay que darle seguimiento", "follow_up"],
    ["Dame el reporte de metricas del mes", "analyst"],
    ["Hola, buenos dias", "receptionist"],
    ["Quiero dar de alta a un nuevo cliente", "receptionist"],
    ["asdf qwer", "receptionist"],
    ["", "receptionist"],
  ];
  it.each(cases)("%j -> %s", (text, agent) => {
    expect(classifyByKeywords(text).agent).toBe(agent);
  });
});

describe("AGT-03: ruteo del orquestador", () => {
  it("usa la clasificacion del LLM cuando es valida (entrada ambigua)", async () => {
    const llm = createMockLlm(classificationResponse("booking", "pide algo para manana"));
    const result = await classifyIntent("necesito algo para manana por la tarde", llm);
    expect(result).toMatchObject({ agent: "booking", source: "llm" });
    expect(llm.calls[0].tier).toBe("classifier");
  });

  it("acepta JSON dentro de texto adicional", async () => {
    const llm = createMockLlm(textResponse('Claro: {"agent":"analyst","reason":"pide cifras"} listo'));
    expect((await classifyIntent("cuanto vendimos", llm)).agent).toBe("analyst");
  });

  it.each([
    ["cotizar con descuento", "sales"],
    ["agendar una cita", "booking"],
    ["prospecto sin respuesta", "follow_up"],
    ["reporte de metricas", "analyst"],
    ["hola", "receptionist"],
  ])("casos claros %j -> %s via LLM", async (text, agent) => {
    const llm = createMockLlm(classificationResponse(agent));
    expect((await classifyIntent(text, llm)).agent).toBe(agent);
  });

  it("LLM que devuelve basura -> respaldo determinista", async () => {
    for (const garbage of ["no se", "{agent:", '{"agent":"orchestrator","reason":"x"}', '{"agent":"sales"}', "[]"]) {
      const llm = createMockLlm(textResponse(garbage));
      const result = await classifyIntent("necesito una cotizacion", llm);
      expect(result).toMatchObject({ agent: "sales", source: "fallback" });
    }
  });

  it("LLM que lanza error -> respaldo determinista sin lanzar", async () => {
    const llm = createMockLlm(new Error("caido"));
    expect(await classifyIntent("agendar una reserva", llm)).toMatchObject({ agent: "booking", source: "fallback" });
  });

  it("texto vacio o ambiguo -> receptionist, vacio sin llamar al LLM", async () => {
    const llm = createMockLlm(textResponse("basura"));
    expect((await classifyIntent("   ", llm)).agent).toBe("receptionist");
    expect(llm.calls).toHaveLength(0);
    expect((await classifyIntent("mmm", llm)).agent).toBe("receptionist");
  });

  it("handleMessage clasifica y ejecuta al especialista elegido", async () => {
    const llm = createMockLlm([classificationResponse("analyst"), textResponse("Aqui esta el resumen.")]);
    const result = await handleMessage("dame un reporte", { llm, organizationId: "org-1", db });
    expect(result).toMatchObject({ agent: "analyst", reply: "Aqui esta el resumen.", tools: [] });
    expect(llm.calls[1].tier).toBe("specialist");
    expect(llm.calls[1].system).toContain("Analista");
  });
});
