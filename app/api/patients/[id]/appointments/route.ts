import { NextRequest, NextResponse } from "next/server";
import { MOCK_APPOINTMENTS } from "@/lib/mock-data";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const appts = MOCK_APPOINTMENTS
    .filter((a) => a.patient_id === params.id)
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());

  return NextResponse.json(appts);
}
