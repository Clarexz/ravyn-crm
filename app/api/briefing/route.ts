import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateBriefing } from "@/lib/agents/analyst";
import { getClinicContext } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

const querySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

// Briefing diario del Agente Analista. Solo lectura; la organizacion sale siempre de la sesion.
export async function GET(request: NextRequest) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const parsed = querySchema.safeParse({ days: request.nextUrl.searchParams.get("days") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "Parametros invalidos" }, { status: 400 });
  try {
    const briefing = await generateBriefing({ organizationId: ctx.organizationId, db: ctx.db, agent: "analyst" }, parsed.data.days);
    return NextResponse.json({ briefing });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
