"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AppointmentStatusBadge } from "@/components/crm/AppointmentStatusBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Patient, Appointment } from "@/types/database";

const SOURCE_CONFIG: Record<Patient["source"], { label: string; className: string }> = {
  whatsapp: { label: "WhatsApp", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  web:      { label: "Web",      className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  manual:   { label: "Manual",   className: "bg-muted text-muted-foreground border-border" },
};

interface EditablePatient { full_name: string; phone: string; email: string; notes: string }

export default function PatientsClient({ patients }: { patients: Patient[] }) {
  const router = useRouter();
  const [search, setSearch]                 = useState("");
  const [sourceFilter, setSourceFilter]     = useState<string>("all");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [sheetOpen, setSheetOpen]           = useState(false);
  const [isEditing, setIsEditing]           = useState(false);
  const [editValues, setEditValues]         = useState<EditablePatient>({ full_name: "", phone: "", email: "", notes: "" });
  const [isSaving, setIsSaving]             = useState(false);
  const [appointments, setAppointments]     = useState<Appointment[]>([]);
  const [loadingApts, setLoadingApts]       = useState(false);

  const [createOpen, setCreateOpen]         = useState(false);
  const [newPatient, setNewPatient]         = useState<EditablePatient>({ full_name: "", phone: "", email: "", notes: "" });
  const [isCreating, setIsCreating]         = useState(false);

  const resetCreateForm = () => {
    setNewPatient({ full_name: "", phone: "", email: "", notes: "" });
  };

  const handleCreate = async () => {
    if (!newPatient.full_name.trim()) {
      toast.error("El nombre es requerido");
      return;
    }
    setIsCreating(true);
    try {
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newPatient, source: "manual" }),
      });
      const raw = await res.text();
      let parsed: { error?: string } | Patient = {};
      try { parsed = raw ? JSON.parse(raw) : {}; } catch { /* not json */ }

      if (!res.ok) {
        console.error("[Create patient] Status:", res.status, "Body:", raw);
        const msg = (parsed as { error?: string }).error ?? `Error ${res.status}: ${raw.slice(0, 200) || "respuesta vacía"}`;
        toast.error(msg);
        return;
      }
      toast.success("Paciente creado");
      resetCreateForm();
      setCreateOpen(false);
      router.refresh();
    } catch (e) {
      console.error("[Create patient] Network error:", e);
      toast.error("Error de red");
    } finally {
      setIsCreating(false);
    }
  };

  const filtered = useMemo(() => {
    return patients.filter((p) => {
      const q = search.toLowerCase();
      const matchesSearch = search.length < 2 || 
        p.full_name.toLowerCase().includes(q) || 
        p.phone?.toLowerCase().includes(q) || 
        p.email?.toLowerCase().includes(q);
      
      const matchesSource = sourceFilter === "all" || p.source === sourceFilter;
      
      return matchesSearch && matchesSource;
    });
  }, [patients, search, sourceFilter]);

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Pacientes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Directorio de pacientes de la clínica</p>
        </div>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          className="h-9 gap-2 bg-foreground text-background hover:bg-foreground/90 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nuevo paciente</span>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 md:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pacientes..."
            className="pl-9 h-9 text-sm w-full"
          />
        </div>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="h-9 text-sm w-full sm:w-44">
            <SelectValue placeholder="Fuente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las fuentes</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="web">Web</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden overflow-x-auto w-full">
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {search.length >= 2 ? "No se encontraron pacientes" : "No hay pacientes registrados"}
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-3 md:px-4 py-3 text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider">Paciente</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Contacto</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Email</th>
                <th className="text-left px-3 md:px-4 py-3 text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider">Fuente</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Registro</th>
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
                    <td className="px-3 md:px-4 py-4 text-sm font-semibold text-foreground whitespace-nowrap">
                      {patient.full_name}
                      <div className="sm:hidden text-[10px] text-muted-foreground font-normal mt-0.5">
                        {patient.phone ?? "Sin teléfono"}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-muted-foreground hidden sm:table-cell whitespace-nowrap">{patient.phone ?? "—"}</td>
                    <td className="px-4 py-4 text-sm text-muted-foreground hidden md:table-cell whitespace-nowrap">{patient.email ?? "—"}</td>
                    <td className="px-3 md:px-4 py-4">
                      <Badge variant="outline" className={`text-[10px] border px-1.5 py-0.5 font-medium ${src.className}`}>{src.label}</Badge>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground hidden lg:table-cell whitespace-nowrap">
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
        <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-card border-border">
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

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm(); }}>
        <DialogContent className="w-[95vw] max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Nuevo paciente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Nombre completo *</Label>
              <Input
                value={newPatient.full_name}
                onChange={(e) => setNewPatient((p) => ({ ...p, full_name: e.target.value }))}
                placeholder="Ej. Ana García López"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Teléfono</Label>
              <Input
                value={newPatient.phone}
                onChange={(e) => setNewPatient((p) => ({ ...p, phone: e.target.value }))}
                placeholder="5512345678"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Email</Label>
              <Input
                type="email"
                value={newPatient.email}
                onChange={(e) => setNewPatient((p) => ({ ...p, email: e.target.value }))}
                placeholder="paciente@correo.com"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Notas</Label>
              <Textarea
                value={newPatient.notes}
                onChange={(e) => setNewPatient((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
                placeholder="Alergias, observaciones..."
                className="text-sm resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setCreateOpen(false); resetCreateForm(); }}
                className="h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={isCreating || !newPatient.full_name.trim()}
                className="h-9 text-xs px-4 font-semibold bg-foreground text-background"
              >
                {isCreating ? "Creando..." : "Crear paciente"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
