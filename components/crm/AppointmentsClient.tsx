"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, List, Search, ChevronLeft, ChevronRight, Bell } from "lucide-react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg } from "@fullcalendar/core";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
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

export default function AppointmentsClient({
  appointments: initialAppointments,
  clinicId: _clinicId,
  userId: _userId,
}: {
  appointments: AppointmentWithPatient[];
  clinicId: string;
  userId: string;
}) {
  const [viewMode, setViewMode]         = useState<ViewMode>("calendar");
  const [appointments, _setAppointments] = useState(initialAppointments);
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [page, setPage]                 = useState(1);
  const [selectedApt, setSelectedApt]   = useState<AppointmentWithPatient | null>(null);
  const [sheetOpen, setSheetOpen]       = useState(false);
  const [remindingId, setRemindingId]   = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Edit logic
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    status: "pending" as AppointmentStatus,
    service: "",
    notes: "",
  });

  const openAptDetails = (apt: AppointmentWithPatient) => {
    setSelectedApt(apt);
    setEditValues({
      status: apt.status,
      service: apt.service ?? "",
      notes: apt.notes ?? "",
    });
    setIsEditing(false);
    setSheetOpen(true);
  };

  const handleSaveChanges = async () => {
    if (!selectedApt) return;
    setIsUpdatingStatus(true);
    try {
      const res = await fetch(`/api/appointments/${selectedApt.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editValues),
      });
      if (res.ok) {
        const updated = await res.json() as Appointment;
        // Actualizamos la lista global para que el calendario se repinte
        const updatedList = appointments.map(a => a.id === updated.id ? { ...a, ...updated } : a);
        _setAppointments(updatedList);
        
        // Actualizamos el detalle seleccionado
        setSelectedApt(prev => prev ? { ...prev, status: updated.status } : null);
        
        toast.success("Cita actualizada correctamente");
        setIsEditing(false); // Volver a la vista de detalles
      }
    } catch {
      toast.error("Error al guardar los cambios");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleSendReminder = async (id: string, patientName: string) => {
    setRemindingId(id);
    try {
      const res = await fetch(`/api/appointments/${id}/remind`, { method: "POST" });
      if (res.ok) {
        toast.success(`Recordatorio enviado a ${patientName}`);
      } else {
        toast.error("Error al enviar el recordatorio");
      }
    } catch {
      toast.error("Error inesperado");
    } finally {
      setRemindingId(null);
    }
  };

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
    if (apt) {
      setSelectedApt(apt);
      setSheetOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Citas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestión de agenda y seguimiento</p>
        </div>

        <div className="flex bg-muted p-1 rounded-lg w-fit self-end sm:self-auto">
          <Button
            variant={viewMode === "calendar" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("calendar")}
            className="h-8 text-xs gap-1.5"
          >
            <Calendar className="w-3.5 h-3.5" />
            Calendario
          </Button>
          <Button
            variant={viewMode === "table" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("table")}
            className="h-8 text-xs gap-1.5"
          >
            <List className="w-3.5 h-3.5" />
            Lista
          </Button>
        </div>
      </div>

      {viewMode === "table" ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <div className="relative flex-1 min-w-0 sm:min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Buscar por paciente..."
                className="pl-9 h-9 text-sm w-full"
              />
            </div>
            <div className="flex flex-col xs:flex-row gap-3 w-full sm:w-auto">
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="h-9 text-sm w-full sm:w-44">
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
                <SelectTrigger className="h-9 text-sm w-full sm:w-40">
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
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-medium text-muted-foreground uppercase px-4 py-3">Paciente</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground uppercase px-4 py-3">Fecha / Hora</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground uppercase px-4 py-3 hidden md:table-cell">Servicio</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground uppercase px-4 py-3">Estado</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground uppercase px-4 py-3 hidden sm:table-cell">Fuente</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground uppercase px-4 py-3 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-12">
                      No se encontraron citas con los filtros aplicados.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((apt) => (
                    <TableRow key={apt.id} className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => openAptDetails(apt)}>
                      <TableCell className="text-sm font-medium text-foreground whitespace-nowrap px-4 py-3">
                        {apt.patients?.full_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap px-4 py-3">
                        <span className="hidden sm:inline">{format(new Date(apt.scheduled_at), "d 'de' MMM, HH:mm", { locale: es })}</span>
                        <span className="sm:hidden">{format(new Date(apt.scheduled_at), "d/MM, HH:mm", { locale: es })}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden md:table-cell px-4 py-3">{apt.service ?? "—"}</TableCell>
                      <TableCell className="px-4 py-3"><AppointmentStatusBadge status={apt.status} /></TableCell>
                      <TableCell className="text-[10px] text-muted-foreground hidden sm:table-cell px-4 py-3">{SOURCE_LABELS[apt.source] ?? apt.source}</TableCell>
                      <TableCell className="text-right px-4 py-3">
                        <Button variant="ghost" size="sm" className="h-7 text-xs px-2 md:px-3">
                          <span className="hidden xs:inline">Ver detalle</span>
                          <span className="xs:hidden">Ver</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">Página {page} de {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)} className="h-8 w-8 p-0">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)} className="h-8 w-8 p-0">
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
        <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-card border-border">
          <SheetHeader>
            <SheetTitle className="text-base font-semibold">Detalle de cita</SheetTitle>
          </SheetHeader>

          <AnimatePresence mode="wait">
            {selectedApt && (
              <motion.div
                key={selectedApt.id + (isEditing ? "-edit" : "-view")}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="mt-6 space-y-5"
              >
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Paciente</p>
                  <p className="text-sm font-semibold text-foreground">{selectedApt.patients?.full_name ?? "Sin nombre"}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fecha y hora</p>
                  <p className="text-sm text-foreground">
                    {format(new Date(selectedApt.scheduled_at), "EEEE, d 'de' MMMM yyyy · HH:mm", { locale: es })}
                  </p>
                </div>

                {isEditing ? (
                  <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Estado de la cita</Label>
                      <Select 
                        value={editValues.status} 
                        onValueChange={(v) => setEditValues({ ...editValues, status: v as AppointmentStatus })}
                      >
                        <SelectTrigger className="w-full h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.entries(STATUS_LABELS) as [AppointmentStatus, string][]).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button 
                        onClick={handleSaveChanges} 
                        disabled={isUpdatingStatus}
                        className="flex-1 h-10 text-xs font-bold bg-foreground text-background"
                      >
                        {isUpdatingStatus ? "Guardando..." : "Guardar cambios"}
                      </Button>
                      <Button variant="ghost" onClick={() => setIsEditing(false)} className="h-10 text-xs">
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Servicio</p>
                      <p className="text-sm text-foreground">{selectedApt.service ?? "—"}</p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado</p>
                      <AppointmentStatusBadge status={selectedApt.status} />
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fuente</p>
                      <p className="text-sm text-foreground capitalize">{SOURCE_LABELS[selectedApt.source] ?? selectedApt.source}</p>
                    </div>

                    {selectedApt.notes && (
                      <div className="pt-4 border-t border-border">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">Notas</p>
                        <p className="text-sm text-foreground mt-1 leading-relaxed">{selectedApt.notes}</p>
                      </div>
                    )}

                    <div className="pt-6 border-t border-border space-y-3">
                      <Button 
                        variant="outline" 
                        onClick={() => setIsEditing(true)} 
                        className="w-full h-10 text-xs gap-2"
                      >
                        Cambiar estado
                      </Button>
                      <Button 
                        onClick={() => handleSendReminder(selectedApt.id, selectedApt.patients?.full_name ?? "Paciente")}
                        disabled={remindingId === selectedApt.id}
                        className="w-full h-10 text-xs gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                      >
                        <Bell className={cn("w-4 h-4", remindingId === selectedApt.id && "animate-pulse")} />
                        {remindingId === selectedApt.id ? "Enviando..." : "Enviar recordatorio WhatsApp"}
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
