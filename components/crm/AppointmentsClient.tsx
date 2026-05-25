"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, List, Search, ChevronLeft, ChevronRight, Bell, Clock, Tag, ExternalLink } from "lucide-react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg } from "@fullcalendar/core";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { AppointmentStatusBadge } from "@/components/crm/AppointmentStatusBadge";
import { TimeSlotPicker } from "@/components/crm/TimeSlotPicker";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { format as formatDateFn } from "date-fns";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Appointment, AppointmentStatus, Patient } from "@/types/database";

type AppointmentWithPatient = Appointment & {
  patients: Pick<Patient, "full_name" | "phone"> | null;
  services?: { color: string } | null;
};

type ViewMode = "calendar" | "table";

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending:   "Pendiente",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Completada",
  no_show:   "No show",
};

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  web:      "Web",
  manual:   "Manual",
};

const PAGE_SIZE = 10;

export default function AppointmentsClient({
  appointments: initialAppointments,
  clinicId,
  clinicName,
}: {
  appointments: AppointmentWithPatient[];
  clinicId: string;
  userId: string;
  clinicName: string;
}) {
  const router = useRouter();
  const [viewMode, setViewMode]         = useState<ViewMode>("calendar");
  const [appointments, _setAppointments] = useState(initialAppointments);

  useEffect(() => {
    _setAppointments(initialAppointments);
    
    if (!clinicId) return;

    // Configurar suscripción a cambios en tiempo real desde Supabase
    const supabase = createClient();
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'appointments',
          filter: `clinic_id=eq.${clinicId}`
        },
        async (payload) => {
          console.log("Nueva cita recibida vía Realtime:", payload.new);
          // Opcional: Obtener los datos del paciente para que se muestre el nombre completo
          // Ya que el payload de 'appointments' solo trae el patient_id
          const { data: patient } = await supabase
            .from('patients')
            .select('full_name, phone')
            .eq('id', payload.new.patient_id)
            .single();

          const newAppointment = {
            ...payload.new,
            patients: patient || { full_name: "Paciente Nuevo", phone: null },
            services: null // Asumimos color default si no se joinea
          } as AppointmentWithPatient;
          
          _setAppointments(prev => [...prev, newAppointment]);
          toast.success(`Nueva cita agendada: ${patient?.full_name || 'Paciente'}`);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [initialAppointments, clinicId]);

  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage]                 = useState(1);
  const [selectedApt, setSelectedApt]   = useState<AppointmentWithPatient | null>(null);
  const [sheetOpen, setSheetOpen]       = useState(false);
  const [isSaving, setIsSaving]         = useState(false);

  // Edit logic
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    status: "pending" as AppointmentStatus,
    date: "",
    time: "",
    duration_minutes: "30",
    service_id: "",
    notes: "",
  });

  const todayStr = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();

  const openAptDetails = (apt: AppointmentWithPatient) => {
    setSelectedApt(apt);
    setIsEditing(false);
    setSheetOpen(true);
  };

  const enterEditMode = async () => {
    if (!selectedApt) return;
    const d = new Date(selectedApt.scheduled_at);
    setEditValues({
      status: selectedApt.status,
      date: formatDateFn(d, "yyyy-MM-dd"),
      time: formatDateFn(d, "HH:mm"),
      duration_minutes: String(selectedApt.duration_minutes),
      service_id: selectedApt.service_id ?? "",
      notes: selectedApt.notes ?? "",
    });
    setIsEditing(true);
  };

  const handleSaveChanges = async () => {
    if (!selectedApt) return;
    if (!editValues.date || !editValues.time) {
      toast.error("Fecha y hora son requeridas");
      return;
    }
    const scheduledAt = new Date(`${editValues.date}T${editValues.time}`);
    if (isNaN(scheduledAt.getTime())) {
      toast.error("Fecha/hora inválidas");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/appointments/${selectedApt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: editValues.status,
          scheduled_at: scheduledAt.toISOString(),
          duration_minutes: parseInt(editValues.duration_minutes),
          notes: editValues.notes,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Error al guardar");
        return;
      }
      const updated = await res.json() as AppointmentWithPatient;
      _setAppointments((list) => list.map((a) => (a.id === updated.id ? updated : a)));
      setSelectedApt(updated);
      setIsEditing(false);
      toast.success("Cita actualizada");
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setIsSaving(false);
    }
  };

  const filtered = useMemo(() => {
    return appointments.filter((apt) => {
      const name       = apt.patients?.full_name?.toLowerCase() ?? "";
      const matchSearch = search.length < 2 || name.includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || apt.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [appointments, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const calendarEvents = appointments.map((apt) => {
    const isInactive = apt.status === "cancelled" || apt.status === "no_show";
    
    const statusMap: Record<AppointmentStatus, string> = {
      pending:   "pending",
      confirmed: "confirmed",
      cancelled: "cancelled",
      completed: "completed",
      no_show:   "cancelled",
    };
    
    const tokenPart = statusMap[apt.status];

    return {
      id:              apt.id,
      title:           apt.patients?.full_name ?? "Sin nombre",
      start:           apt.scheduled_at,
      end:             new Date(new Date(apt.scheduled_at).getTime() + apt.duration_minutes * 60000).toISOString(),
      backgroundColor: `var(--state-${tokenPart}-bg)`,
      borderColor:     `var(--state-${tokenPart}-text)`,
      textColor:       `var(--state-${tokenPart}-text)`,
      classNames:      ["border-l-4", "px-3", isInactive ? "opacity-50 line-through grayscale" : "shadow-sm"],
    };
  });

  const handleEventClick = (info: EventClickArg) => {
    const apt = appointments.find((a) => a.id === info.event.id);
    if (apt) {
      setSelectedApt(apt);
      setSheetOpen(true);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight transition-colors">Agenda de Citas</h1>
          <p className="text-sm text-[var(--text-secondary)] font-semibold mt-1 transition-colors">Control de horarios y disponibilidad</p>
        </div>

        <div className="flex bg-[var(--bg-card)] p-1.5 rounded-2xl w-fit self-end sm:self-auto border border-[var(--border-default)] shadow-sm transition-all">
          <Button
            variant={viewMode === "calendar" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("calendar")}
            className={cn("h-9 text-[10px] font-black uppercase tracking-widest gap-2 rounded-xl px-4 transition-all", viewMode === "calendar" ? "bg-[var(--sidebar-bg)] text-white shadow-lg" : "text-[var(--text-secondary)]")}
          >
            <Calendar className="w-3.5 h-3.5" />
            Calendario
          </Button>
          <Button
            variant={viewMode === "table" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("table")}
            className={cn("h-9 text-[10px] font-black uppercase tracking-widest gap-2 rounded-xl px-4 transition-all", viewMode === "table" ? "bg-[var(--sidebar-bg)] text-white shadow-lg" : "text-[var(--text-secondary)]")}
          >
            <List className="w-3.5 h-3.5" />
            Lista
          </Button>
        </div>
      </div>

      {viewMode === "table" ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)] pointer-events-none z-10" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Buscar por paciente..."
                className="pl-11 h-12 text-sm w-full bg-[var(--bg-card)] border-[var(--border-default)] rounded-2xl shadow-sm focus:ring-[var(--brand-accent)] text-[var(--text-primary)] transition-colors"
              />
            </div>
            <div className="flex gap-3">
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="h-12 text-xs font-bold w-40 shrink-0 bg-[var(--bg-card)] border-[var(--border-default)] rounded-2xl shadow-sm text-[var(--text-primary)] transition-colors">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-[var(--border-default)] bg-[var(--bg-surface)]">
                  <SelectItem value="all">Todos</SelectItem>
                  {(Object.entries(STATUS_LABELS) as [AppointmentStatus, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            {paginated.length === 0 ? (
              <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-[32px] py-20 text-center shadow-sm transition-colors">
                <p className="text-sm text-[var(--text-secondary)] font-black uppercase tracking-widest">Sin registros encontrados</p>
              </div>
            ) : (
              paginated.map((apt) => (
                <div 
                  key={apt.id} 
                  onClick={() => openAptDetails(apt)}
                  className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-[24px] p-5 flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer group shadow-sm"
                >
                  <div className="flex items-center gap-6 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--bg-page)] flex items-center justify-center shrink-0 border border-[var(--border-default)] group-hover:scale-110 transition-transform">
                      <span className="text-sm font-black text-[var(--text-primary)] uppercase">{apt.patients?.full_name?.charAt(0)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-black text-[var(--text-primary)] truncate leading-none transition-colors">{apt.patients?.full_name ?? "—"}</p>
                      <p className="text-[11px] text-[var(--text-secondary)] font-bold mt-2 uppercase tracking-wider flex items-center gap-2 transition-colors">
                        {format(new Date(apt.scheduled_at), "d 'de' MMM, HH:mm", { locale: es })}
                        <span className="w-1 h-1 rounded-full bg-[var(--text-muted)] opacity-30" />
                        {apt.service ?? "Sin servicio"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <AppointmentStatusBadge status={apt.status} />
                    <ChevronRight className="w-5 h-5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-all" />
                  </div>
                </div>
              ))
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-6 mt-10">
              <Button variant="outline" size="icon" disabled={page === 1} onClick={() => setPage(page - 1)} className="h-12 w-12 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-default)] shadow-sm hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)]">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <span className="text-xs font-black text-[var(--text-secondary)] uppercase tracking-widest">Pág {page} de {totalPages}</span>
              <Button variant="outline" size="icon" disabled={page === totalPages} onClick={() => setPage(page + 1)} className="h-12 w-12 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-default)] shadow-sm hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)]">
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-[32px] overflow-hidden p-8 shadow-sm transition-colors">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
            events={calendarEvents}
            eventClick={handleEventClick}
            dayMaxEvents={3}
            slotEventOverlap={false}
            slotLabelFormat={{
              hour: "numeric",
              minute: "2-digit",
              omitZeroMinute: false,
              meridiem: false,
              hour12: false,
            }}
            eventTimeFormat={{
              hour: "numeric",
              minute: "2-digit",
              meridiem: false,
              hour12: false,
            }}
            eventContent={(eventInfo) => {
              const isMonthView = eventInfo.view.type === "dayGridMonth";
              
              if (isMonthView) {
                return (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 w-full overflow-hidden">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: eventInfo.textColor }} />
                    <b className="text-[10px] font-bold truncate text-[var(--text-primary)]">{eventInfo.event.title}</b>
                  </div>
                );
              }

              const duration = eventInfo.event.end && eventInfo.event.start 
                ? (eventInfo.event.end.getTime() - eventInfo.event.start.getTime()) / 60000 
                : 0;
              
              const is30Min = duration === 30;

              if (is30Min) {
                return (
                  <div className="flex items-center w-full h-full overflow-hidden px-2 gap-2">
                    <b className="text-[10px] font-bold truncate text-[var(--text-primary)] w-1/2 leading-none">{eventInfo.event.title}</b>
                    <span className="text-[9px] font-semibold text-[var(--text-secondary)] opacity-80 truncate w-1/2 text-right">{eventInfo.timeText}</span>
                  </div>
                );
              }

              return (
                <div className="flex flex-col overflow-hidden leading-tight p-2 h-full justify-start gap-1">
                  <b className="text-[11px] font-bold truncate text-[var(--text-primary)] leading-none">{eventInfo.event.title}</b>
                  <span className="text-[9px] font-semibold text-[var(--text-secondary)] opacity-80 truncate">{eventInfo.timeText}</span>
                </div>
              );
            }}
            locale="es"
            height="auto"
            slotMinTime="07:00:00"
            slotMaxTime="21:00:00"
            allDaySlot={false}
            nowIndicator
          />
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-[var(--bg-surface)] border-none shadow-2xl p-8 rounded-l-[40px] transition-colors">
          <SheetHeader className="mb-10 flex flex-row items-center justify-between">
            <SheetTitle className="text-xl font-bold text-[var(--text-primary)] uppercase tracking-tighter">Expediente de Cita</SheetTitle>
          </SheetHeader>

          <AnimatePresence mode="wait">
            {selectedApt && (
              <motion.div
                key={selectedApt.id + (isEditing ? "-edit" : "-view")}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                <div className="bg-[var(--bg-card)] p-6 rounded-3xl border border-[var(--border-default)] shadow-sm transition-colors relative overflow-hidden">
                  <p className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] mb-2 relative z-10">Paciente Principal</p>
                  <p className="text-lg font-bold text-[var(--text-primary)] relative z-10">{selectedApt.patients?.full_name ?? "Sin nombre"}</p>
                  <div className="absolute top-0 right-0 w-20 h-20 bg-[var(--brand-accent)] opacity-[0.03] rounded-bl-[60px]" />
                </div>

                {isEditing ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest">Fecha</Label>
                        <input
                          type="date"
                          min={todayStr}
                          value={editValues.date}
                          onChange={(e) => setEditValues((v) => ({ ...v, date: e.target.value, time: "" }))}
                          className="w-full h-12 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-default)] text-sm px-4 focus:ring-2 focus:ring-[var(--brand-accent)] font-bold text-[var(--text-primary)] transition-colors"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest">Hora</Label>
                        <TimeSlotPicker
                          date={editValues.date}
                          value={editValues.time}
                          onChange={(t) => setEditValues((v) => ({ ...v, time: t }))}
                          branchName={clinicName}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest">Estado de Cita</Label>
                      <Select
                        value={editValues.status}
                        onValueChange={(v) => setEditValues((vals) => ({ ...vals, status: v as AppointmentStatus }))}
                      >
                        <SelectTrigger className="h-12 text-sm font-bold bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl text-[var(--text-primary)] transition-colors"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-2xl border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)]">
                          {(Object.entries(STATUS_LABELS) as [AppointmentStatus, string][]).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-3 pt-6 border-t border-[var(--border-default)]">
                      <Button
                        onClick={handleSaveChanges}
                        disabled={isSaving}
                        className="flex-1 h-12 text-[11px] font-black uppercase tracking-widest bg-[var(--brand-accent)] text-white rounded-2xl shadow-lg shadow-blue-500/20"
                      >
                        {isSaving ? "Guardando..." : "Confirmar Cambios"}
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => setIsEditing(false)} 
                        className="h-12 text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)] border-[var(--border-default)] bg-[var(--bg-page)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10 hover:border-[var(--destructive)] rounded-2xl transition-all"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-[var(--bg-card)] p-5 rounded-[24px] border border-[var(--border-default)] flex flex-col gap-2 shadow-sm transition-colors">
                        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                          <Clock className="w-3.5 h-3.5 opacity-50" />
                          <p className="text-[10px] font-black uppercase tracking-widest">Horario</p>
                        </div>
                        <p className="text-sm font-bold text-[var(--text-primary)]">
                          {format(new Date(selectedApt.scheduled_at), "d MMM, HH:mm", { locale: es })}
                        </p>
                      </div>
                      <div className="bg-[var(--bg-card)] p-5 rounded-[24px] border border-[var(--border-default)] flex flex-col gap-2 shadow-sm transition-colors">
                        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                          <Clock className="w-3.5 h-3.5 opacity-50" />
                          <p className="text-[10px] font-black uppercase tracking-widest">Duración</p>
                        </div>
                        <p className="text-sm font-bold text-[var(--text-primary)]">{selectedApt.duration_minutes} min</p>
                      </div>
                      <div className="bg-[var(--bg-card)] p-5 rounded-[24px] border border-[var(--border-default)] flex flex-col gap-2 shadow-sm transition-colors">
                        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                          <Tag className="w-3.5 h-3.5 opacity-50" />
                          <p className="text-[10px] font-black uppercase tracking-widest">Tratamiento</p>
                        </div>
                        <p className="text-sm font-bold text-[var(--brand-accent)]">{selectedApt.service ?? "Consulta General"}</p>
                      </div>
                      <div className="bg-[var(--bg-card)] p-5 rounded-[24px] border border-[var(--border-default)] flex flex-col gap-2 shadow-sm transition-colors">
                        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                          <ExternalLink className="w-3.5 h-3.5 opacity-50" />
                          <p className="text-[10px] font-black uppercase tracking-widest">Canal</p>
                        </div>
                        <p className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">{SOURCE_LABELS[selectedApt.source] ?? selectedApt.source}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest px-1">Estatus de la cita</p>
                      <div className="bg-[var(--bg-card)] p-4 rounded-2xl border border-[var(--border-default)] flex items-center justify-between shadow-sm transition-colors">
                         <AppointmentStatusBadge status={selectedApt.status} />
                         <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-tighter italic">Última actualización hoy</span>
                      </div>
                    </div>

                    <div className="pt-8 border-t border-[var(--border-default)] space-y-4">
                      <Button
                        onClick={enterEditMode}
                        className="w-full h-12 text-[11px] font-black uppercase tracking-widest bg-[var(--brand-accent)] text-white rounded-2xl shadow-lg shadow-blue-500/20 hover:opacity-90 transition-all"
                      >
                        Reagendar / Editar
                      </Button>
                      <Button
                        disabled
                        className="w-full h-12 text-[11px] font-black uppercase tracking-widest bg-[var(--bg-page)] text-[var(--text-muted)] rounded-2xl border border-[var(--border-default)] transition-all"
                      >
                        <Bell className="w-3.5 h-3.5 mr-2" />
                        Recordatorio WhatsApp
                      </Button>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </SheetContent>
      </Sheet>
    </div>
  );
}
