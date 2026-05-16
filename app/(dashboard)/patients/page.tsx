import PatientsClient from "@/components/crm/PatientsClient";
import { getClinicContext } from "@/lib/supabase/auth";

export default async function PatientsPage() {
  const ctx = await getClinicContext();
  if (!ctx) return <PatientsClient patients={[]} />;

  const { data: patients } = await ctx.db
    .from("patients")
    .select("*")
    .eq("clinic_id", ctx.clinicId)
    .order("created_at", { ascending: false });

  return <PatientsClient patients={patients ?? []} />;
}
