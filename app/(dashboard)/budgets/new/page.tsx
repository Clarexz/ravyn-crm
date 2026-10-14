import { NewBudgetFlow } from "@/components/crm/NewBudgetFlow";
import { getClinicContext } from "@/lib/supabase/auth";
import { itemToService } from "@/lib/supabase/mappers";
import type { Item } from "@/types/database";
import { redirect } from "next/navigation";

export default async function NewBudgetPage() {
  const ctx = await getClinicContext();
  if (!ctx) redirect("/login");
  const { organizationId } = ctx;

  const { data: items, error } = await ctx.db
    .from("items")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("type", "service")
    .eq("active", true)
    .order("name");

  if (error) console.error("Error fetching services:", error);

  const services = ((items ?? []) as Item[]).map(itemToService);

  return <NewBudgetFlow organizationId={organizationId} services={services} />;
}
