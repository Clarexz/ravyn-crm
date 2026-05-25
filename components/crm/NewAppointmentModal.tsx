"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNewAppointment } from "@/components/crm/NewAppointmentContext";
import { TimeSlotPicker } from "@/components/crm/TimeSlotPicker";
import { toast } from "sonner";
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

type PatientResult = Pick<Patient, "id" | "full_name" | "phone" | "email">;

export function NewAppointmentModal({ clinicId, clinicName }: { clinicId: string; clinicName: string }) {
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
    if (!selectedPatient) {
      toast.error("Selecciona un paciente válido");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const scheduled_at = new Date(`${values.date}T${values.time}`).toISOString();
      const selectedService = services.find((s) => s.id === values.service_id);
      
      // 1. Save to local database
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
        setSubmitError(err.error ?? "Error al crear la cita localmente");
        return;
      }

      // 2. Trigger n8n Automation Webhook
      try {
        await fetch("https://n8n.srv1574981.hstgr.cloud/webhook/agendar-cita-reynosa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name:     selectedPatient.full_name,
            phone:    selectedPatient.phone || "—",
            email:    selectedPatient.email || "—",
            branch:   clinicName,
            service:  selectedService?.name || "Consulta General",
            date:     values.date,
            time:     values.time
          }),
        });
        console.log("n8n automation triggered successfully");
      } catch (n8nError) {
        console.error("n8n trigger failed:", n8nError);
      }

      reset();
      setSelectedPatient(null);
      setPatientQuery("");
      setOpen(false);
      toast.success("Cita agendada y sincronizada correctamente");
      
      // Update UI immediately
      router.refresh();
    } catch (err) {
      console.error("Submit error:", err);
      setSubmitError("Error inesperado al procesar la cita.");
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[95vw] max-w-lg bg-[var(--bg-surface)] border-none p-8 md:p-10 rounded-[40px] overflow-y-auto max-h-[90vh] shadow-2xl transition-colors">
        <DialogHeader className="mb-8">
          <DialogTitle className="text-2xl font-black text-[var(--text-primary)] uppercase tracking-tighter text-center">Agendar Cita</DialogTitle>
          <DialogDescription className="text-center text-xs text-[var(--text-secondary)]">Completa los datos para registrar la nueva visita en la agenda.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          {/* Patient search */}
          <div className="flex flex-col gap-2">
            <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest px-1">Paciente</Label>
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
                placeholder="Buscar o registrar paciente..."
                className="h-12 text-sm bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl font-bold px-5 focus:ring-2 focus:ring-[var(--brand-accent)] shadow-sm text-[var(--text-primary)] transition-all"
              />
              {dropdownOpen && patientQuery.length >= 1 && !selectedPatient && (
                <div className="absolute top-full left-0 right-0 z-[60] mt-2 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
                  {isSearching ? (
                    <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-[var(--text-secondary)] font-bold uppercase tracking-widest">
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--brand-accent)]" />
                      Buscando...
                    </div>
                  ) : patientResults.length === 0 ? (
                    <div className="px-3 py-6 text-xs text-[var(--text-secondary)] font-bold uppercase tracking-widest text-center">
                      Sin coincidencias
                    </div>
                  ) : (
                    patientResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectPatient(p)}
                        className="w-full text-left px-5 py-4 text-sm hover:bg-[var(--bg-card-hover)] transition-colors border-b border-[var(--border-default)] last:border-0 flex flex-col gap-1"
                      >
                        <span className="font-black text-[var(--text-primary)]">{p.full_name}</span>
                        {p.phone && <span className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider">{p.phone}</span>}
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
                    className="w-full text-left px-5 py-4 text-[10px] text-[var(--brand-accent)] bg-[var(--brand-accent-bg)] hover:opacity-80 border-t border-[var(--border-default)] transition-colors font-black uppercase tracking-widest"
                  >
                    + Registrar paciente nuevo
                  </button>
                </div>
              )}
            </div>
            <p className="text-[10px] text-[var(--destructive)] font-bold uppercase px-2">{errors.patient_id?.message ?? ""}</p>

            {showCreate && (
              <div className="mt-2 p-6 bg-[var(--bg-card)] rounded-3xl flex flex-col gap-4 shadow-md border border-[var(--border-default)] transition-colors">
                <div className="flex items-center gap-2 text-[var(--brand-accent)] mb-1">
                   <UserPlus className="w-4 h-4" />
                   <p className="text-[10px] font-black uppercase tracking-widest">Nuevo Registro Rápido</p>
                </div>
                <Input
                  placeholder="Nombre completo"
                  value={newPatient.full_name}
                  onChange={(e) => setNewPatient((p) => ({ ...p, full_name: e.target.value }))}
                  className="h-11 text-sm bg-[var(--bg-input)] border border-[var(--border-default)] rounded-xl text-[var(--text-primary)] font-bold transition-all"
                />
                <Input
                  placeholder="Teléfono (Opcional)"
                  value={newPatient.phone}
                  onChange={(e) => setNewPatient((p) => ({ ...p, phone: e.target.value }))}
                  className="h-11 text-sm bg-[var(--bg-input)] border border-[var(--border-default)] rounded-xl text-[var(--text-primary)] font-bold transition-all"
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={handleCreatePatient} disabled={isCreating || !newPatient.full_name.trim()} className="flex-1 h-10 text-[10px] font-black uppercase tracking-widest bg-[var(--brand-accent)] text-white rounded-xl shadow-lg shadow-blue-500/20">
                    {isCreating ? "Registrando..." : "Confirmar Registro"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowCreate(false)} className="h-10 text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10 rounded-xl">
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-5">
            <div className="flex flex-col gap-2">
              <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest px-1">Fecha de cita</Label>
              <div className="relative">
                <input
                  type="date"
                  min={todayStr}
                  {...register("date", { onBlur: () => trigger(["date", "time"]) })}
                  className="w-full h-12 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-default)] text-sm px-5 focus:ring-2 focus:ring-[var(--brand-accent)] font-bold text-[var(--text-primary)] shadow-sm transition-all"
                />
              </div>
              <p className="text-[10px] text-[var(--destructive)] font-bold uppercase px-2">{errors.date?.message ?? ""}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest px-1">Hora</Label>
              <input type="hidden" {...register("time")} />
              <TimeSlotPicker
                date={selectedDate ?? ""}
                value={selectedTime ?? ""}
                onChange={(t) => { setValue("time", t, { shouldValidate: true }); trigger(["date", "time"]); }}
                onBlur={() => trigger(["date", "time"])}
                minTime={minTime}
                branchName={clinicName}
              />
              <p className="text-[10px] text-[var(--destructive)] font-bold uppercase px-2">{errors.time?.message ?? ""}</p>
            </div>
          </div>

          {/* Duration and Service */}
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-5">
            <div className="flex flex-col gap-2">
              <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest px-1">Duración</Label>
              <Select defaultValue="30" onValueChange={(v) => setValue("duration_minutes", v)}>
                <SelectTrigger className="h-12 text-sm font-bold bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl px-5 text-[var(--text-primary)] shadow-sm transition-all"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-2xl border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)]">
                  {DURATIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest px-1">Tratamiento</Label>
              <Select onValueChange={(v) => setValue("service_id", v, { shouldValidate: true })} disabled={loadingServices}>
                <SelectTrigger className="h-12 text-sm font-bold bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl px-5 text-[var(--text-primary)] shadow-sm transition-all"><SelectValue placeholder={loadingServices ? "Cargando..." : "Seleccionar..."} /></SelectTrigger>
                <SelectContent className="rounded-2xl border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)]">
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id} textValue={s.name}>
                      <span className="flex items-center justify-between gap-3 w-full min-w-0">
                        <span className="truncate">{s.name}</span>
                        <span className="text-[var(--brand-accent)] text-[10px] font-black shrink-0 transition-colors">
                          {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(s.cost)}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-[var(--destructive)] font-bold uppercase px-2">{errors.service_id?.message ?? ""}</p>
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-2">
            <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest px-1">Notas clínicas</Label>
            <Textarea {...register("notes")} placeholder="Escribe observaciones adicionales aquí..." rows={3} className="text-sm bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl font-medium px-5 py-4 resize-none focus:ring-2 focus:ring-[var(--brand-accent)] shadow-sm text-[var(--text-primary)] transition-all" />
          </div>

          {submitError && <p className="text-[10px] text-[var(--destructive)] font-black uppercase text-center">{submitError}</p>}

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-[var(--border-default)] mt-2">
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              onClick={handleClose} 
              className="h-12 text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)] border-[var(--border-default)] bg-[var(--bg-page)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10 hover:border-[var(--destructive)] rounded-2xl transition-all"
            >
              Cerrar
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting} className="h-12 px-10 text-[11px] font-black uppercase tracking-widest bg-[var(--brand-accent)] text-white rounded-2xl shadow-xl shadow-blue-500/20 hover:opacity-90 transition-all">
              {isSubmitting ? "Agendando..." : "Agendar Cita"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
