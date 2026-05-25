import { getClinicContext } from "@/lib/supabase/auth";
import { PatientProfileClient } from "@/components/crm/PatientProfileClient";
import { notFound } from "next/navigation";

export default async function PatientProfilePage({ params }: { params: { id: string } }) {
  const ctx = await getClinicContext();
  if (!ctx) return null;

  // 1. Fetch patient
  const { data: patient } = await ctx.db
    .from("patients")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", ctx.clinicId)
    .single();

  if (!patient) notFound();

  // 2. Fetch appointments
  const { data: appointments } = await ctx.db
    .from("appointments")
    .select("*")
    .eq("patient_id", params.id)
    .order("scheduled_at", { ascending: false });

  return <PatientProfileClient patient={patient} appointments={appointments ?? []} />;
}
