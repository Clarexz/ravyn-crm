// Lectura del tablero y movimiento humano de etapa (Fase 5). Toda consulta filtra por organization_id.
import type { SupabaseClient } from "@supabase/supabase-js";
import { STAGES, STALE_DAYS, isStage, stageMoveNeedsAdmin, type MoveResult, type PipelineCard, type Stage } from "./stages";

const DAY_MS = 86_400_000;
const MAX_ROWS = 2000;

type OppRow = {
  id: string;
  contact_id: string | null;
  title: string;
  stage: string;
  value: number | string | null;
  currency: string | null;
  created_at: string;
  updated_at?: string | null;
};

// null si la lectura falla (el llamador responde 500 sin detalles internos).
export async function loadBoardCards(db: SupabaseClient, organizationId: string, now: Date = new Date()): Promise<PipelineCard[] | null> {
  try {
    const oppRes = await db
      .from("opportunities")
      .select("id, contact_id, title, stage, value, currency, created_at")
      .eq("organization_id", organizationId)
      .limit(MAX_ROWS);
    if (oppRes.error) return null;
    const opps = (oppRes.data ?? []) as OppRow[];
    if (opps.length === 0) return [];

    const actRes = await db
      .from("activities")
      .select("opportunity_id, created_at")
      .eq("organization_id", organizationId)
      .in("opportunity_id", opps.map((o) => o.id))
      .limit(20_000);
    if (actRes.error) return null;
    const last = new Map<string, number>();
    for (const a of (actRes.data ?? []) as Array<{ opportunity_id: string; created_at: string }>) {
      const t = Date.parse(a.created_at);
      if (t > (last.get(a.opportunity_id) ?? 0)) last.set(a.opportunity_id, t);
    }

    const contactIds = Array.from(new Set(opps.map((o) => o.contact_id).filter((c): c is string => !!c)));
    const names = new Map<string, string>();
    if (contactIds.length > 0) {
      const cRes = await db.from("contacts").select("id, full_name").eq("organization_id", organizationId).in("id", contactIds);
      if (cRes.error) return null;
      for (const c of (cRes.data ?? []) as Array<{ id: string; full_name: string }>) names.set(c.id, c.full_name);
    }

    return opps
      .filter((o) => isStage(o.stage))
      .map((o): PipelineCard => {
        const lastAt = last.get(o.id) ?? Date.parse(o.created_at);
        const days = Math.max(0, Math.floor((now.getTime() - lastAt) / DAY_MS));
        const stage = o.stage as Stage;
        return {
          id: o.id,
          title: o.title,
          stage,
          value: Number(o.value) || 0,
          currency: o.currency ?? "MXN",
          contact_id: o.contact_id,
          contact_name: o.contact_id ? (names.get(o.contact_id) ?? null) : null,
          days_since_activity: days,
          last_activity_at: new Date(lastAt).toISOString(),
          stale: stage !== "won" && stage !== "lost" && days >= STALE_DAYS,
        };
      })
      .sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || a.last_activity_at.localeCompare(b.last_activity_at));
  } catch {
    return null;
  }
}

export type MoveInput = {
  organizationId: string;
  opportunityId: string;
  toStage: Stage;
  // Etapa que el cliente creia vigente; si difiere de la real se responde 409 (tablero desactualizado).
  expectedFrom?: Stage;
  reason?: string;
  actor: { id: string; role: "admin" | "staff" };
  now?: Date;
};

// Movimiento humano de etapa (D-14): cambia la etapa y registra la actividad stage_change en la misma operacion.
// La actualizacion es condicional a la etapa leida (compare-and-set) y, si registrar la actividad falla,
// se restaura la fila: no queda un cambio sin su rastro. Los agentes siguen usando update_stage + aprobacion.
export async function moveOpportunityStage(db: SupabaseClient, input: MoveInput): Promise<MoveResult> {
  const { organizationId, opportunityId, toStage, actor } = input;
  const now = input.now ?? new Date();
  try {
    const cur = await db
      .from("opportunities")
      .select("id, contact_id, stage, probability, closed_at")
      .eq("organization_id", organizationId)
      .eq("id", opportunityId)
      .maybeSingle();
    if (cur.error) return { ok: false, status: 500, error: "Error interno" };
    const opp = cur.data as { id: string; contact_id: string | null; stage: string; probability: number; closed_at: string | null } | null;
    if (!opp || !isStage(opp.stage)) return { ok: false, status: 404, error: "Oportunidad no encontrada" };
    const from = opp.stage;

    if (input.expectedFrom && input.expectedFrom !== from) {
      return { ok: false, status: 409, error: "La oportunidad cambio de etapa desde otro lugar", current_stage: from };
    }
    if (from === toStage) return { ok: true, changed: false, opportunity_id: opp.id, from, to: toStage, last_activity_at: now.toISOString() };
    if (stageMoveNeedsAdmin(from, toStage) && actor.role !== "admin") {
      return { ok: false, status: 403, error: "Solo un administrador puede cerrar o reabrir oportunidades" };
    }

    const closing = toStage === "won" || toStage === "lost";
    const patch: Record<string, unknown> = { stage: toStage, closed_at: closing ? now.toISOString() : null };
    if (toStage === "won") patch.probability = 100;
    if (toStage === "lost") patch.probability = 0;

    const up = await db
      .from("opportunities")
      .update(patch)
      .eq("organization_id", organizationId)
      .eq("id", opp.id)
      .eq("stage", from)
      .select("id")
      .maybeSingle();
    if (up.error) return { ok: false, status: 500, error: "Error interno" };
    if (!up.data) {
      // Otro movimiento se adelanto entre la lectura y la escritura.
      const again = await db.from("opportunities").select("stage").eq("organization_id", organizationId).eq("id", opp.id).maybeSingle();
      const stage = (again.data as { stage?: string } | null)?.stage;
      return { ok: false, status: 409, error: "La oportunidad cambio de etapa desde otro lugar", ...(isStage(stage) ? { current_stage: stage } : {}) };
    }

    const act = await db
      .from("activities")
      .insert({
        organization_id: organizationId,
        contact_id: opp.contact_id,
        opportunity_id: opp.id,
        type: "stage_change",
        title: `Etapa: ${from} a ${toStage}`,
        description: input.reason ?? null,
        status: "completed",
        performed_by_type: "human",
        performed_by_id: actor.id,
      })
      .select("created_at")
      .single();
    if (act.error || !act.data) {
      await db
        .from("opportunities")
        .update({ stage: from, probability: opp.probability, closed_at: opp.closed_at })
        .eq("organization_id", organizationId)
        .eq("id", opp.id);
      return { ok: false, status: 500, error: "No se pudo registrar el cambio" };
    }
    return { ok: true, changed: true, opportunity_id: opp.id, from, to: toStage, last_activity_at: (act.data as { created_at: string }).created_at };
  } catch {
    return { ok: false, status: 500, error: "Error interno" };
  }
}
