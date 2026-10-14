import { getClinicContext } from "@/lib/supabase/auth";
import { PatientProfileClient } from "@/components/crm/PatientProfileClient";
import { notFound } from "next/navigation";
import { bookingToAppointment, contactToPatient } from "@/lib/supabase/mappers";
import type { Booking, Contact } from "@/types/database";

export default async function PatientProfilePage({ params }: { params: { id: string } }) {
  const ctx = await getClinicContext();
  if (!ctx) return null;

  // 1. Contacto (verifica pertenencia a la organizacion)
  const { data: contact } = await ctx.db
    .from("contacts")
    .select("*")
    .eq("id", params.id)
    .eq("organization_id", ctx.organizationId)
    .single();

  if (!contact) notFound();

  // 2. Reservas del contacto
  const { data: bookings } = await ctx.db
    .from("bookings")
    .select("*")
    .eq("contact_id", params.id)
    .eq("organization_id", ctx.organizationId)
    .order("scheduled_at", { ascending: false });

  return (
    <PatientProfileClient
      patient={contactToPatient(contact as Contact)}
      appointments={((bookings ?? []) as Booking[]).map(bookingToAppointment)}
    />
  );
}
