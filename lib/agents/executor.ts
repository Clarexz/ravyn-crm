// Ejecutor de herramientas. Orden: existe -> permiso -> Zod -> run. Nunca lanza.
import { z } from "zod";
import { canUseTool, AGENT_TOOL_PERMISSIONS, type ToolName } from "@/lib/agents/permissions";
import type { AgentName, ToolContext, ToolDefinition, ToolResult, ToolSummary } from "@/lib/agents/types";
import { isToolName, TOOL_REGISTRY } from "@/lib/agents/tools";
import { ToolError } from "@/lib/agents/tools/shared";

function fail(code: "PERMISSION_DENIED" | "UNKNOWN_TOOL" | "INVALID_INPUT" | "NOT_FOUND" | "EXECUTION_FAILED", message: string): ToolResult {
  return { ok: false, error: { code, message } };
}

function readableIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => {
      const path = i.path.length > 0 ? i.path.join(".") : "entrada";
      return `${path}: ${i.message}`;
    })
    .join("; ");
}

export type PreparedCall = {
  ok: true;
  toolName: ToolName;
  tool: ToolDefinition;
  input: unknown;
};

// Pasos previos a ejecutar: existe -> permiso -> Zod. Nunca lanza.
export function prepareToolCall(
  agent: AgentName,
  toolName: string,
  rawInput: unknown,
): PreparedCall | Extract<ToolResult, { ok: false }> {
  try {
    if (typeof toolName !== "string" || !isToolName(toolName)) {
      return fail("UNKNOWN_TOOL", `La herramienta "${String(toolName).slice(0, 60)}" no existe.`) as Extract<ToolResult, { ok: false }>;
    }
    if (!canUseTool(agent, toolName)) {
      return fail("PERMISSION_DENIED", `El agente "${String(agent)}" no tiene permiso para usar ${toolName}.`) as Extract<ToolResult, { ok: false }>;
    }
    const tool = TOOL_REGISTRY[toolName];
    const parsed = tool.input.safeParse(rawInput);
    if (!parsed.success) {
      return fail("INVALID_INPUT", `Entrada invalida para ${toolName}: ${readableIssues(parsed.error)}`) as Extract<ToolResult, { ok: false }>;
    }
    return { ok: true, toolName, tool, input: parsed.data };
  } catch {
    return fail("EXECUTION_FAILED", "No se pudo preparar la herramienta.") as Extract<ToolResult, { ok: false }>;
  }
}

// Ejecuta una llamada ya preparada. Nunca lanza.
export async function runPrepared(prepared: PreparedCall, ctx: ToolContext): Promise<ToolResult> {
  try {
    const data = await prepared.tool.run(ctx, prepared.input);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ToolError) return fail(err.code, err.message);
    return fail("EXECUTION_FAILED", "No se pudo ejecutar la herramienta. Intenta de nuevo.");
  }
}

export async function executeTool(
  agent: AgentName,
  toolName: string,
  rawInput: unknown,
  ctx: Omit<ToolContext, "agent">,
): Promise<ToolResult> {
  const prepared = prepareToolCall(agent, toolName, rawInput);
  if (!prepared.ok) return prepared;
  return runPrepared(prepared, { ...ctx, agent });
}

export function listToolsForAgent(agent: AgentName): ToolSummary[] {
  try {
    const allowed = AGENT_TOOL_PERMISSIONS[agent] ?? [];
    return allowed.map((name) => {
      const tool = TOOL_REGISTRY[name];
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: z.toJSONSchema(tool.input, { io: "input" }) as Record<string, unknown>,
      };
    });
  } catch {
    return [];
  }
}
