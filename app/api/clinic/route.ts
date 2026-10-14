import { NextRequest, NextResponse } from "next/server";
import { getClinicContext } from "@/lib/supabase/auth";

export async function GET() {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data, error } = await ctx.db
    .from("organizations")
    .select("id, name, phone, email, subdomain, plan, created_at")
    .eq("id", ctx.organizationId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Clínica no encontrada" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (ctx.profile.role !== "admin") {
    return NextResponse.json({ error: "Solo un administrador puede editar la organizacion" }, { status: 403 });
  }

  const body = await request.json() as {
    name?: string;
    phone?: string;
    email?: string;
  };

  const updates: Record<string, string | null> = {};
  if (body.name !== undefined) {
    if (!body.name.trim()) return NextResponse.json({ error: "Nombre vacío" }, { status: 400 });
    updates.name = body.name.trim();
  }
  if (body.phone !== undefined) updates.phone = body.phone.trim() || null;
  if (body.email !== undefined) updates.email = body.email.trim() || null;

  const { data, error } = await ctx.db
    .from("organizations")
    .update(updates)
    .eq("id", ctx.organizationId)
    .select("id, name, phone, email, subdomain, plan, created_at")
    .single();

  if (error || !data) {
    console.error("[PATCH /api/clinic] Error:", error);
    return NextResponse.json({ error: error?.message ?? "Error" }, { status: 500 });
  }

  return NextResponse.json(data);
}
