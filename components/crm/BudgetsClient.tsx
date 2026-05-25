"use client";

import { useState, useMemo } from "react";
import { Search, Plus, Receipt, FileDown, Trash2, Eye, Users, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { Budget, BudgetStatus } from "@/types/database";

interface BudgetsClientProps {
  budgets: Budget[];
  clinicId: string;
}

const STATUS_CONFIG: Record<BudgetStatus, { label: string; className: string }> = {
  active:   { label: "Vigente",  className: "bg-[#EFF6FF] text-[#0284C7] dark:bg-blue-500/20 dark:text-blue-400" },
  accepted: { label: "Aceptado", className: "bg-[#F0FDF4] text-[#10B981] dark:bg-emerald-500/20 dark:text-emerald-400" },
  expired:  { label: "Vencido",  className: "bg-[#FEF2F2] text-[#DC2626] dark:bg-rose-500/20 dark:text-rose-400" },
  draft:    { label: "Borrador", className: "bg-[#F8FAFC] text-[#64748B] border border-slate-200 dark:bg-white/10 dark:text-white/40 dark:border-none" },
};

export function BudgetsClient({ budgets: initialBudgets }: BudgetsClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [budgets, setBudgets] = useState<Budget[]>(initialBudgets);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return budgets.filter((b) => {
      const q = search.toLowerCase();
      return b.responsible_name.toLowerCase().includes(q) || b.budget_number.toLowerCase().includes(q);
    });
  }, [budgets, search]);

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este presupuesto permanentemente?")) return;
    
    setIsDeleting(id);
    try {
      const res = await fetch(`/api/budgets/${id}`, {
        method: "DELETE",
      });
      
      if (!res.ok) throw new Error("Error al eliminar");
      
      setBudgets(prev => prev.filter(b => b.id !== id));
      toast.success("Presupuesto eliminado");
      router.refresh();
    } catch {
      toast.error("No se pudo eliminar el presupuesto");
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div className="space-y-8 w-full">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight transition-colors">Presupuestos</h1>
          <p className="text-sm text-[var(--text-secondary)] font-semibold mt-1 transition-colors">Cotizaciones y planes de tratamiento familiar</p>
        </div>
        <Button
          onClick={() => router.push("/budgets/new")}
          className="h-10 gap-2 bg-[#0284C7] text-white hover:bg-[#0369A1] shrink-0 font-black text-[10px] uppercase tracking-widest px-6 rounded-xl shadow-lg shadow-blue-500/20 transition-all"
        >
          <Plus className="w-4 h-4 text-white" />
          Nuevo presupuesto
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por responsable o número de presupuesto..."
          className="pl-11 h-12 text-sm w-full bg-[var(--bg-input)] border border-[var(--border-default)] dark:border-white/5 rounded-2xl shadow-sm focus:ring-2 focus:ring-[var(--brand-accent)] text-[var(--text-primary)] transition-all"
        />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] dark:border-white/5 rounded-[32px] py-24 text-center shadow-sm transition-all flex flex-col items-center gap-6">
            <div className="w-20 h-20 bg-[var(--bg-page)] rounded-full flex items-center justify-center border border-[var(--border-default)] dark:border-white/5">
              <Receipt className="w-10 h-10 text-[var(--text-muted)] opacity-20" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-[var(--text-secondary)] font-black uppercase tracking-widest opacity-40">
                Aún no tienes presupuestos creados
              </p>
              <p className="text-xs text-[var(--text-muted)] font-medium italic lowercase">Comienza creando tu primera cotización familiar</p>
            </div>
            <Button
              onClick={() => router.push("/budgets/new")}
              variant="outline"
              className="mt-2 h-11 px-8 rounded-2xl border-[var(--brand-accent)] text-[var(--brand-accent)] font-black text-[10px] uppercase tracking-widest hover:bg-[var(--brand-accent)] hover:text-white transition-all shadow-sm"
            >
              + Nuevo presupuesto
            </Button>
          </div>
        ) : (
          filtered.map((b) => {
            const status = STATUS_CONFIG[b.status];
            return (
              <div
                key={b.id}
                onClick={() => router.push(`/budgets/${b.id}`)}
                className="bg-[var(--bg-card)] border-b border-[var(--border-default)] dark:border-white/5 md:rounded-[24px] md:border p-6 flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer group shadow-sm"
              >
                <div className="flex items-center gap-6 min-w-0">
                   <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-all dark:bg-blue-500/10 dark:text-blue-400 dark:border-none shadow-inner">
                     <span className="text-base font-black uppercase">{b.responsible_name.charAt(0)}</span>
                   </div>
                   <div className="min-w-0">
                     <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-[var(--brand-accent)] tracking-widest">{b.budget_number}</span>
                        <p className="text-lg font-black text-[var(--text-primary)] truncate leading-none transition-colors">{b.responsible_name}</p>
                     </div>
                     <div className="flex items-center gap-4 mt-2 transition-colors">
                        <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                           <Users className="w-3.5 h-3.5 opacity-40" />
                           <span className="text-[10px] font-bold uppercase tracking-wider">{b.members?.length || 0} {b.members?.length === 1 ? 'Integrante' : 'Integrantes'}</span>
                        </div>
                        <span className="w-1 h-1 rounded-full bg-[var(--text-muted)] opacity-20" />
                        <p className="text-[11px] font-black text-[var(--text-primary)] transition-colors">
                          {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(b.total)}
                        </p>
                     </div>
                   </div>
                </div>

                <div className="flex items-center gap-8">
                  <div className="text-right hidden lg:block space-y-1">
                    <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest opacity-60">Emisión</p>
                    <p className="text-[10px] font-bold text-[var(--text-primary)] transition-colors">{format(new Date(b.created_at), "d MMM yyyy", { locale: es })}</p>
                  </div>
                  <div className="text-right hidden lg:block space-y-1">
                    <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest opacity-60">Vence</p>
                    <p className="text-[10px] font-bold text-[var(--text-primary)] transition-colors">{format(new Date(b.expires_at), "d MMM yyyy", { locale: es })}</p>
                  </div>
                  <Badge variant="outline" className={cn("text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter border-none shadow-sm transition-all", status.className)}>
                    {status.label}
                  </Badge>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg hover:bg-[var(--bg-page)] text-[var(--text-secondary)] transition-colors">
                       <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg hover:bg-[var(--bg-page)] text-[var(--text-secondary)] transition-colors">
                       <FileDown className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="w-8 h-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 transition-colors"
                      disabled={isDeleting === b.id}
                      onClick={(e) => { e.stopPropagation(); handleDelete(b.id); }}
                    >
                       {isDeleting === b.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {filtered.length > 0 && (
        <div className="px-4 opacity-40">
          <p className="text-[9px] font-medium text-[var(--text-muted)] lowercase italic transition-colors">
            {filtered.length} {filtered.length === 1 ? 'presupuesto registrado' : 'presupuestos registrados'}
          </p>
        </div>
      )}
    </div>
  );
}
