"use client";

import { Calendar, CalendarCheck, Clock, UserX, Bell } from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, subDays, isWithinInterval } from "date-fns";
import { es } from "date-fns/locale";
import { KpiCard } from "@/components/crm/KpiCard";
import { AppointmentStatusBadge } from "@/components/crm/AppointmentStatusBadge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { KpiDetailsModal } from "@/components/crm/KpiDetailsModal";
import type { Appointment, Patient } from "@/types/database";

type AppointmentWithPatient = Appointment & {
  patients: Pick<Patient, "full_name" | "phone"> | null;
};

export function DashboardClient({ appointments }: { appointments: AppointmentWithPatient[] }) {
  const [activeModal, setActiveModal] = useState<{ title: string; appointments: AppointmentWithPatient[] } | null>(null);

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const thirtyDaysAgo = subDays(now, 30);

  const todayAppts = appointments.filter((a) => {
    const d = new Date(a.scheduled_at);
    return isWithinInterval(d, { start: todayStart, end: todayEnd }) && a.status !== "cancelled";
  });

  const weekAppts = appointments.filter((a) => {
    const d = new Date(a.scheduled_at);
    return isWithinInterval(d, { start: weekStart, end: weekEnd }) && a.status !== "cancelled";
  });

  const pendingAppts = appointments.filter((a) => a.status === "pending");

  const noShowAppts = appointments.filter(
    (a) => a.status === "no_show" && new Date(a.scheduled_at) >= thirtyDaysAgo,
  );

  const upcomingToday = [...todayAppts]
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .slice(0, 5);

  const pendingList = [...pendingAppts]
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6 md:space-y-8">
      <div>
        <h1 className="text-xl font-bold text-foreground">Resumen</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Vista general de la actividad de la clínica</p>
      </div>

      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => setActiveModal({ title: "Citas de hoy", appointments: todayAppts })}
          className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <KpiCard title="Citas hoy"   value={todayAppts.length}   subtitle={`${todayAppts.length} cita${todayAppts.length !== 1 ? "s" : ""} hoy`} icon={Calendar}     trend={todayAppts.length > 0 ? "up" : "neutral"} className="hover:border-primary/50 transition-colors" />
        </div>
        <div
          onClick={() => setActiveModal({ title: "Citas de esta semana", appointments: weekAppts })}
          className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <KpiCard title="Esta semana" value={weekAppts.length}    subtitle="Total en la semana" icon={CalendarCheck} trend={weekAppts.length > 0 ? "up" : "neutral"} className="hover:border-primary/50 transition-colors" />
        </div>
        <div
          onClick={() => setActiveModal({ title: "Citas pendientes", appointments: pendingAppts })}
          className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <KpiCard title="Pendientes"  value={pendingAppts.length} subtitle="Sin confirmar"      icon={Clock}         trend={pendingAppts.length > 0 ? "down" : "neutral"} className="hover:border-primary/50 transition-colors" />
        </div>
        <div
          onClick={() => setActiveModal({ title: "Pacientes No-show", appointments: noShowAppts })}
          className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <KpiCard title="No shows"    value={noShowAppts.length}  subtitle="Últimos 30 días"    icon={UserX}         trend={noShowAppts.length > 0 ? "down" : "neutral"} className="hover:border-primary/50 transition-colors" />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Citas de hoy</h2>
          {upcomingToday.length > 0 ? (
            <div className="space-y-3">
              {upcomingToday.map((apt) => (
                <div key={apt.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled
                      title="Próximamente recordatorios en WhatsApp"
                      className="w-8 h-8 shrink-0 text-muted-foreground/50 cursor-not-allowed"
                    >
                      <Bell className="w-4 h-4" />
                    </Button>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {apt.patients?.full_name ?? "Paciente desconocido"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(apt.scheduled_at), "HH:mm", { locale: es })}
                        {apt.service && ` · ${apt.service}`}
                      </p>
                    </div>
                  </div>
                  <AppointmentStatusBadge status={apt.status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">No hay citas programadas para hoy</p>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Pendientes de confirmar</h2>
          {pendingList.length > 0 ? (
            <div className="space-y-3">
              {pendingList.map((apt) => (
                <div key={apt.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {apt.patients?.full_name ?? "Paciente desconocido"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(apt.scheduled_at), "d 'de' MMMM, HH:mm", { locale: es })}
                      {apt.service && ` · ${apt.service}`}
                    </p>
                  </div>
                  <AppointmentStatusBadge status={apt.status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">No hay citas pendientes de confirmar</p>
          )}
        </div>
      </div>

      {activeModal && (
        <KpiDetailsModal
          isOpen={!!activeModal}
          onClose={() => setActiveModal(null)}
          title={activeModal.title}
          appointments={activeModal.appointments}
        />
      )}
    </div>
  );
}
