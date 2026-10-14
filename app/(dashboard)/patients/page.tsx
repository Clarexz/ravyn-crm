import PatientsClient from "@/components/crm/PatientsClient";
import { getClinicContext } from "@/lib/supabase/auth";
import { contactToPatient } from "@/lib/supabase/mappers";
import type { Contact } from "@/types/database";

export default async function PatientsPage() {
  const ctx = await getClinicContext();
  if (!ctx) return <PatientsClient patients={[]} />;

  const { data: contacts } = await ctx.db
    .from("contacts")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false });

  return <PatientsClient patients={((contacts ?? []) as Contact[]).map(contactToPatient)} />;
}
