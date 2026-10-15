"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { reviewAction } from "@/components/crm/agents/usePendingActions";
import { agentMeta, canApprove, CRITICAL_ADMIN_ONLY_HINT, payloadOf, STATUS_LABELS, type ActionDiff, type ActionView } from "@/lib/agents/ui";
import { cn } from "@/lib/utils";

type Props = {
  action: ActionView | null;
  onClose: () => void;
  // Se llama tras aprobar/rechazar (o si otra persona ya reviso la accion) para refrescar la lista.
  onReviewed: () => void;
};

type Scalar = string | number | boolean;
const isScalar = (v: unknown): v is Scalar => ["string", "number", "boolean"].includes(typeof v);

export function ActionReviewDialog({ action, onClose, onReviewed }: Props) {
  const [diff, setDiff] = useState<ActionDiff | null>(null);
  const [diffFailed, setDiffFailed] = useState(false);
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const id = action?.id ?? null;
  const p = useMemo(() => (action ? payloadOf(action) : null), [action]);

  useEffect(() => {
    setNotes("");
    setEditing(false);
    setDiff(null);
    setDiffFailed(false);
    if (!id) return;
    let cancelled = false;
    fetch(`/api/agents/actions/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http"))))
      .then((body: { diff: ActionDiff; is_admin?: boolean }) => {
        if (cancelled) return;
        setDiff(body.diff);
        setIsAdmin(body.is_admin === true);
      })
      .catch(() => !cancelled && setDiffFailed(true));
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!p) return;
    setDraft(Object.fromEntries(Object.entries(p.input).filter(([, v]) => isScalar(v)).map(([k, v]) => [k, String(v)])));
  }, [p]);

  if (!action || !p) return null;
  const meta = agentMeta(action.agent_name);
  const pending = action.status === "pending";
  const mayApprove = canApprove(isAdmin, p.critical);

  // Solo se reenvian los campos escalares que cambiaron; el resto del input se conserva tal cual.
  const modifiedInput = (): Record<string, unknown> | undefined => {
    if (!editing) return undefined;
    const next: Record<string, unknown> = { ...p.input };
    let changed = false;
    for (const [key, text] of Object.entries(draft)) {
      const original = p.input[key];
      if (String(original) === text) continue;
      changed = true;
      if (typeof original === "number") next[key] = text.trim() === "" ? Number.NaN : Number(text);
      else if (typeof original === "boolean") next[key] = text === "true";
      else next[key] = text;
    }
    return changed ? next : undefined;
  };

  const submit = async (kind: "approve" | "reject") => {
    setBusy(true);
    const input = kind === "approve" ? modifiedInput() : undefined;
    if (input && Object.values(input).some((v) => typeof v === "number" && Number.isNaN(v))) {
      toast.error("Revisa los valores numericos");
      setBusy(false);
      return;
    }
    const res = await reviewAction(action.id, kind, { notes: notes.trim() || undefined, input });
    setBusy(false);
    if (res.ok) {
      toast.success(kind === "approve" ? (res.executed ? "Accion aprobada y ejecutada" : "Aprobada, pero la ejecucion fallo") : "Accion rechazada");
      onReviewed();
      onClose();
    } else if (res.status === 409) {
      toast.error("Otra persona ya reviso esta accion");
      onReviewed();
      onClose();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-testid="approval-modal"
        className="max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-2xl grid-cols-[minmax(0,1fr)] overflow-y-auto overflow-x-hidden rounded-3xl border-[var(--border-default)] bg-[var(--bg-surface)] p-6 sm:rounded-3xl"
      >
        <DialogHeader>
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
            <span className="font-bold text-[var(--text-secondary)]">Agente {meta.label}</span>
            <span>·</span>
            <span>{STATUS_LABELS[action.status]}</span>
            {p.critical && (
              <span className="rounded-full bg-[var(--destructive)]/10 px-2 py-0.5 font-bold text-[var(--destructive)]">Accion critica</span>
            )}
          </div>
          <DialogTitle className="break-words pr-6 text-left text-lg font-black text-[var(--text-primary)]">{p.summary}</DialogTitle>
          <DialogDescription className="sr-only">Revision de la accion propuesta por el agente</DialogDescription>
        </DialogHeader>

        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Motivo del agente</h3>
          <p data-testid="agent-reason" className="mt-1 rounded-2xl bg-[var(--bg-card-hover)] px-4 py-3 text-sm text-[var(--text-primary)]">
            {p.reason || "El agente no indico un motivo."}
          </p>
        </section>

        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
            {diff ? (diff.kind === "create" ? `Nuevo: ${diff.entity}` : `Cambio en: ${diff.entity}${diff.target ? ` - ${diff.target}` : ""}`) : "Cambio propuesto"}
          </h3>
          {diffFailed && <p className="mt-1 text-xs text-[var(--text-secondary)]">No se pudo cargar el estado actual; revisa el payload.</p>}
          {!diff && !diffFailed && <div className="mt-2 h-16 animate-pulse rounded-2xl bg-[var(--bg-card-hover)]" aria-busy="true" />}
          {diff && (
            <div data-testid="action-diff" className="mt-2 overflow-hidden rounded-2xl border border-[var(--border-default)]">
              <div className="grid grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 bg-[var(--bg-card-hover)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)]">
                <span>Campo</span>
                <span>Actual</span>
                <span>Propuesto</span>
              </div>
              {diff.rows.length === 0 && <p className="px-3 py-3 text-xs text-[var(--text-secondary)]">Sin campos que mostrar.</p>}
              {diff.rows.map((r) => (
                <div key={r.field} className="grid grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 border-t border-[var(--border-default)] px-3 py-2 text-xs sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)]">
                  <span className="font-semibold text-[var(--text-secondary)]">{r.label}</span>
                  <span className={cn("break-words whitespace-pre-line", r.current ? "text-[var(--text-secondary)] line-through" : "text-[var(--text-muted)]")}>
                    {r.current ?? "(vacio)"}
                  </span>
                  <span className="break-words whitespace-pre-line font-bold text-[var(--brand-accent)]">{r.proposed ?? "(vacio)"}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Payload exacto</h3>
          <pre
            data-testid="action-payload"
            className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-2xl bg-[var(--bg-card-hover)] px-4 py-3 font-mono text-xs text-[var(--text-primary)]"
          >
            {JSON.stringify(p.input, null, 2)}
          </pre>
        </section>

        {pending && editing && (
          <section data-testid="edit-fields" className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Modificar valores</h3>
            {Object.keys(draft).map((key) => (
              <label key={key} className="block text-xs text-[var(--text-secondary)]">
                <span className="font-semibold">{key}</span>
                {typeof p.input[key] === "boolean" ? (
                  <select
                    value={draft[key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-[var(--border-default)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)]"
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    data-testid={`edit-${key}`}
                    value={draft[key]}
                    inputMode={typeof p.input[key] === "number" ? "decimal" : undefined}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-[var(--border-default)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-accent)]"
                  />
                )}
              </label>
            ))}
          </section>
        )}

        {!pending && (
          <section className="rounded-2xl border border-[var(--border-default)] px-4 py-3 text-xs text-[var(--text-secondary)]">
            {action.requires_approval
              ? <>Revisada {action.reviewed_at ? new Date(action.reviewed_at).toLocaleString("es-MX") : ""}{action.review_seconds !== null ? ` (${action.review_seconds} s despues de la propuesta)` : ""}.</>
              : <>Ejecutada automaticamente, sin aprobacion.</>}
            {action.review_notes && <p className="mt-1">Comentario: {action.review_notes}</p>}
            {action.error_message && <p className="mt-1 text-[var(--destructive)]">{action.error_message}</p>}
          </section>
        )}

        {pending && (
          <section className="space-y-3">
            <label className="block text-xs text-[var(--text-secondary)]">
              <span className="font-semibold">Comentario (opcional)</span>
              <textarea
                data-testid="review-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
                rows={2}
                placeholder="Por que apruebas, modificas o rechazas"
                className="mt-1 w-full resize-none rounded-xl border border-[var(--border-default)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-accent)]"
              />
            </label>
            {!mayApprove && (
              <p data-testid="admin-only-hint" className="rounded-xl border border-[var(--border-default)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                {CRITICAL_ADMIN_ONLY_HINT}. Puedes rechazarla.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="approve-button"
                disabled={busy || !mayApprove}
                title={mayApprove ? undefined : CRITICAL_ADMIN_ONLY_HINT}
                onClick={() => submit("approve")}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--brand-accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                <Check className="h-4 w-4" /> {editing ? "Aprobar con cambios" : "Aprobar"}
              </button>
              <button
                type="button"
                data-testid="modify-button"
                disabled={busy || !mayApprove || Object.keys(draft).length === 0}
                aria-pressed={editing}
                onClick={() => setEditing((v) => !v)}
                className={cn(
                  "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-50",
                  editing ? "border-[var(--brand-accent)] text-[var(--brand-accent)]" : "border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]",
                )}
              >
                <Pencil className="h-4 w-4" /> Modificar valores
              </button>
              <button
                type="button"
                data-testid="reject-button"
                disabled={busy}
                onClick={() => submit("reject")}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--destructive)]/40 px-4 py-2 text-sm font-bold text-[var(--destructive)] hover:bg-[var(--destructive)]/10 disabled:opacity-50"
              >
                <X className="h-4 w-4" /> Rechazar
              </button>
            </div>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
