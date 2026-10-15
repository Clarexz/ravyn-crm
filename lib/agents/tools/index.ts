import type { ToolDefinition } from "@/lib/agents/types";
import { TOOL_NAMES, type ToolName } from "@/lib/agents/permissions";
import { generateBriefingTool } from "@/lib/agents/analyst";
import { createTask, logMessage, setReminder } from "./activity_tools";
import { findStaleOpportunities, getOrgMetrics } from "./analytics_tools";
import { checkAvailability, createBooking, rescheduleBooking } from "./booking_tools";
import { createContact, searchContact, updateContactNotes } from "./contact_tools";
import { DISCOUNT_APPROVAL_THRESHOLD, calculateQuote, createOpportunity, updateStage } from "./sales_tools";

export const TOOL_REGISTRY: Record<ToolName, ToolDefinition> = {
  search_contact: searchContact as ToolDefinition,
  create_contact: createContact as ToolDefinition,
  update_contact_notes: updateContactNotes as ToolDefinition,
  create_opportunity: createOpportunity as ToolDefinition,
  update_stage: updateStage as ToolDefinition,
  calculate_quote: calculateQuote as ToolDefinition,
  check_availability: checkAvailability as ToolDefinition,
  create_booking: createBooking as ToolDefinition,
  reschedule_booking: rescheduleBooking as ToolDefinition,
  create_task: createTask as ToolDefinition,
  log_message: logMessage as ToolDefinition,
  set_reminder: setReminder as ToolDefinition,
  find_stale_opportunities: findStaleOpportunities as ToolDefinition,
  get_org_metrics: getOrgMetrics as ToolDefinition,
  generate_briefing: generateBriefingTool as ToolDefinition,
};

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name) && Object.hasOwn(TOOL_REGISTRY, name);
}

// Criticidad precisa por llamada (para la Fase 2): update_stage a won/lost y descuento > 10%
// en calculate_quote/create_opportunity. `input` debe venir ya validado.
export function isCriticalCall(tool: ToolName, input: unknown): boolean {
  const i = (input ?? {}) as { stage?: unknown; discount_percent?: unknown };
  if (tool === "update_stage") return i.stage === "won" || i.stage === "lost";
  if (tool === "calculate_quote" || tool === "create_opportunity") {
    return typeof i.discount_percent === "number" && i.discount_percent > DISCOUNT_APPROVAL_THRESHOLD;
  }
  return false;
}
