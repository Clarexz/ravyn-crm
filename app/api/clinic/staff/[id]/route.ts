import { NextRequest, NextResponse } from "next/server";
import { getClinicContext } from "@/lib/supabase/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  if (ctx.profile.role !== "admin" && ctx.user.id !== params.id) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await request.json() as {
    full_name?: string;
    role?: "admin" | "staff";
  };

  const updates: Record<string, string> = {};
  if (body.full_name !== undefined) {
    if (!body.full_name.trim()) return NextResponse.json({ error: "Nombre vacío" }, { status: 400 });
    updates.full_name = body.full_name.trim();
  }
  if (body.role !== undefined && ctx.profile.role === "admin") {
    updates.role = body.role;
  }

  const { data, error } = await ctx.db
    .from("users")
    .update(updates)
    .eq("id", params.id)
    .eq("clinic_id", ctx.clinicId)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "No encontrado" }, { status: 404 });
  }

  const { data: auth } = await ctx.db.auth.admin.getUserById(params.id);
  return NextResponse.json({ ...data, email: auth?.user?.email ?? "" });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  if (ctx.profile.role !== "admin") {
    return NextResponse.json({ error: "Solo admin puede eliminar miembros" }, { status: 403 });
  }
  if (ctx.user.id === params.id) {
    return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 400 });
  }

  // Verificar que pertenece a la clínica antes de borrar
  const { data: target } = await ctx.db
    .from("users")
    .select("id")
    .eq("id", params.id)
    .eq("clinic_id", ctx.clinicId)
    .single();

  if (!target) {
    return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });
  }

  // Borrar auth user → la FK CASCADE elimina el registro de public.users
  const { error } = await ctx.db.auth.admin.deleteUser(params.id);
  if (error) {
    console.error("[DELETE /api/clinic/staff/[id]] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
