import { BudgetDetailsClient } from "@/components/crm/BudgetDetailsClient";
import { getClinicContext } from "@/lib/supabase/auth";

export default async function BudgetDetailsPage({ params }: { params: { id: string } }) {
  const { clinicId } = await getClinicContext();
  
  // In a real app, we would fetch the specific budget from Supabase
  // For now, we'll pass a mock budget or handle the "not found" state
  
  return <BudgetDetailsClient budgetId={params.id} clinicId={clinicId} />;
}
