"use client";

import { useEffect, useState } from "react";
import { AuthorBadge } from "@/components/crm/AuthorBadge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActivityWithAuthor } from "@/lib/agents/ui";

type Props = { contactId?: string; bookingId?: string; limit?: number; emptyText?: string };

const TYPE_LABELS: Record<string, string> = {
  call: "Llamada",
  message: "Mensaje",
  meeting: "Reunion",
  task: "Tarea",
  note: "Nota",
  stage_change: "Cambio de etapa",
  agent_interaction: "Interaccion de agente",
};

// Historial de actividades con la insignia de quien las realizo (persona o agente).
export function ActivityTimeline({ contactId, bookingId, limit = 20, emptyText = "Sin actividad registrada." }: Props) {
  const [items, setItems] = useState<ActivityWithAuthor[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ limit: String(limit) });
    if (contactId) qs.set("contact_id", contactId);
    if (bookingId) qs.set("booking_id", bookingId);
    setItems(null);
    setFailed(false);
    fetch(`/api/activities?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http"))))
      .then((body: { activities: ActivityWithAuthor[] }) => !cancelled && setItems(body.activities))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [contactId, bookingId, limit]);

  if (failed) return <p className="text-sm text-[var(--text-secondary)]">No se pudo cargar el historial.</p>;
  if (items === null) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-2xl" />
      </div>
    );
  }
  if (items.length === 0) return <p className="text-sm text-[var(--text-secondary)]">{emptyText}</p>;

  return (
    <ul className="space-y-2" data-testid="activity-timeline">
      {items.map((a) => (
        <li key={a.id} className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {TYPE_LABELS[a.type] ?? a.type}
            </span>
            <AuthorBadge type={a.performed_by_type} id={a.performed_by_id} name={a.author_name} />
            <time className="ml-auto text-[11px] text-[var(--text-muted)]" dateTime={a.created_at}>
              {new Date(a.created_at).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
            </time>
          </div>
          <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{a.title}</p>
          {a.description && <p className="text-xs text-[var(--text-secondary)]">{a.description}</p>}
          {a.assigned_to && (
            <p className="mt-1 text-xs font-medium text-[var(--text-secondary)]" data-testid="activity-assignee">
              Asignada a {a.assignee_name ?? "una persona del equipo"}
              {a.due_date ? ` · vence ${new Date(a.due_date).toLocaleDateString("es-MX", { dateStyle: "medium" })}` : ""}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
