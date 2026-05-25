import { BudgetsClient } from "@/components/crm/BudgetsClient";
import { getClinicContext } from "@/lib/supabase/auth";
import type { Budget } from "@/types/database";

export default async function BudgetsPage() {
  const ctx = await getClinicContext();
  if (!ctx) return <BudgetsClient budgets={[]} clinicId="" />;

  const { data: budgets, error } = await ctx.db
    .from("budgets")
    .select(`
      *,
      members:budget_members(
        *,
        services:budget_services(*)
      )
    `)
    .eq("clinic_id", ctx.clinicId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching budgets:", error);
  }

  return <BudgetsClient budgets={(budgets as Budget[]) ?? []} clinicId={ctx.clinicId} />;
}
