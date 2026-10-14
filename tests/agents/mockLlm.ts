// LLM simulado para pruebas: responde con un guion o con una funcion.
import type { LlmClient, LlmRequest, LlmResponse, LlmToolCall } from "@/lib/agents/llm";

export type MockStep = LlmResponse | Error | ((request: LlmRequest, callIndex: number) => LlmResponse);

export type MockLlm = LlmClient & { calls: LlmRequest[] };

export function textResponse(text: string): LlmResponse {
  return { text, toolCalls: [], stopReason: "end_turn" };
}

export function toolCallResponse(calls: Array<Omit<LlmToolCall, "id"> & { id?: string }>, text = ""): LlmResponse {
  return {
    text,
    toolCalls: calls.map((c, i) => ({ id: c.id ?? `toolu_${i}`, name: c.name, input: c.input })),
    stopReason: "tool_use",
  };
}

export function classificationResponse(agent: string, reason = "prueba"): LlmResponse {
  return textResponse(JSON.stringify({ agent, reason }));
}

// Guion: cada llamada consume el siguiente paso; el ultimo se repite si se agota.
export function createMockLlm(steps: MockStep[] | MockStep): MockLlm {
  const script = Array.isArray(steps) ? steps : [steps];
  const calls: LlmRequest[] = [];
  return {
    calls,
    async complete(request) {
      const index = calls.length;
      calls.push(request);
      const step = script[Math.min(index, script.length - 1)];
      if (step instanceof Error) throw step;
      return typeof step === "function" ? step(request, index) : step;
    },
  };
}
