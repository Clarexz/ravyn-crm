// Ejecutor de herramientas. Orden: existe -> permiso -> Zod -> run. Nunca lanza.
import { z } from "zod";
import { canUseTool, AGENT_TOOL_PERMISSIONS } from "@/lib/agents/permissions";
import type { AgentName, ToolContext, ToolResult, ToolSummary } from "@/lib/agents/types";
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

export async function executeTool(
  agent: AgentName,
  toolName: string,
  rawInput: unknown,
  ctx: Omit<ToolContext, "agent">,
): Promise<ToolResult> {
  try {
    if (typeof toolName !== "string" || !isToolName(toolName)) {
      return fail("UNKNOWN_TOOL", `La herramienta "${String(toolName).slice(0, 60)}" no existe.`);
    }
    if (!canUseTool(agent, toolName)) {
      return fail("PERMISSION_DENIED", `El agente "${String(agent)}" no tiene permiso para usar ${toolName}.`);
    }
    const tool = TOOL_REGISTRY[toolName];
    const parsed = tool.input.safeParse(rawInput);
    if (!parsed.success) {
      return fail("INVALID_INPUT", `Entrada invalida para ${toolName}: ${readableIssues(parsed.error)}`);
    }
    const data = await tool.run({ ...ctx, agent }, parsed.data);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ToolError) return fail(err.code, err.message);
    return fail("EXECUTION_FAILED", "No se pudo ejecutar la herramienta. Intenta de nuevo.");
  }
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
