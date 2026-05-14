import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AppointmentStatus } from "@/types/database";

interface AppointmentStatusBadgeProps {
  status: AppointmentStatus;
  className?: string;
}

const statusConfig: Record<
  AppointmentStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "Pendiente",
    className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20",
  },
  confirmed: {
    label: "Confirmada",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20",
  },
  cancelled: {
    label: "Cancelada",
    className: "bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/20",
  },
  completed: {
    label: "Completada",
    className: "bg-gray-500/15 text-gray-400 border-gray-500/30 hover:bg-gray-500/20",
  },
  no_show: {
    label: "No show",
    className: "bg-orange-500/15 text-orange-400 border-orange-500/30 hover:bg-orange-500/20",
  },
};

export function AppointmentStatusBadge({
  status,
  className,
}: AppointmentStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium border px-2 py-0.5",
        config.className,
        className
      )}
    >
      {config.label}
    </Badge>
  );
}
