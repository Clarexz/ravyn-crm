import { NextRequest, NextResponse } from "next/server";
import { MOCK_APPOINTMENTS, MOCK_PATIENTS } from "@/lib/mock-data";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const month = searchParams.get("month");
  const year = searchParams.get("year");

  let results = MOCK_APPOINTMENTS;

  if (month && year) {
    const m = parseInt(month);
    const y = parseInt(year);
    const start = new Date(y, m - 1, 1).getTime();
    const end = new Date(y, m, 1).getTime();
    results = results.filter((a) => {
      const t = new Date(a.scheduled_at).getTime();
      return t >= start && t < end;
    });
  }

  return NextResponse.json(results);
}

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    patient_id?: string;
    scheduled_at?: string;
    duration_minutes?: number;
    service?: string;
    notes?: string;
  };

  const patient = MOCK_PATIENTS.find((p) => p.id === body.patient_id) ?? null;
  const newAppt = {
    id: `a-${Date.now()}`,
    clinic_id: "mock-clinic-001",
    patient_id: body.patient_id ?? null,
    scheduled_at: body.scheduled_at ?? new Date().toISOString(),
    duration_minutes: body.duration_minutes ?? 30,
    status: "pending" as const,
    service: body.service ?? null,
    notes: body.notes ?? null,
    source: "manual" as const,
    n8n_execution_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    patients: patient ? { full_name: patient.full_name, phone: patient.phone ?? "" } : null,
  };

  return NextResponse.json(newAppt, { status: 201 });
}
