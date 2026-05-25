"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Service } from "@/types/database";

const formatCost = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(n);

const DEFAULT_COLOR = "#6366f1";

const COLOR_PRESETS = [
  "#64748b", "#6b7280", "#78716c", "#ef4444", "#f97316",
  "#f59e0b", "#eab308", "#84cc16", "#22c55e", "#10b981",
  "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
];

interface EditableService {
  name: string;
  description: string;
  cost: string;
  color: string;
  active: boolean;
}

const emptyService = (): EditableService => ({
  name: "",
  description: "",
  cost: "",
  color: DEFAULT_COLOR,
  active: true,
});

export function ServicesClient({ services }: { services: Service[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [values, setValues] = useState<EditableService>(emptyService());
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (search.length < 1) return services;
    const q = search.toLowerCase();
    return services.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q),
    );
  }, [services, search]);

  const resetForm = () => {
    setValues(emptyService());
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (s: Service) => {
    setValues({
      name: s.name,
      description: s.description ?? "",
      cost: String(s.cost),
      color: s.color ?? DEFAULT_COLOR,
      active: s.active,
    });
    setEditingId(s.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!values.name.trim()) {
      toast.error("El nombre es requerido");
      return;
    }
    const costNum = parseFloat(values.cost);
    if (isNaN(costNum) || costNum < 0) {
      toast.error("Costo inválido");
      return;
    }

    setIsSaving(true);
    try {
      const url = editingId ? `/api/services/${editingId}` : "/api/services";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          description: values.description,
          cost: costNum,
          color: values.color,
          active: values.active,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Error al guardar servicio");
        return;
      }

      toast.success(editingId ? "Servicio actualizado" : "Servicio creado");
      setDialogOpen(false);
      resetForm();
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar el servicio "${name}"? Las citas pasadas conservarán el costo original.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/services/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Error al eliminar");
        return;
      }
      toast.success("Servicio eliminado");
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-8 w-full">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight transition-colors">Catálogo de Servicios</h1>
          <p className="text-sm text-[var(--text-secondary)] font-semibold mt-1 transition-colors">Gestión de tratamientos, costos y colores</p>
        </div>
        <Button
          size="sm"
          onClick={openCreate}
          className="h-10 gap-2 bg-[var(--brand-accent)] text-white hover:opacity-90 shrink-0 font-black text-[10px] uppercase tracking-widest px-6 rounded-xl shadow-lg shadow-blue-500/20"
        >
          <Plus className="w-4 h-4 text-white" />
          <span className="hidden sm:inline">Nuevo servicio</span>
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar servicios por nombre o descripción..."
          className="pl-11 h-12 text-sm w-full bg-[var(--bg-input)] border-[var(--border-default)] rounded-2xl shadow-sm focus:ring-[var(--brand-accent)] text-[var(--text-primary)] transition-all"
        />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-[32px] py-24 text-center shadow-sm transition-all">
            <p className="text-sm text-[var(--text-secondary)] font-black uppercase tracking-widest opacity-40">
              {services.length === 0 ? "Aún no tienes servicios configurados" : "Sin resultados para tu búsqueda"}
            </p>
          </div>
        ) : (
          filtered.map((s) => (
            <div
              key={s.id}
              className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-[24px] p-6 flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-all group shadow-sm"
            >
              <div className="flex items-center gap-6 min-w-0">
                <div 
                  className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 border-2 border-[var(--bg-surface)] shadow-md group-hover:scale-110 transition-transform"
                  style={{ backgroundColor: `${s.color ?? DEFAULT_COLOR}20` }}
                >
                  <span className="text-base font-black uppercase" style={{ color: s.color ?? DEFAULT_COLOR }}>
                    {s.name.charAt(0)}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-black text-[var(--text-primary)] truncate transition-colors leading-none">{s.name}</p>
                  {s.description && s.description.toLowerCase() !== s.name.toLowerCase() && (
                    <p className="text-[10px] text-[#94A3B8] font-bold mt-2 lowercase first-letter:uppercase tracking-wider line-clamp-1 max-w-xl">
                      {s.description}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-8">
                <div className="text-right">
                  <p className="text-[9px] font-black text-[var(--text-secondary)] uppercase tracking-widest opacity-60">Costo Base</p>
                  <p className="text-lg font-black text-[var(--text-primary)] mt-0.5 tabular-nums transition-colors">{formatCost(s.cost)}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {s.active ? (
                    <Badge variant="outline" className="text-[10px] font-black border-none bg-[#EFF6FF] text-[#0284C7] dark:bg-[var(--state-confirmed-bg)] dark:text-[var(--state-confirmed-text)] px-3 py-1 rounded-full lowercase first-letter:uppercase tracking-tighter shadow-sm">
                      Activo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] font-black border-none bg-[var(--bg-page)] text-[var(--text-muted)] px-3 py-1 rounded-full lowercase first-letter:uppercase tracking-tighter">
                      Inactivo
                    </Badge>
                  )}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(s)}
                      className="h-8 w-8 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] rounded-lg"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(s.id, s.name)}
                      disabled={deletingId === s.id}
                      className="h-8 w-8 text-[var(--text-secondary)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-4">
        <p className="text-[9px] font-medium text-[var(--text-muted)] lowercase italic transition-colors">
          {filtered.length} {filtered.length === 1 ? "servicio disponible" : "servicios disponibles"}
        </p>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="w-[95vw] max-w-lg bg-[var(--bg-surface)] border-none shadow-2xl rounded-[40px] p-10 transition-colors">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-xl font-black text-[var(--text-primary)] uppercase tracking-tighter transition-colors">
              {editingId ? "Actualizar Servicio" : "Nuevo Tratamiento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest transition-colors">Nombre del servicio</Label>
              <Input
                value={values.name}
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                placeholder="Ej. Limpieza dental"
                className="h-12 text-sm bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl font-bold px-5 text-[var(--text-primary)] transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest transition-colors">Descripción</Label>
              <Textarea
                value={values.description}
                onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
                rows={3}
                placeholder="Detalles del tratamiento..."
                className="text-sm bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl font-medium px-5 py-4 resize-none text-[var(--text-primary)] transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest transition-colors">Costo (MXN)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={values.cost}
                onChange={(e) => setValues((v) => ({ ...v, cost: e.target.value }))}
                placeholder="0.00"
                className="h-12 text-sm bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl font-black px-5 text-[var(--text-primary)] transition-colors"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest transition-colors">Paleta de color</Label>
              <div className="grid grid-cols-10 gap-2">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setValues((v) => ({ ...v, color: c }))}
                    style={{ backgroundColor: c }}
                    className={cn("w-6 h-6 rounded-full transition-all ring-offset-2", values.color.toLowerCase() === c.toLowerCase() ? "ring-2 ring-[var(--sidebar-bg)] scale-125 shadow-md" : "hover:scale-110")}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-[var(--border-default)] mt-4">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setDialogOpen(false); resetForm(); }}
                className="h-12 text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10 rounded-2xl transition-all"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !values.name.trim()}
                className="h-12 px-8 text-[11px] font-black uppercase tracking-widest bg-[var(--brand-accent)] text-white rounded-2xl shadow-lg shadow-blue-500/20 transition-all hover:opacity-90"
              >
                {isSaving ? "Guardando..." : editingId ? "Actualizar" : "Crear Servicio"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
