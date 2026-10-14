import AppointmentsClient from "@/components/crm/AppointmentsClient";
import { getClinicContext } from "@/lib/supabase/auth";
import { bookingToAppointment } from "@/lib/supabase/mappers";
import type { Booking } from "@/types/database";

type BookingRow = Booking & {
  contacts: { full_name: string; phone: string | null } | null;
  items: { color: string } | null;
};

export default async function AppointmentsPage() {
  const ctx = await getClinicContext();
  if (!ctx) {
    return <AppointmentsClient appointments={[]} organizationId="" userId="" clinicName="" />;
  }

  const [{ data: bookings }, { data: organization }] = await Promise.all([
    ctx.db
      .from("bookings")
      .select("*, contacts(full_name, phone), items(color)")
      .eq("organization_id", ctx.organizationId)
      .order("scheduled_at", { ascending: true }),
    ctx.db
      .from("organizations")
      .select("name")
      .eq("id", ctx.organizationId)
      .single()
  ]);

  const appointments = ((bookings ?? []) as BookingRow[]).map(({ contacts, items, ...booking }) => ({
    ...bookingToAppointment(booking),
    patients: contacts,
    services: items,
  }));

  return (
    <AppointmentsClient
      appointments={appointments}
      organizationId={ctx.organizationId}
      userId={ctx.user.id}
      clinicName={organization?.name ?? "Sucursal Centro"}
    />
  );
}
