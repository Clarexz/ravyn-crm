"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Check, Eye, Inbox, X } from "lucide-react";
import { toast } from "sonner";
import { ActionReviewDialog } from "@/components/crm/agents/ActionReviewDialog";
import { reviewAction } from "@/components/crm/agents/usePendingActions";
import { AGENTS_CHANGED_EVENT, AGENT_META, agentMeta, payloadOf, STATUS_LABELS, type ActionView } from "@/lib/agents/ui";
import { cn } from "@/lib/utils";

type View = "pending" | "reviewed" | "automatic";
const VIEWS: Array<{ id: View; label: string }> = [
  { id: "pending", label: "Pendientes" },
  { id: "reviewed", label: "Revisadas" },
  { id: "automatic", label: "Automaticas" },
];
const POLL_MS = 10_000;

function queryFor(view: View): string {
  if (view === "pending") return "status=pending&limit=100";
  if (view === "reviewed") return "requires_approval=true&limit=100";
  return "requires_approval=false&limit=100";
}

export function InboxClient() {
  const [view, setView] = useState<View>("pending");
  const [agent, setAgent] = useState<string>("all");
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [rows, setRows] = useState<ActionView[] | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<ActionView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/actions?${queryFor(view)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("http");
      const body = (await res.json()) as { actions: ActionView[] };
      setRows(view === "reviewed" ? body.actions.filter((a) => a.status !== "pending") : body.actions);
      setError(false);
    } catch {
      setError(true);
    }
  }, [view]);

  useEffect(() => {
    setRows(null);
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    const onChange = () => void load();
    window.addEventListener(AGENTS_CHANGED_EVENT, onChange);
    return () => {
      clearInterval(timer);
      window.removeEventListener(AGENTS_CHANGED_EVENT, onChange);
    };
  }, [load]);

  const visible = useMemo(
    () => (rows ?? []).filter((a) => (agent === "all" || a.agent_name === agent) && (!onlyCritical || payloadOf(a).critical)),
    [rows, agent, onlyCritical],
  );

  const quick = async (a: ActionView, kind: "approve" | "reject") => {
    setBusy(a.id);
    const res = await reviewAction(a.id, kind);
    setBusy(null);
    if (res.ok) toast.success(kind === "approve" ? (res.executed ? "Accion aprobada y ejecutada" : "Aprobada, pero la ejecucion fallo") : "Accion rechazada");
    else toast.error(res.status === 409 ? "Otra persona ya reviso esta accion" : res.message);
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Vista de la bandeja">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            data-testid={`view-${v.id}`}
            onClick={() => setView(v.id)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs font-bold transition-colors",
              view === v.id
                ? "border-[var(--brand-accent)] bg-[var(--brand-accent)] text-white"
                : "border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]",
            )}
          >
            {v.label}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            Agente
            <select
              data-testid="filter-agent"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
            >
              <option value="all">Todos</option>
              {Object.entries(AGENT_META)
                .filter(([k]) => k !== "orchestrator")
                .map(([k, m]) => (
                  <option key={k} value={k}>
                    {m.label}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input type="checkbox" data-testid="filter-critical" checked={onlyCritical} onChange={(e) => setOnlyCritical(e.target.checked)} />
            Solo criticas
          </label>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-2xl border border-[var(--border-default)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          No se pudo cargar la bandeja. Reintentando...
        </p>
      )}

      {rows === null && !error && (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-3xl bg-[var(--bg-card-hover)]" />
          ))}
        </div>
      )}

      {rows !== null && visible.length === 0 && (
        <div data-testid="inbox-empty" className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-[var(--border-default)] p-10 text-center">
          <Inbox className="h-6 w-6 text-[var(--text-muted)]" aria-hidden />
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {view === "pending" ? "No hay acciones pendientes" : "Nada que mostrar con estos filtros"}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            {view === "pending" ? "Cuando un agente proponga algo sensible, aparecera aqui para tu aprobacion." : "Prueba con otra vista o quita los filtros."}
          </p>
        </div>
      )}

      <ul className="space-y-3">
        {visible.map((a) => {
          const p = payloadOf(a);
          const meta = agentMeta(a.agent_name);
          return (
            <li key={a.id} data-testid="action-card" data-action-id={a.id} data-status={a.status} className="rounded-3xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                <span className="font-bold text-[var(--text-secondary)]">{meta.label}</span>
                <span>·</span>
                <time dateTime={a.proposed_at}>{formatDistanceToNow(new Date(a.proposed_at), { addSuffix: true, locale: es })}</time>
                {p.critical && <span className="rounded-full bg-[var(--destructive)]/10 px-2 py-0.5 font-bold text-[var(--destructive)]">Critica</span>}
                {a.status !== "pending" && (
                  <span className="ml-auto rounded-full border border-[var(--border-default)] px-2 py-0.5 font-bold text-[var(--text-secondary)]">{STATUS_LABELS[a.status]}</span>
                )}
              </div>
              <p className="mt-1.5 text-sm font-bold text-[var(--text-primary)]">{p.summary}</p>
              {p.reason && <p className="mt-1 text-xs text-[var(--text-secondary)]">{p.reason}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="review-button"
                  onClick={() => setSelected(a)}
                  className="flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--border-default)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
                >
                  <Eye className="h-3.5 w-3.5" /> {a.status === "pending" ? "Revisar" : "Ver detalle"}
                </button>
                {a.status === "pending" && (
                  <>
                    <button
                      type="button"
                      data-testid="quick-approve"
                      disabled={busy === a.id}
                      onClick={() => quick(a, "approve")}
                      className="flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--brand-accent)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" /> Aprobar
                    </button>
                    <button
                      type="button"
                      data-testid="quick-reject"
                      disabled={busy === a.id}
                      onClick={() => quick(a, "reject")}
                      className="flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--border-default)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" /> Rechazar
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <ActionReviewDialog action={selected} onClose={() => setSelected(null)} onReviewed={() => void load()} />
    </div>
  );
}
