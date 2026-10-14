// Bucle de un especialista: el LLM propone tool_calls, se ejecutan solo con executeTool
// y los ToolResult (incluidos errores) vuelven al modelo. Nunca lanza.
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeTool } from "@/lib/agents/executor";
import type { LlmClient, LlmMessage, LlmToolCall, LlmToolResultMessage } from "@/lib/agents/llm";
import { SPECIALISTS, type SpecialistName } from "@/lib/agents/specialists";
import type { ToolErrorCode, ToolResult } from "@/lib/agents/types";

export const MAX_ITERATIONS = 6;
export const MAX_TOOLS_PER_TURN = 4;

export const FALLBACK_REPLY = "No pude completar la solicitud en este momento. Intenta de nuevo o reformula el mensaje.";

export type ToolTrace = {
  name: string;
  ok: boolean;
  errorCode?: ToolErrorCode;
};

export type SpecialistRun = {
  reply: string;
  tools: ToolTrace[];
  iterations: number;
  // true si el bucle termino por limite o por error y no por una respuesta final del modelo.
  incomplete: boolean;
};

export type RunSpecialistOptions = {
  llm: LlmClient;
  organizationId: string;
  db: SupabaseClient;
  industryContext?: string;
  now?: Date;
  maxIterations?: number;
  maxToolsPerTurn?: number;
};

// El tenant nunca lo decide el modelo: se descartan claves de organizacion de la entrada.
const FORBIDDEN_INPUT_KEYS = new Set(["organizationid", "organization_id", "orgid", "org_id", "clinicid", "clinic_id"]);

function sanitizeInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).filter(([key]) => !FORBIDDEN_INPUT_KEYS.has(key.toLowerCase())),
  );
}

function failure(code: ToolErrorCode, message: string): ToolResult {
  return { ok: false, error: { code, message } };
}

function serialize(result: ToolResult): string {
  try {
    return JSON.stringify(result);
  } catch {
    return JSON.stringify(failure("EXECUTION_FAILED", "Resultado no serializable"));
  }
}

export async function runSpecialist(
  agent: SpecialistName,
  userText: string,
  options: RunSpecialistOptions,
): Promise<SpecialistRun> {
  const maxIterations = options.maxIterations ?? MAX_ITERATIONS;
  const maxTools = options.maxToolsPerTurn ?? MAX_TOOLS_PER_TURN;
  const trace: ToolTrace[] = [];
  let iterations = 0;

  try {
    const definition = SPECIALISTS[agent];
    const system = definition.systemPrompt({ industryContext: options.industryContext, now: options.now });
    const tools = definition.tools();
    const messages: LlmMessage[] = [{ role: "user", content: userText }];

    while (iterations < maxIterations) {
      iterations += 1;
      const response = await options.llm.complete({ tier: "specialist", system, messages, tools });

      if (response.toolCalls.length === 0) {
        const reply = response.text.trim();
        return { reply: reply || FALLBACK_REPLY, tools: trace, iterations, incomplete: !reply };
      }

      messages.push({ role: "assistant", text: response.text, toolCalls: response.toolCalls, raw: response.raw });

      const results: LlmToolResultMessage[] = [];
      const calls: LlmToolCall[] = response.toolCalls;
      for (let i = 0; i < calls.length; i += 1) {
        const call = calls[i];
        let result: ToolResult;
        if (i >= maxTools) {
          result = failure("EXECUTION_FAILED", `Limite de ${maxTools} herramientas por turno alcanzado; reintenta en el siguiente paso.`);
        } else {
          try {
            result = await executeTool(agent, call.name, sanitizeInput(call.input), {
              organizationId: options.organizationId,
              db: options.db,
              now: options.now,
            });
          } catch {
            result = failure("EXECUTION_FAILED", "La herramienta fallo de forma inesperada");
          }
          trace.push({ name: call.name, ok: result.ok, ...(result.ok ? {} : { errorCode: result.error.code }) });
        }
        results.push({ id: call.id, name: call.name, content: serialize(result), isError: !result.ok });
      }
      messages.push({ role: "tool", results });
    }

    return { reply: FALLBACK_REPLY, tools: trace, iterations, incomplete: true };
  } catch {
    // Fallo del LLM o de la preparacion: respuesta controlada, sin detalles internos.
    return { reply: FALLBACK_REPLY, tools: trace, iterations, incomplete: true };
  }
}
