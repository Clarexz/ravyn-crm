"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Patient } from "@/types/database";

const SOURCE_CONFIG: Record<Patient["source"], { label: string; className: string }> = {
  whatsapp: { label: "WhatsApp", className: "bg-[var(--state-confirmed-bg)] text-[var(--state-confirmed-text)]" },
  web:      { label: "Web",      className: "bg-blue-500/15 text-blue-600" },
  manual:   { label: "Manual",   className: "bg-[#F1F5F9] text-[#64748B] border border-slate-200 dark:bg-white/10 dark:text-white/40 dark:border-none" },
};

interface EditablePatient { full_name: string; phone: string; email: string; notes: string }

export default function PatientsClient({ patients }: { patients: Patient[] }) {
  const router = useRouter();
  const [search, setSearch]                 = useState("");
  const [sourceFilter, setSourceFilter]     = useState<string>("all");

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
      if (!res.ok) {
        toast.error("Error al crear paciente");
        return;
      }
      toast.success("Paciente creado");
      resetCreateForm();
      setCreateOpen(false);
      router.refresh();
    } catch {
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

  const getAvatarStyle = (char: string) => {
    const upper = char.toUpperCase();
    if (upper === 'J') return "bg-blue-50 text-blue-600 border-blue-100 dark:bg-[#1E3A5F] dark:text-[#38BDF8] dark:border-none";
    if (upper === 'A') return "bg-purple-50 text-purple-600 border-purple-100 dark:bg-[#3D1F5F] dark:text-purple-300 dark:border-none";
    if (upper === 'C') return "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-[#1F3D2A] dark:text-[#6EE7B7] dark:border-none";
    if (upper === 'S') return "bg-orange-50 text-orange-600 border-orange-100 dark:bg-[#3D2A1F] dark:text-orange-300 dark:border-none";
    return "bg-[var(--bg-page)] text-[var(--brand-accent)] border-[var(--border-default)]";
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">Directorio de Pacientes</h1>
          <p className="text-sm text-[var(--text-secondary)] font-semibold mt-1">Base de datos centralizada de la clínica</p>
        </div>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          className="h-10 gap-2 bg-[var(--brand-accent)] text-white hover:opacity-90 shrink-0 font-black text-[10px] uppercase tracking-widest px-6 rounded-xl shadow-lg shadow-blue-500/20"
        >
          <Plus className="w-4 h-4 text-white" />
          <span className="hidden sm:inline">Nuevo registro</span>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, teléfono o email..."
            className="pl-11 h-12 text-sm w-full bg-[var(--bg-input)] border-[var(--border-default)] rounded-2xl shadow-sm focus:ring-[var(--brand-accent)] text-[var(--text-primary)] transition-all"
          />
        </div>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="h-12 text-xs font-bold w-full sm:w-44 bg-[var(--bg-input)] border-[var(--border-default)] rounded-2xl shadow-sm text-[var(--text-primary)] transition-all">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent className="rounded-2xl border-[var(--border-default)] bg-[var(--bg-surface)]">
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="web">Web</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-[32px] py-24 text-center shadow-sm transition-all">
            <p className="text-sm text-[var(--text-secondary)] font-black uppercase tracking-widest opacity-40">
              {search.length >= 2 ? "No se encontraron resultados" : "Aún no tienes pacientes"}
            </p>
          </div>
        ) : (
          filtered.map((patient) => {
            const src = SOURCE_CONFIG[patient.source];
            return (
              <div
                key={patient.id}
                onClick={() => router.push(`/patients/${patient.id}`)}
                className="bg-[var(--bg-card)] border-b border-[var(--border-default)] dark:border-white/5 md:rounded-[24px] md:border p-6 flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer group shadow-sm"
              >
                <div className="flex items-center gap-6 min-w-0">
                  <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border group-hover:scale-110 transition-all shadow-inner", getAvatarStyle(patient.full_name.charAt(0)))}>
                    <span className="text-base font-black uppercase">{patient.full_name.charAt(0)}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-black text-[var(--text-primary)] truncate leading-none">{patient.full_name}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                      <p className={cn("text-[10px] font-bold uppercase tracking-wider transition-all text-[var(--text-secondary)] selectable", !patient.phone && "opacity-30 dark:opacity-35")}>
                        {patient.phone ?? "Sin teléfono"}
                      </p>
                      <span className="w-1 h-1 rounded-full bg-[var(--text-muted)] opacity-20 hidden sm:block" />
                      <p className={cn("text-[10px] font-bold uppercase tracking-wider hidden md:block transition-all text-[var(--text-secondary)] selectable", !patient.email && "opacity-30 dark:opacity-35")}>
                        {patient.email ?? "Sin correo"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right hidden lg:block">
                    <p className="text-[9px] font-black text-[var(--text-secondary)] uppercase tracking-widest opacity-60">Registrado</p>
                    <p className="text-[10px] font-bold text-[var(--text-primary)] mt-0.5">{format(new Date(patient.created_at), "d MMM yyyy", { locale: es })}</p>
                  </div>
                  <Badge variant="outline" className={cn("text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter border-none shadow-sm", src.className)}>{src.label}</Badge>
                  <ChevronRight className="w-5 h-5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-all" />
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between px-4">
        <p className="text-[9px] font-medium text-[var(--text-muted)] lowercase opacity-40 italic">
          {filtered.length} registros en el directorio
        </p>
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm(); }}>
        <DialogContent className="w-[95vw] max-w-lg bg-[var(--bg-surface)] border-none shadow-2xl rounded-[40px] p-10 transition-colors">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-xl font-black text-[var(--text-primary)] uppercase tracking-tighter">Registrar Nuevo Paciente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest">Nombre completo *</Label>
              <Input
                value={newPatient.full_name}
                onChange={(e) => setNewPatient((p) => ({ ...p, full_name: e.target.value }))}
                placeholder="Ej. Ana García López"
                className="h-12 text-sm bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl font-bold px-5 text-[var(--text-primary)] transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest">Teléfono</Label>
              <Input
                value={newPatient.phone}
                onChange={(e) => setNewPatient((p) => ({ ...p, phone: e.target.value }))}
                placeholder="5512345678"
                className="h-12 text-sm bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl font-bold px-5 text-[var(--text-primary)] transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest">Email</Label>
              <Input
                type="email"
                value={newPatient.email}
                onChange={(e) => setNewPatient((p) => ({ ...p, email: e.target.value }))}
                placeholder="paciente@correo.com"
                className="h-12 text-sm bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl font-bold px-5 text-[var(--text-primary)] transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest">Notas Clínicas</Label>
              <Textarea
                value={newPatient.notes}
                onChange={(e) => setNewPatient((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
                placeholder="Alergias, observaciones, historial relevante..."
                className="text-sm bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl font-medium px-5 py-4 resize-none text-[var(--text-primary)] transition-all"
              />
            </div>
            <div className="flex justify-end gap-3 pt-6 border-t border-[var(--border-default)] mt-4">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setCreateOpen(false); resetCreateForm(); }}
                className="h-12 text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10 rounded-2xl transition-all"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={isCreating || !newPatient.full_name.trim()}
                className="h-12 px-8 text-[11px] font-black uppercase tracking-widest bg-[var(--brand-accent)] text-white rounded-2xl shadow-lg shadow-blue-500/20 transition-all hover:opacity-90"
              >
                {isCreating ? "Registrando..." : "Crear Registro"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
