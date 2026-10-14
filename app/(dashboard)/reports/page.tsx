import ReportsClient from "@/components/crm/ReportsClient";
import { getClinicContext } from "@/lib/supabase/auth";
import { bookingToAppointment, contactToPatient } from "@/lib/supabase/mappers";
import type { Booking, Contact } from "@/types/database";

export default async function ReportsPage() {
  const ctx = await getClinicContext();
  if (!ctx) return <ReportsClient appointments={[]} patients={[]} />;

  const [{ data: bookings }, { data: contacts }] = await Promise.all([
    ctx.db
      .from("bookings")
      .select("*")
      .eq("organization_id", ctx.organizationId)
      .order("scheduled_at", { ascending: false }),
    ctx.db
      .from("contacts")
      .select("*")
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <ReportsClient
      appointments={((bookings ?? []) as Booking[]).map(bookingToAppointment)}
      patients={((contacts ?? []) as Contact[]).map(contactToPatient)}
    />
  );
}
