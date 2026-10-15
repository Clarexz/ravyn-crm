import { NextRequest, NextResponse } from "next/server";
import { ACTION_STATUSES, listActions } from "@/lib/agents/governance";
import { getClinicContext } from "@/lib/supabase/auth";
import type { AgentActionStatus } from "@/types/database";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const status = params.get("status");
  if (status !== null && !(ACTION_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Estado invalido" }, { status: 400 });
  }
  const approval = params.get("requires_approval");
  const limitParam = params.get("limit");
  const limit = limitParam === null ? undefined : Number(limitParam);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    return NextResponse.json({ error: "Limite invalido" }, { status: 400 });
  }

  const out = await listActions(ctx.db, ctx.organizationId, {
    status: (status as AgentActionStatus | null) ?? undefined,
    requiresApproval: approval === null ? undefined : approval === "true",
    limit,
  });
  return NextResponse.json({ ...out.body, is_admin: ctx.profile?.role === "admin" }, { status: out.status });
}
