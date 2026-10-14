import { NextResponse } from "next/server";
import { countPendingActions } from "@/lib/agents/governance";
import { getClinicContext } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const count = await countPendingActions(ctx.db, ctx.organizationId);
  if (count === null) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  return NextResponse.json({ count });
}
