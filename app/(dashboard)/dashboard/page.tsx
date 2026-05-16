import { DashboardClient } from "@/components/crm/DashboardClient";
import { getClinicContext } from "@/lib/supabase/auth";
import { subDays, startOfDay } from "date-fns";

export default async function DashboardPage() {
  const ctx = await getClinicContext();
  if (!ctx) return <DashboardClient appointments={[]} />;

  const since = startOfDay(subDays(new Date(), 30)).toISOString();

  const { data: appointments } = await ctx.db
    .from("appointments")
    .select("*, patients(full_name, phone)")
    .eq("clinic_id", ctx.clinicId)
    .gte("scheduled_at", since)
    .order("scheduled_at", { ascending: true });

  return <DashboardClient appointments={appointments ?? []} />;
}
