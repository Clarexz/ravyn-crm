import { beforeEach, describe, expect, it, vi } from "vitest";

const executeTool = vi.hoisted(() => vi.fn());
const listToolsForAgent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agents/executor", () => ({ executeTool, listToolsForAgent }));

import { MAX_ITERATIONS, runSpecialist } from "@/lib/agents/runtime";
import { SPECIALISTS, SPECIALIST_NAMES } from "@/lib/agents/specialists";
import { createMockLlm, textResponse, toolCallResponse } from "./mockLlm";
import type { SupabaseClient } from "@supabase/supabase-js";

const db = {} as SupabaseClient;
const base = { organizationId: "org-autenticada", db };

beforeEach(() => {
  executeTool.mockReset();
  listToolsForAgent.mockReset();
  listToolsForAgent.mockReturnValue([{ name: "search_contact", description: "d", inputSchema: { type: "object" } }]);
});

describe("especialistas", () => {
  it("definen los 5 agentes y derivan herramientas de listToolsForAgent", () => {
    expect(SPECIALIST_NAMES).toHaveLength(5);
    for (const name of SPECIALIST_NAMES) {
      SPECIALISTS[name].tools();
      expect(listToolsForAgent).toHaveBeenLastCalledWith(name);
      expect(SPECIALISTS[name].systemPrompt()).toMatch(/espanol/);
    }
  });

  it("el prompt admite contexto de industria sin fijar una", () => {
    expect(SPECIALISTS.sales.systemPrompt()).not.toMatch(/dental|clinica|restaurante/i);
    expect(SPECIALISTS.sales.systemPrompt({ industryContext: "Vende seguros" })).toContain("Vende seguros");
  });
});

describe("runtime del especialista", () => {
  it("ejecuta la herramienta propuesta y devuelve texto final y traza", async () => {
    executeTool.mockResolvedValue({ ok: true, data: { contacts: [] } });
    const llm = createMockLlm([
      toolCallResponse([{ name: "search_contact", input: { query: "Ana" } }]),
      textResponse("No hay contactos."),
    ]);
    const run = await runSpecialist("receptionist", "busca a Ana", { llm, ...base });
    expect(run).toMatchObject({ reply: "No hay contactos.", incomplete: false, iterations: 2 });
    expect(run.tools).toEqual([{ name: "search_contact", ok: true }]);
    expect(llm.calls[0].tools).toEqual(listToolsForAgent.mock.results[0].value);
    const toolMsg = llm.calls[1].messages.at(-1);
    expect(toolMsg).toMatchObject({ role: "tool", results: [{ name: "search_contact", isError: false }] });
  });

  it("respeta el limite de iteraciones", async () => {
    executeTool.mockResolvedValue({ ok: true, data: {} });
    const llm = createMockLlm(toolCallResponse([{ name: "search_contact", input: {} }]));
    const run = await runSpecialist("receptionist", "x", { llm, ...base });
    expect(llm.calls).toHaveLength(MAX_ITERATIONS);
    expect(run.incomplete).toBe(true);
    expect(run.iterations).toBe(MAX_ITERATIONS);
    expect(run.reply).toBeTruthy();
  });

  it("limita herramientas por turno y responde a cada tool_use", async () => {
    executeTool.mockResolvedValue({ ok: true, data: {} });
    const calls = Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, name: "search_contact", input: {} }));
    const llm = createMockLlm([toolCallResponse(calls), textResponse("listo")]);
    const run = await runSpecialist("receptionist", "x", { llm, ...base, maxToolsPerTurn: 2 });
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(run.tools).toHaveLength(2);
    const toolMsg = llm.calls[1].messages.at(-1);
    expect(toolMsg?.role === "tool" && toolMsg.results).toHaveLength(6);
  });

  it("pasa PERMISSION_DENIED al modelo sin lanzar", async () => {
    executeTool.mockResolvedValue({ ok: false, error: { code: "PERMISSION_DENIED", message: "no permitido" } });
    const llm = createMockLlm([
      toolCallResponse([{ name: "update_stage", input: {} }]),
      textResponse("No tengo permiso para eso."),
    ]);
    const run = await runSpecialist("receptionist", "mueve la oportunidad", { llm, ...base });
    expect(run.reply).toBe("No tengo permiso para eso.");
    expect(run.tools).toEqual([{ name: "update_stage", ok: false, errorCode: "PERMISSION_DENIED" }]);
    const toolMsg = llm.calls[1].messages.at(-1);
    expect(toolMsg?.role === "tool" && toolMsg.results[0]).toMatchObject({ isError: true });
    expect(toolMsg?.role === "tool" && toolMsg.results[0].content).toContain("PERMISSION_DENIED");
  });

  it("si executeTool lanza o el LLM falla, devuelve respuesta controlada", async () => {
    executeTool.mockRejectedValue(new Error("boom interno"));
    const llm = createMockLlm([toolCallResponse([{ name: "search_contact", input: {} }]), textResponse("ok")]);
    const run = await runSpecialist("receptionist", "x", { llm, ...base });
    expect(run.tools[0]).toMatchObject({ ok: false, errorCode: "EXECUTION_FAILED" });
    expect(run.reply).toBe("ok");

    const broken = await runSpecialist("sales", "x", { llm: createMockLlm(new Error("sdk")), ...base });
    expect(broken.incomplete).toBe(true);
    expect(broken.reply).not.toMatch(/sdk/);
  });

  it("nunca pasa un organizationId proveniente del modelo", async () => {
    executeTool.mockResolvedValue({ ok: true, data: {} });
    const llm = createMockLlm([
      toolCallResponse([
        { name: "search_contact", input: { query: "a", organizationId: "org-ajena", organization_id: "org-ajena" } },
      ]),
      textResponse("fin"),
    ]);
    await runSpecialist("receptionist", "x", { llm, ...base });
    const [agent, tool, input, ctx] = executeTool.mock.calls[0];
    expect(agent).toBe("receptionist");
    expect(tool).toBe("search_contact");
    expect(ctx.organizationId).toBe("org-autenticada");
    expect(JSON.stringify(input)).not.toContain("org-ajena");
    expect(input).toEqual({ query: "a" });
  });
});
