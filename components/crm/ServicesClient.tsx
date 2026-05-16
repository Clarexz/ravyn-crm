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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Servicios</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Catálogo de servicios y precios de la clínica</p>
        </div>
        <Button
          size="sm"
          onClick={openCreate}
          className="h-9 gap-2 bg-foreground text-background hover:bg-foreground/90 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nuevo servicio</span>
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar servicios..."
          className="pl-9 h-9 text-sm"
        />
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {services.length === 0 ? "Aún no has dado de alta servicios" : "No se encontraron servicios"}
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Servicio</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Descripción</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Costo</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Estado</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider w-32">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 text-sm font-semibold text-foreground whitespace-nowrap">
                    <span className="inline-flex items-center gap-2.5">
                      <span
                        className="w-3 h-3 rounded-full shrink-0 ring-1 ring-border"
                        style={{ backgroundColor: s.color ?? DEFAULT_COLOR }}
                        aria-hidden
                      />
                      {s.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell max-w-md truncate">
                    {s.description || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-foreground text-right whitespace-nowrap">
                    {formatCost(s.cost)}
                  </td>
                  <td className="px-4 py-3">
                    {s.active ? (
                      <Badge variant="outline" className="text-[10px] border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        Activo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-border bg-muted text-muted-foreground">
                        Inactivo
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(s)}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(s.id, s.name)}
                        disabled={deletingId === s.id}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} servicio{filtered.length !== 1 ? "s" : ""}</p>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="w-[95vw] max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {editingId ? "Editar servicio" : "Nuevo servicio"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Nombre *</Label>
              <Input
                value={values.name}
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                placeholder="Ej. Limpieza dental"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Descripción</Label>
              <Textarea
                value={values.description}
                onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
                rows={3}
                placeholder="Detalles, qué incluye, duración aproximada..."
                className="text-sm resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Costo (MXN) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={values.cost}
                onChange={(e) => setValues((v) => ({ ...v, cost: e.target.value }))}
                placeholder="0.00"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-2">
                Color
                <span
                  className="w-4 h-4 rounded-full ring-1 ring-border"
                  style={{ backgroundColor: values.color }}
                  aria-hidden
                />
              </Label>
              <div className="grid grid-cols-10 gap-1.5">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setValues((v) => ({ ...v, color: c }))}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                    className={`w-6 h-6 rounded-full transition-all ${
                      values.color.toLowerCase() === c.toLowerCase()
                        ? "ring-2 ring-offset-2 ring-offset-card ring-foreground scale-110"
                        : "ring-1 ring-border hover:scale-110"
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Label className="text-[11px] text-muted-foreground">Personalizado:</Label>
                <input
                  type="color"
                  value={values.color}
                  onChange={(e) => setValues((v) => ({ ...v, color: e.target.value }))}
                  className="h-7 w-12 rounded cursor-pointer border border-border bg-transparent"
                />
                <span className="text-[11px] font-mono text-muted-foreground">{values.color.toUpperCase()}</span>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={values.active}
                onChange={(e) => setValues((v) => ({ ...v, active: e.target.checked }))}
                className="w-4 h-4 rounded border-border"
              />
              Servicio activo (disponible para nuevas citas)
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setDialogOpen(false); resetForm(); }}
                className="h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !values.name.trim()}
                className="h-9 text-xs px-4 font-semibold bg-foreground text-background"
              >
                {isSaving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear servicio"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
