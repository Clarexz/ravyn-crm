"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  ArrowRight, 
  Plus, 
  Trash2, 
  Users, 
  Download,
  Save,
  Search,
  Loader2,
  FileText
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { Patient, Service, BudgetMember, BudgetMemberRelationship, BudgetService } from "@/types/database";

// PDF Libraries
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface NewBudgetFlowProps {
  clinicId: string;
}

const STEPS = [
  { id: 1, label: "Responsable" },
  { id: 2, label: "Integrantes y servicios" },
  { id: 3, label: "Resumen y condiciones" }
];

export function NewBudgetFlow({ clinicId }: NewBudgetFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [services, setServices] = useState<Service[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/services?active=true")
      .then(res => res.json())
      .then(data => setServices(Array.isArray(data) ? data : []))
      .catch(() => setServices([]));
  }, []);
  
  // Data State
  const [responsible, setResponsible] = useState<{
    id?: string;
    full_name: string;
    phone: string;
    email: string;
    is_new: boolean;
  }>({ full_name: "", phone: "", email: "", is_new: false });
  
  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults]   = useState<Patient[]>([]);
  const [isSearching, setIsSearching]         = useState(false);
  const [showResults, setShowResults]         = useState(false);

  useEffect(() => {
    if (patientQuery.length < 2) { setPatientResults([]); return; }
    setIsSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/patients?q=${encodeURIComponent(patientQuery)}&clinic_id=${clinicId}`)
        .then(res => res.json())
        .then(data => {
          setPatientResults(Array.isArray(data) ? data : []);
          setShowResults(true);
        })
        .finally(() => setIsSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [patientQuery, clinicId]);

  const selectPatient = (p: Patient) => {
    setResponsible({
      id: p.id,
      full_name: p.full_name,
      phone: p.phone ?? "",
      email: p.email ?? "",
      is_new: false
    });
    setPatientQuery(p.full_name);
    setShowResults(false);
  };
  
  const [doctorNotes, setDoctorNotes] = useState("");
  const [patientNotes, setPatientNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Contado / Transferencia");
  const [validityDays, setValidityDays] = useState(30);
  
  const [members, setMembers] = useState<BudgetMember[]>([
    { id: "1", full_name: "", relationship: "responsible", services: [] }
  ]);
  
  const [discountValue, setDiscountValue] = useState(0);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");

  // Sync responsible name to first member
  useEffect(() => {
    if (responsible.full_name) {
      setMembers(prev => prev.map(m => m.relationship === 'responsible' ? { ...m, full_name: responsible.full_name } : m));
    }
  }, [responsible.full_name]);

  // Calculations
  const subtotal = useMemo(() => {
    return members.reduce((sum, m) => {
      return sum + m.services.reduce((sSum, s) => sSum + (s.unit_price * s.sessions), 0);
    }, 0);
  }, [members]);

  const discountAmount = useMemo(() => {
    if (discountType === 'percentage') return (subtotal * discountValue) / 100;
    return discountValue;
  }, [subtotal, discountValue, discountType]);

  const total = subtotal - discountAmount;

  // Handlers
  const addMember = () => {
    setMembers([...members, { id: crypto.randomUUID(), full_name: "", relationship: "child", services: [] }]);
  };

  const removeMember = (id: string) => {
    if (members.length === 1) return;
    setMembers(members.filter(m => m.id !== id));
  };

  const updateMember = (id: string, updates: Partial<BudgetMember>) => {
    setMembers(members.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const addServiceToMember = (memberId: string) => {
    setMembers(members.map(m => {
      if (m.id === memberId) {
        return {
          ...m,
          services: [...m.services, { service_id: "", name: "", sessions: 1, unit_price: 0, is_manual_price: false }]
        };
      }
      return m;
    }));
  };

  const removeServiceFromMember = (memberId: string, serviceIndex: number) => {
    setMembers(members.map(m => {
      if (m.id === memberId) {
        const newServices = [...m.services];
        newServices.splice(serviceIndex, 1);
        return { ...m, services: newServices };
      }
      return m;
    }));
  };

  const updateServiceInMember = (memberId: string, serviceIndex: number, updates: Partial<BudgetService>) => {
    setMembers(members.map(m => {
      if (m.id === memberId) {
        const newServices = [...m.services];
        newServices[serviceIndex] = { ...newServices[serviceIndex], ...updates };
        return { ...m, services: newServices };
      }
      return m;
    }));
  };

  const handleSelectCatalogService = (memberId: string, serviceIndex: number, catalogServiceId: string) => {
    const s = services.find(s => s.id === catalogServiceId);
    if (!s) return;
    updateServiceInMember(memberId, serviceIndex, {
      service_id: s.id,
      name: s.name,
      unit_price: s.cost,
      is_manual_price: false
    });
  };

  const handleSaveBudget = async (status: "draft" | "active" = "active") => {
    if (!responsible.full_name) {
      toast.error("Debes asignar un responsable");
      setStep(1);
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responsible_id: responsible.id,
          responsible_name: responsible.full_name,
          responsible_phone: responsible.phone,
          responsible_email: responsible.email,
          status,
          subtotal,
          discount_value: discountValue,
          discount_type: discountType,
          total,
          validity_days: validityDays,
          payment_method: paymentMethod,
          doctor_notes: doctorNotes,
          patient_notes: patientNotes,
          members
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al guardar");
      }

      toast.success(status === 'draft' ? "Borrador guardado" : "Presupuesto creado correctamente");
      router.push("/budgets");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setIsSaving(false);
    }
  };

  const generatePDF = async () => {
    if (!pdfRef.current) return;
    
    toast.loading("Generando documento...", { id: "pdf-gen" });
    
    try {
      const element = pdfRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff"
      });
      
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });
      
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
      pdf.save(`Presupuesto-${responsible.full_name.split(' ').join('')}-${format(new Date(), "yyyyMMdd")}.pdf`);
      
      toast.success("PDF generado con éxito", { id: "pdf-gen" });
    } catch (err) {
      console.error("PDF Error:", err);
      toast.error("Error al generar PDF", { id: "pdf-gen" });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);
  };

  return (
    <div className="space-y-12 pb-32 max-w-[1400px] mx-auto">
      <div className="flex flex-col items-center gap-8 relative">
        <Button 
          variant="ghost" 
          onClick={() => step === 1 ? router.push("/budgets") : setStep(step - 1)}
          className="absolute left-0 top-1/2 -translate-y-1/2 group text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="w-5 h-5 mr-2 transition-transform group-hover:-translate-x-1" />
          <span className="hidden sm:inline">{step === 1 ? "Cerrar" : "Paso anterior"}</span>
        </Button>

        <div className="flex bg-[var(--bg-card)] border border-[var(--border-default)] dark:border-white/5 p-1.5 rounded-2xl shadow-sm">
          {STEPS.map((s) => (
            <div 
              key={s.id}
              className={cn(
                "flex items-center gap-3 px-6 py-2.5 rounded-xl transition-all border",
                step === s.id 
                  ? "bg-[#0284C7] text-white shadow-md scale-[1.02] border-transparent" 
                  : "text-[var(--text-muted)] bg-[#F8FAFC] dark:bg-white/5 border-[var(--border-default)] dark:border-white/5"
              )}
            >
              <span className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black border transition-colors",
                step === s.id ? "bg-white text-[#0284C7] border-white" : "border-[var(--border-default)] bg-white/50 dark:bg-white/10"
              )}>{s.id}</span>
              <span className="text-[11px] font-black uppercase tracking-widest">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="min-h-[600px]">
        {step === 1 && (
          <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
             <div className="bg-[var(--bg-card)] border border-[var(--border-default)] dark:border-white/5 rounded-[40px] p-10 shadow-sm space-y-8 transition-colors">
                <div className="space-y-2">
                   <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight transition-colors">Datos del responsable</h2>
                   <p className="text-sm text-[var(--text-secondary)] transition-colors">Persona que recibirá el presupuesto y se hará cargo del pago</p>
                </div>

                <div className="space-y-6">
                   <div className="space-y-3 relative">
                      <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest px-1 transition-colors">Buscar responsable en pacientes</Label>
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <Input 
                          value={patientQuery}
                          onChange={(e) => setPatientQuery(e.target.value)}
                          placeholder="Nombre del paciente..."
                          className="h-12 bg-[var(--bg-input)] border border-[var(--border-default)] dark:border-white/5 rounded-2xl font-bold pl-11 pr-5 transition-all text-[var(--text-primary)]"
                        />
                      </div>
                      
                      {showResults && patientQuery.length >= 2 && (
                        <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-[var(--bg-card)] border border-[var(--border-default)] dark:border-white/5 rounded-2xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                           {isSearching ? (
                             <div className="p-6 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)] font-bold uppercase">
                               <Loader2 className="w-4 h-4 animate-spin text-[var(--brand-accent)]" />
                               Buscando...
                             </div>
                           ) : patientResults.length === 0 ? (
                             <div className="p-6 text-center text-xs text-[var(--text-muted)] font-bold uppercase">Sin resultados</div>
                           ) : (
                             patientResults.map(p => (
                               <button 
                                 key={p.id}
                                 onClick={() => selectPatient(p)}
                                 className="w-full text-left p-4 hover:bg-[var(--bg-page)] border-b border-[var(--border-default)] dark:border-white/5 last:border-0 transition-colors"
                               >
                                  <p className="text-sm font-black text-[var(--text-primary)] transition-colors">{p.full_name}</p>
                                  <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider transition-colors">{p.phone || 'Sin teléfono'}</p>
                               </button>
                             ))
                           )}
                        </div>
                      )}
                   </div>

                   <div className="h-px bg-[var(--border-default)] dark:bg-white/5 transition-colors" />

                   <div className="space-y-6">
                      <div className="flex items-center justify-between">
                         <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] transition-colors">O registrar manualmente</h3>
                         <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-tighter transition-colors">Paciente nuevo</span>
                            <button
                              type="button"
                              onClick={() => setResponsible({...responsible, is_new: !responsible.is_new})}
                              className={cn(
                                "w-10 h-5 rounded-full relative transition-colors duration-200 focus:outline-none",
                                responsible.is_new ? "bg-[#0284C7]" : "bg-[var(--border-default)] dark:bg-white/10"
                              )}
                            >
                              <div className={cn(
                                "absolute top-1 w-3 h-3 rounded-full bg-white transition-transform duration-200",
                                responsible.is_new ? "left-6" : "left-1"
                              )} />
                            </button>
                         </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div className="space-y-2">
                           <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest px-1 transition-colors">Nombre completo</Label>
                           <Input 
                             value={responsible.full_name}
                             onChange={(e) => setResponsible({...responsible, full_name: e.target.value, is_new: true})}
                             placeholder="Ej. Juan Pérez"
                             className="h-12 bg-[var(--bg-input)] border border-[var(--border-default)] dark:border-white/5 rounded-2xl font-bold px-5 text-[var(--text-primary)]"
                           />
                         </div>
                         <div className="space-y-2">
                           <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest px-1 transition-colors">Teléfono</Label>
                           <Input 
                             value={responsible.phone}
                             onChange={(e) => setResponsible({...responsible, phone: e.target.value})}
                             placeholder="55 1234 5678"
                             className="h-12 bg-[var(--bg-input)] border border-[var(--border-default)] dark:border-white/5 rounded-2xl font-bold px-5 text-[var(--text-primary)]"
                           />
                         </div>
                         <div className="md:col-span-2 space-y-2">
                           <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest px-1 transition-colors">Email</Label>
                           <Input 
                             value={responsible.email}
                             onChange={(e) => setResponsible({...responsible, email: e.target.value})}
                             placeholder="juan@ejemplo.com"
                             className="h-12 bg-[var(--bg-input)] border border-[var(--border-default)] dark:border-white/5 rounded-2xl font-bold px-5 text-[var(--text-primary)]"
                           />
                         </div>
                      </div>
                   </div>

                   <div className="pt-4 space-y-2">
                      <Label className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest px-1 transition-colors">Observaciones internas</Label>
                      <Textarea 
                        value={doctorNotes}
                        onChange={(e) => setDoctorNotes(e.target.value)}
                        placeholder="Anotaciones sobre el plan de tratamiento..."
                        className="bg-[var(--bg-input)] border border-[var(--border-default)] dark:border-white/5 rounded-2xl p-5 min-h-[100px] resize-none font-medium text-[var(--text-primary)]"
                      />
                   </div>
                </div>
             </div>
             <div className="flex justify-end">
                <Button 
                  onClick={() => setStep(2)}
                  disabled={!responsible.full_name}
                  className="h-12 px-10 bg-[#0284C7] text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-blue-500/20 transition-all hover:bg-[#0369A1]"
                >
                  Continuar a integrantes <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
             </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-10 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
             {/* Left: Members */}
             <div className="lg:col-span-6 space-y-6">
                {members.map((member) => (
                  <div key={member.id} className="bg-[var(--bg-card)] border border-[var(--border-default)] dark:border-white/5 rounded-[32px] overflow-hidden shadow-sm transition-all">
                     <div className="p-6 border-b border-[var(--border-default)] dark:border-white/5 flex items-center justify-between bg-[var(--bg-page)]/30">
                        <div className="flex items-center gap-4 flex-1">
                           <div className="w-10 h-10 rounded-xl bg-[var(--brand-accent)] bg-opacity-10 text-[var(--brand-accent)] flex items-center justify-center font-black transition-colors">
                              {member.full_name ? member.full_name.charAt(0).toUpperCase() : '?'}
                           </div>
                           <div className="flex flex-col gap-1.5 flex-1 max-w-xs">
                              <Input 
                                value={member.full_name}
                                onChange={(e) => updateMember(member.id, { full_name: e.target.value })}
                                placeholder="Nombre del integrante"
                                className="h-8 bg-transparent border-none font-bold text-sm focus-visible:ring-0 p-0 transition-colors text-[var(--text-primary)]"
                              />
                              <div className="flex items-center gap-2">
                                <Select 
                                  value={member.relationship}
                                  onValueChange={(v) => updateMember(member.id, { relationship: v as BudgetMemberRelationship })}
                                >
                                  <SelectTrigger className="h-6 w-fit bg-white dark:bg-white/5 border-none text-[9px] font-black uppercase tracking-tighter rounded-full px-3 py-0 shadow-sm text-[var(--text-primary)]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="rounded-xl border-[var(--border-default)] dark:border-white/5 bg-[var(--bg-surface)]">
                                    <SelectItem value="responsible">Responsable</SelectItem>
                                    <SelectItem value="spouse">Cónyuge</SelectItem>
                                    <SelectItem value="child">Hijo/a</SelectItem>
                                    <SelectItem value="other">Otro</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                           </div>
                        </div>
                        {members.length > 1 && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => removeMember(member.id)}
                            className="text-[var(--destructive)] hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                     </div>

                     <div className="p-6 space-y-4 transition-colors">
                        {member.services.map((service, sIdx) => (
                          <div key={sIdx} className="grid grid-cols-12 gap-4 items-end group">
                             <div className="col-span-5 space-y-1.5">
                                <Label className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest px-1 transition-colors">Servicio / Tratamiento</Label>
                                <Select value={service.service_id} onValueChange={(v) => handleSelectCatalogService(member.id, sIdx, v)}>
                                   <SelectTrigger className="h-10 bg-[var(--bg-input)] border border-[var(--border-default)] dark:border-white/5 rounded-xl font-bold text-xs shadow-sm text-[var(--text-primary)] transition-all">
                                      <SelectValue placeholder="Elegir del catálogo..." />
                                   </SelectTrigger>
                                   <SelectContent className="rounded-xl border-[var(--border-default)] dark:border-white/5 bg-[var(--bg-surface)]">
                                      {services.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                      ))}
                                   </SelectContent>
                                </Select>
                             </div>
                             <div className="col-span-2 space-y-1.5">
                                <Label className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest px-1 text-center block transition-colors">Sesiones</Label>
                                <Input 
                                  type="number" 
                                  min="1"
                                  value={service.sessions}
                                  onChange={(e) => updateServiceInMember(member.id, sIdx, { sessions: parseInt(e.target.value) || 1 })}
                                  className="h-10 bg-[var(--bg-input)] border border-[var(--border-default)] dark:border-white/5 rounded-xl font-black text-center text-xs shadow-sm text-[var(--text-primary)]"
                                />
                             </div>
                             <div className="col-span-2 space-y-1.5">
                                <Label className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest px-1 transition-colors">Precio Unit.</Label>
                                <div className="relative">
                                  <Input 
                                    type="number"
                                    value={service.unit_price}
                                    onChange={(e) => updateServiceInMember(member.id, sIdx, { unit_price: parseFloat(e.target.value) || 0, is_manual_price: true })}
                                    className="h-10 bg-[var(--bg-input)] border border-[var(--border-default)] dark:border-white/5 rounded-xl font-black text-xs pl-3 pr-6 shadow-sm text-[var(--text-primary)]"
                                  />
                                  {service.is_manual_price && (
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-amber-500 shadow-sm" title="Precio modificado manualmente" />
                                  )}
                                </div>
                             </div>
                             <div className="col-span-2 text-right pb-3">
                                <p className="text-[10px] font-black text-[var(--text-muted)] uppercase mb-1 tracking-tighter transition-colors">Subtotal</p>
                                <p className="text-xs font-black text-[var(--text-primary)] transition-colors">
                                   {formatCurrency(service.unit_price * service.sessions)}
                                </p>
                             </div>
                             <div className="col-span-1 pb-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => removeServiceFromMember(member.id, sIdx)}
                                  className="w-8 h-8 opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 transition-all"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                             </div>
                          </div>
                        ))}

                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => addServiceToMember(member.id)}
                          className="w-fit text-[10px] font-black uppercase tracking-widest text-[#0284C7] hover:bg-[#0284C7]/5 rounded-xl h-9 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5 mr-2" />
                          Agregar servicio
                        </Button>
                     </div>
                  </div>
                ))}

                <Button 
                  onClick={addMember}
                  className="w-full h-14 bg-white dark:bg-white/5 border-2 border-dashed border-[var(--border-default)] dark:border-white/10 rounded-[32px] text-[var(--text-secondary)] hover:border-[#0284C7] hover:text-[#0284C7] transition-all flex items-center justify-center gap-3 font-black text-[11px] uppercase tracking-widest shadow-sm"
                >
                  <Users className="w-5 h-5" />
                  Agregar integrante familiar
                </Button>
             </div>

             {/* Right: Summary sticky */}
             <div className="lg:col-span-4">
                <div className="sticky top-4 bg-[var(--sidebar-bg)] rounded-[40px] p-8 text-white shadow-2xl space-y-8 transition-colors">
                   <div className="space-y-4">
                      <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Resumen del presupuesto</p>
                      <div className="space-y-3">
                         {members.map(m => (
                           <div key={m.id} className="flex justify-between items-center text-xs">
                              <span className="text-white/60 font-medium truncate max-w-[60%]">{m.full_name || 'Integrante sin nombre'}</span>
                              <span className="font-black tabular-nums">
                                 {formatCurrency(m.services.reduce((sum, s) => sum + (s.unit_price * s.sessions), 0))}
                              </span>
                           </div>
                         ))}
                      </div>
                      <div className="h-px bg-white/10 my-4" />
                      <div className="flex justify-between items-center text-sm">
                         <span className="text-white/40 font-black uppercase tracking-widest">Subtotal</span>
                         <span className="font-black">
                            {formatCurrency(subtotal)}
                         </span>
                      </div>
                      
                      <div className="space-y-3 pt-2">
                         <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-white/40 uppercase">Descuento familiar</span>
                            <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                               <button 
                                 onClick={() => setDiscountType('percentage')}
                                 className={cn("px-3 py-1 rounded-lg text-[9px] font-black transition-all", discountType === 'percentage' ? "bg-[#0284C7] text-white shadow-md" : "text-white/40 hover:text-white")}
                               >%</button>
                               <button 
                                 onClick={() => setDiscountType('fixed')}
                                 className={cn("px-3 py-1 rounded-lg text-[9px] font-black transition-all", discountType === 'fixed' ? "bg-[#0284C7] text-white shadow-md" : "text-white/40 hover:text-white")}
                               >$</button>
                            </div>
                         </div>
                         <div className="relative">
                            <Input 
                              type="number"
                              value={discountValue}
                              onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                              className="h-11 bg-white/5 border-white/10 rounded-xl text-white font-black pl-4 pr-10 focus:ring-[#0284C7]"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 font-black text-xs">
                               {discountType === 'percentage' ? '%' : 'MXN'}
                            </span>
                         </div>
                      </div>
                   </div>

                   <div className="pt-6 border-t border-white/10 space-y-1">
                      <p className="text-[10px] font-black text-[#0284C7] uppercase tracking-widest">Total Final</p>
                      <p className="text-4xl font-black text-white tabular-nums tracking-tighter">
                         {formatCurrency(total)}
                      </p>
                   </div>

                   <Button 
                     onClick={() => setStep(3)}
                     className="w-full h-14 bg-[#0284C7] text-white hover:opacity-90 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-black/20 transition-all hover:bg-[#0369A1]"
                   >
                     Continuar a resumen <ArrowRight className="w-5 h-5 ml-2" />
                   </Button>
                </div>
             </div>
          </div>
        )}

        {step === 3 && (
          <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
             {/* A4 Preview Card - Always White for realistic PDF preview */}
             <div ref={pdfRef} className="bg-white border border-slate-200 shadow-2xl rounded-sm aspect-[1/1.41] p-16 text-slate-800 flex flex-col space-y-8 select-text selectable transition-all overflow-hidden relative">
                {/* PDF Header */}
                <div className="flex justify-between items-start">
                   <div className="space-y-3">
                      <div className="text-[#0284C7] font-black text-xl tracking-tighter uppercase leading-none">
                         Clínica Dental Premium
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Sucursal Centro · Guadalajara, MX</p>
                      </div>
                   </div>
                   <div className="text-right space-y-1">
                      <h4 className="text-xl font-black text-[#0284C7] tracking-widest">#0024</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{format(new Date(), "d 'de' MMMM, yyyy", { locale: es })}</p>
                   </div>
                </div>

                <div className="h-px bg-slate-100 mt-4" />

                {/* Responsible Info */}
                <div className="grid grid-cols-3 gap-8">
                   <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Responsable</p>
                      <p className="text-sm font-black text-slate-900 capitalize">{responsible.full_name}</p>
                   </div>
                   <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Contacto</p>
                      <p className="text-sm font-bold text-slate-700">{responsible.phone || '—'}</p>
                   </div>
                   <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Correo</p>
                      <p className="text-sm font-bold text-slate-700 truncate">{responsible.email || '—'}</p>
                   </div>
                </div>

                {/* Members & Services List */}
                <div className="flex-1 space-y-10 mt-4">
                   {members.map((m) => (
                     <div key={m.id} className="space-y-3">
                        <div className="flex items-center gap-3 border-b border-slate-100 pb-2">
                           <span className="text-xs font-black text-slate-900 uppercase tracking-tight">{m.full_name}</span>
                           <Badge variant="outline" className="text-[9px] font-bold text-slate-400 uppercase px-2 py-0.5 border border-slate-200 rounded-full">{m.relationship}</Badge>
                        </div>
                        <table className="w-full">
                           <thead>
                              <tr className="text-[9px] font-black text-slate-300 uppercase tracking-widest text-left border-b border-slate-50">
                                 <th className="pb-3 w-1/2">Tratamiento</th>
                                 <th className="pb-3 text-center">Cant.</th>
                                 <th className="pb-3 text-right">Precio</th>
                                 <th className="pb-3 text-right">Subtotal</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-50">
                              {m.services.map((s, idx) => (
                                <tr key={idx} className="text-xs">
                                   <td className="py-3 font-bold text-slate-700">{s.name || 'Sin especificar'}</td>
                                   <td className="py-3 text-center font-black text-slate-400">{s.sessions}</td>
                                   <td className="py-3 text-right font-bold text-slate-500">{formatCurrency(s.unit_price)}</td>
                                   <td className="py-3 text-right font-black text-slate-900">{formatCurrency(s.unit_price * s.sessions)}</td>
                                </tr>
                              ))}
                           </tbody>
                        </table>
                        <div className="flex justify-end pt-2 border-t border-slate-50">
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                              Subtotal {m.full_name.split(' ')[0]}: <span className="text-slate-900 ml-2">
                                 {formatCurrency(m.services.reduce((sum, s) => sum + (s.unit_price * s.sessions), 0))}
                              </span>
                           </p>
                        </div>
                     </div>
                   ))}
                </div>

                <div className="h-px bg-slate-200" />

                {/* Final Totals & Conditions */}
                <div className="grid grid-cols-2 gap-16 items-start">
                   <div className="space-y-6">
                      <div className="space-y-3">
                         <h5 className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Condiciones Comerciales</h5>
                         <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                               <p className="text-[9px] font-black text-slate-400">Vigencia</p>
                               <div className="flex items-center gap-1 border-b border-slate-100">
                                 <input 
                                   value={validityDays}
                                   type="number"
                                   onChange={(e) => setValidityDays(parseInt(e.target.value) || 0)}
                                   className="w-10 h-8 bg-transparent p-0 text-xs font-bold focus:outline-none" 
                                 />
                                 <span className="text-xs font-bold text-slate-600">días</span>
                               </div>
                            </div>
                            <div className="space-y-1">
                               <p className="text-[9px] font-black text-slate-400">Forma de pago</p>
                               <input 
                                 value={paymentMethod}
                                 onChange={(e) => setPaymentMethod(e.target.value)}
                                 className="h-8 w-full bg-transparent border-b border-slate-100 p-0 text-xs font-bold focus:outline-none" 
                               />
                            </div>
                         </div>
                      </div>
                      <div className="space-y-2">
                         <p className="text-[9px] font-black text-slate-400">Notas adicionales</p>
                         <textarea 
                           value={patientNotes}
                           onChange={(e) => setPatientNotes(e.target.value)}
                           className="w-full bg-slate-50 border-none rounded-xl text-[10px] min-h-[60px] p-3 text-slate-600 font-medium resize-none focus:ring-0"
                           placeholder="Ej. Descuento aplicado por pago anticipado..."
                         />
                      </div>
                   </div>

                   <div className="space-y-4 pt-2">
                      <div className="flex justify-between items-center text-xs">
                         <span className="text-slate-400 font-black uppercase tracking-widest">Subtotal General</span>
                         <span className="font-black text-slate-700">{formatCurrency(subtotal)}</span>
                      </div>
                      {discountAmount > 0 && (
                        <div className="flex justify-between items-center text-xs text-rose-500">
                           <span className="font-black uppercase tracking-widest">Descuento {discountType === 'percentage' ? `(${discountValue}%)` : ''}</span>
                           <span className="font-black">-{formatCurrency(discountAmount)}</span>
                        </div>
                      )}
                      <div className="h-px bg-slate-200" />
                      <div className="flex justify-between items-center">
                         <span className="text-[10px] font-black text-[#0284C7] uppercase tracking-[0.2em]">Total Final</span>
                         <span className="text-3xl font-black text-slate-900 tracking-tighter tabular-nums">{formatCurrency(total)}</span>
                      </div>
                   </div>
                </div>

                <div className="pt-8 flex justify-between items-end mt-auto">
                   <div className="grid grid-cols-2 gap-20 w-full">
                      <div className="space-y-4">
                         <div className="h-px bg-slate-200" />
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Firma del Doctor</p>
                      </div>
                      <div className="space-y-4">
                         <div className="h-px bg-slate-200" />
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Acepto el presupuesto</p>
                      </div>
                   </div>
                </div>
                <div className="pt-4 flex justify-end">
                   <p className="text-[9px] font-bold text-slate-300 italic">Documento generado vía Ravyn CRM Dental v1.0</p>
                </div>
             </div>
          </div>
        )}
      </div>

      {/* Fixed Action Bar for Step 3 */}
      {step === 3 && (
        <div className="fixed bottom-0 left-0 right-0 md:left-72 bg-[var(--bg-surface)] border-t border-[var(--border-default)] p-4 z-40 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] transition-all">
           <div className="max-w-6xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="w-10 h-10 rounded-xl bg-[#0284C7]/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-[#0284C7]" />
                 </div>
                 <div>
                    <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Vista Previa</p>
                    <p className="text-sm font-black text-[var(--text-primary)] uppercase">Presupuesto en borrador</p>
                 </div>
              </div>
              <div className="flex items-center gap-4">
                <Button 
                  onClick={() => handleSaveBudget('draft')}
                  disabled={isSaving}
                  variant="outline"
                  className="h-11 px-8 rounded-xl border-[var(--border-default)] text-[var(--text-secondary)] font-black text-[11px] uppercase tracking-widest hover:bg-[var(--bg-page)]"
                >
                   {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                   Guardar borrador
                </Button>
                <Button 
                  onClick={async () => {
                    await handleSaveBudget('active');
                    generatePDF();
                  }}
                  disabled={isSaving}
                  className="h-11 px-10 bg-[#0284C7] text-white hover:bg-[#0369A1] rounded-xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-blue-500/20"
                >
                   {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                   Generar PDF Final
                </Button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
