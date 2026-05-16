"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Plus, MessageSquare, Clock, UserPlus, Save, Info, Trash2, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Clinic, User as UserType } from "@/types/database";

interface SettingsClientProps { clinic: Clinic; staff: UserType[] }

export function SettingsClient({ clinic: initialClinic, staff: initialStaff }: SettingsClientProps) {
  const [clinic, setClinic]     = useState(initialClinic);
  const [staffList, setStaffList] = useState(initialStaff);
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    name: initialClinic.name,
    phone: initialClinic.phone ?? "",
    email: initialClinic.email ?? "",
  });
  
  // Staff logic
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [newStaff, setNewStaff] = useState({ full_name: "", email: "", role: "staff" });
  const [isAddingStaff, setIsAddingStaff] = useState(false);

  // Edit/View Staff logic
  const [selectedStaff, setSelectedStaff] = useState<UserType | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isEditingStaff, setIsEditingStaff] = useState(false);
  const [isDeletingStaff, setIsDeletingStaff] = useState(false);

  // WhatsApp logic
  const [wsTemplate, setWsTemplate] = useState("Hola {{paciente}}, recordatorio de tu cita el día {{fecha}} a las {{hora}} en {{clinica}}.");
  const [isSavingWS, setIsSavingWS] = useState(false);

  // Hours logic
  const [businessHours, setBusinessHours] = useState([
    { day: "Lunes",    open: "09:00", close: "18:00", active: true },
    { day: "Martes",   open: "09:00", close: "18:00", active: true },
    { day: "Miércoles", open: "09:00", close: "18:00", active: true },
    { day: "Jueves",   open: "09:00", close: "18:00", active: true },
    { day: "Viernes",  open: "09:00", close: "18:00", active: true },
    { day: "Sábado",   open: "10:00", close: "14:00", active: true },
    { day: "Domingo",  open: "00:00", close: "00:00", active: false },
  ]);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleAddStaff = async () => {
    if (!newStaff.full_name || !newStaff.email) return;
    setIsAddingStaff(true);
    await new Promise(r => setTimeout(r, 800));
    const newUser = { id: Math.random().toString(), ...newStaff } as UserType;
    setStaffList([...staffList, newUser]);
    setIsAddingStaff(false);
    setIsStaffModalOpen(false);
    setNewStaff({ full_name: "", email: "", role: "staff" });
    toast.success("Usuario añadido al equipo");
  };

  const handleUpdateStaff = async () => {
    if (!selectedStaff) return;
    setIsAddingStaff(true);
    await new Promise(r => setTimeout(r, 600));
    setStaffList(staffList.map(s => s.id === selectedStaff.id ? selectedStaff : s));
    setIsAddingStaff(false);
    setIsEditingStaff(false);
    setIsSheetOpen(false);
    toast.success("Información actualizada");
  };

  const handleDeleteStaff = async () => {
    if (!selectedStaff) return;
    setIsDeletingStaff(true);
    await new Promise(r => setTimeout(r, 800));
    setStaffList(staffList.filter(s => s.id !== selectedStaff.id));
    setIsDeletingStaff(false);
    setIsSheetOpen(false);
    setSelectedStaff(null);
    toast.success("Usuario eliminado");
  };

  const handleSaveWhatsApp = async () => {
    setIsSavingWS(true);
    await new Promise(r => setTimeout(r, 600));
    setIsSavingWS(false);
    toast.success("Plantilla de WhatsApp actualizada");
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/clinic", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editValues),
      });
      if (res.ok) {
        setClinic(await res.json() as Clinic);
        setIsEditing(false);
      } else {
        const err = await res.json() as { error?: string };
        setSaveError(err.error ?? "Error al guardar");
      }
    } catch {
      setSaveError("Error inesperado");
    } finally {
      setIsSaving(false);
    }
  };

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
            <TabsTrigger value="staff"  className="text-[10px] sm:text-xs h-7 gap-1.5 px-3"><UserPlus className="w-3.5 h-3.5" /> Staff</TabsTrigger>
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
                  <Button size="sm" onClick={handleSave} disabled={isSaving} className="h-8 text-xs font-semibold bg-foreground text-background">
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
                      <p className="text-sm text-foreground mt-1 capitalize font-medium">{value}</p>
                    </div>
                  ))}
                </div>
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
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="staff" className="space-y-4 mt-0">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setIsStaffModalOpen(true)} className="h-8 text-xs gap-1.5 bg-foreground text-background">
              <Plus className="w-3.5 h-3.5" />
              Nuevo miembro
            </Button>
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden overflow-x-auto">
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
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{member.full_name}</td>
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
          </div>
        </TabsContent>

        <TabsContent value="whatsapp" className="space-y-4 mt-0">
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">Recordatorio de Citas</h3>
              <p className="text-xs text-muted-foreground">Personaliza el mensaje que reciben tus pacientes automáticamente.</p>
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-medium">Contenido del mensaje</Label>
              <Textarea 
                value={wsTemplate}
                onChange={(e) => setWsTemplate(e.target.value)}
                rows={4}
                className="text-sm resize-none"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {["{{paciente}}", "{{fecha}}", "{{hora}}", "{{clinica}}"].map(tag => (
                  <Badge key={tag} variant="secondary" className="cursor-pointer hover:bg-muted transition-colors text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            <Button 
              size="sm" 
              onClick={handleSaveWhatsApp} 
              disabled={isSavingWS}
              className="h-8 text-xs gap-1.5 bg-foreground text-background"
            >
              <Save className="w-3.5 h-3.5" />
              {isSavingWS ? "Guardando..." : "Guardar plantilla"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="hours" className="space-y-4 mt-0">
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="space-y-1 mb-6">
              <h3 className="text-sm font-semibold text-foreground">Horarios de Atención</h3>
              <p className="text-xs text-muted-foreground">Define los días y horas en los que la clínica está operativa.</p>
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

      {/* View/Edit Staff Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={(o) => { setIsSheetOpen(o); if(!o) setIsEditingStaff(false); }}>
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
                        onChange={(e) => setSelectedStaff({ ...selectedStaff, email: e.target.value })}
                        className="h-9 text-sm" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Rol</Label>
                      <Select 
                        value={selectedStaff.role} 
                        onValueChange={(v) => setSelectedStaff({ ...selectedStaff, role: v as any })}
                      >
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="staff">Staff</SelectItem>
                          <SelectItem value="admin">Administrador</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button 
                        size="sm" 
                        onClick={handleUpdateStaff} 
                        disabled={isAddingStaff}
                        className="flex-1 h-9 text-xs bg-foreground text-background"
                      >
                        {isAddingStaff ? "Guardando..." : "Guardar cambios"}
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
                        <p className="text-sm text-foreground mt-0.5">{selectedStaff.email}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">Rol</p>
                        <p className="text-sm text-foreground mt-0.5 capitalize">{selectedStaff.role}</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 pt-4">
                      <Button size="sm" variant="outline" onClick={() => setIsEditingStaff(true)} className="h-9 text-xs gap-2">
                        <Info className="w-3.5 h-3.5" /> Editar información
                      </Button>
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
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Staff Modal */}
      <Dialog open={isStaffModalOpen} onOpenChange={setIsStaffModalOpen}>
        <DialogContent className="w-[95vw] max-w-sm bg-card border-border p-5 rounded-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Añadir Staff</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Nombre completo</Label>
              <Input 
                value={newStaff.full_name}
                onChange={(e) => setNewStaff(v => ({ ...v, full_name: e.target.value }))}
                className="h-9 text-sm" 
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Email</Label>
              <Input 
                type="email"
                value={newStaff.email}
                onChange={(e) => setNewStaff(v => ({ ...v, email: e.target.value }))}
                className="h-9 text-sm" 
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Rol</Label>
              <Select value={newStaff.role} onValueChange={(v) => setNewStaff(v => ({ ...v, role: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={handleAddStaff} disabled={isAddingStaff} className="flex-1 h-9 text-xs bg-foreground text-background">
                {isAddingStaff ? "Añadiendo..." : "Añadir al equipo"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIsStaffModalOpen(false)} className="h-9 text-xs">
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
