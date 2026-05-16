import { NextRequest, NextResponse } from "next/server";
import { getClinicContext } from "@/lib/supabase/auth";
import type { AppointmentStatus } from "@/types/database";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json() as {
    status?: AppointmentStatus;
    scheduled_at?: string;
    duration_minutes?: number;
    service?: string | null;
    service_id?: string | null;
    cost_at_booking?: number | null;
    notes?: string;
    note?: string; // log entry
  };

  const { data: existing, error: fetchError } = await ctx.db
    .from("appointments")
    .select("id, status")
    .eq("id", params.id)
    .eq("clinic_id", ctx.clinicId)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  }

  const updates: Record<string, string | number | null> = {};
  if (body.status !== undefined) updates.status = body.status;
  if (body.scheduled_at !== undefined) updates.scheduled_at = body.scheduled_at;
  if (body.duration_minutes !== undefined) updates.duration_minutes = body.duration_minutes;
  if (body.service !== undefined) updates.service = body.service || null;
  if (body.service_id !== undefined) updates.service_id = body.service_id || null;
  if (body.cost_at_booking !== undefined) {
    updates.cost_at_booking = typeof body.cost_at_booking === "number" ? body.cost_at_booking : null;
  }
  if (body.notes !== undefined) updates.notes = body.notes || null;

  const { data: updated, error: updateError } = await ctx.db
    .from("appointments")
    .update(updates)
    .eq("id", params.id)
    .eq("clinic_id", ctx.clinicId)
    .select("*, patients(full_name, phone), services(color)")
    .single();

  if (updateError || !updated) {
    console.error("[PATCH /api/appointments/[id]] Error:", updateError);
    return NextResponse.json({ error: updateError?.message ?? "Error al actualizar" }, { status: 500 });
  }

  if (body.status && body.status !== existing.status) {
    await ctx.db.from("appointment_logs").insert({
      appointment_id: params.id,
      changed_by: ctx.user.id,
      old_status: existing.status,
      new_status: body.status,
      note: body.note || null,
    });
  }

  return NextResponse.json(updated);
}
