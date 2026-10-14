import { DashboardClient } from "@/components/crm/DashboardClient";
import { getClinicContext } from "@/lib/supabase/auth";
import { bookingToAppointment } from "@/lib/supabase/mappers";
import type { Booking } from "@/types/database";
import { subDays, startOfDay } from "date-fns";

export default async function DashboardPage() {
  const ctx = await getClinicContext();
  if (!ctx) return <DashboardClient appointments={[]} organizationId="" />;

  const since = startOfDay(subDays(new Date(), 30)).toISOString();

  const { data: bookings } = await ctx.db
    .from("bookings")
    .select("*, contacts(full_name, phone)")
    .eq("organization_id", ctx.organizationId)
    .gte("scheduled_at", since)
    .order("scheduled_at", { ascending: true });

  const appointments = ((bookings ?? []) as (Booking & {
    contacts: { full_name: string; phone: string | null } | null;
  })[]).map(({ contacts, ...booking }) => ({
    ...bookingToAppointment(booking),
    patients: contacts
      ? { full_name: contacts.full_name, phone: contacts.phone ?? undefined }
      : null,
  }));

  return <DashboardClient appointments={appointments} organizationId={ctx.organizationId} />;
}
