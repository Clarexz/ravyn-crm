import { BudgetsClient } from "@/components/crm/BudgetsClient";
import { getClinicContext } from "@/lib/supabase/auth";
import { BUDGET_SELECT, budgetFromRow } from "@/lib/budgets/mappers";

export default async function BudgetsPage() {
  const ctx = await getClinicContext();
  if (!ctx) return <BudgetsClient budgets={[]} organizationId="" />;

  const { data: budgets, error } = await ctx.db
    .from("budgets")
    .select(BUDGET_SELECT)
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching budgets:", error);
  }

  return (
    <BudgetsClient
      budgets={(budgets ?? []).map((r) => budgetFromRow(r as unknown as Record<string, unknown>))}
      organizationId={ctx.organizationId}
    />
  );
}
