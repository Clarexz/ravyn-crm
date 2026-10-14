import { NextRequest, NextResponse } from "next/server";
import { getClinicContext } from "@/lib/supabase/auth";
import { bookingToAppointment } from "@/lib/supabase/mappers";
import type { AppointmentStatus, Booking } from "@/types/database";

type BookingRow = Booking & {
  contacts: { full_name: string; phone: string | null } | null;
  items: { color: string } | null;
};

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
    .from("bookings")
    .select("id, status, contact_id")
    .eq("id", params.id)
    .eq("organization_id", ctx.organizationId)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  }

  const updates: Record<string, string | number | null> = {};
  if (body.status !== undefined) updates.status = body.status;
  if (body.scheduled_at !== undefined) updates.scheduled_at = body.scheduled_at;
  if (body.duration_minutes !== undefined) updates.duration_minutes = body.duration_minutes;
  if (body.service !== undefined) updates.service_snapshot = body.service || null;
  if (body.service_id !== undefined) {
    if (body.service_id) {
      const { data: item } = await ctx.db
        .from("items")
        .select("id")
        .eq("id", body.service_id)
        .eq("organization_id", ctx.organizationId)
        .maybeSingle();
      if (!item) {
        return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 });
      }
    }
    updates.item_id = body.service_id || null;
  }
  if (body.cost_at_booking !== undefined) {
    updates.cost_at_booking = typeof body.cost_at_booking === "number" ? body.cost_at_booking : null;
  }
  if (body.notes !== undefined) updates.notes = body.notes || null;

  const { data: updated, error: updateError } = await ctx.db
    .from("bookings")
    .update(updates)
    .eq("id", params.id)
    .eq("organization_id", ctx.organizationId)
    .select("*, contacts(full_name, phone), items(color)")
    .single();

  if (updateError || !updated) {
    console.error("[PATCH /api/appointments/[id]] Error:", updateError);
    return NextResponse.json({ error: updateError?.message ?? "Error al actualizar" }, { status: 500 });
  }

  if (body.status && body.status !== existing.status) {
    const { error: logError } = await ctx.db.from("activities").insert({
      organization_id: ctx.organizationId,
      contact_id: existing.contact_id,
      booking_id: params.id,
      type: "note",
      title: `Cambio de estado: ${existing.status} -> ${body.status}`,
      description: body.note || null,
      status: "completed",
      performed_by_type: "human",
      performed_by_id: ctx.user.id,
    });
    if (logError) console.error("[PATCH /api/appointments/[id]] Error al registrar actividad:", logError);
  }

  const { contacts, items, ...booking } = updated as BookingRow;
  return NextResponse.json({ ...bookingToAppointment(booking), patients: contacts, services: items });
}
