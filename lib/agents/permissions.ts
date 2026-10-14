// Matriz de permisos de herramientas por agente (Fase 1). Dueno: agente maestro.
// Un agente solo puede ejecutar las herramientas de su lista; el ejecutor lo verifica
// antes de validar la entrada o tocar la base de datos.
import type { AgentName } from "@/types/database";

export const TOOL_NAMES = [
  "search_contact",
  "create_contact",
  "update_contact_notes",
  "create_opportunity",
  "update_stage",
  "calculate_quote",
  "check_availability",
  "create_booking",
  "reschedule_booking",
  "create_task",
  "log_message",
  "set_reminder",
  "find_stale_opportunities",
  "get_org_metrics",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const AGENT_TOOL_PERMISSIONS: Record<AgentName, readonly ToolName[]> = {
  orchestrator: [],
  receptionist: ["search_contact", "create_contact", "update_contact_notes", "log_message", "check_availability"],
  sales: ["search_contact", "create_opportunity", "update_stage", "calculate_quote", "log_message", "create_task"],
  booking: ["search_contact", "check_availability", "create_booking", "reschedule_booking"],
  follow_up: ["search_contact", "find_stale_opportunities", "create_task", "set_reminder", "log_message"],
  analyst: ["get_org_metrics", "find_stale_opportunities"],
};

export function canUseTool(agent: AgentName, tool: string): boolean {
  return (AGENT_TOOL_PERMISSIONS[agent] as readonly string[]).includes(tool);
}
