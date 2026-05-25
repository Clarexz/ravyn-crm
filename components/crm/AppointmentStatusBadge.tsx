"use client";

import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  pending:   "Pendiente",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Completada",
  no_show:   "No show",
};

export function AppointmentStatusBadge({ status }: { status: string }) {
  const getStatusStyles = (s: string) => {
    switch (s) {
      case "pending":
        return "bg-[var(--state-pending-bg)] text-[var(--state-pending-text)]";
      case "confirmed":
        return "bg-[var(--state-confirmed-bg)] text-[var(--state-confirmed-text)]";
      case "cancelled":
      case "no_show":
        return "bg-[var(--state-cancelled-bg)] text-[var(--state-cancelled-text)]";
      case "completed":
        return "bg-[var(--state-completed-bg)] text-[var(--state-completed-text)]";
      default:
        return "bg-slate-100 text-slate-600";
    }
  };

  return (
    <span
      className={cn(
        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter shrink-0",
        "dark:bg-opacity-20 dark:backdrop-blur-sm",
        getStatusStyles(status)
      )}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}
