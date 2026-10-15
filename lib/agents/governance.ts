// Gobernanza y Human-in-the-Loop (Fase 2). Dueno: subagente f2-hitl.
// Envuelve al ejecutor: permisos y Zod primero; despues decide, segun el nivel de
// autonomia de la organizacion, si la accion se ejecuta o queda en espera de aprobacion.
// Solo depende de un cliente tipo SupabaseClient (ctx.db): base real, de demo o falsa.
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeTool, prepareToolCall, runPrepared } from "@/lib/agents/executor";
import type { ToolName } from "@/lib/agents/permissions";
import { isCriticalCall, TOOL_REGISTRY } from "@/lib/agents/tools";
import { AUTONOMY_LEVELS, DEFAULT_AUTONOMY, configFor, isAutonomy, loadOrgAgentConfig } from "@/lib/agents/settings";
import { DISCOUNT_APPROVAL_THRESHOLD } from "@/lib/agents/tools/sales_tools";
import type {
  AgentAutonomy,
  AgentName,
  PendingApprovalData,
  ToolContext,
  ToolResult,
  ToolRisk,
} from "@/lib/agents/types";
import type { AgentAction, AgentActionStatus } from "@/types/database";

export { AUTONOMY_LEVELS, DEFAULT_AUTONOMY, isAutonomy };
export const ACTION_STATUSES: readonly AgentActionStatus[] = ["pending", "approved", "rejected", "executed", "failed"];

// Herramientas que no escriben (o solo registran comunicacion): nunca se frenan por autonomia.
const READ_ONLY_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  "search_contact",
  "check_availability",
  "calculate_quote",
  "find_stale_opportunities",
  "get_org_metrics",
]);
const ALWAYS_ALLOWED_WRITES: ReadonlySet<ToolName> = new Set<ToolName>(["log_message"]);
// Riesgo medio: piden aprobacion desde el nivel balanced.
const MEDIUM_RISK_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>(["create_booking", "reschedule_booking", "create_opportunity"]);

export type ApprovalDecision = { required: boolean; critical: boolean; reason: string };

// Decision pura y determinista. `input` debe venir ya validado.
export function decideApproval(level: AgentAutonomy, tool: ToolName, input: unknown): ApprovalDecision {
  if (isCriticalCall(tool, input)) {
    return { required: true, critical: true, reason: criticalReason(tool, input) };
  }
  if (level === "conservative" && !READ_ONLY_TOOLS.has(tool) && !ALWAYS_ALLOWED_WRITES.has(tool)) {
    return {
      required: true,
      critical: false,
      reason: "El nivel de autonomia conservador exige aprobacion humana para toda accion que modifica datos.",
    };
  }
  if (level === "balanced" && MEDIUM_RISK_TOOLS.has(tool)) {
    return {
      required: true,
      critical: false,
      reason: "El nivel de autonomia equilibrado exige aprobacion humana para citas y oportunidades.",
    };
  }
  return { required: false, critical: false, reason: "" };
}

function criticalReason(tool: ToolName, input: unknown): string {
  const i = (input ?? {}) as { stage?: unknown; discount_percent?: unknown };
  if (tool === "update_stage") return `Cerrar una oportunidad como ${String(i.stage) === "won" ? "ganada" : "perdida"} es una accion critica.`;
  if (typeof i.discount_percent === "number") {
    return `Un descuento de ${i.discount_percent}% supera el limite de ${DISCOUNT_APPROVAL_THRESHOLD}% que un agente puede aplicar solo.`;
  }
  return "Accion critica: siempre requiere aprobacion humana.";
}

// Resumen legible y determinista de lo que hara la accion.
export function summarizeAction(tool: ToolName, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  const discount = typeof i.discount_percent === "number" && i.discount_percent > 0 ? ` con ${i.discount_percent}% de descuento` : "";
  switch (tool) {
    case "create_opportunity":
      return `Crear la oportunidad "${s(i.title)}"${discount}.`;
    case "update_stage":
      return `Cambiar la oportunidad ${s(i.opportunity_id)} a la etapa ${s(i.stage)}.`;
    case "calculate_quote":
      return `Aplicar una cotizacion${discount}.`;
    case "create_booking":
      return `Agendar una cita el ${s(i.scheduled_at)} (${String(i.duration_minutes ?? 30)} min).`;
    case "reschedule_booking":
      return `Reprogramar la cita ${s(i.booking_id)} para el ${s(i.new_scheduled_at)}.`;
    case "create_contact":
      return `Crear el contacto "${s(i.full_name)}".`;
    case "update_contact_notes":
      return `Agregar una nota al contacto ${s(i.contact_id)}.`;
    case "create_task":
      return `Crear la tarea "${s(i.title)}".`;
    case "set_reminder":
      return `Crear el recordatorio "${s(i.title)}".`;
    default:
      return `Ejecutar ${tool}.`;
  }
}

function riskOf(tool: ToolName, critical: boolean): ToolRisk {
  return critical ? "high" : TOOL_REGISTRY[tool].risk;
}

// Nivel efectivo del agente: su ajuste propio o, si no tiene, el global de la organizacion.
export async function loadAutonomy(db: SupabaseClient, organizationId: string, agent?: AgentName): Promise<AgentAutonomy> {
  const config = await loadOrgAgentConfig(db, organizationId);
  return agent ? configFor(config, agent).autonomy : config.autonomy;
}

type GovCtx = Omit<ToolContext, "agent">;

// Interceptor. Nunca lanza.
export async function executeToolGoverned(
  agent: AgentName,
  toolName: string,
  rawInput: unknown,
  ctx: GovCtx,
): Promise<ToolResult> {
  try {
    const prepared = prepareToolCall(agent, toolName, rawInput);
    if (!prepared.ok) return prepared; // sin permiso o entrada invalida: no crea accion

    const config = configFor(await loadOrgAgentConfig(ctx.db, ctx.organizationId), agent);
    if (!config.enabled) {
      return { ok: false, error: { code: "PERMISSION_DENIED", message: "El agente esta deshabilitado en el Centro de Control." } };
    }
    const level = config.autonomy;
    const decision = decideApproval(level, prepared.toolName, prepared.input);
    const proposedAt = (ctx.now ?? new Date()).toISOString();

    if (decision.required) {
      const summary = summarizeAction(prepared.toolName, prepared.input);
      const res = await ctx.db
        .from("agent_actions")
        .insert({
          organization_id: ctx.organizationId,
          agent_name: agent,
          action_type: prepared.toolName,
          payload: {
            tool: prepared.toolName,
            input: prepared.input,
            reason: decision.reason,
            summary,
            risk: riskOf(prepared.toolName, decision.critical),
            critical: decision.critical,
            autonomy: level,
          },
          requires_approval: true,
          status: "pending",
          proposed_at: proposedAt,
        })
        .select("id")
        .single();
      const id = (res.data as { id?: string } | null)?.id;
      if (res.error || !id) {
        return { ok: false, error: { code: "EXECUTION_FAILED", message: "No se pudo registrar la accion para aprobacion." } };
      }
      const data: PendingApprovalData = { status: "pending_approval", action_id: id, summary };
      return { ok: true, data };
    }

    const result = await runPrepared(prepared, { ...ctx, agent });
    await traceExecution(ctx, agent, prepared.toolName, prepared.input, result, proposedAt);
    return result;
  } catch {
    return { ok: false, error: { code: "EXECUTION_FAILED", message: "No se pudo ejecutar la herramienta. Intenta de nuevo." } };
  }
}

// Trazabilidad de las acciones automaticas. Un fallo al registrar no afecta al resultado.
async function traceExecution(
  ctx: GovCtx,
  agent: AgentName,
  tool: ToolName,
  input: unknown,
  result: ToolResult,
  proposedAt: string,
): Promise<void> {
  try {
    await ctx.db.from("agent_actions").insert({
      organization_id: ctx.organizationId,
      agent_name: agent,
      action_type: tool,
      payload: { tool, input, summary: summarizeAction(tool, input), risk: TOOL_REGISTRY[tool].risk },
      requires_approval: false,
      status: result.ok ? "executed" : "failed",
      proposed_at: proposedAt,
      execution_result: result.ok ? { data: result.data } : { error: result.error },
      error_message: result.ok ? null : result.error.message,
    });
  } catch {
    // ignorado a proposito
  }
}

// --- Bandeja y revision humana ---

export type ActionView = AgentAction & { review_seconds: number | null };
export type GovernanceOutcome = { status: number; body: Record<string, unknown> };

export function withReviewSeconds(row: AgentAction): ActionView {
  let seconds: number | null = null;
  if (row.reviewed_at && row.proposed_at) {
    const diff = Date.parse(row.reviewed_at) - Date.parse(row.proposed_at);
    if (Number.isFinite(diff)) seconds = Math.max(0, Math.round(diff / 1000));
  }
  return { ...row, review_seconds: seconds };
}

export type ListFilters = { status?: AgentActionStatus; requiresApproval?: boolean; limit?: number };

export async function listActions(db: SupabaseClient, organizationId: string, filters: ListFilters = {}): Promise<GovernanceOutcome> {
  try {
    let q = db.from("agent_actions").select("*").eq("organization_id", organizationId);
    if (filters.status) q = q.eq("status", filters.status);
    if (filters.requiresApproval !== undefined) q = q.eq("requires_approval", filters.requiresApproval);
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const res = await q.order("proposed_at", { ascending: false }).limit(limit);
    if (res.error) return { status: 500, body: { error: "Error interno" } };
    const actions = ((res.data ?? []) as AgentAction[]).map(withReviewSeconds);
    return { status: 200, body: { actions } };
  } catch {
    return { status: 500, body: { error: "Error interno" } };
  }
}

export async function countPendingActions(db: SupabaseClient, organizationId: string): Promise<number | null> {
  try {
    const res = await db.from("agent_actions").select("id").eq("organization_id", organizationId).eq("status", "pending");
    return res.error ? null : (res.data ?? []).length;
  } catch {
    return null;
  }
}

export async function getAction(db: SupabaseClient, organizationId: string, id: string): Promise<GovernanceOutcome> {
  try {
    const action = await loadAction(db, organizationId, id);
    return action ? { status: 200, body: { action: withReviewSeconds(action) } } : { status: 404, body: { error: "Accion no encontrada" } };
  } catch {
    return { status: 500, body: { error: "Error interno" } };
  }
}

async function loadAction(db: SupabaseClient, organizationId: string, id: string): Promise<AgentAction | null> {
  const res = await db.from("agent_actions").select("*").eq("organization_id", organizationId).eq("id", id).maybeSingle();
  if (res.error) throw new Error("db");
  return (res.data as AgentAction | null) ?? null;
}

const NOT_FOUND: GovernanceOutcome = { status: 404, body: { error: "Accion no encontrada" } };
const INTERNAL: GovernanceOutcome = { status: 500, body: { error: "Error interno" } };
const notPending = (status: string): GovernanceOutcome => ({
  status: 409,
  body: { error: `La accion ya no esta pendiente (estado: ${status})` },
});

export type ReviewParams = {
  db: SupabaseClient;
  organizationId: string;
  userId: string;
  actionId: string;
  notes?: string;
  now?: Date;
  // Rol del revisor: las acciones criticas solo las aprueba un administrador (R-01).
  isAdmin?: boolean;
};

export const CRITICAL_ADMIN_ONLY_MESSAGE = "Solo un administrador puede aprobar acciones criticas";

// R-01: las acciones criticas solo las aprueba un administrador. Rechazar y las no criticas, cualquier usuario.
export async function approveAction(params: ReviewParams & { input?: unknown }): Promise<GovernanceOutcome> {
  const { db, organizationId, userId, actionId } = params;
  try {
    const action = await loadAction(db, organizationId, actionId);
    if (!action) return NOT_FOUND;
    if (action.status !== "pending") return notPending(action.status);

    const payload = (action.payload ?? {}) as { tool?: unknown; input?: unknown };
    const tool = typeof payload.tool === "string" ? payload.tool : action.action_type;
    const prepared = prepareToolCall(action.agent_name, tool, params.input !== undefined ? params.input : payload.input);
    if (!prepared.ok) {
      // Valores modificados invalidos (o carga corrupta): la accion sigue pendiente.
      return { status: 400, body: { error: prepared.error.message, code: prepared.error.code } };
    }

    // La criticidad se evalua sobre lo guardado y sobre los valores finales (un revisor no puede volverla critica a escondidas).
    const critical = (payload as { critical?: unknown }).critical === true || isCriticalCall(prepared.toolName, prepared.input);
    if (critical && params.isAdmin !== true) {
      return { status: 403, body: { error: CRITICAL_ADMIN_ONLY_MESSAGE, code: "ADMIN_REQUIRED" } };
    }

    const reviewedAt = (params.now ?? new Date()).toISOString();
    const newPayload =
      params.input !== undefined
        ? { ...payload, input: prepared.input, original_input: payload.input, modified_by_reviewer: true }
        : payload;
    // Transicion atomica pending -> approved: solo una peticion concurrente la gana.
    const claim = await db
      .from("agent_actions")
      .update({
        status: "approved",
        reviewed_by: userId,
        reviewed_at: reviewedAt,
        review_notes: params.notes ?? null,
        payload: newPayload,
      })
      .eq("organization_id", organizationId)
      .eq("id", actionId)
      .eq("status", "pending")
      .select("*");
    if (claim.error) return INTERNAL;
    if (!Array.isArray(claim.data) || claim.data.length !== 1) return notPending("changed");

    const result = await runPrepared(prepared, { organizationId, db, agent: action.agent_name, now: params.now });
    const final = await db
      .from("agent_actions")
      .update(
        result.ok
          ? { status: "executed", execution_result: { data: result.data }, error_message: null }
          : {
              status: "failed",
              execution_result: { error: { code: result.error.code } },
              error_message: `No se pudo ejecutar la accion aprobada (${result.error.code}).`,
            },
      )
      .eq("organization_id", organizationId)
      .eq("id", actionId)
      .select("*")
      .single();
    if (final.error || !final.data) return INTERNAL;
    return { status: 200, body: { action: withReviewSeconds(final.data as AgentAction), executed: result.ok } };
  } catch {
    return INTERNAL;
  }
}

export async function rejectAction(params: ReviewParams): Promise<GovernanceOutcome> {
  const { db, organizationId, userId, actionId } = params;
  try {
    const action = await loadAction(db, organizationId, actionId);
    if (!action) return NOT_FOUND;
    if (action.status !== "pending") return notPending(action.status);
    const res = await db
      .from("agent_actions")
      .update({
        status: "rejected",
        reviewed_by: userId,
        reviewed_at: (params.now ?? new Date()).toISOString(),
        review_notes: params.notes ?? null,
      })
      .eq("organization_id", organizationId)
      .eq("id", actionId)
      .eq("status", "pending")
      .select("*");
    if (res.error) return INTERNAL;
    if (!Array.isArray(res.data) || res.data.length !== 1) return notPending("changed");
    return { status: 200, body: { action: withReviewSeconds(res.data[0] as AgentAction) } };
  } catch {
    return INTERNAL;
  }
}

// Re-exportado para quien necesite ejecutar sin interceptar (p. ej. pruebas).
export { executeTool };
