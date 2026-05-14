"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { Clinic, User } from "@/types/database";

interface SettingsClientProps { clinic: Clinic; staff: User[] }

export function SettingsClient({ clinic: initialClinic, staff }: SettingsClientProps) {
  const [clinic, setClinic]     = useState(initialClinic);
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    name: initialClinic.name,
    phone: initialClinic.phone ?? "",
    email: initialClinic.email ?? "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
        <TabsList className="h-9">
          <TabsTrigger value="clinic" className="text-xs h-7">Clínica</TabsTrigger>
          <TabsTrigger value="staff"  className="text-xs h-7">Staff</TabsTrigger>
        </TabsList>

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
                  <Button size="sm" onClick={handleSave} disabled={isSaving} className="h-8 text-xs font-semibold">
                    {isSaving ? "Guardando..." : "Guardar"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setIsEditing(false); setSaveError(null); }} className="h-8 text-xs">
                    Cancelar
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { label: "Nombre",   value: clinic.name },
                    { label: "Plan",     value: clinic.plan },
                    { label: "Teléfono", value: clinic.phone ?? "—" },
                    { label: "Email",    value: clinic.email ?? "—" },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
                      <p className="text-sm text-foreground mt-1 capitalize">{value}</p>
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
                  Editar
                </Button>
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="staff" className="mt-0">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {staff.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-muted-foreground">No hay usuarios registrados</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Nombre</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Rol</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((member) => (
                    <tr key={member.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{member.full_name}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={member.role === "admin"
                            ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 text-xs"
                            : "bg-muted text-muted-foreground border-border text-xs"
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
      </Tabs>
    </div>
  );
}
