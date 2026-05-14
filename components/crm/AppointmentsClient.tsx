"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, List, Search, ChevronLeft, ChevronRight } from "lucide-react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg } from "@fullcalendar/core";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AppointmentStatusBadge } from "@/components/crm/AppointmentStatusBadge";
import { cn } from "@/lib/utils";
import type { Appointment, AppointmentStatus, Patient } from "@/types/database";

type AppointmentWithPatient = Appointment & {
  patients: Pick<Patient, "full_name" | "phone"> | null;
};

type ViewMode = "calendar" | "table";

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  pending:   "#eab308",
  confirmed: "#10b981",
  cancelled: "#ef4444",
  completed: "#6b7280",
  no_show:   "#f97316",
};

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

interface AppointmentsClientProps {
  appointments: AppointmentWithPatient[];
  clinicId: string;
  userId: string;
}

export default function AppointmentsClient({
  appointments: initialAppointments,
  clinicId: _clinicId,
  userId,
}: AppointmentsClientProps) {
  const [viewMode, setViewMode]         = useState<ViewMode>("calendar");
  const [appointments, setAppointments] = useState(initialAppointments);
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [page, setPage]                 = useState(1);
  const [selectedApt, setSelectedApt]   = useState<AppointmentWithPatient | null>(null);
  const [sheetOpen, setSheetOpen]       = useState(false);
  const [isUpdating, setIsUpdating]     = useState(false);

  const filtered = useMemo(() => {
    return appointments.filter((apt) => {
      const name       = apt.patients?.full_name?.toLowerCase() ?? "";
      const matchSearch = search.length < 2 || name.includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || apt.status === statusFilter;
      const matchSource = sourceFilter === "all" || apt.source === sourceFilter;
      return matchSearch && matchStatus && matchSource;
    });
  }, [appointments, search, statusFilter, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const calendarEvents = appointments.map((apt) => ({
    id:              apt.id,
    title:           apt.patients?.full_name ?? "Sin nombre",
    start:           apt.scheduled_at,
    end:             new Date(new Date(apt.scheduled_at).getTime() + apt.duration_minutes * 60000).toISOString(),
    backgroundColor: STATUS_COLORS[apt.status],
    borderColor:     STATUS_COLORS[apt.status],
    textColor:       "#fff",
  }));

  const handleEventClick = (info: EventClickArg) => {
    const apt = appointments.find((a) => a.id === info.event.id);
    if (apt) { setSelectedApt(apt); setSheetOpen(true); }
  };

  const handleStatusChange = async (newStatus: AppointmentStatus) => {
    if (!selectedApt) return;
    setIsUpdating(true);
    const prev = selectedApt;
    const optimistic = { ...selectedApt, status: newStatus };
    setSelectedApt(optimistic);
    setAppointments((all) => all.map((a) => a.id === prev.id ? optimistic : a));
    try {
      const res = await fetch(`/api/appointments/${prev.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, changed_by: userId }),
      });
      if (!res.ok) {
        setSelectedApt(prev);
        setAppointments((all) => all.map((a) => a.id === prev.id ? prev : a));
      }
    } catch {
      setSelectedApt(prev);
      setAppointments((all) => all.map((a) => a.id === prev.id ? prev : a));
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Citas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestiona las citas de la clínica</p>
        </div>

        <div className="flex items-center gap-1 bg-muted border border-border rounded-md p-1">
          {(["calendar", "table"] as const).map((mode) => (
            <Button
              key={mode}
              variant="ghost"
              size="sm"
              onClick={() => setViewMode(mode)}
              className={cn(
                "h-7 px-3 gap-1.5 text-xs font-medium transition-colors",
                viewMode === mode
                  ? "bg-background text-foreground shadow-sm hover:bg-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {mode === "calendar" ? <Calendar className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
              {mode === "calendar" ? "Calendario" : "Lista"}
            </Button>
          ))}
        </div>
      </div>

      {viewMode === "table" ? (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Buscar por paciente..."
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="h-9 text-sm w-44">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                {(Object.entries(STATUS_LABELS) as [AppointmentStatus, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(1); }}>
              <SelectTrigger className="h-9 text-sm w-40">
                <SelectValue placeholder="Fuente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las fuentes</SelectItem>
                {(Object.entries(SOURCE_LABELS) as [string, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-medium">Paciente</TableHead>
                  <TableHead className="text-xs font-medium">Fecha / Hora</TableHead>
                  <TableHead className="text-xs font-medium">Servicio</TableHead>
                  <TableHead className="text-xs font-medium">Estado</TableHead>
                  <TableHead className="text-xs font-medium">Fuente</TableHead>
                  <TableHead className="text-xs font-medium text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-10">
                      No se encontraron citas
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((apt) => (
                    <TableRow key={apt.id} className="cursor-pointer" onClick={() => { setSelectedApt(apt); setSheetOpen(true); }}>
                      <TableCell className="text-sm font-medium text-foreground">
                        {apt.patients?.full_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(apt.scheduled_at), "d 'de' MMM, HH:mm", { locale: es })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{apt.service ?? "—"}</TableCell>
                      <TableCell><AppointmentStatusBadge status={apt.status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{SOURCE_LABELS[apt.source] ?? apt.source}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="h-7 text-xs">Ver detalle</Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-muted-foreground">
                {filtered.length} citas · Página {page} de {totalPages}
              </p>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="w-7 h-7 disabled:opacity-30">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="w-7 h-7 disabled:opacity-30">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
            events={calendarEvents}
            eventClick={handleEventClick}
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
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-base font-semibold">Detalle de cita</SheetTitle>
          </SheetHeader>

          <AnimatePresence mode="wait">
            {selectedApt && (
              <motion.div
                key={selectedApt.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="mt-6 space-y-5"
              >
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Paciente</p>
                  <p className="text-sm font-semibold text-foreground">{selectedApt.patients?.full_name ?? "Sin nombre"}</p>
                  {selectedApt.patients?.phone && (
                    <p className="text-xs text-muted-foreground">{selectedApt.patients.phone}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fecha y hora</p>
                  <p className="text-sm text-foreground">
                    {format(new Date(selectedApt.scheduled_at), "EEEE, d 'de' MMMM yyyy · HH:mm", { locale: es })}
                  </p>
                  <p className="text-xs text-muted-foreground">{selectedApt.duration_minutes} minutos</p>
                </div>

                {selectedApt.service && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Servicio</p>
                    <p className="text-sm text-foreground">{selectedApt.service}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado</p>
                  <AppointmentStatusBadge status={selectedApt.status} />
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fuente</p>
                  <p className="text-sm text-foreground">{SOURCE_LABELS[selectedApt.source] ?? selectedApt.source}</p>
                </div>

                {selectedApt.notes && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notas</p>
                    <p className="text-sm text-muted-foreground">{selectedApt.notes}</p>
                  </div>
                )}

                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cambiar estado</p>
                  <div className="flex flex-wrap gap-2">
                    {(Object.entries(STATUS_LABELS) as [AppointmentStatus, string][]).map(([status, label]) => (
                      <Button
                        key={status}
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusChange(status)}
                        disabled={isUpdating || selectedApt.status === status}
                        className={cn(
                          "h-7 text-xs transition-colors",
                          selectedApt.status === status && "bg-secondary"
                        )}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Creada el {format(new Date(selectedApt.created_at), "d 'de' MMMM yyyy", { locale: es })}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </SheetContent>
      </Sheet>
    </div>
  );
}
