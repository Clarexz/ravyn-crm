"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNewAppointment } from "@/components/crm/NewAppointmentContext";
import type { Patient } from "@/types/database";

const schema = z.object({
  patient_id:       z.string().min(1, "Selecciona un paciente"),
  date:             z.string().min(1, "La fecha es requerida"),
  time:             z.string().min(1, "La hora es requerida"),
  duration_minutes: z.string(),
  service:          z.string().min(1, "El servicio es requerido"),
  notes:            z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const SERVICES  = ["Limpieza", "Ortodoncia", "Extracción", "Revisión general", "Blanqueamiento", "Emergencia"];
const DURATIONS = [
  { value: "15", label: "15 minutos" },
  { value: "30", label: "30 minutos" },
  { value: "45", label: "45 minutos" },
  { value: "60", label: "1 hora" },
  { value: "90", label: "1.5 horas" },
];

type PatientResult = Pick<Patient, "id" | "full_name" | "phone">;

export function NewAppointmentModal({ clinicId }: { clinicId: string }) {
  const { open, setOpen } = useNewAppointment();
  const router = useRouter();

  const [patientQuery, setPatientQuery]       = useState("");
  const [patientResults, setPatientResults]   = useState<PatientResult[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(null);
  const [showCreate, setShowCreate]           = useState(false);
  const [newPatient, setNewPatient]           = useState({ full_name: "", phone: "" });
  const [isCreating, setIsCreating]           = useState(false);
  const [isSubmitting, setIsSubmitting]       = useState(false);
  const [submitError, setSubmitError]         = useState<string | null>(null);

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { duration_minutes: "30", service: "" },
  });

  const searchPatients = useCallback(async (q: string) => {
    if (q.length < 2) { setPatientResults([]); return; }
    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(q)}&clinic_id=${clinicId}`);
      if (res.ok) setPatientResults(await res.json() as PatientResult[]);
    } catch { /* ignore */ }
  }, [clinicId]);

  useEffect(() => {
    const t = setTimeout(() => searchPatients(patientQuery), 300);
    return () => clearTimeout(t);
  }, [patientQuery, searchPatients]);

  const selectPatient = (p: PatientResult) => {
    setSelectedPatient(p);
    setValue("patient_id", p.id);
    setPatientQuery(p.full_name);
    setPatientResults([]);
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
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: values.patient_id,
          clinic_id: clinicId,
          scheduled_at,
          duration_minutes: parseInt(values.duration_minutes),
          service: values.service,
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Nueva cita</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          {/* Patient search */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Paciente</Label>
            <div className="relative">
              <Input
                value={patientQuery}
                onChange={(e) => {
                  setPatientQuery(e.target.value);
                  setSelectedPatient(null);
                  setValue("patient_id", "");
                }}
                placeholder="Buscar por nombre..."
                className="h-9 text-sm"
              />
              {patientResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
                  {patientResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectPatient(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                    >
                      <span className="font-medium text-foreground">{p.full_name}</span>
                      {p.phone && <span className="text-muted-foreground ml-2 text-xs">{p.phone}</span>}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setShowCreate(true); setPatientResults([]); setNewPatient({ full_name: patientQuery, phone: "" }); }}
                    className="w-full text-left px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-accent border-t border-border transition-colors"
                  >
                    + Crear paciente nuevo
                  </button>
                </div>
              )}
            </div>
            {errors.patient_id && <p className="text-xs text-red-500">{errors.patient_id.message}</p>}

            {showCreate && (
              <div className="mt-2 p-3 bg-muted/50 border border-border rounded-md space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Nuevo paciente</p>
                <Input
                  placeholder="Nombre completo"
                  value={newPatient.full_name}
                  onChange={(e) => setNewPatient((p) => ({ ...p, full_name: e.target.value }))}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Teléfono (opcional)"
                  value={newPatient.phone}
                  onChange={(e) => setNewPatient((p) => ({ ...p, phone: e.target.value }))}
                  className="h-8 text-sm"
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={handleCreatePatient} disabled={isCreating || !newPatient.full_name.trim()} className="h-7 text-xs">
                    {isCreating ? "Creando..." : "Crear"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowCreate(false)} className="h-7 text-xs">
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Fecha</Label>
              <input
                type="date"
                {...register("date")}
                className="w-full h-9 rounded-md bg-background border border-border text-foreground text-sm px-3 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {errors.date && <p className="text-xs text-red-500">{errors.date.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Hora</Label>
              <input
                type="time"
                {...register("time")}
                className="w-full h-9 rounded-md bg-background border border-border text-foreground text-sm px-3 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {errors.time && <p className="text-xs text-red-500">{errors.time.message}</p>}
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Duración</Label>
            <Select defaultValue="30" onValueChange={(v) => setValue("duration_minutes", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DURATIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Service */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Servicio</Label>
            <Select onValueChange={(v) => setValue("service", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar servicio..." /></SelectTrigger>
              <SelectContent>
                {SERVICES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {errors.service && <p className="text-xs text-red-500">{errors.service.message}</p>}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Notas (opcional)</Label>
            <Textarea {...register("notes")} placeholder="Observaciones adicionales..." rows={2} className="text-sm resize-none" />
          </div>

          {submitError && <p className="text-xs text-red-500">{submitError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={handleClose} className="h-8 text-xs">Cancelar</Button>
            <Button type="submit" size="sm" disabled={isSubmitting} className="h-8 text-xs px-4 font-semibold">
              {isSubmitting ? "Guardando..." : "Guardar cita"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
