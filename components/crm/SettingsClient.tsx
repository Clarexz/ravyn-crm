"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, MessageSquare, Clock, UserPlus, Save, Info, Trash2, User, ChevronRight } from "lucide-react";
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
      <div className="py-12 text-center text-sm text-[var(--text-secondary)]">
        No se pudo cargar la información de la clínica.
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight transition-colors">Configuración Clínica</h1>
        <p className="text-sm text-[var(--text-secondary)] font-semibold mt-1 transition-colors">Personalización y gestión operativa</p>
      </div>

      <Tabs defaultValue="clinic" className="space-y-8">
        <div className="w-full overflow-x-auto pb-1 no-scrollbar">
          <TabsList className="inline-flex h-12 w-full sm:w-auto items-center justify-start gap-2 bg-[var(--bg-card)] dark:bg-[#1E2D3D] border border-[var(--border-default)] dark:border-white/5 p-1.5 min-w-max rounded-2xl shadow-sm transition-all">
            {[
              { id: "clinic", label: "Clínica", icon: Info },
              { id: "staff", label: "Equipo", icon: UserPlus },
              { id: "whatsapp", label: "WhatsApp", icon: MessageSquare },
              { id: "hours", label: "Horarios", icon: Clock }
            ].map((tab) => (
              <TabsTrigger 
                key={tab.id}
                value={tab.id} 
                className={cn(
                  "rounded-xl text-[11px] font-bold h-9 gap-2 px-6 transition-all",
                  "data-[state=active]:bg-[#0284C7] data-[state=active]:text-white",
                  "dark:data-[state=active]:bg-[rgba(2,132,199,0.15)] dark:data-[state=active]:text-[#38BDF8] dark:data-[state=active]:border-b-2 dark:data-[state=active]:border-[#0284C7] dark:data-[state=active]:rounded-b-none",
                  "text-[var(--text-secondary)]"
                )}
              >
                <tab.icon className="w-4 h-4" /> {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="clinic" className="space-y-6 mt-0">
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] dark:border-white/5 rounded-[32px] p-10 shadow-sm max-w-4xl relative overflow-hidden transition-all">
            <div className="flex items-start justify-between mb-8 transition-all">
              <div>
                <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight transition-colors">Información general</h2>
                <p className="text-sm text-[var(--text-secondary)] font-medium mt-1 transition-colors">Identidad pública de tu consultorio</p>
              </div>
              {!isEditing && isAdmin && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    setEditValues({ name: clinic.name, phone: clinic.phone ?? "", email: clinic.email ?? "" });
                    setIsEditing(true);
                  }} 
                  className={cn(
                    "h-10 text-[11px] font-bold px-6 rounded-xl transition-all shadow-sm",
                    "border-[var(--border-default)] bg-[var(--bg-page)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]",
                    "dark:border-white/15 dark:bg-[#0A1628] dark:hover:bg-white/5"
                  )}
                >
                  Editar datos
                </Button>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-6">
                {[
                  { key: "name",  label: "Nombre de la clínica" },
                  { key: "phone", label: "Teléfono de contacto" },
                  { key: "email", label: "Email oficial" },
                ].map(({ key, label }) => (
                  <div key={key} className="space-y-2">
                    <Label className="text-sm font-medium text-[var(--text-secondary)] transition-colors">{label}</Label>
                    <Input
                      value={editValues[key as keyof typeof editValues]}
                      onChange={(e) => setEditValues((v) => ({ ...v, [key]: e.target.value }))}
                      className="h-12 text-sm bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl font-bold px-5 text-[var(--text-primary)] transition-all"
                    />
                  </div>
                ))}
                {saveError && <p className="text-xs text-[var(--destructive)] font-black uppercase">{saveError}</p>}
                <div className="flex gap-3 pt-6 border-t border-[var(--border-default)] mt-4 transition-colors">
                  <Button 
                    size="sm" 
                    onClick={handleSaveClinic} 
                    disabled={isSaving} 
                    className="h-12 px-8 text-[11px] font-black uppercase tracking-widest bg-[#0284C7] text-white rounded-2xl shadow-lg shadow-blue-500/20 transition-all"
                  >
                    {isSaving ? "Guardando..." : "Confirmar Cambios"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setIsEditing(false); setSaveError(null); }} className="h-12 text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10 rounded-2xl transition-all">
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 transition-all">
                {[
                  { label: "Nombre comercial", value: clinic.name },
                  { label: "Nivel de plan",     value: "Basic", badge: true },
                  { label: "Línea directa",     value: clinic.phone ?? "No registrado" },
                  { label: "Correo de soporte", value: clinic.email ?? "No registrado" },
                ].map(({ label, value, badge }) => (
                  <div key={label} className="space-y-1 transition-all">
                    <p className="text-sm font-medium text-[var(--text-secondary)] transition-colors">{label}</p>
                    {badge ? (
                      <div className="pt-1">
                        <Badge className="bg-[#EFF6FF] text-[#0284C7] dark:bg-emerald-500/20 dark:text-emerald-400 border-none px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">
                          {value}
                        </Badge>
                      </div>
                    ) : (
                      <p className="text-base font-bold text-[var(--text-primary)] transition-colors">{value}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {/* Decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--bg-page)] dark:bg-white/5 rounded-bl-[100px] -mr-10 -mt-10 opacity-30 pointer-events-none transition-colors" />
          </div>

          {/* Filling Empty Space Sections */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
             {[
               { title: "Gestión de equipo", desc: "Configura roles y permisos", icon: UserPlus, status: "Configurado" },
               { title: "WhatsApp Business", desc: "Automatiza recordatorios", icon: MessageSquare, status: "Por configurar" },
               { title: "Horarios operativos", desc: "Define disponibilidad semanal", icon: Clock, status: "Configurado" },
             ].map((card) => (
               <div key={card.title} className="bg-[var(--bg-card)] border border-[var(--border-default)] dark:border-white/5 p-6 rounded-3xl opacity-60 hover:opacity-100 transition-all cursor-pointer group">
                  <card.icon className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[#0284C7] mb-4 transition-colors" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text-primary)] mb-1">{card.title}</h3>
                  <p className="text-[10px] text-[var(--text-secondary)] font-medium mb-4">{card.desc}</p>
                  <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-tighter rounded-full border-[var(--border-default)]">{card.status}</Badge>
               </div>
             ))}
          </div>
        </TabsContent>

        <TabsContent value="staff" className="space-y-6 mt-0">
          {/* Staff Content remains here */}
          <div className="flex items-center justify-between transition-all">
            <h2 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-widest transition-colors">Gestión de equipo</h2>
            {isAdmin && (
              <Button size="sm" onClick={() => setIsStaffModalOpen(true)} className="h-10 gap-2 bg-[#0284C7] text-white rounded-xl font-black text-[10px] uppercase tracking-widest px-6 shadow-lg shadow-blue-500/20 transition-all">
                <Plus className="w-4 h-4 text-white" />
                Añadir Miembro
              </Button>
            )}
          </div>

          <div className="space-y-3 transition-all">
            {staffList.length === 0 ? (
              <div className="bg-[var(--bg-card)] border border-[var(--border-default)] dark:border-white/5 rounded-[32px] py-20 text-center shadow-sm transition-all">
                <p className="text-sm text-[var(--text-secondary)] font-black uppercase tracking-widest transition-colors">Sin miembros registrados</p>
              </div>
            ) : (
              staffList.map((member) => (
                <div
                  key={member.id}
                  onClick={() => { setSelectedStaff(member); setIsSheetOpen(true); setIsEditingStaff(false); }}
                  className="bg-[var(--bg-card)] border border-[var(--border-default)] dark:border-white/5 rounded-[24px] p-6 flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer group shadow-sm"
                >
                  <div className="flex items-center gap-6 min-w-0 transition-all">
                    <div className="w-14 h-14 rounded-2xl bg-[var(--bg-page)] flex items-center justify-center shrink-0 border border-[var(--border-default)] group-hover:scale-110 transition-all">
                      <span className="text-base font-black text-[#0284C7] uppercase transition-colors">{member.full_name.charAt(0)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-lg font-black text-[var(--text-primary)] truncate leading-none transition-colors">
                        {member.full_name}
                        {member.id === currentUserId && <span className="text-[10px] text-[#0284C7] font-black ml-3 uppercase tracking-tighter transition-colors">(Tú)</span>}
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary)] font-bold mt-2 uppercase tracking-wider transition-colors">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-8 transition-all">
                    <Badge
                      className={cn(
                        "text-[10px] font-black px-4 py-1 rounded-full uppercase tracking-widest border-none transition-all",
                        member.role === "admin" ? "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400" : "bg-[var(--bg-page)] text-[var(--text-secondary)]"
                      )}
                    >
                      {member.role === "admin" ? "Admin" : "Staff"}
                    </Badge>
                    <ChevronRight className="w-5 h-5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-all" />
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="whatsapp" className="space-y-6 mt-0">
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] dark:border-white/5 rounded-[40px] p-20 flex flex-col items-center justify-center gap-6 text-center shadow-sm transition-all">
            <div className="w-20 h-20 bg-[#EFF6FF] rounded-3xl flex items-center justify-center transition-colors">
              <MessageSquare className="w-10 h-10 text-[#0284C7]" />
            </div>
            <div className="space-y-2 transition-all">
              <h3 className="text-xl font-black text-[var(--text-primary)] uppercase tracking-tighter transition-colors">Próximamente</h3>
              <p className="text-sm text-[var(--text-secondary)] font-semibold max-w-xs mx-auto uppercase tracking-wider leading-relaxed transition-colors">
                Automatización de recordatorios vía WhatsApp en fase de desarrollo
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="hours" className="space-y-6 mt-0">
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] dark:border-white/5 rounded-[32px] p-10 shadow-sm max-w-2xl mx-auto transition-all">
            <div className="mb-10 text-center transition-all">
              <h3 className="text-lg font-black text-[var(--text-primary)] uppercase tracking-tighter transition-colors">Horarios Operativos</h3>
              <p className="text-xs text-[var(--text-secondary)] font-bold mt-1 uppercase tracking-widest transition-colors">Disponibilidad semanal de la clínica</p>
            </div>

            <div className="space-y-2 transition-all">
              {businessHours.map((h, i) => (
                <div key={h.day} className={cn("flex items-center justify-between gap-4 p-4 rounded-2xl transition-all", h.active ? "bg-[var(--bg-page)]" : "opacity-40")}>
                  <div className="flex items-center gap-4 w-32 transition-all">
                    <input
                      type="checkbox"
                      checked={h.active}
                      onChange={(e) => {
                        const newHours = [...businessHours];
                        newHours[i].active = e.target.checked;
                        setBusinessHours(newHours);
                      }}
                      className="w-5 h-5 accent-[#0284C7] cursor-pointer"
                    />
                    <span className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-widest transition-colors">
                      {h.day}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 transition-all">
                    <Input
                      type="time"
                      value={h.open}
                      disabled={!h.active}
                      className="h-10 text-xs font-black w-24 bg-[var(--bg-input)] border-none rounded-xl text-center text-[var(--text-primary)] transition-colors"
                    />
                    <span className="text-[var(--text-muted)] font-black text-[9px] uppercase transition-colors">a</span>
                    <Input
                      type="time"
                      value={h.close}
                      disabled={!h.active}
                      className="h-10 text-xs font-black w-24 bg-[var(--bg-input)] border-none rounded-xl text-center text-[var(--text-primary)] transition-colors"
                    />
                  </div>
                </div>
              ))}
            </div>

            <Button size="sm" className="w-full h-12 text-[11px] font-black uppercase tracking-widest mt-10 bg-[#0284C7] text-white rounded-2xl shadow-xl shadow-blue-900/20 transition-all hover:opacity-90">
              <Save className="w-4 h-4 mr-3 text-white" />
              Guardar Configuración
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Staff detail / edit sheet */}
      <Sheet open={isSheetOpen} onOpenChange={(o) => { setIsSheetOpen(o); if (!o) setIsEditingStaff(false); }}>
        <SheetContent className="w-full sm:max-w-md bg-[var(--bg-surface)] border-none shadow-2xl p-8 rounded-l-[40px] overflow-y-auto transition-colors">
          <SheetHeader className="mb-10 transition-all">
            <SheetTitle className="text-xl font-black text-[var(--text-primary)] uppercase tracking-tighter transition-colors">Perfil de Staff</SheetTitle>
          </SheetHeader>

          {selectedStaff && (
            <div className="space-y-8 transition-all">
              <div className="flex flex-col items-center text-center gap-4 bg-[var(--bg-page)] p-8 rounded-[32px] border border-[var(--border-default)] transition-all">
                <div className="w-20 h-20 bg-[var(--bg-surface)] rounded-[24px] flex items-center justify-center shadow-sm border border-[var(--border-default)] transition-all">
                  <User className="w-10 h-10 text-[#0284C7]" />
                </div>
                <div className="space-y-2 transition-all">
                  <h3 className="font-black text-xl text-[var(--text-primary)] tracking-tighter transition-colors">{selectedStaff.full_name}</h3>
                  <Badge className="bg-[#EFF6FF] text-[#0284C7] border-none px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">
                    Nivel {selectedStaff.role}
                  </Badge>
                </div>
              </div>

              <div className="space-y-6 transition-all">
                {isEditingStaff ? (
                  <>
                    <div className="space-y-2 transition-all">
                      <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest transition-colors">Nombre Completo</Label>
                      <Input
                        value={selectedStaff.full_name}
                        onChange={(e) => setSelectedStaff({ ...selectedStaff, full_name: e.target.value })}
                        className="h-12 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl font-bold px-5 text-[var(--text-primary)] transition-all"
                      />
                    </div>
                    <div className="space-y-2 transition-all">
                      <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest transition-colors">Email (No editable)</Label>
                      <Input
                        value={selectedStaff.email}
                        disabled
                        className="h-12 bg-zinc-100 dark:bg-black/20 border border-[var(--border-default)] rounded-2xl font-bold px-5 opacity-60 transition-all"
                      />
                    </div>
                    {isAdmin && (
                      <div className="space-y-2 transition-all">
                        <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest transition-colors">Rol Asignado</Label>
                        <Select
                          value={selectedStaff.role}
                          onValueChange={(v) => setSelectedStaff({ ...selectedStaff, role: v as "admin" | "staff" })}
                          disabled={selectedStaff.id === currentUserId}
                        >
                          <SelectTrigger className="h-12 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl font-bold text-[var(--text-primary)] transition-all"><SelectValue /></SelectTrigger>
                          <SelectContent className="rounded-2xl border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] transition-all">
                            <SelectItem value="staff">Staff Operativo</SelectItem>
                            <SelectItem value="admin">Administrador</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex gap-3 pt-6 transition-all">
                      <Button
                        size="sm"
                        onClick={handleUpdateStaff}
                        disabled={isSavingStaff}
                        className="flex-1 h-12 text-[11px] font-black uppercase tracking-widest bg-[#0284C7] text-white rounded-2xl shadow-lg shadow-blue-500/20 transition-all"
                      >
                        {isSavingStaff ? "Guardando..." : "Guardar Cambios"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setIsEditingStaff(false)} className="h-12 text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10 rounded-2xl transition-all">
                        Cancelar
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-6 transition-all">
                      <div className="bg-[var(--bg-page)] px-6 py-4 rounded-2xl border border-[var(--border-default)] transition-all">
                        <p className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest transition-colors">Correo Electrónico</p>
                        <p className="text-sm font-bold text-[var(--text-primary)] mt-1 break-all transition-colors">{selectedStaff.email}</p>
                      </div>
                      <div className="bg-[var(--bg-page)] px-6 py-4 rounded-2xl border border-[var(--border-default)] transition-all">
                        <p className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest transition-colors">Identificación</p>
                        <p className="text-sm font-bold text-[var(--text-primary)] mt-1 break-all transition-colors">{selectedStaff.id}</p>
                      </div>
                    </div>

                    {(isAdmin || selectedStaff.id === currentUserId) && (
                      <div className="flex flex-col gap-3 pt-6 transition-all">
                        <Button 
                          size="sm" 
                          onClick={() => setIsEditingStaff(true)} 
                          className="h-12 text-[11px] font-black uppercase tracking-widest bg-[#0284C7] text-white rounded-2xl shadow-lg shadow-blue-500/20 transition-all hover:opacity-90"
                        >
                          Editar Información
                        </Button>
                        {isAdmin && selectedStaff.id !== currentUserId && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleDeleteStaff}
                            disabled={isDeletingStaff}
                            className="h-12 text-[11px] font-black uppercase tracking-widest text-[var(--destructive)] hover:bg-[var(--destructive)]/10 rounded-2xl transition-all"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Eliminar del Equipo
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
        <DialogContent className="w-[95vw] max-w-lg bg-[var(--bg-surface)] border-none shadow-2xl rounded-[40px] p-10 transition-colors">
          <DialogHeader className="mb-6 transition-all">
            <DialogTitle className="text-xl font-black text-[var(--text-primary)] uppercase tracking-tighter transition-colors">Nuevo Miembro del Equipo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 transition-all">
            <div className="space-y-2 transition-all">
              <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest transition-colors">Nombre Completo</Label>
              <Input
                value={newStaff.full_name}
                onChange={(e) => setNewStaff((v) => ({ ...v, full_name: e.target.value }))}
                className="h-12 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl font-bold px-5 text-[var(--text-primary)] transition-all"
                placeholder="Nombre del doctor o staff..."
              />
            </div>
            <div className="space-y-2 transition-all">
              <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest transition-colors">Correo Electrónico</Label>
              <Input
                type="email"
                value={newStaff.email}
                onChange={(e) => setNewStaff((v) => ({ ...v, email: e.target.value }))}
                className="h-12 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl font-bold px-5 text-[var(--text-primary)] transition-all"
                placeholder="correo@clinica.com"
              />
            </div>
            <div className="space-y-2 transition-all">
              <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest transition-colors">Contraseña Temporal</Label>
              <Input
                type="password"
                value={newStaff.password}
                onChange={(e) => setNewStaff((v) => ({ ...v, password: e.target.value }))}
                className="h-12 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-2xl font-bold px-5 text-[var(--text-primary)] transition-all"
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div className="flex gap-3 pt-6 border-t border-[var(--border-default)] mt-4 transition-all">
              <Button 
                size="sm" 
                onClick={handleAddStaff} 
                disabled={isAddingStaff} 
                className="flex-1 h-12 text-[11px] font-black uppercase tracking-widest bg-[#0284C7] text-white rounded-2xl shadow-lg shadow-blue-500/20 transition-all hover:opacity-90"
              >
                {isAddingStaff ? "Registrando..." : "Añadir al Equipo"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIsStaffModalOpen(false)} className="h-12 text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10 rounded-2xl transition-all">
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
