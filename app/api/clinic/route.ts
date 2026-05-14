import { NextRequest, NextResponse } from "next/server";
import { MOCK_CLINIC } from "@/lib/mock-data";

export async function PATCH(request: NextRequest) {
  const body = await request.json() as Partial<typeof MOCK_CLINIC>;
  return NextResponse.json({ ...MOCK_CLINIC, ...body });
}
