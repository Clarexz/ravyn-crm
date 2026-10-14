import { ServicesClient } from "@/components/crm/ServicesClient";
import { getClinicContext } from "@/lib/supabase/auth";
import { itemToService } from "@/lib/supabase/mappers";
import type { Item } from "@/types/database";

export default async function ServicesPage() {
  const ctx = await getClinicContext();
  if (!ctx) return <ServicesClient services={[]} />;

  const { data: items } = await ctx.db
    .from("items")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .eq("type", "service")
    .order("name", { ascending: true });

  return <ServicesClient services={((items ?? []) as Item[]).map(itemToService)} />;
}
