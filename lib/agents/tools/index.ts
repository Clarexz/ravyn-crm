import type { ToolDefinition } from "@/lib/agents/types";
import { TOOL_NAMES, type ToolName } from "@/lib/agents/permissions";
import { generateBriefingTool } from "@/lib/agents/analyst";
import { createTask, logMessage, setReminder } from "./activity_tools";
import { findStaleOpportunities, getOrgMetrics } from "./analytics_tools";
import { PARTY_SIZE_APPROVAL_THRESHOLD, cancelBooking, checkAvailability, createBooking, rescheduleBooking } from "./booking_tools";
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
  cancel_booking: cancelBooking as ToolDefinition,
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

// Criticidad precisa por llamada. UNICA fuente de verdad: cada regla se ejecuta sobre la entrada ya validada.
// Agregar una regla exige un caso en tests/e2e-flows/criticalMatrix.ts (una prueba falla si falta, Fase 6).
export type CriticalRule = {
  id: string;
  tool: ToolName;
  description: string;
  applies: (input: Record<string, unknown>) => boolean;
};

export const CRITICAL_RULES: readonly CriticalRule[] = [
  {
    id: "update_stage.close",
    tool: "update_stage",
    description: "Pasar una oportunidad a won o lost",
    applies: (i) => i.stage === "won" || i.stage === "lost",
  },
  {
    id: "calculate_quote.discount",
    tool: "calculate_quote",
    description: `Descuento mayor a ${DISCOUNT_APPROVAL_THRESHOLD}% en una cotizacion`,
    applies: (i) => typeof i.discount_percent === "number" && i.discount_percent > DISCOUNT_APPROVAL_THRESHOLD,
  },
  {
    id: "create_opportunity.discount",
    tool: "create_opportunity",
    description: `Descuento mayor a ${DISCOUNT_APPROVAL_THRESHOLD}% al crear una oportunidad`,
    applies: (i) => typeof i.discount_percent === "number" && i.discount_percent > DISCOUNT_APPROVAL_THRESHOLD,
  },
  {
    id: "cancel_booking.always",
    tool: "cancel_booking",
    description: "Cancelar cualquier cita",
    applies: () => true,
  },
  {
    id: "create_booking.large_party",
    tool: "create_booking",
    description: `Reservacion para mas de ${PARTY_SIZE_APPROVAL_THRESHOLD} personas`,
    applies: (i) => typeof i.party_size === "number" && i.party_size > PARTY_SIZE_APPROVAL_THRESHOLD,
  },
];

// `input` debe venir ya validado.
export function isCriticalCall(tool: ToolName, input: unknown): boolean {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return CRITICAL_RULES.some((r) => r.tool === tool && r.applies(i));
}
