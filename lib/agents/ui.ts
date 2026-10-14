// Metadatos y tipos de la UI de agentes (Fase 3). Sin dependencias de servidor: lo usan componentes cliente.
import type { Activity, AgentAction, AgentActionStatus, AgentName } from "@/types/database";

export type ActionView = AgentAction & { review_seconds: number | null };

export const AGENT_META: Record<AgentName, { label: string; role: string; color: string }> = {
  orchestrator: { label: "Orquestador", role: "Clasifica la peticion y delega", color: "#6366f1" },
  receptionist: { label: "Recepcionista", role: "Contactos y primera atencion", color: "#0ea5e9" },
  sales: { label: "Ventas", role: "Cotizaciones y oportunidades", color: "#10b981" },
  booking: { label: "Agenda", role: "Disponibilidad y citas", color: "#f59e0b" },
  follow_up: { label: "Seguimiento", role: "Prospectos sin respuesta", color: "#ec4899" },
  analyst: { label: "Analista", role: "Metricas y resumen ejecutivo", color: "#8b5cf6" },
};

export const CONFIGURABLE_AGENTS = ["receptionist", "sales", "booking", "follow_up", "analyst"] as const;
export type ConfigurableAgent = (typeof CONFIGURABLE_AGENTS)[number];

export const AUTONOMY_LABELS = {
  conservative: { label: "Conservador", help: "Toda escritura requiere aprobacion." },
  balanced: { label: "Equilibrado", help: "Citas, oportunidades y acciones criticas requieren aprobacion." },
  autonomous: { label: "Autonomo", help: "Ejecuta solo; las acciones criticas siempre piden aprobacion." },
} as const;

export function agentMeta(name: string): { label: string; role: string; color: string } {
  return (AGENT_META as Record<string, { label: string; role: string; color: string }>)[name] ?? {
    label: name,
    role: "",
    color: "#64748b",
  };
}

export const STATUS_LABELS: Record<AgentActionStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  executed: "Ejecutada",
  failed: "Fallida",
};

export type DiffRow = { field: string; label: string; current: string | null; proposed: string | null };
export type ActionDiff = { kind: "create" | "update"; entity: string; target: string | null; rows: DiffRow[] };

export type ActivityWithAuthor = Activity & { author_name: string | null };

export function payloadOf(action: AgentAction): {
  summary: string;
  reason: string;
  risk: "low" | "medium" | "high";
  critical: boolean;
  input: Record<string, unknown>;
} {
  const p = (action.payload ?? {}) as Record<string, unknown>;
  const risk = p.risk === "high" || p.risk === "medium" || p.risk === "low" ? p.risk : "low";
  return {
    summary: typeof p.summary === "string" ? p.summary : action.action_type,
    reason: typeof p.reason === "string" ? p.reason : "",
    risk,
    critical: p.critical === true,
    input: p.input && typeof p.input === "object" && !Array.isArray(p.input) ? (p.input as Record<string, unknown>) : {},
  };
}

// Aviso entre componentes (campana, bandeja, chat) para refrescar los pendientes sin esperar al sondeo.
export const AGENTS_CHANGED_EVENT = "ravyn:agents-changed";
export function notifyAgentsChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
}
