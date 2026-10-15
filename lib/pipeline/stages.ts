// Etapas comerciales y contratos compartidos del pipeline (Fase 5). Modulo puro y seguro para el cliente.
export const OPEN_STAGES = ["lead", "contacted", "qualified", "proposal", "negotiation"] as const;
export const CLOSED_STAGES = ["won", "lost"] as const;
export const STAGES = [...OPEN_STAGES, ...CLOSED_STAGES] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  lead: "Lead",
  contacted: "Contactado",
  qualified: "Calificado",
  proposal: "Propuesta",
  negotiation: "Negociación",
  won: "Ganado",
  lost: "Perdido",
};

export const isStage = (v: unknown): v is Stage => typeof v === "string" && (STAGES as readonly string[]).includes(v);
export const isClosedStage = (s: string): boolean => s === "won" || s === "lost";

// Una oportunidad abierta sin actividad desde hace estos dias se considera estancada (ANL-02).
export const STALE_DAYS = 15;

// Cerrar (o reabrir) una oportunidad es una decision de administrador, coherente con R-01 (D-14).
export function stageMoveNeedsAdmin(from: string, to: string): boolean {
  return from !== to && (isClosedStage(from) || isClosedStage(to));
}

export type PipelineCard = {
  id: string;
  title: string;
  stage: Stage;
  value: number;
  currency: string;
  contact_id: string | null;
  contact_name: string | null;
  days_since_activity: number;
  last_activity_at: string;
  stale: boolean;
};

export type PipelineBoard = {
  cards: PipelineCard[];
  is_admin: boolean;
  generated_at: string;
  stale_days: number;
};

export type MoveResult =
  | { ok: true; changed: boolean; opportunity_id: string; from: Stage; to: Stage; last_activity_at: string }
  | { ok: false; status: 400 | 403 | 404 | 409 | 500; error: string; current_stage?: Stage };
