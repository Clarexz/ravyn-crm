"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check, X } from "lucide-react";
import { toast } from "sonner";
import { reviewAction, usePendingActions } from "@/components/crm/agents/usePendingActions";
import { agentMeta, payloadOf } from "@/lib/agents/ui";
import { cn } from "@/lib/utils";

// Campana del encabezado: contador de pendientes y aprobacion rapida (campana -> Aprobar = 2 clics).
export function PendingBell() {
  const { actions, count, error } = usePendingActions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const review = async (id: string, kind: "approve" | "reject") => {
    setBusy(id);
    const res = await reviewAction(id, kind);
    setBusy(null);
    if (res.ok) toast.success(kind === "approve" ? (res.executed ? "Accion aprobada y ejecutada" : "Aprobada, pero la ejecucion fallo") : "Accion rechazada");
    else toast.error(res.status === 409 ? "Otra persona ya reviso esta accion" : res.message);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        data-testid="pending-bell"
        aria-label={count > 0 ? `Acciones pendientes de agentes: ${count}` : "Acciones pendientes de agentes: ninguna"}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span
            data-testid="pending-count"
            className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--destructive)] px-1 text-[10px] font-black text-white"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Acciones pendientes de agentes"
          data-testid="pending-panel"
          className="fixed inset-x-4 top-20 z-40 rounded-3xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[22rem] rounded-3xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 shadow-2xl"
        >
          <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
            Esperan tu aprobacion
          </p>
          {error && <p className="px-2 py-3 text-xs text-[var(--text-secondary)]">No se pudo actualizar la lista.</p>}
          {!error && count === 0 && (
            <p className="px-2 py-4 text-center text-sm text-[var(--text-secondary)]">Sin acciones pendientes.</p>
          )}
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {actions.slice(0, 5).map((a) => {
              const p = payloadOf(a);
              const meta = agentMeta(a.agent_name);
              return (
                <li key={a.id} className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                    <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                    {meta.label}
                    {p.critical && <span className="ml-auto rounded-full bg-[var(--destructive)]/10 px-1.5 font-bold text-[var(--destructive)]">Critica</span>}
                  </div>
                  <p className="mt-1 text-xs font-semibold text-[var(--text-primary)]">{p.summary}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busy === a.id}
                      onClick={() => review(a.id, "approve")}
                      className={cn("flex flex-1 items-center justify-center gap-1 rounded-xl bg-[var(--brand-accent)] py-1.5 text-[11px] font-bold text-white disabled:opacity-50")}
                    >
                      <Check className="h-3 w-3" /> Aprobar
                    </button>
                    <button
                      type="button"
                      disabled={busy === a.id}
                      onClick={() => review(a.id, "reject")}
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-[var(--border-default)] py-1.5 text-[11px] font-bold text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-50"
                    >
                      <X className="h-3 w-3" /> Rechazar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <Link
            href="/agents/inbox"
            onClick={() => setOpen(false)}
            className="mt-2 block rounded-xl px-2 py-2 text-center text-xs font-bold text-[var(--brand-accent)] hover:bg-[var(--bg-card-hover)]"
          >
            {count > 5 ? `Ver las ${count} en la bandeja` : "Abrir la bandeja"}
          </Link>
        </div>
      )}
    </div>
  );
}
