import { NextRequest, NextResponse } from "next/server";
import { MOCK_PATIENTS } from "@/lib/mock-data";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const results = q.length >= 2
    ? MOCK_PATIENTS.filter((p) =>
        p.full_name.toLowerCase().includes(q.toLowerCase()) ||
        (p.phone ?? "").includes(q)
      )
    : MOCK_PATIENTS.slice(0, 10);

  return NextResponse.json(results);
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { full_name?: string; phone?: string; email?: string; notes?: string };
  const newPatient = {
    id: `p-${Date.now()}`,
    clinic_id: "mock-clinic-001",
    full_name: body.full_name ?? "Nuevo paciente",
    phone: body.phone ?? null,
    email: body.email ?? null,
    notes: body.notes ?? null,
    source: "manual" as const,
    created_at: new Date().toISOString(),
  };
  return NextResponse.json(newPatient, { status: 201 });
}
