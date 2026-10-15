import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { moveOpportunityStage } from "@/lib/pipeline/board";
import { STAGES } from "@/lib/pipeline/stages";
import { guardMutation } from "@/lib/http/requestGuard";
import { getClinicContext } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    stage: z.enum(STAGES),
    from: z.enum(STAGES).optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

// Movimiento humano de etapa (D-14). organization_id y autor salen de la sesion, nunca del cuerpo.
// Cerrar o reabrir (won/lost) solo lo hace un administrador. No pasa por la aprobacion de agentes.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!z.uuid().safeParse(params.id).success) return NextResponse.json({ error: "Id invalido" }, { status: 400 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });

  const result = await moveOpportunityStage(ctx.db, {
    organizationId: ctx.organizationId,
    opportunityId: params.id,
    toStage: parsed.data.stage,
    expectedFrom: parsed.data.from,
    reason: parsed.data.reason,
    actor: { id: ctx.user.id, role: ctx.profile.role },
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, ...(result.current_stage ? { current_stage: result.current_stage } : {}) }, { status: result.status });
  }
  return NextResponse.json(result);
}
