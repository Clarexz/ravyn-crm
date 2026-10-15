import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DemoDb } from "@/lib/demo";
import { isDemoMode } from "@/lib/demo/config";
import { switchDemoVertical } from "@/lib/demo/verticals";
import { guardMutation } from "@/lib/http/requestGuard";
import { packFor, SELECTABLE_INDUSTRIES, type TenantConfig } from "@/lib/industry/packs";
import { applyTenantChange, loadTenantConfig } from "@/lib/industry/server";
import { getClinicContext } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

function view(config: TenantConfig, isAdmin: boolean) {
  return {
    industry: config.industry,
    industry_label: config.industryLabel,
    organization_name: config.organizationName,
    timezone: config.timezone,
    business_hours: config.businessHours,
    labels: config.labels,
    new_booking_label: config.newBookingLabel,
    modules: config.modules,
    active_modules: config.activeModules,
    industries: SELECTABLE_INDUSTRIES.map((id) => ({ id, label: packFor(id).label })),
    is_admin: isAdmin,
    demo: isDemoMode(),
  };
}

// Esquema de la organizacion de la sesion: industria, zona horaria, etiquetas y modulos activos/inactivos.
export async function GET() {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const config = await loadTenantConfig(ctx.db, ctx.organizationId);
  return NextResponse.json(view(config, ctx.profile?.role === "admin"));
}

const bodySchema = z
  .object({
    industry: z.enum(SELECTABLE_INDUSTRIES).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
  })
  .strict()
  .refine((b) => b.industry !== undefined || b.timezone !== undefined, { message: "Nada que cambiar" });

// Solo un administrador cambia la industria o la zona horaria de SU organizacion (el id sale de la sesion).
export async function PATCH(request: NextRequest) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (ctx.profile?.role !== "admin") {
    return NextResponse.json({ error: "Solo un administrador puede cambiar la configuracion de la organizacion" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }
  const body = bodySchema.safeParse(json);
  if (!body.success) return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });

  try {
    if (body.data.industry !== undefined) {
      if (isDemoMode() && ctx.db instanceof DemoDb) {
        // Demo: ademas de la configuracion, cambian los datos de ejemplo al giro elegido.
        switchDemoVertical(ctx.db, ctx.organizationId, body.data.industry);
      } else {
        const out = await applyTenantChange(ctx.db, ctx.organizationId, { industry: body.data.industry });
        if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 });
      }
    }
    if (body.data.timezone !== undefined) {
      const out = await applyTenantChange(ctx.db, ctx.organizationId, { timezone: body.data.timezone });
      if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 });
    }
  } catch (error) {
    console.error("[PATCH /api/organization/schema]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  return NextResponse.json(view(await loadTenantConfig(ctx.db, ctx.organizationId), true));
}
