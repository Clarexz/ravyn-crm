import { BudgetsClient } from "@/components/crm/BudgetsClient";
import { getClinicContext } from "@/lib/supabase/auth";

export default async function BudgetsPage() {
  const { clinicId } = await getClinicContext();
  
  // In a real app, we would fetch from Supabase here
  // const { data: budgets } = await supabase.from('budgets').select('*').eq('clinic_id', clinicId);
  
  // For now, we'll pass an empty array or mock data
  const budgets: any[] = []; 

  return <BudgetsClient budgets={budgets} clinicId={clinicId} />;
}
