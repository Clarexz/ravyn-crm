import { NextRequest, NextResponse } from "next/server";
import { getClinicContext } from "@/lib/supabase/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data, error } = await ctx.db
    .from("appointments")
    .select("*")
    .eq("patient_id", params.id)
    .eq("clinic_id", ctx.clinicId)
    .order("scheduled_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
