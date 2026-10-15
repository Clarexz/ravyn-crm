import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildActionDiff } from "@/lib/agents/diff";
import { getAction } from "@/lib/agents/governance";
import { getClinicContext } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

// Detalle de una accion con su vista de diferencia (estado actual vs propuesto).
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!z.uuid().safeParse(params.id).success) return NextResponse.json({ error: "Accion no encontrada" }, { status: 404 });

  const out = await getAction(ctx.db, ctx.organizationId, params.id);
  if (out.status !== 200) return NextResponse.json(out.body, { status: out.status });
  const action = out.body.action as Parameters<typeof buildActionDiff>[2];
  const diff = await buildActionDiff(ctx.db, ctx.organizationId, action);
  return NextResponse.json({ ...out.body, diff, is_admin: ctx.profile?.role === "admin" });
}
