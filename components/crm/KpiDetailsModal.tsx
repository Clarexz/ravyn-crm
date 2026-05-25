"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
      <DialogContent className="w-[95vw] max-w-2xl bg-[var(--bg-surface)] border-none p-8 md:p-10 rounded-[40px] shadow-2xl transition-colors">
        <DialogHeader className="mb-6">
          <DialogTitle className="text-2xl font-bold text-[var(--text-primary)] uppercase tracking-tighter transition-colors">
            {title} <span className="text-[var(--accent)] ml-2 transition-colors">[{appointments.length}]</span>
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 max-h-[60vh] overflow-y-auto pr-2 space-y-4 no-scrollbar">
          {appointments.length === 0 ? (
            <div className="py-20 text-center bg-[var(--bg-page)] rounded-[32px] border border-[var(--border-default)] transition-colors">
              <p className="text-sm text-[var(--text-secondary)] font-black uppercase tracking-widest transition-colors">Sin registros encontrados</p>
            </div>
          ) : (
            appointments.map((apt) => (
              <div
                key={apt.id}
                className="flex items-center justify-between p-6 rounded-[24px] bg-[var(--bg-card)] border border-[var(--border-default)] hover:bg-[var(--bg-card-hover)] transition-all group shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-4">
                    <p className="text-base font-bold text-[var(--text-primary)] truncate transition-colors">
                      {apt.patients?.full_name ?? "Paciente desconocido"}
                    </p>
                    <AppointmentStatusBadge status={apt.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    <p className="text-[11px] text-[var(--text-secondary)] font-bold uppercase tracking-wider transition-colors">
                      {format(new Date(apt.scheduled_at), "d 'de' MMMM, HH:mm", {
                        locale: es,
                      })}
                    </p>
                    {apt.service && (
                      <p className="text-[11px] text-[var(--accent)] font-black uppercase tracking-widest transition-colors">
                        {apt.service}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-8 flex justify-end pt-6 border-t border-[var(--border-default)] transition-colors">
          <Button 
            variant="ghost" 
            onClick={onClose} 
            className="h-12 px-10 text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10 rounded-2xl transition-all"
          >
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
