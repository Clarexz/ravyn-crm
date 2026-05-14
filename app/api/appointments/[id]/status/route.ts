import { NextRequest, NextResponse } from "next/server";
import { MOCK_APPOINTMENTS } from "@/lib/mock-data";
import type { AppointmentStatus } from "@/types/database";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json() as { status: AppointmentStatus; note?: string };
  const appt = MOCK_APPOINTMENTS.find((a) => a.id === params.id);

  if (!appt) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  }

  // Return the updated appointment (in-memory only — no persistence in mock mode)
  return NextResponse.json({
    ...appt,
    status: body.status,
    updated_at: new Date().toISOString(),
  });
}
