import { ServicesClient } from "@/components/crm/ServicesClient";
import { getClinicContext } from "@/lib/supabase/auth";
import type { Service } from "@/types/database";

export default async function ServicesPage() {
  const ctx = await getClinicContext();
  if (!ctx) return <ServicesClient services={[]} />;

  const { data: services } = await ctx.db
    .from("services")
    .select("*")
    .eq("clinic_id", ctx.clinicId)
    .order("name", { ascending: true });

  return <ServicesClient services={(services as Service[]) ?? []} />;
}
