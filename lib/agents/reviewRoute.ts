// Utilidades compartidas por las rutas de aprobacion y rechazo.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { approveAction, rejectAction, type GovernanceOutcome } from "@/lib/agents/governance";
import { getClinicContext } from "@/lib/supabase/auth";

const bodySchema = z
  .object({
    notes: z.string().trim().max(1000).optional(),
    input: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

async function readBody(request: NextRequest): Promise<{ notes?: string; input?: Record<string, unknown> } | null> {
  const raw = await request.text();
  if (!raw.trim()) return {};
  try {
    const parsed = bodySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function handleReview(request: NextRequest, id: string, kind: "approve" | "reject"): Promise<NextResponse> {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Accion no encontrada" }, { status: 404 });

  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });

  // organizationId y userId salen siempre de la sesion.
  const base = { db: ctx.db, organizationId: ctx.organizationId, userId: ctx.user.id, actionId: id, notes: body.notes };
  const out: GovernanceOutcome =
    kind === "approve" ? await approveAction({ ...base, input: body.input }) : await rejectAction(base);
  return NextResponse.json(out.body, { status: out.status });
}
