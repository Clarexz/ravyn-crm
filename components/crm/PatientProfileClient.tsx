"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Phone, Mail, Calendar, Edit2, Check, X, Tag } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AppointmentStatusBadge } from "@/components/crm/AppointmentStatusBadge";
import type { Patient, Appointment } from "@/types/database";

interface PatientProfileClientProps {
  patient: Patient;
  appointments: Appointment[];
}

const SOURCE_CONFIG: Record<Patient["source"], { label: string; className: string }> = {
  whatsapp: { label: "WhatsApp", className: "bg-[var(--state-confirmed-bg)] text-[var(--state-confirmed-text)]" },
  web:      { label: "Web",      className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  manual:   { label: "Manual",   className: "bg-[var(--bg-page)] text-[var(--text-secondary)] border-[var(--border-default)] dark:bg-white/10 dark:text-white/40 dark:border-none" },
};

export function PatientProfileClient({ patient: initialPatient, appointments }: PatientProfileClientProps) {
  const router = useRouter();
  const [patient, setPatient] = useState(initialPatient);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [values, setValues] = useState({
    full_name: initialPatient.full_name,
    phone: initialPatient.phone ?? "",
    email: initialPatient.email ?? "",
    notes: initialPatient.notes ?? "",
  });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/patients/${patient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (res.ok) {
        const updated = await res.json();
        setPatient(updated);
        setIsEditing(false);
        toast.success("Perfil actualizado");
        router.refresh();
      } else {
        toast.error("Error al guardar cambios");
      }
    } catch {
      toast.error("Error de red");
    } finally {
      setIsSaving(false);
    }
  };

  const src = SOURCE_CONFIG[patient.source];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header / Navigation */}
      <div className="flex items-center justify-between">
        <Button 
          variant="ghost" 
          onClick={() => router.push("/patients")}
          className="group text-[var(--text-secondary)] hover:text-[var(--text-primary)] -ml-4 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 mr-2 transition-transform group-hover:-translate-x-1" />
          Volver al directorio
        </Button>
        
        {!isEditing ? (
          <Button 
            onClick={() => setIsEditing(true)}
            className="bg-[var(--brand-accent)] text-white hover:opacity-90 rounded-xl px-6 transition-all shadow-lg shadow-blue-500/20"
          >
            <Edit2 className="w-4 h-4 mr-2 text-white" />
            Editar perfil
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              onClick={() => setIsEditing(false)}
              className="text-[var(--destructive)] hover:bg-[var(--destructive)]/10 rounded-xl transition-all"
            >
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button 
              onClick={handleSave}
              disabled={isSaving}
              className="bg-[var(--brand-accent)] text-white hover:opacity-90 rounded-xl px-6 shadow-lg shadow-blue-500/20 transition-all"
            >
              <Check className="w-4 h-4 mr-2" />
              {isSaving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column: Essential Info Card */}
        <div className="lg:col-span-1 space-y-5">
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] dark:border-white/5 rounded-[40px] p-8 shadow-sm flex flex-col items-center text-center relative overflow-hidden text-balance transition-colors">
            <div className="w-16 h-16 rounded-2xl bg-[#EFF6FF] dark:bg-[rgba(2,132,199,0.20)] flex items-center justify-center border border-blue-100 dark:border-white/5 mb-4 shadow-inner shrink-0 transition-colors">
              <span className="text-2xl font-black text-[#0284C7] dark:text-[#38BDF8] uppercase">{patient.full_name.charAt(0)}</span>
            </div>
            
            <div className="space-y-1 z-10">
              <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight leading-tight transition-colors">{patient.full_name}</h1>
              <Badge variant="outline" className={cn("mt-2 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter border-none", src.className)}>
                {src.label}
              </Badge>
            </div>

            <div className="w-full border-t border-[var(--border-default)] dark:border-white/5 mt-6 pt-6 space-y-3 z-10 transition-colors text-left">
              <div className="flex items-center gap-3 text-[var(--text-secondary)] transition-colors">
                <Phone className="w-3.5 h-3.5 opacity-40" />
                <span className="text-sm font-semibold text-[var(--text-primary)] selectable">{patient.phone || "Sin teléfono"}</span>
              </div>
              <div className="flex items-center gap-3 text-[var(--text-secondary)] transition-colors">
                <Mail className="w-3.5 h-3.5 opacity-40" />
                <span className="text-sm font-semibold text-[var(--text-primary)] truncate selectable">{patient.email || "Sin correo"}</span>
              </div>
              <div className="flex items-center gap-3 text-[var(--text-secondary)] transition-colors">
                <Calendar className="w-3.5 h-3.5 opacity-40" />
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {format(new Date(patient.created_at), "d MMM yyyy", { locale: es })}
                </span>
              </div>
            </div>

            {/* Decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--bg-page)] dark:bg-white/5 rounded-bl-[100px] -mr-10 -mt-10 opacity-30 pointer-events-none transition-colors" />
          </div>

          <div className="bg-[var(--sidebar-bg)] dark:bg-[#0F2035] border border-white/5 dark:border-white/10 rounded-[32px] p-5 shadow-2xl text-white transition-all">
            <h2 className="text-[10px] font-black text-white/40 dark:text-[var(--text-secondary)] uppercase tracking-[0.2em] mb-4 transition-colors">Próxima acción</h2>
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <p className="text-[13px] font-bold leading-relaxed text-white/70 italic transition-colors">&quot;Planear recordatorio automático de limpieza para el próximo mes&quot;</p>
            </div>
            <Button className="w-full mt-4 bg-[#0284C7] dark:bg-transparent dark:border-2 dark:border-[#38BDF8] dark:text-[#38BDF8] text-white hover:opacity-90 rounded-xl font-black text-[10px] transition-all shadow-lg shadow-blue-500/20">
              Crear alerta
            </Button>
          </div>
        </div>

        {/* Right Column: Detailed Tabs/Sections */}
        <div className="lg:col-span-2 space-y-5">
          {/* Main Info / Editing */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] dark:border-white/5 rounded-[40px] p-8 md:p-10 shadow-sm relative overflow-hidden transition-colors">
            <div className="mb-8">
              <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight transition-colors">Información detallada</h2>
              <p className="text-sm text-[var(--text-secondary)] font-medium mt-1 transition-colors">Expediente y datos personales</p>
            </div>

            {isEditing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest transition-colors">Nombre Completo</Label>
                  <Input 
                    value={values.full_name}
                    onChange={(e) => setValues(v => ({ ...v, full_name: e.target.value }))}
                    className="h-12 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl font-bold px-5 text-[var(--text-primary)] transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest transition-colors">Teléfono</Label>
                  <Input 
                    value={values.phone}
                    onChange={(e) => setValues(v => ({ ...v, phone: e.target.value }))}
                    className="h-12 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl font-bold px-5 text-[var(--text-primary)] transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest transition-colors">Email</Label>
                  <Input 
                    value={values.email}
                    onChange={(e) => setValues(v => ({ ...v, email: e.target.value }))}
                    className="h-12 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl font-bold px-5 text-[var(--text-primary)] transition-all"
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest transition-colors">Notas Clínicas</Label>
                  <Textarea 
                    value={values.notes}
                    onChange={(e) => setValues(v => ({ ...v, notes: e.target.value }))}
                    rows={4}
                    className="bg-[var(--bg-input)] border border-[var(--border-default)] rounded-3xl font-medium p-6 resize-none text-[var(--text-primary)] transition-all"
                    placeholder="Escribe observaciones clínicas, alergias o historial..."
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest opacity-60 transition-colors">Documento ID</p>
                    <p className="text-sm font-bold text-[var(--text-primary)] transition-colors selectable">{patient.id.split("-")[0].toUpperCase()}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest opacity-60 transition-colors">Canal de captación</p>
                    <p className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider transition-colors">{patient.source}</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-4 bg-[var(--brand-accent)] rounded-full transition-colors" />
                    <h3 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-widest opacity-80 transition-colors">Notas del expediente</h3>
                  </div>
                  <div className={cn(
                    "bg-[var(--bg-page)] rounded-[24px] border border-[var(--border-default)] dark:border-white/5 overflow-y-auto no-scrollbar transition-all",
                    patient.notes ? "p-6" : "p-6 max-h-[80px] flex items-center"
                  )}>
                    <p className="text-sm text-[var(--text-primary)] font-medium leading-relaxed whitespace-pre-wrap transition-colors selectable">
                      {patient.notes || "Sin observaciones adicionales registradas."}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Appointments History */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] dark:border-white/5 rounded-[40px] p-8 md:p-10 shadow-sm transition-colors">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight transition-colors">Historial de citas</h2>
                <p className="text-sm text-[var(--text-secondary)] font-medium mt-1 transition-colors">Cronología de tratamientos y visitas</p>
              </div>
              <Badge className="bg-[var(--bg-page)] text-[var(--text-primary)] border-[var(--border-default)] dark:border-white/5 px-4 py-1.5 rounded-full text-xs font-black transition-colors shadow-sm">
                {appointments.length} total
              </Badge>
            </div>

            <div className="space-y-3">
              {appointments.length === 0 ? (
                <div className="py-16 text-center bg-[var(--bg-page)] rounded-[32px] border border-[var(--border-default)] border-dashed transition-colors">
                  <p className="text-sm text-[var(--text-secondary)] font-black uppercase tracking-widest opacity-40">Sin citas registradas</p>
                </div>
              ) : (
                appointments.map((apt) => (
                  <div 
                    key={apt.id} 
                    className="flex items-center justify-between py-3 px-5 rounded-[20px] bg-[var(--bg-page)] dark:bg-white/5 border border-[var(--border-default)] dark:border-white/5 hover:bg-[var(--bg-card-hover)] transition-all group shadow-sm"
                  >
                    <div className="flex items-center gap-5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[var(--bg-surface)] flex items-center justify-center shrink-0 border border-[var(--border-default)] dark:border-white/5 shadow-sm group-hover:scale-110 transition-all">
                        <Calendar className="w-4 h-4 text-[var(--brand-accent)]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[var(--text-primary)] truncate transition-colors leading-none">
                          {format(new Date(apt.scheduled_at), "d 'de' MMMM, yyyy", { locale: es })}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 transition-colors">
                          <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">
                            {format(new Date(apt.scheduled_at), "HH:mm")}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-[var(--text-muted)] opacity-30" />
                          <div className="flex items-center gap-1">
                            <Tag className="w-2.5 h-3 text-[var(--brand-accent)]" />
                            <span className="text-[10px] text-[var(--brand-accent)] font-black uppercase tracking-widest">{apt.service ?? "Consulta"}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <AppointmentStatusBadge status={apt.status} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
