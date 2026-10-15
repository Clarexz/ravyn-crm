"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Inbox, KanbanSquare, RefreshCw, Sparkles } from "lucide-react";
import { useTenant } from "@/components/crm/TenantProvider";
import type { Briefing } from "@/lib/agents/analyst";
import { cn } from "@/lib/utils";

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; briefing: Briefing };

function isEmpty(b: Briefing): boolean {
  const m = b.metrics;
  return (
    m.pipeline.open_count === 0 &&
    m.first_response.new_contacts === 0 &&
    m.opportunity_conversion.closed === 0 &&
    m.quote_conversion.issued === 0 &&
    m.no_show.completed + m.no_show.no_show === 0 &&
    m.pending_approvals === 0
  );
}

// Widget "Briefing Diario": resumen del Agente Analista. Todo el texto llega ya redactado por el servidor
// y se pinta como texto de React (sin HTML).
export function BriefingCard() {
  const { modules, labels } = useTenant();
  const [state, setState] = useState<State>({ kind: "loading" });
  const pipeline = modules.find((m) => m.id === "pipeline");
  const showPipelineLink = !!pipeline?.active && pipeline.available;

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/briefing", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { briefing: Briefing };
      setState({ kind: "ready", briefing: data.briefing });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section
      data-testid="briefing-card"
      aria-labelledby="briefing-title"
      className="rounded-[32px] border border-[var(--border-default)] bg-[var(--bg-card)] p-6 shadow-sm sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="briefing-title" className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]">
          <Sparkles className="h-4 w-4 text-[var(--brand-accent)]" /> Briefing diario
          <span className="rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] tracking-wider">Analista</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {showPipelineLink && (
            <Link href="/pipeline" data-testid="briefing-link-pipeline" className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-default)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]">
              <KanbanSquare className="h-3.5 w-3.5" /> {labels.pipeline.plural}
            </Link>
          )}
          <Link href="/agents/inbox" data-testid="briefing-link-inbox" className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-default)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]">
            <Inbox className="h-3.5 w-3.5" /> Aprobaciones
          </Link>
          <button type="button" aria-label="Actualizar briefing" onClick={() => void load()} className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]">
            <RefreshCw className={cn("h-3.5 w-3.5", state.kind === "loading" && "animate-spin")} />
          </button>
        </div>
      </div>

      {state.kind === "loading" && (
        <div data-testid="briefing-loading" aria-busy="true" className="mt-6 space-y-3">
          <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--bg-surface)]" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--bg-surface)]" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--bg-surface)]" />
        </div>
      )}

      {state.kind === "error" && (
        <div data-testid="briefing-error" role="alert" className="mt-6 rounded-2xl border border-dashed border-[var(--border-default)] p-5 text-sm text-[var(--text-secondary)]">
          No se pudo generar el briefing.{" "}
          <button type="button" onClick={() => void load()} className="font-bold text-[var(--brand-accent)] underline">Reintentar</button>
        </div>
      )}

      {state.kind === "ready" && isEmpty(state.briefing) && (
        <p data-testid="briefing-empty" className="mt-6 rounded-2xl border border-dashed border-[var(--border-default)] p-5 text-sm text-[var(--text-secondary)]">
          Aún no hay datos suficientes para el briefing. Cuando haya {labels.contact.plural.toLowerCase()}, {labels.pipeline.plural.toLowerCase()} y {labels.booking.plural.toLowerCase()}, aparecerán aquí las métricas y las alertas.
        </p>
      )}

      {state.kind === "ready" && !isEmpty(state.briefing) && (
        <div className="mt-5 space-y-6">
          <p data-testid="briefing-headline" className="text-base font-bold text-[var(--text-primary)]">{state.briefing.headline}</p>

          <dl data-testid="briefing-metrics" className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {state.briefing.sections.metrics.map((l) => (
              <div key={l.key} className="min-w-0">
                <dt className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{l.label}</dt>
                <dd className="text-sm font-semibold text-[var(--text-primary)]">{l.value}</dd>
              </div>
            ))}
          </dl>

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Alertas prioritarias
            </h3>
            {state.briefing.sections.alerts.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">Ninguna.</p>
            ) : (
              <ul data-testid="briefing-alerts" className="space-y-2">
                {state.briefing.sections.alerts.map((a, i) => (
                  <li key={i} className={cn("rounded-xl border-l-4 bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]", a.severity === "high" ? "border-[var(--destructive)]" : "border-amber-500")}>
                    {a.text}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]">Acciones recomendadas</h3>
            <ul data-testid="briefing-actions" className="list-disc space-y-1.5 pl-5 text-sm text-[var(--text-primary)]">
              {state.briefing.sections.actions.map((a, i) => (
                <li key={i}>{a.text}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
