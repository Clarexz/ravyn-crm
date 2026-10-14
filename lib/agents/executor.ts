// STUB del contrato. La implementacion real la escribe el agente de herramientas.
import type { AgentName, ToolContext, ToolResult, ToolSummary } from "@/lib/agents/types";

// Verifica permiso, valida la entrada con Zod, ejecuta la herramienta y captura cualquier
// error en un ToolResult (nunca lanza). Siempre opera dentro de ctx.organizationId.
export async function executeTool(
  _agent: AgentName,
  _toolName: string,
  _rawInput: unknown,
  _ctx: Omit<ToolContext, "agent">,
): Promise<ToolResult> {
  throw new Error("executeTool: no implementado");
}

// Herramientas que el agente tiene permitido usar, con su JSON Schema de entrada.
export function listToolsForAgent(_agent: AgentName): ToolSummary[] {
  throw new Error("listToolsForAgent: no implementado");
}
