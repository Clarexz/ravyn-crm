import AppointmentsClient from "@/components/crm/AppointmentsClient";
import { getClinicContext } from "@/lib/supabase/auth";

export default async function AppointmentsPage() {
  const ctx = await getClinicContext();
  if (!ctx) {
    return <AppointmentsClient appointments={[]} clinicId="" userId="" />;
  }

  const { data: appointments } = await ctx.db
    .from("appointments")
    .select("*, patients(full_name, phone), services(color)")
    .eq("clinic_id", ctx.clinicId)
    .order("scheduled_at", { ascending: true });

  return (
    <AppointmentsClient
      appointments={appointments ?? []}
      clinicId={ctx.clinicId}
      userId={ctx.user.id}
    />
  );
}
