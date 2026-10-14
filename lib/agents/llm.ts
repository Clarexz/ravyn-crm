// Cliente de LLM minimo. El resto del motor depende SOLO de la interfaz LlmClient;
// la implementacion real usa @anthropic-ai/sdk y solo se instancia en el servidor.
import Anthropic from "@anthropic-ai/sdk";
import { DemoLlmClient } from "@/lib/agents/demoLlm";
import { isDemoMode } from "@/lib/demo/config";
import type { ToolSummary } from "@/lib/agents/types";

// classifier: respuesta corta y barata (enrutamiento). specialist: razonamiento con herramientas.
export type LlmTier = "classifier" | "specialist";

export const LLM_MODELS: Record<LlmTier, string> = {
  classifier: "claude-haiku-5-5",
  specialist: "claude-sonnet-5-5",
};

export type LlmToolCall = { id: string; name: string; input: unknown };

export type LlmToolResultMessage = {
  id: string;
  name: string;
  content: string;
  isError: boolean;
};

export type LlmMessage =
  | { role: "user"; content: string }
  // raw: bloques originales del proveedor; se reenvian tal cual para conservar el razonamiento.
  | { role: "assistant"; text: string; toolCalls: LlmToolCall[]; raw?: unknown }
  | { role: "tool"; results: LlmToolResultMessage[] };

export type LlmRequest = {
  tier: LlmTier;
  system: string;
  messages: LlmMessage[];
  tools?: ToolSummary[];
  maxTokens?: number;
};

export type LlmStopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "other";

export type LlmResponse = {
  text: string;
  toolCalls: LlmToolCall[];
  stopReason: LlmStopReason;
  raw?: unknown;
};

export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResponse>;
}

// La clave de IA no esta configurada en el servidor.
export class LlmConfigError extends Error {
  constructor(message = "ANTHROPIC_API_KEY no esta configurada en el servidor") {
    super(message);
    this.name = "LlmConfigError";
  }
}

// Fallo al invocar al proveedor de IA.
export class LlmError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LlmError";
  }
}

function toAnthropicMessages(messages: LlmMessage[]): Anthropic.MessageParam[] {
  return messages.map((m): Anthropic.MessageParam => {
    if (m.role === "user") return { role: "user", content: m.content };
    if (m.role === "assistant") {
      if (Array.isArray(m.raw)) {
        return { role: "assistant", content: m.raw as Anthropic.ContentBlockParam[] };
      }
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (m.text) blocks.push({ type: "text", text: m.text });
      for (const c of m.toolCalls) {
        blocks.push({ type: "tool_use", id: c.id, name: c.name, input: c.input });
      }
      return { role: "assistant", content: blocks };
    }
    return {
      role: "user",
      content: m.results.map(
        (r): Anthropic.ToolResultBlockParam => ({
          type: "tool_result",
          tool_use_id: r.id,
          content: r.content,
          is_error: r.isError,
        }),
      ),
    };
  });
}

function mapStopReason(reason: string | null): LlmStopReason {
  switch (reason) {
    case "end_turn":
    case "tool_use":
    case "max_tokens":
    case "refusal":
      return reason;
    default:
      return "other";
  }
}

export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const tools: Anthropic.Tool[] | undefined = request.tools?.length
      ? request.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: { ...t.inputSchema, type: "object" as const },
        }))
      : undefined;

    try {
      const response = await this.client.messages.create({
        model: LLM_MODELS[request.tier],
        max_tokens: request.maxTokens ?? (request.tier === "classifier" ? 512 : 4096),
        system: request.system,
        messages: toAnthropicMessages(request.messages),
        // Esfuerzo bajo para clasificar; los especialistas usan el valor por defecto del modelo.
        ...(request.tier === "classifier" ? { output_config: { effort: "low" as const } } : {}),
        ...(tools ? { tools } : {}),
      });

      let text = "";
      const toolCalls: LlmToolCall[] = [];
      for (const block of response.content) {
        if (block.type === "text") text += block.text;
        else if (block.type === "tool_use") {
          toolCalls.push({ id: block.id, name: block.name, input: block.input });
        }
      }
      return {
        text: text.trim(),
        toolCalls,
        stopReason: mapStopReason(response.stop_reason),
        raw: response.content,
      };
    } catch (error) {
      // Mensaje generico: el detalle del proveedor no se propaga al cliente.
      const status = error instanceof Anthropic.APIError ? error.status : undefined;
      throw new LlmError(`Fallo la llamada al modelo${status ? ` (HTTP ${status})` : ""}`, { cause: error });
    }
  }
}

// Fabrica: en modo demo (D-08) devuelve el LLM preprogramado; en modo live lee la clave
// solo en el servidor (nunca NEXT_PUBLIC_).
export function createLlmClient(env: NodeJS.ProcessEnv = process.env): LlmClient {
  if (isDemoMode()) return new DemoLlmClient();
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new LlmConfigError();
  return new AnthropicLlmClient(apiKey);
}
