import { NextRequest, NextResponse } from "next/server";
import { getClinicContext } from "@/lib/supabase/auth";
import { bookingToAppointment } from "@/lib/supabase/mappers";
import type { AppointmentStatus, Booking } from "@/types/database";

const BOOKING_SELECT = "*, contacts(full_name, phone), items(color)";

type BookingRow = Booking & {
  contacts: { full_name: string; phone: string | null } | null;
  items: { color: string } | null;
};

// Misma forma que el JSON de v1: cita + patients + services.
function toAppointmentJson(row: BookingRow) {
  const { contacts, items, ...booking } = row;
  return { ...bookingToAppointment(booking), patients: contacts, services: items };
}

export async function GET(request: NextRequest) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const month = searchParams.get("month");
  const year = searchParams.get("year");
  const date = searchParams.get("date");

  let query = ctx.db
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("organization_id", ctx.organizationId)
    .order("scheduled_at", { ascending: true });

  if (date) {
    const start = new Date(`${date}T00:00:00`).toISOString();
    const end = new Date(`${date}T23:59:59.999`).toISOString();
    query = query.gte("scheduled_at", start).lte("scheduled_at", end);
  } else if (month && year) {
    const m = parseInt(month);
    const y = parseInt(year);
    const start = new Date(y, m - 1, 1).toISOString();
    const end = new Date(y, m, 1).toISOString();
    query = query.gte("scheduled_at", start).lt("scheduled_at", end);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[GET /api/appointments] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(((data ?? []) as BookingRow[]).map(toAppointmentJson));
}

export async function POST(request: NextRequest) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json() as {
    patient_id?: string;
    scheduled_at?: string;
    duration_minutes?: number;
    service?: string;
    service_id?: string;
    cost_at_booking?: number;
    notes?: string;
    source?: "whatsapp" | "web" | "manual";
    status?: AppointmentStatus;
  };

  if (!body.patient_id) {
    return NextResponse.json({ error: "patient_id requerido" }, { status: 400 });
  }
  if (!body.scheduled_at) {
    return NextResponse.json({ error: "scheduled_at requerido" }, { status: 400 });
  }

  // contact_id / item_id del cliente deben pertenecer a la organizacion.
  const { data: contact } = await ctx.db
    .from("contacts")
    .select("id")
    .eq("id", body.patient_id)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!contact) {
    return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
  }

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

  const { data, error } = await ctx.db
    .from("bookings")
    .insert({
      organization_id: ctx.organizationId,
      contact_id: body.patient_id,
      scheduled_at: body.scheduled_at,
      duration_minutes: body.duration_minutes ?? 30,
      status: body.status ?? "pending",
      service_snapshot: body.service || null,
      item_id: body.service_id || null,
      cost_at_booking: typeof body.cost_at_booking === "number" ? body.cost_at_booking : null,
      notes: body.notes || null,
      source: body.source ?? "manual",
    })
    .select(BOOKING_SELECT)
    .single();

  if (error) {
    console.error("[POST /api/appointments] Error:", error);
    return NextResponse.json({ error: `${error.message}${error.hint ? ` — ${error.hint}` : ""}` }, { status: 500 });
  }

  return NextResponse.json(toAppointmentJson(data as BookingRow), { status: 201 });
}
