"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, MessageSquare, Clock, UserPlus, Save, Info, Trash2, User } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Clinic, StaffMember } from "@/types/database";

interface SettingsClientProps {
  clinic: Clinic | null;
  staff: StaffMember[];
  currentUserId: string;
  isAdmin: boolean;
}

export function SettingsClient({ clinic: initialClinic, staff: initialStaff, currentUserId, isAdmin }: SettingsClientProps) {
  const router = useRouter();
  const [clinic, setClinic] = useState<Clinic | null>(initialClinic);
  const [staffList, setStaffList] = useState<StaffMember[]>(initialStaff);

  // Clinic edit
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    name: initialClinic?.name ?? "",
    phone: initialClinic?.phone ?? "",
    email: initialClinic?.email ?? "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Staff add
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const emptyNewStaff = { full_name: "", email: "", password: "", role: "staff" as "admin" | "staff" };
  const [newStaff, setNewStaff] = useState(emptyNewStaff);
  const [isAddingStaff, setIsAddingStaff] = useState(false);

  // Staff edit/delete
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isEditingStaff, setIsEditingStaff] = useState(false);
  const [isSavingStaff, setIsSavingStaff] = useState(false);
  const [isDeletingStaff, setIsDeletingStaff] = useState(false);

  // Business hours (still local state — no DB column yet)
  const [businessHours, setBusinessHours] = useState([
    { day: "Lunes",    open: "09:00", close: "18:00", active: true },
    { day: "Martes",   open: "09:00", close: "18:00", active: true },
    { day: "Miércoles", open: "09:00", close: "18:00", active: true },
    { day: "Jueves",   open: "09:00", close: "18:00", active: true },
    { day: "Viernes",  open: "09:00", close: "18:00", active: true },
    { day: "Sábado",   open: "10:00", close: "14:00", active: true },
    { day: "Domingo",  open: "00:00", close: "00:00", active: false },
  ]);

  const handleSaveClinic = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/clinic", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editValues),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.error ?? "Error al guardar");
        return;
      }
      const updated = await res.json() as Clinic;
      setClinic(updated);
      setIsEditing(false);
      toast.success("Clínica actualizada");
      router.refresh();
    } catch {
      setSaveError("Error inesperado");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddStaff = async () => {
    if (!newStaff.full_name.trim() || !newStaff.email.trim() || !newStaff.password) {
      toast.error("Nombre, email y contraseña son requeridos");
      return;
    }
    if (newStaff.password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setIsAddingStaff(true);
    try {
      const res = await fetch("/api/clinic/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newStaff),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Error al crear miembro");
        return;
      }
      const created = await res.json() as StaffMember;
      setStaffList((list) => [...list, created]);
      setNewStaff(emptyNewStaff);
      setIsStaffModalOpen(false);
      toast.success("Miembro agregado al equipo");
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setIsAddingStaff(false);
    }
  };

  const handleUpdateStaff = async () => {
    if (!selectedStaff) return;
    setIsSavingStaff(true);
    try {
      const res = await fetch(`/api/clinic/staff/${selectedStaff.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: selectedStaff.full_name,
          role: selectedStaff.role,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Error al actualizar");
        return;
      }
      const updated = await res.json() as StaffMember;
      setStaffList((list) => list.map((s) => (s.id === updated.id ? updated : s)));
      setSelectedStaff(updated);
      setIsEditingStaff(false);
      toast.success("Información actualizada");
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setIsSavingStaff(false);
    }
  };

  const handleDeleteStaff = async () => {
    if (!selectedStaff) return;
    if (!confirm(`¿Eliminar a "${selectedStaff.full_name}" del equipo? Esta acción no se puede deshacer.`)) return;
    setIsDeletingStaff(true);
    try {
      const res = await fetch(`/api/clinic/staff/${selectedStaff.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Error al eliminar");
        return;
      }
      setStaffList((list) => list.filter((s) => s.id !== selectedStaff.id));
      setIsSheetOpen(false);
      setSelectedStaff(null);
      toast.success("Miembro eliminado");
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setIsDeletingStaff(false);
    }
  };

  if (!clinic) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No se pudo cargar la información de la clínica.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Ajustes de la clínica</p>
      </div>

      <Tabs defaultValue="clinic" className="space-y-6">
        <div className="w-full overflow-x-auto pb-1 no-scrollbar">
          <TabsList className="inline-flex h-9 w-full sm:w-auto items-center justify-start gap-1 bg-muted p-1 min-w-max">
            <TabsTrigger value="clinic" className="text-[10px] sm:text-xs h-7 gap-1.5 px-3"><Info className="w-3.5 h-3.5" /> Clínica</TabsTrigger>
            <TabsTrigger value="staff"  className="text-[10px] sm:text-xs h-7 gap-1.5 px-3"><UserPlus className="w-3.5 h-3.5" /> Miembros</TabsTrigger>
            <TabsTrigger value="whatsapp" className="text-[10px] sm:text-xs h-7 gap-1.5 px-3"><MessageSquare className="w-3.5 h-3.5" /> WhatsApp</TabsTrigger>
            <TabsTrigger value="hours" className="text-[10px] sm:text-xs h-7 gap-1.5 px-3"><Clock className="w-3.5 h-3.5" /> Horarios</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="clinic" className="space-y-5 mt-0">
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            {isEditing ? (
              <>
                {[
                  { key: "name",  label: "Nombre de la clínica" },
                  { key: "phone", label: "Teléfono" },
                  { key: "email", label: "Email" },
                ].map(({ key, label }) => (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-xs font-medium">{label}</Label>
                    <Input
                      value={editValues[key as keyof typeof editValues]}
                      onChange={(e) => setEditValues((v) => ({ ...v, [key]: e.target.value }))}
                      className="h-9 text-sm"
                    />
                  </div>
                ))}
                {saveError && <p className="text-xs text-red-500">{saveError}</p>}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={handleSaveClinic} disabled={isSaving} className="h-8 text-xs font-semibold bg-foreground text-background">
                    {isSaving ? "Guardando..." : "Guardar"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setIsEditing(false); setSaveError(null); }} className="h-8 text-xs">
                    Cancelar
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {[
                    { label: "Nombre",   value: clinic.name },
                    { label: "Plan",     value: clinic.plan },
                    { label: "Teléfono", value: clinic.phone ?? "—" },
                    { label: "Email",    value: clinic.email ?? "—" },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
                      <p className="text-sm text-foreground mt-1 font-medium">{value}</p>
                    </div>
                  ))}
                </div>
                {isAdmin && (
                  <Button
                    size="sm" variant="outline"
                    onClick={() => {
                      setEditValues({ name: clinic.name, phone: clinic.phone ?? "", email: clinic.email ?? "" });
                      setIsEditing(true);
                    }}
                    className="h-8 text-xs mt-2"
                  >
                    Editar información
                  </Button>
                )}
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="staff" className="space-y-4 mt-0">
          {isAdmin && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setIsStaffModalOpen(true)} className="h-8 text-xs gap-1.5 bg-foreground text-background">
                <Plus className="w-3.5 h-3.5" />
                Nuevo miembro
              </Button>
            </div>
          )}

          <div className="bg-card border border-border rounded-lg overflow-hidden overflow-x-auto">
            {staffList.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Sin miembros en el equipo</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Nombre</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Email</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Rol</th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.map((member) => (
                    <tr
                      key={member.id}
                      onClick={() => { setSelectedStaff(member); setIsSheetOpen(true); setIsEditingStaff(false); }}
                      className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-foreground">
                        {member.full_name}
                        {member.id === currentUserId && <span className="text-[10px] text-muted-foreground ml-2">(tú)</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">{member.email}</td>
                      <td className="px-4 py-3 text-right">
                        <Badge
                          variant="outline"
                          className={member.role === "admin"
                            ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 text-[10px]"
                            : "bg-muted text-muted-foreground border-border text-[10px]"
                          }
                        >
                          {member.role === "admin" ? "Admin" : "Staff"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="whatsapp" className="space-y-4 mt-0">
          <div className="bg-card border border-border rounded-lg p-12 flex flex-col items-center justify-center gap-2 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground/60" />
            <p className="text-sm font-semibold text-foreground">Próximamente</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              La integración con WhatsApp estará disponible pronto.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="hours" className="space-y-4 mt-0">
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="space-y-1 mb-6">
              <h3 className="text-sm font-semibold text-foreground">Horarios de Atención</h3>
              <p className="text-xs text-muted-foreground">Define los días y horas en los que la clínica está operativa. (Persistencia pendiente de implementar)</p>
            </div>

            <div className="space-y-4">
              {businessHours.map((h, i) => (
                <div key={h.day} className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3 w-28">
                    <input
                      type="checkbox"
                      checked={h.active}
                      onChange={(e) => {
                        const newHours = [...businessHours];
                        newHours[i].active = e.target.checked;
                        setBusinessHours(newHours);
                      }}
                      className="w-4 h-4 accent-foreground"
                    />
                    <span className={cn("text-xs font-medium", !h.active && "text-muted-foreground line-through")}>
                      {h.day}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={h.open}
                      disabled={!h.active}
                      onChange={(e) => {
                        const newHours = [...businessHours];
                        newHours[i].open = e.target.value;
                        setBusinessHours(newHours);
                      }}
                      className="h-8 text-[10px] w-24"
                    />
                    <span className="text-muted-foreground text-[10px]">a</span>
                    <Input
                      type="time"
                      value={h.close}
                      disabled={!h.active}
                      onChange={(e) => {
                        const newHours = [...businessHours];
                        newHours[i].close = e.target.value;
                        setBusinessHours(newHours);
                      }}
                      className="h-8 text-[10px] w-24"
                    />
                  </div>
                </div>
              ))}
            </div>

            <Button size="sm" className="h-8 text-xs gap-1.5 mt-6 bg-foreground text-background">
              <Save className="w-3.5 h-3.5" />
              Guardar horarios
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Staff detail / edit sheet */}
      <Sheet open={isSheetOpen} onOpenChange={(o) => { setIsSheetOpen(o); if (!o) setIsEditingStaff(false); }}>
        <SheetContent className="w-full sm:max-w-md bg-card border-border overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-base font-bold">Detalle del Miembro</SheetTitle>
          </SheetHeader>

          {selectedStaff && (
            <div className="mt-8 space-y-6">
              <div className="flex flex-col items-center text-center gap-2">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                  <User className="w-8 h-8 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-lg text-foreground">{selectedStaff.full_name}</h3>
                  <Badge variant="outline" className="capitalize">{selectedStaff.role}</Badge>
                </div>
              </div>

              <div className="space-y-4 border-t border-border pt-6">
                {isEditingStaff ? (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Nombre completo</Label>
                      <Input
                        value={selectedStaff.full_name}
                        onChange={(e) => setSelectedStaff({ ...selectedStaff, full_name: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Email</Label>
                      <Input
                        value={selectedStaff.email}
                        disabled
                        className="h-9 text-sm opacity-60"
                      />
                      <p className="text-[10px] text-muted-foreground">El email no se puede cambiar desde aquí</p>
                    </div>
                    {isAdmin && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Rol</Label>
                        <Select
                          value={selectedStaff.role}
                          onValueChange={(v) => setSelectedStaff({ ...selectedStaff, role: v as "admin" | "staff" })}
                          disabled={selectedStaff.id === currentUserId}
                        >
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="staff">Staff</SelectItem>
                            <SelectItem value="admin">Administrador</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        onClick={handleUpdateStaff}
                        disabled={isSavingStaff}
                        className="flex-1 h-9 text-xs bg-foreground text-background"
                      >
                        {isSavingStaff ? "Guardando..." : "Guardar cambios"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setIsEditingStaff(false)} className="h-9 text-xs">
                        Cancelar
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">Email</p>
                        <p className="text-sm text-foreground mt-0.5 break-all">{selectedStaff.email}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">Rol</p>
                        <p className="text-sm text-foreground mt-0.5 capitalize">{selectedStaff.role}</p>
                      </div>
                    </div>

                    {(isAdmin || selectedStaff.id === currentUserId) && (
                      <div className="flex flex-col gap-2 pt-4">
                        <Button size="sm" variant="outline" onClick={() => setIsEditingStaff(true)} className="h-9 text-xs gap-2">
                          <Info className="w-3.5 h-3.5" /> Editar información
                        </Button>
                        {isAdmin && selectedStaff.id !== currentUserId && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleDeleteStaff}
                            disabled={isDeletingStaff}
                            className="h-9 text-xs gap-2 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {isDeletingStaff ? "Eliminando..." : "Eliminar del equipo"}
                          </Button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* New staff dialog */}
      <Dialog open={isStaffModalOpen} onOpenChange={(open) => { setIsStaffModalOpen(open); if (!open) setNewStaff(emptyNewStaff); }}>
        <DialogContent className="w-[95vw] max-w-sm bg-card border-border p-5 rounded-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Agregar miembro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Nombre completo *</Label>
              <Input
                value={newStaff.full_name}
                onChange={(e) => setNewStaff((v) => ({ ...v, full_name: e.target.value }))}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Email *</Label>
              <Input
                type="email"
                value={newStaff.email}
                onChange={(e) => setNewStaff((v) => ({ ...v, email: e.target.value }))}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Contraseña temporal *</Label>
              <Input
                type="password"
                value={newStaff.password}
                onChange={(e) => setNewStaff((v) => ({ ...v, password: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
                className="h-9 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Compártela con el miembro; podrá cambiarla después.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Rol</Label>
              <Select value={newStaff.role} onValueChange={(v) => setNewStaff((p) => ({ ...p, role: v as "admin" | "staff" }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={handleAddStaff} disabled={isAddingStaff} className="flex-1 h-9 text-xs bg-foreground text-background">
                {isAddingStaff ? "Agregando..." : "Agregar al equipo"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setIsStaffModalOpen(false); setNewStaff(emptyNewStaff); }} className="h-9 text-xs">
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
