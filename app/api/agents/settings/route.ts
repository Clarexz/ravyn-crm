import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AUTONOMY_LEVELS, loadOrgAgentConfig, saveOrgAgentConfig } from "@/lib/agents/settings";
import { SPECIALIST_NAMES } from "@/lib/agents/prompts";
import { guardMutation } from "@/lib/http/requestGuard";
import { getClinicContext } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const config = await loadOrgAgentConfig(ctx.db, ctx.organizationId);
  return NextResponse.json({ config, is_admin: ctx.profile.role === "admin" });
}

const agentSchema = z
  .object({ enabled: z.boolean().optional(), autonomy: z.enum(AUTONOMY_LEVELS as [string, ...string[]]).optional() })
  .strict();
const bodySchema = z
  .object({ agents: z.object(Object.fromEntries(SPECIALIST_NAMES.map((n) => [n, agentSchema.optional()]))).strict() })
  .strict();

// Solo un administrador puede cambiar la configuracion de los agentes.
export async function PATCH(request: NextRequest) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (ctx.profile.role !== "admin") {
    return NextResponse.json({ error: "Solo un administrador puede cambiar la configuracion de los agentes" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }
  const body = bodySchema.safeParse(json);
  if (!body.success) return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });

  const config = await saveOrgAgentConfig(ctx.db, ctx.organizationId, body.data.agents as Parameters<typeof saveOrgAgentConfig>[2]);
  if (!config) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  return NextResponse.json({ config });
}
