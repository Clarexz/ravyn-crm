"use client";

import { Calendar, CalendarCheck, Clock, UserX, ArrowRight } from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, subDays, isWithinInterval, isAfter } from "date-fns";
import { es } from "date-fns/locale";
import { KpiCard } from "@/components/crm/KpiCard";
import { AppointmentStatusBadge } from "@/components/crm/AppointmentStatusBadge";
import { useState, useEffect, useMemo } from "react";
import { KpiDetailsModal } from "@/components/crm/KpiDetailsModal";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { Appointment, Patient } from "@/types/database";

type AppointmentWithPatient = Appointment & {
  patients: Pick<Patient, "full_name" | "phone"> | null;
};

interface DashboardClientProps {
  appointments: AppointmentWithPatient[];
  clinicId: string;
}

export function DashboardClient({ appointments: initialAppointments, clinicId }: DashboardClientProps) {
  const [activeModal, setActiveModal] = useState<{ title: string; appointments: AppointmentWithPatient[] } | null>(null);
  const [appointments, setAppointments] = useState(initialAppointments);

  // Sync with real-time database changes
  useEffect(() => {
    setAppointments(initialAppointments);
    
    if (!clinicId) return;

    const supabase = createClient();
    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // Escuchamos INSERT, UPDATE y DELETE
          schema: 'public',
          table: 'appointments',
          filter: `clinic_id=eq.${clinicId}`
        },
        async (payload) => {
          console.log("Cambio detectado en Dashboard:", payload);
          
          if (payload.eventType === 'INSERT') {
            const { data: patient } = await supabase
              .from('patients')
              .select('full_name, phone')
              .eq('id', payload.new.patient_id)
              .single();

            const newAppt = {
              ...payload.new,
              patients: patient || { full_name: "Paciente Nuevo", phone: null }
            } as AppointmentWithPatient;
            
            setAppointments(prev => [...prev, newAppt]);
          } else if (payload.eventType === 'UPDATE') {
            setAppointments(prev => prev.map(a => a.id === payload.new.id ? { ...a, ...payload.new } : a));
          } else if (payload.eventType === 'DELETE') {
            setAppointments(prev => prev.filter(a => a.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [initialAppointments, clinicId]);

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

  const upcomingWeek = appointments
    .filter(a => isAfter(new Date(a.scheduled_at), todayEnd) && isWithinInterval(new Date(a.scheduled_at), { start: todayStart, end: weekEnd }) && a.status !== "cancelled")
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .slice(0, 6);

  const getAvatarColor = (name: string) => {
    const colors = [
      "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      "bg-blue-500/10 text-blue-500 border-blue-500/20",
      "bg-purple-500/10 text-purple-500 border-purple-500/20",
      "bg-rose-500/10 text-rose-500 border-rose-500/20",
      "bg-amber-500/10 text-amber-500 border-amber-500/20",
    ];
    const hash = name.split("").reduce((acc, char) => char.charCodeAt(0) + acc, 0);
    return colors[hash % colors.length];
  };

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight transition-colors">Panel de Control</h1>
        <p className="text-sm text-[var(--text-secondary)] font-semibold mt-1 transition-colors">Resumen operativo y métricas clave</p>
      </div>

      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => setActiveModal({ title: "Citas de hoy", appointments: todayAppts })}
          className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <KpiCard title="Citas hoy" value={todayAppts.length} subtitle={`${todayAppts.length} citas hoy`} icon={Calendar} trend="up" iconBg="bg-blue-500" iconColor="text-blue-500" />
        </div>
        <div
          onClick={() => setActiveModal({ title: "Citas de esta semana", appointments: weekAppts })}
          className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <KpiCard title="Esta semana" value={weekAppts.length} subtitle="Total en la semana" icon={CalendarCheck} trend="up" iconBg="bg-emerald-500" iconColor="text-emerald-500" />
        </div>
        <div
          onClick={() => setActiveModal({ title: "Citas pendientes", appointments: pendingAppts })}
          className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <KpiCard title="Pendientes" value={pendingAppts.length} subtitle="Por confirmar" icon={Clock} trend="neutral" iconBg="bg-amber-500" iconColor="text-amber-500" />
        </div>
        <div
          onClick={() => setActiveModal({ title: "Pacientes No-show", appointments: noShowAppts })}
          className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <KpiCard title="No shows" value={noShowAppts.length} subtitle="Últimos 30 días" icon={UserX} trend="down" iconBg="bg-rose-500" iconColor="text-rose-500" />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-[32px] p-8 shadow-sm transition-all flex flex-col h-full">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-[11px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em]">Citas de hoy</h2>
            <ArrowRight className="w-4 h-4 text-[var(--text-muted)] opacity-30" />
          </div>
          {upcomingToday.length > 0 ? (
            <div className="space-y-6">
              {upcomingToday.map((apt) => (
                <div key={apt.id} className="flex items-center justify-between py-1 group cursor-pointer">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={cn("w-12 h-12 rounded-2xl border-2 border-[var(--bg-surface)] shadow-md flex items-center justify-center shrink-0 transition-transform group-hover:scale-110", getAvatarColor(apt.patients?.full_name ?? "?"))}>
                      <span className="text-sm font-black uppercase">
                        {apt.patients?.full_name?.charAt(0) ?? "?"}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--text-primary)] truncate transition-colors">
                        {apt.patients?.full_name ?? "Paciente desconocido"}
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary)] font-bold mt-1 uppercase tracking-wider transition-colors">
                        {format(new Date(apt.scheduled_at), "HH:mm", { locale: es })}
                        {apt.service && <span className="text-[var(--brand-accent)]">[{apt.service}]</span>}
                      </p>
                    </div>
                  </div>
                  <AppointmentStatusBadge status={apt.status} />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-transparent rounded-3xl border border-[var(--border-default)] border-dashed text-center transition-colors min-h-[200px]">
              <Calendar className="w-8 h-8 text-[var(--text-muted)] opacity-20 mb-2" />
              <p className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest text-balance max-w-[150px]">Sin citas para hoy</p>
            </div>
          )}
        </div>

        <div className="bg-[var(--sidebar-bg)] dark:bg-[var(--bg-card)] border border-white/5 dark:border-[var(--border-default)] rounded-[32px] p-8 shadow-2xl transition-all flex flex-col h-full">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-[11px] font-black text-white/40 dark:text-[var(--text-secondary)] uppercase tracking-[0.2em]">Alertas Prioritarias</h2>
            <Clock className="w-4 h-4 text-white/20 dark:text-[var(--text-muted)]" />
          </div>
          {pendingList.length > 0 ? (
            <div className="space-y-6">
              {pendingList.map((apt) => (
                <div key={apt.id} className="flex items-center justify-between py-1 group cursor-pointer">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={cn("w-12 h-12 rounded-2xl border-2 border-white/10 shadow-lg flex items-center justify-center shrink-0", getAvatarColor(apt.patients?.full_name ?? "?"))}>
                      <span className="text-sm font-black uppercase">
                        {apt.patients?.full_name?.charAt(0) ?? "?"}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white dark:text-[var(--text-primary)] truncate transition-colors">
                        {apt.patients?.full_name ?? "Paciente desconocido"}
                      </p>
                      <p className="text-[10px] text-white/30 dark:text-[var(--text-secondary)] font-bold mt-1 uppercase tracking-widest transition-colors">
                        {format(new Date(apt.scheduled_at), "d 'de' MMMM", { locale: es })}
                        {apt.service && <span className="text-[var(--brand-accent)]">[{apt.service}]</span>}
                      </p>
                    </div>
                  </div>
                  <AppointmentStatusBadge status={apt.status} />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-black/20 dark:bg-transparent rounded-3xl border border-white/5 dark:border-[var(--border-default)] dark:border-dashed text-center transition-colors min-h-[200px]">
              <Clock className="w-8 h-8 text-white/10 dark:text-[var(--text-muted)] opacity-20 mb-2" />
              <p className="text-[10px] text-white/20 dark:text-[var(--text-muted)] font-black uppercase tracking-widest">Sin alertas pendientes</p>
            </div>
          )}
        </div>

        {/* Third Section: Upcoming this week */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-[32px] p-8 shadow-sm transition-all xl:col-span-2">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-[11px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em]">Próximas citas esta semana</h2>
            <CalendarCheck className="w-4 h-4 text-[var(--text-muted)] opacity-30" />
          </div>
          {upcomingWeek.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {upcomingWeek.map((apt) => (
                <div key={apt.id} className="flex items-center gap-4 p-4 rounded-2xl bg-[var(--bg-surface)] dark:bg-white/5 border border-[var(--border-default)]/50 group hover:border-[var(--brand-accent)]/30 transition-all cursor-pointer">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black text-xs uppercase", getAvatarColor(apt.patients?.full_name ?? "?"))}>
                    {apt.patients?.full_name?.charAt(0) ?? "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[var(--text-primary)] truncate uppercase tracking-tight">{apt.patients?.full_name}</p>
                    <p className="text-[10px] text-[var(--text-secondary)] font-bold mt-0.5">
                      {format(new Date(apt.scheduled_at), "eeee d, HH:mm", { locale: es })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 flex flex-col items-center justify-center bg-transparent rounded-3xl border border-[var(--border-default)] border-dashed text-center transition-colors">
              <p className="text-[10px] text-[var(--text-muted)] font-medium lowercase first-letter:uppercase italic">No hay más citas programadas para esta semana</p>
            </div>
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
