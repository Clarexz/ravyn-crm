import { NewBudgetFlow } from "@/components/crm/NewBudgetFlow";
import { getClinicContext } from "@/lib/supabase/auth";
import { redirect } from "next/navigation";

export default async function NewBudgetPage() {
  const ctx = await getClinicContext();
  if (!ctx) redirect("/login");
  const { clinicId } = ctx;
  
  // Fetch services for the services selector in step 2
  // Fetch patients for the responsible search in step 1
  
  return <NewBudgetFlow clinicId={clinicId} />;
}
