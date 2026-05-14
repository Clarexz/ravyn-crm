"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AppointmentStatusBadge } from "@/components/crm/AppointmentStatusBadge";
import type { Patient, Appointment } from "@/types/database";

const SOURCE_CONFIG: Record<Patient["source"], { label: string; className: string }> = {
  whatsapp: { label: "WhatsApp", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  web:      { label: "Web",      className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  manual:   { label: "Manual",   className: "bg-muted text-muted-foreground border-border" },
};

interface EditablePatient { full_name: string; phone: string; email: string; notes: string }

export default function PatientsClient({ patients }: { patients: Patient[] }) {
  const [search, setSearch]                 = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [sheetOpen, setSheetOpen]           = useState(false);
  const [isEditing, setIsEditing]           = useState(false);
  const [editValues, setEditValues]         = useState<EditablePatient>({ full_name: "", phone: "", email: "", notes: "" });
  const [isSaving, setIsSaving]             = useState(false);
  const [appointments, setAppointments]     = useState<Appointment[]>([]);
  const [loadingApts, setLoadingApts]       = useState(false);

  const filtered = useMemo(() => {
    if (search.length < 2) return patients;
    const q = search.toLowerCase();
    return patients.filter(
      (p) => p.full_name.toLowerCase().includes(q) || p.phone?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q)
    );
  }, [patients, search]);

  const openSheet = async (patient: Patient) => {
    setSelectedPatient(patient);
    setIsEditing(false);
    setSheetOpen(true);
    setLoadingApts(true);
    setAppointments([]);
    try {
      const res = await fetch(`/api/patients/${patient.id}/appointments`);
      if (res.ok) setAppointments(await res.json() as Appointment[]);
    } catch { /* silently fail */ }
    finally { setLoadingApts(false); }
  };

  const handleSave = async () => {
    if (!selectedPatient) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/patients/${selectedPatient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editValues),
      });
      if (res.ok) { setSelectedPatient(await res.json() as Patient); setIsEditing(false); }
    } catch { /* silently fail */ }
    finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Pacientes</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Directorio de pacientes de la clínica</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar pacientes..."
          className="pl-9 h-9 text-sm"
        />
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {search.length >= 2 ? "No se encontraron pacientes" : "No hay pacientes registrados"}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Nombre</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Teléfono</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Fuente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Registro</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((patient) => {
                const src = SOURCE_CONFIG[patient.source];
                return (
                  <tr
                    key={patient.id}
                    onClick={() => openSheet(patient)}
                    className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{patient.full_name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">{patient.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">{patient.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`text-xs border px-2 py-0.5 ${src.className}`}>{src.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                      {format(new Date(patient.created_at), "d MMM yyyy", { locale: es })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} paciente{filtered.length !== 1 ? "s" : ""}</p>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-base font-semibold">Detalle de paciente</SheetTitle>
          </SheetHeader>

          <AnimatePresence mode="wait">
            {selectedPatient && (
              <motion.div
                key={selectedPatient.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="mt-6 space-y-5"
              >
                {isEditing ? (
                  <div className="space-y-3">
                    {(["full_name", "phone", "email"] as const).map((field) => (
                      <div key={field} className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground capitalize">
                          {field === "full_name" ? "Nombre" : field === "phone" ? "Teléfono" : "Email"}
                        </Label>
                        <Input
                          value={editValues[field]}
                          onChange={(e) => setEditValues((v) => ({ ...v, [field]: e.target.value }))}
                          className="h-9 text-sm"
                        />
                      </div>
                    ))}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Notas</Label>
                      <Textarea
                        value={editValues.notes}
                        onChange={(e) => setEditValues((v) => ({ ...v, notes: e.target.value }))}
                        rows={3}
                        className="text-sm resize-none"
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={handleSave} disabled={isSaving} className="h-8 text-xs font-semibold">
                        {isSaving ? "Guardando..." : "Guardar"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="h-8 text-xs">
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {[
                        { label: "Nombre",    value: selectedPatient.full_name },
                        { label: "Teléfono",  value: selectedPatient.phone ?? "—" },
                        { label: "Email",     value: selectedPatient.email ?? "—" },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
                          <p className="text-sm text-foreground mt-1">{value}</p>
                        </div>
                      ))}
                      {selectedPatient.notes && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notas</p>
                          <p className="text-sm text-muted-foreground mt-1">{selectedPatient.notes}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fuente</p>
                        <Badge variant="outline" className={`mt-1 text-xs border px-2 py-0.5 ${SOURCE_CONFIG[selectedPatient.source].className}`}>
                          {SOURCE_CONFIG[selectedPatient.source].label}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Registro</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {format(new Date(selectedPatient.created_at), "d 'de' MMMM yyyy", { locale: es })}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm" variant="outline"
                      onClick={() => {
                        setEditValues({
                          full_name: selectedPatient.full_name,
                          phone: selectedPatient.phone ?? "",
                          email: selectedPatient.email ?? "",
                          notes: selectedPatient.notes ?? "",
                        });
                        setIsEditing(true);
                      }}
                      className="h-8 text-xs"
                    >
                      Editar
                    </Button>
                  </>
                )}

                <div className="pt-4 border-t border-border space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Historial de citas</p>
                  {loadingApts ? (
                    <div className="space-y-2">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  ) : appointments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin citas registradas</p>
                  ) : (
                    <div className="space-y-2">
                      {appointments.map((apt) => (
                        <div key={apt.id} className="bg-muted/50 border border-border rounded-md p-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-foreground">
                              {format(new Date(apt.scheduled_at), "d 'de' MMM yyyy, HH:mm", { locale: es })}
                            </p>
                            <AppointmentStatusBadge status={apt.status} />
                          </div>
                          {apt.service && <p className="text-xs text-muted-foreground">{apt.service}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </SheetContent>
      </Sheet>
    </div>
  );
}
