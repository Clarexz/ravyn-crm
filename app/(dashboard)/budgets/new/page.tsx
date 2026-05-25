import { NewBudgetFlow } from "@/components/crm/NewBudgetFlow";
import { getClinicContext } from "@/lib/supabase/auth";

export default async function NewBudgetPage() {
  const { clinicId } = await getClinicContext();
  
  // Fetch services for the services selector in step 2
  // Fetch patients for the responsible search in step 1
  
  return <NewBudgetFlow clinicId={clinicId} />;
}
