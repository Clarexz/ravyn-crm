import { NextRequest, NextResponse } from "next/server";
import { getClinicContext } from "@/lib/supabase/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data, error } = await ctx.db
    .from("patients")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", ctx.clinicId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json() as {
    full_name?: string;
    phone?: string;
    email?: string;
    notes?: string;
  };

  const updates: Record<string, string | null> = {};
  if (body.full_name !== undefined) updates.full_name = body.full_name;
  if (body.phone !== undefined) updates.phone = body.phone || null;
  if (body.email !== undefined) updates.email = body.email || null;
  if (body.notes !== undefined) updates.notes = body.notes || null;

  const { data, error } = await ctx.db
    .from("patients")
    .update(updates)
    .eq("id", params.id)
    .eq("clinic_id", ctx.clinicId)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Paciente no encontrado" }, { status: 404 });
  }

  return NextResponse.json(data);
}
