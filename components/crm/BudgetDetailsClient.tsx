"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  Download, 
  CheckCircle2, 
  Copy, 
  Pencil, 
  Clock, 
  Calendar, 
  User,
  Receipt,
  BadgeDollarSign
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { Budget, BudgetStatus } from "@/types/database";

interface BudgetDetailsClientProps {
  budgetId: string;
  clinicId: string;
}

const STATUS_CONFIG: Record<BudgetStatus, { label: string; className: string }> = {
  active:   { label: "Vigente",  className: "bg-[#EFF6FF] text-[#0284C7] dark:bg-blue-500/20 dark:text-blue-400" },
  accepted: { label: "Aceptado", className: "bg-[#F0FDF4] text-[#10B981] dark:bg-emerald-500/20 dark:text-emerald-400" },
  expired:  { label: "Vencido",  className: "bg-[#FEF2F2] text-[#DC2626] dark:bg-rose-500/20 dark:text-rose-400" },
  draft:    { label: "Borrador", className: "bg-[#F8FAFC] text-[#64748B] border border-slate-200 dark:bg-white/10 dark:text-white/40 dark:border-none" },
};

export function BudgetDetailsClient({ budgetId, clinicId }: BudgetDetailsClientProps) {
  const router = useRouter();
  
  // Mock data for display
  const [budget, setBudget] = useState<Budget>({
    id: budgetId,
    clinic_id: clinicId,
    budget_number: "#0024",
    responsible_id: "p1",
    responsible_name: "Jeronimo Gonzales",
    responsible_phone: "55 1234 5678",
    responsible_email: "jeronimo@ejemplo.com",
    status: "active",
    subtotal: 4500,
    discount_value: 10,
    discount_type: "percentage",
    total: 4050,
    validity_days: 30,
    payment_method: "Contado / Transferencia",
    doctor_notes: "Plan inicial de limpieza y blanqueamiento",
    patient_notes: "Válido solo pagando el total en la primera sesión",
    members: [
      {
        id: "m1",
        full_name: "Jeronimo Gonzales",
        relationship: "responsible",
        services: [
          { service_id: "s1", name: "Limpieza Dental", sessions: 1, unit_price: 1500, is_manual_price: false },
          { service_id: "s2", name: "Blanqueamiento", sessions: 1, unit_price: 3000, is_manual_price: false }
        ]
      }
    ],
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString()
  });

  const isExpired = new Date(budget.expires_at) < new Date() && budget.status === "active";
  const daysDiff = differenceInDays(new Date(budget.expires_at), new Date());
  
  const handleMarkAccepted = () => {
    setBudget({ ...budget, status: "accepted" });
    toast.success("Presupuesto marcado como aceptado");
  };

  const handleDuplicate = () => {
    toast.success("Presupuesto duplicado. Redirigiendo...");
    router.push("/budgets/new?duplicate=" + budgetId);
  };

  const status = STATUS_CONFIG[budget.status];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button 
          variant="ghost" 
          onClick={() => router.push("/budgets")}
          className="group text-[var(--text-secondary)] hover:text-[var(--text-primary)] -ml-4 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 mr-2 transition-transform group-hover:-translate-x-1" />
          Volver a presupuestos
        </Button>
        <Button 
          onClick={() => router.push(`/budgets/edit/${budgetId}`)}
          className="bg-[var(--brand-accent)] text-white hover:opacity-90 rounded-xl px-6 transition-all shadow-lg shadow-blue-500/20"
        >
          <Pencil className="w-4 h-4 mr-2" />
          Editar presupuesto
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-8 items-start">
        {/* Left: Info Panel */}
        <div className="lg:col-span-4 space-y-6">
           <div className="bg-[var(--bg-card)] border border-[var(--border-default)] dark:border-white/5 rounded-[40px] p-8 shadow-sm space-y-8">
              <div className="flex flex-col items-center text-center space-y-4">
                 <Badge variant="outline" className={cn("px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border-none shadow-sm", status.className)}>
                    {status.label}
                 </Badge>
                 <div className="space-y-1">
                    <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Responsable</p>
                    <h1 
                      onClick={() => router.push(`/patients/${budget.responsible_id}`)}
                      className="text-2xl font-black text-[var(--text-primary)] hover:text-[#0284C7] cursor-pointer transition-colors leading-tight"
                    >
                       {budget.responsible_name}
                    </h1>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-[var(--bg-page)] p-4 rounded-2xl border border-[var(--border-default)] dark:border-white/5 space-y-1">
                    <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Emisión</p>
                    <div className="flex items-center gap-2 text-[var(--text-primary)] font-bold text-sm">
                       <Calendar className="w-3.5 h-3.5 opacity-30" />
                       {format(new Date(budget.created_at), "d MMM, yyyy")}
                    </div>
                 </div>
                 <div className="bg-[var(--bg-page)] p-4 rounded-2xl border border-[var(--border-default)] dark:border-white/5 space-y-1">
                    <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Vencimiento</p>
                    <div className="flex items-center gap-2 text-[var(--text-primary)] font-bold text-sm">
                       <Clock className="w-3.5 h-3.5 opacity-30" />
                       {format(new Date(budget.expires_at), "d MMM, yyyy")}
                    </div>
                 </div>
              </div>

              <div className="flex flex-col items-center text-center p-6 bg-[var(--bg-page)] rounded-3xl border border-[var(--border-default)] dark:border-white/5">
                 <p className={cn(
                   "text-[10px] font-black uppercase tracking-widest mb-1",
                   daysDiff > 0 ? "text-[var(--brand-accent)]" : "text-[var(--destructive)]"
                 )}>
                   {daysDiff > 0 ? `Vence en ${daysDiff} días` : `Vencido hace ${Math.abs(daysDiff)} días`}
                 </p>
                 <div className="h-1 w-24 bg-[var(--border-default)] rounded-full overflow-hidden mt-2">
                    <div 
                      className={cn("h-full transition-all", daysDiff > 0 ? "bg-[var(--brand-accent)]" : "bg-[var(--destructive)]")}
                      style={{ width: `${Math.max(0, Math.min(100, (daysDiff / 30) * 100))}%` }}
                    />
                 </div>
              </div>

              <div className="pt-6 border-t border-[var(--border-default)] dark:border-white/5 space-y-6">
                 <div className="text-center space-y-1">
                    <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em]">Monto Total</p>
                    <p className="text-4xl font-black text-[var(--text-primary)] tabular-nums tracking-tighter">
                       {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(budget.total)}
                    </p>
                 </div>

                 <div className="flex flex-col gap-3">
                    <Button className="h-12 w-full bg-[#0284C7] text-white hover:opacity-90 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-blue-500/20 transition-all">
                       <Download className="w-4 h-4 mr-2" />
                       Descargar PDF
                    </Button>
                    <Button 
                      onClick={handleMarkAccepted}
                      disabled={budget.status === 'accepted'}
                      variant="outline" 
                      className="h-12 w-full border-[var(--brand-accent)] text-[var(--brand-accent)] hover:bg-[var(--brand-accent)] hover:text-white rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all"
                    >
                       <CheckCircle2 className="w-4 h-4 mr-2" />
                       Marcar como aceptado
                    </Button>
                    <Button 
                      onClick={handleDuplicate}
                      variant="ghost" 
                      className="h-12 w-full text-[var(--text-secondary)] hover:bg-[var(--bg-page)] rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all"
                    >
                       <Copy className="w-4 h-4 mr-2" />
                       Duplicar presupuesto
                    </Button>
                 </div>
              </div>
           </div>
        </div>

        {/* Right: PDF Preview - Always White for realistic document preview */}
        <div className="lg:col-span-6">
           <div className="bg-white border border-slate-200 shadow-2xl rounded-sm aspect-[1/1.41] p-12 text-slate-800 flex flex-col space-y-10 scale-[0.95] origin-top transform-gpu select-text selectable">
              <div className="flex justify-between items-start">
                 <div className="space-y-3">
                    <div className="w-12 h-12 bg-[#0284C7] rounded-xl flex items-center justify-center">
                       <Receipt className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900 uppercase">Clínica Dental Premium</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Guadalajara, Jalisco</p>
                    </div>
                 </div>
                 <div className="text-right space-y-1">
                    <h4 className="text-lg font-black text-[#0284C7] tracking-widest">{budget.budget_number}</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{format(new Date(budget.created_at), "d MMM yyyy", { locale: es })}</p>
                 </div>
              </div>

              <div className="h-px bg-slate-100" />

              <div className="grid grid-cols-2 gap-10">
                 <div className="space-y-1">
                    <p className="text-[9px] font-black text-slate-300 uppercase">Responsable</p>
                    <p className="text-sm font-black text-slate-800">{budget.responsible_name}</p>
                 </div>
                 <div className="text-right space-y-1">
                    <p className="text-[9px] font-black text-slate-300 uppercase">Contacto</p>
                    <p className="text-xs font-bold text-slate-500">{budget.responsible_phone}</p>
                 </div>
              </div>

              <div className="flex-1 space-y-8">
                 {budget.members.map((m) => (
                   <div key={m.id} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black text-slate-900 uppercase">{m.full_name}</span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase px-2 py-0.5 border border-slate-100 rounded-full">{m.relationship}</span>
                      </div>
                      <table className="w-full text-xs">
                         <tbody className="divide-y divide-slate-50">
                            {m.services.map((s, idx) => (
                              <tr key={idx}>
                                 <td className="py-2.5 font-bold text-slate-600">{s.name}</td>
                                 <td className="py-2.5 text-center font-black text-slate-300">{s.sessions}</td>
                                 <td className="py-2.5 text-right font-black text-slate-800">{new Intl.NumberFormat("es-MX").format(s.unit_price * s.sessions)}</td>
                              </tr>
                            ))}
                         </tbody>
                      </table>
                   </div>
                 ))}
              </div>

              <div className="h-px bg-slate-100" />

              <div className="flex justify-end">
                 <div className="w-48 space-y-3">
                    <div className="flex justify-between items-center text-[10px]">
                       <span className="text-slate-400 font-bold uppercase">Subtotal</span>
                       <span className="font-black text-slate-600">{new Intl.NumberFormat("es-MX").format(budget.subtotal)}</span>
                    </div>
                    {budget.discount_value > 0 && (
                      <div className="flex justify-between items-center text-[10px] text-rose-500">
                         <span className="font-bold uppercase">Descuento ({budget.discount_value}%)</span>
                         <span className="font-black">-{new Intl.NumberFormat("es-MX").format((budget.subtotal * budget.discount_value) / 100)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                       <span className="text-[10px] font-black text-[#0284C7] uppercase">Total</span>
                       <span className="text-xl font-black text-slate-900 tabular-nums">{new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(budget.total)}</span>
                    </div>
                 </div>
              </div>

              <div className="pt-8 border-t border-slate-50 space-y-4">
                 <div className="grid grid-cols-2 gap-8 text-[9px]">
                    <div className="space-y-1">
                       <p className="font-black text-slate-300 uppercase">Forma de pago</p>
                       <p className="font-bold text-slate-600">{budget.payment_method}</p>
                    </div>
                    <div className="space-y-1 text-right">
                       <p className="font-black text-slate-300 uppercase">Vigencia</p>
                       <p className="font-bold text-slate-600">{budget.validity_days} días naturales</p>
                    </div>
                 </div>
                 {budget.patient_notes && (
                   <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-[9px] leading-relaxed text-slate-500 font-medium">{budget.patient_notes}</p>
                   </div>
                 )}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
