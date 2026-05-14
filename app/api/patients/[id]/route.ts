import { NextRequest, NextResponse } from "next/server";
import { MOCK_PATIENTS } from "@/lib/mock-data";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const patient = MOCK_PATIENTS.find((p) => p.id === params.id);
  if (!patient) {
    return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
  }
  return NextResponse.json(patient);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const patient = MOCK_PATIENTS.find((p) => p.id === params.id);
  if (!patient) {
    return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
  }
  const body = await request.json() as Partial<typeof patient>;
  return NextResponse.json({ ...patient, ...body });
}
