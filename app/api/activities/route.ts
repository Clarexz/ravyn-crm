import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listActivities } from "@/lib/activities";
import { getClinicContext } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  contact_id: z.uuid().optional(),
  booking_id: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(request: NextRequest) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    contact_id: params.get("contact_id") ?? undefined,
    booking_id: params.get("booking_id") ?? undefined,
    limit: params.get("limit") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Parametros invalidos" }, { status: 400 });
  if (!parsed.data.contact_id && !parsed.data.booking_id) {
    return NextResponse.json({ error: "Indica contact_id o booking_id" }, { status: 400 });
  }

  const activities = await listActivities(ctx.db, ctx.organizationId, {
    contactId: parsed.data.contact_id,
    bookingId: parsed.data.booking_id,
    limit: parsed.data.limit,
  });
  if (!activities) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  return NextResponse.json({ activities });
}
