import { NextRequest, NextResponse } from "next/server";
import { getClinicContext } from "@/lib/supabase/auth";
import { bookingToAppointment } from "@/lib/supabase/mappers";
import type { Booking } from "@/types/database";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data, error } = await ctx.db
    .from("bookings")
    .select("*")
    .eq("contact_id", params.id)
    .eq("organization_id", ctx.organizationId)
    .order("scheduled_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(((data ?? []) as Booking[]).map(bookingToAppointment));
}
