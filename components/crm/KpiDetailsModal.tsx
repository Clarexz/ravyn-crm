"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AppointmentStatusBadge } from "@/components/crm/AppointmentStatusBadge";
import type { Appointment, Patient } from "@/types/database";

type AppointmentWithPatient = Appointment & {
  patients: Pick<Patient, "full_name" | "phone"> | null;
};

interface KpiDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  appointments: AppointmentWithPatient[];
}

export function KpiDetailsModal({
  isOpen,
  onClose,
  title,
  appointments,
}: KpiDetailsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-2xl bg-card border-border p-4 md:p-6 rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-foreground">
            {title} ({appointments.length})
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 max-h-[60vh] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
          {appointments.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">
              No hay citas en esta categoría.
            </p>
          ) : (
            appointments.map((apt) => (
              <div
                key={apt.id}
                className="flex items-center justify-between p-3 rounded-md border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {apt.patients?.full_name ?? "Paciente desconocido"}
                    </p>
                    <AppointmentStatusBadge status={apt.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(apt.scheduled_at), "d 'de' MMMM, HH:mm", {
                        locale: es,
                      })}
                    </p>
                    {apt.service && (
                      <p className="text-xs text-primary font-medium">
                        {apt.service}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
