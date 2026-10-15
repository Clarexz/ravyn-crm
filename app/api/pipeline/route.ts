import { NextResponse } from "next/server";
import { loadBoardCards } from "@/lib/pipeline/board";
import { STALE_DAYS, type PipelineBoard } from "@/lib/pipeline/stages";
import { getClinicContext } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

// Tablero del pipeline de la organizacion de la sesion (solo lectura).
export async function GET() {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const now = new Date();
  const cards = await loadBoardCards(ctx.db, ctx.organizationId, now);
  if (!cards) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  const board: PipelineBoard = { cards, is_admin: ctx.profile.role === "admin", generated_at: now.toISOString(), stale_days: STALE_DAYS };
  return NextResponse.json(board);
}
