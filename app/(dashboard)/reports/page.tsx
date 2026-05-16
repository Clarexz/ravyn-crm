import ReportsClient from "@/components/crm/ReportsClient";
import { getClinicContext } from "@/lib/supabase/auth";

export default async function ReportsPage() {
  const ctx = await getClinicContext();
  if (!ctx) return <ReportsClient appointments={[]} patients={[]} />;

  const [{ data: appointments }, { data: patients }] = await Promise.all([
    ctx.db
      .from("appointments")
      .select("*, patients(full_name, phone)")
      .eq("clinic_id", ctx.clinicId)
      .order("scheduled_at", { ascending: false }),
    ctx.db
      .from("patients")
      .select("*")
      .eq("clinic_id", ctx.clinicId)
      .order("created_at", { ascending: false }),
  ]);

  return <ReportsClient appointments={appointments ?? []} patients={patients ?? []} />;
}
