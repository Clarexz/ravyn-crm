"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNewAppointment } from "@/components/crm/NewAppointmentContext";
import { TimeSlotPicker } from "@/components/crm/TimeSlotPicker";
import type { Patient, Service } from "@/types/database";

const schema = z.object({
  patient_id:       z.string().min(1, "Selecciona un paciente"),
  date:             z.string().min(1, "La fecha es requerida"),
  time:             z.string().min(1, "La hora es requerida"),
  duration_minutes: z.string(),
  service_id:       z.string().min(1, "El servicio es requerido"),
  notes:            z.string().optional(),
}).refine(
  (data) => new Date(`${data.date}T${data.time}`).getTime() > Date.now(),
  { message: "La fecha y hora deben ser futuras", path: ["time"] }
);
type FormValues = z.infer<typeof schema>;

const DURATIONS = [
  { value: "15",  label: "15 minutos" },
  { value: "30",  label: "30 minutos" },
  { value: "45",  label: "45 minutos" },
  { value: "60",  label: "1 hora" },
  { value: "90",  label: "1.5 horas" },
  { value: "120", label: "2 horas" },
  { value: "150", label: "2.5 horas" },
  { value: "180", label: "3 horas" },
  { value: "210", label: "3.5 horas" },
  { value: "240", label: "4 horas" },
];

type PatientResult = Pick<Patient, "id" | "full_name" | "phone">;

export function NewAppointmentModal({ clinicId }: { clinicId: string }) {
  const { open, setOpen } = useNewAppointment();
  const router = useRouter();

  const [patientQuery, setPatientQuery]       = useState("");
  const [patientResults, setPatientResults]   = useState<PatientResult[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(null);
  const [isSearching, setIsSearching]         = useState(false);
  const [dropdownOpen, setDropdownOpen]       = useState(false);
  const [showCreate, setShowCreate]           = useState(false);
  const [newPatient, setNewPatient]           = useState({ full_name: "", phone: "" });
  const [isCreating, setIsCreating]           = useState(false);
  const [isSubmitting, setIsSubmitting]       = useState(false);
  const [submitError, setSubmitError]         = useState<string | null>(null);
  const [services, setServices]               = useState<Service[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  const { register, handleSubmit, setValue, reset, watch, trigger, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { duration_minutes: "30", service_id: "" },
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  useEffect(() => {
    if (!open) return;
    setLoadingServices(true);
    fetch("/api/services?active=true")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Service[]) => setServices(Array.isArray(data) ? data : []))
      .catch(() => setServices([]))
      .finally(() => setLoadingServices(false));
  }, [open]);

  const selectedDate = watch("date");
  const selectedTime = watch("time");
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const currentTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const minTime = selectedDate === todayStr ? currentTimeStr : undefined;

  const searchPatients = useCallback(async (q: string) => {
    if (q.length < 1) { setPatientResults([]); setIsSearching(false); return; }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(q)}&clinic_id=${clinicId}`);
      if (res.ok) setPatientResults(await res.json() as PatientResult[]);
    } catch { /* ignore */ }
    finally { setIsSearching(false); }
  }, [clinicId]);

  useEffect(() => {
    if (patientQuery.length >= 1 && !selectedPatient) setIsSearching(true);
    const t = setTimeout(() => searchPatients(patientQuery), 250);
    return () => clearTimeout(t);
  }, [patientQuery, searchPatients, selectedPatient]);

  const selectPatient = (p: PatientResult) => {
    setSelectedPatient(p);
    setValue("patient_id", p.id);
    setPatientQuery(p.full_name);
    setPatientResults([]);
    setDropdownOpen(false);
  };

  const handleCreatePatient = async () => {
    if (!newPatient.full_name.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: newPatient.full_name, phone: newPatient.phone, clinic_id: clinicId, source: "manual" }),
      });
      if (res.ok) {
        selectPatient(await res.json() as PatientResult);
        setShowCreate(false);
        setNewPatient({ full_name: "", phone: "" });
      }
    } catch { /* ignore */ }
    finally { setIsCreating(false); }
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const scheduled_at = new Date(`${values.date}T${values.time}`).toISOString();
      const selectedService = services.find((s) => s.id === values.service_id);
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: values.patient_id,
          clinic_id: clinicId,
          scheduled_at,
          duration_minutes: parseInt(values.duration_minutes),
          service: selectedService?.name ?? null,
          service_id: values.service_id,
          cost_at_booking: selectedService?.cost ?? null,
          notes: values.notes ?? "",
          source: "manual",
          status: "pending",
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setSubmitError(err.error ?? "Error al crear la cita");
        return;
      }
      reset();
      setSelectedPatient(null);
      setPatientQuery("");
      setOpen(false);
      router.refresh();
    } catch {
      setSubmitError("Error inesperado. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    reset();
    setSelectedPatient(null);
    setPatientQuery("");
    setPatientResults([]);
    setShowCreate(false);
    setSubmitError(null);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] max-w-lg bg-card border-border p-4 md:p-6 rounded-lg overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Nueva cita</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2 pb-2">
          {/* Patient search */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Paciente</Label>
            <div className="relative" ref={searchContainerRef}>
              <Input
                value={patientQuery}
                onChange={(e) => {
                  setPatientQuery(e.target.value);
                  setSelectedPatient(null);
                  setValue("patient_id", "");
                  setDropdownOpen(true);
                }}
                onFocus={() => { if (patientQuery.length >= 1 && !selectedPatient) setDropdownOpen(true); }}
                placeholder="Buscar por nombre..."
                className="h-10 md:h-9 text-sm"
              />
              {dropdownOpen && patientQuery.length >= 1 && !selectedPatient && (
                <div className="absolute top-full left-0 right-0 z-[60] mt-1.5 bg-muted/95 dark:bg-zinc-900 border border-border rounded-lg shadow-xl overflow-hidden max-h-72 overflow-y-auto backdrop-blur-sm">
                  {isSearching ? (
                    <div className="flex items-center justify-center gap-2 px-3 py-5 text-xs text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Buscando...
                    </div>
                  ) : patientResults.length === 0 ? (
                    <div className="px-3 py-5 text-xs text-muted-foreground text-center">
                      Sin coincidencias
                    </div>
                  ) : (
                    patientResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectPatient(p)}
                        className="w-full text-left px-4 py-3 text-sm hover:bg-accent active:bg-accent/80 transition-colors border-b border-border/60 last:border-0 flex flex-col gap-0.5"
                      >
                        <span className="font-semibold text-foreground">{p.full_name}</span>
                        {p.phone && <span className="text-muted-foreground text-xs">{p.phone}</span>}
                      </button>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreate(true);
                      setPatientResults([]);
                      setDropdownOpen(false);
                      setNewPatient({ full_name: patientQuery, phone: "" });
                    }}
                    className="w-full text-left px-4 py-3 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-accent active:bg-accent/80 border-t-2 border-border transition-colors font-semibold"
                  >
                    + Crear paciente nuevo
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-red-500 min-h-[1rem] leading-4">{errors.patient_id?.message ?? " "}</p>

            {showCreate && (
              <div className="mt-2 p-3 bg-muted/50 border border-border rounded-md space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Nuevo paciente</p>
                <Input
                  placeholder="Nombre completo"
                  value={newPatient.full_name}
                  onChange={(e) => setNewPatient((p) => ({ ...p, full_name: e.target.value }))}
                  className="h-10 md:h-8 text-sm"
                />
                <Input
                  placeholder="Teléfono (opcional)"
                  value={newPatient.phone}
                  onChange={(e) => setNewPatient((p) => ({ ...p, phone: e.target.value }))}
                  className="h-10 md:h-8 text-sm"
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={handleCreatePatient} disabled={isCreating || !newPatient.full_name.trim()} className="flex-1 md:flex-none h-9 md:h-7 text-xs">
                    {isCreating ? "Creando..." : "Crear"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowCreate(false)} className="flex-1 md:flex-none h-9 md:h-7 text-xs">
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Fecha</Label>
              <input
                type="date"
                min={todayStr}
                {...register("date", { onBlur: () => trigger(["date", "time"]) })}
                className="w-full h-10 md:h-9 rounded-md bg-background border border-border text-foreground text-sm px-3 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="text-xs text-red-500 min-h-[1rem] leading-4">{errors.date?.message ?? " "}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Hora</Label>
              <input type="hidden" {...register("time")} />
              <TimeSlotPicker
                date={selectedDate ?? ""}
                value={selectedTime ?? ""}
                onChange={(t) => { setValue("time", t, { shouldValidate: true }); trigger(["date", "time"]); }}
                onBlur={() => trigger(["date", "time"])}
                minTime={minTime}
              />
              <p className="text-xs text-red-500 min-h-[1rem] leading-4">{errors.time?.message ?? " "}</p>
            </div>
          </div>

          {/* Duration and Service */}
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Duración</Label>
              <Select defaultValue="30" onValueChange={(v) => setValue("duration_minutes", v)}>
                <SelectTrigger className="h-10 md:h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Servicio</Label>
              <Select onValueChange={(v) => setValue("service_id", v, { shouldValidate: true })} disabled={loadingServices}>
                <SelectTrigger className="h-10 md:h-9 text-sm"><SelectValue placeholder={loadingServices ? "Cargando..." : services.length === 0 ? "Sin servicios — crea uno primero" : "Seleccionar..."} /></SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id} textValue={s.name}>
                      <span className="flex items-center justify-between gap-3 w-full min-w-0">
                        <span className="truncate">{s.name}</span>
                        <span className="text-muted-foreground text-xs shrink-0">
                          {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(s.cost)}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-red-500 min-h-[1rem] leading-4">{errors.service_id?.message ?? " "}</p>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Notas (opcional)</Label>
            <Textarea {...register("notes")} placeholder="Observaciones adicionales..." rows={3} className="text-sm resize-none" />
          </div>

          <p className="text-xs text-red-500 min-h-[1rem] leading-4">{submitError ?? " "}</p>

          <div className="flex flex-col-reverse xs:flex-row justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={handleClose} className="h-10 md:h-8 text-xs">Cancelar</Button>
            <Button type="submit" size="sm" disabled={isSubmitting} className="h-10 md:h-8 text-xs px-4 font-semibold bg-foreground text-background">
              {isSubmitting ? "Guardando..." : "Guardar cita"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
