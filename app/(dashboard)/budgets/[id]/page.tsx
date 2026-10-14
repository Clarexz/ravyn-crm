import { BudgetDetailsClient } from "@/components/crm/BudgetDetailsClient";
import { getClinicContext } from "@/lib/supabase/auth";
import { BUDGET_SELECT, budgetFromRow } from "@/lib/budgets/mappers";
import { notFound } from "next/navigation";

export default async function BudgetDetailsPage({ params }: { params: { id: string } }) {
  const ctx = await getClinicContext();
  if (!ctx) return notFound();

  const { data: budget, error } = await ctx.db
    .from("budgets")
    .select(BUDGET_SELECT)
    .eq("id", params.id)
    .eq("organization_id", ctx.organizationId)
    .single();

  if (error || !budget) {
    console.error("Error fetching budget:", error);
    return notFound();
  }

  return (
    <BudgetDetailsClient
      budget={budgetFromRow(budget as unknown as Record<string, unknown>)}
      organizationId={ctx.organizationId}
    />
  );
}
