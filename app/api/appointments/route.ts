import { NextRequest, NextResponse } from "next/server";
import { getClinicContext } from "@/lib/supabase/auth";
import type { AppointmentStatus } from "@/types/database";

export async function GET(request: NextRequest) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const month = searchParams.get("month");
  const year = searchParams.get("year");
  const date = searchParams.get("date");

  let query = ctx.db
    .from("appointments")
    .select("*, patients(full_name, phone), services(color)")
    .eq("clinic_id", ctx.clinicId)
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

  return NextResponse.json(data ?? []);
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

  const { data, error } = await ctx.db
    .from("appointments")
    .insert({
      clinic_id: ctx.clinicId,
      patient_id: body.patient_id,
      scheduled_at: body.scheduled_at,
      duration_minutes: body.duration_minutes ?? 30,
      status: body.status ?? "pending",
      service: body.service || null,
      service_id: body.service_id || null,
      cost_at_booking: typeof body.cost_at_booking === "number" ? body.cost_at_booking : null,
      notes: body.notes || null,
      source: body.source ?? "manual",
    })
    .select("*, patients(full_name, phone), services(color)")
    .single();

  if (error) {
    console.error("[POST /api/appointments] Error:", error);
    return NextResponse.json({ error: `${error.message}${error.hint ? ` — ${error.hint}` : ""}` }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
