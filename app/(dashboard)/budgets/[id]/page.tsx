import { BudgetDetailsClient } from "@/components/crm/BudgetDetailsClient";
import { getClinicContext } from "@/lib/supabase/auth";
import type { Budget } from "@/types/database";
import { notFound } from "next/navigation";

export default async function BudgetDetailsPage({ params }: { params: { id: string } }) {
  const ctx = await getClinicContext();
  if (!ctx) return notFound();

  const { data: budget, error } = await ctx.db
    .from("budgets")
    .select(`
      *,
      members:budget_members(
        *,
        services:budget_services(*)
      )
    `)
    .eq("id", params.id)
    .eq("clinic_id", ctx.clinicId)
    .single();

  if (error || !budget) {
    console.error("Error fetching budget:", error);
    return notFound();
  }

  return <BudgetDetailsClient budget={budget as Budget} clinicId={ctx.clinicId} />;
}
