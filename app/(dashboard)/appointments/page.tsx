import AppointmentsClient from "@/components/crm/AppointmentsClient";
import { getClinicContext } from "@/lib/supabase/auth";

export default async function AppointmentsPage() {
  const ctx = await getClinicContext();
  if (!ctx) {
    return <AppointmentsClient appointments={[]} clinicId="" userId="" clinicName="" />;
  }

  const [{ data: appointments }, { data: clinic }] = await Promise.all([
    ctx.db
      .from("appointments")
      .select("*, patients(full_name, phone), services(color)")
      .eq("clinic_id", ctx.clinicId)
      .order("scheduled_at", { ascending: true }),
    ctx.db
      .from("clinics")
      .select("name")
      .eq("id", ctx.clinicId)
      .single()
  ]);

  return (
    <AppointmentsClient
      appointments={appointments ?? []}
      clinicId={ctx.clinicId}
      userId={ctx.user.id}
      clinicName={clinic?.name ?? "Sucursal Centro"}
    />
  );
}
