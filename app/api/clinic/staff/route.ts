import { NextRequest, NextResponse } from "next/server";
import { getClinicContext } from "@/lib/supabase/auth";

export async function GET() {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: profiles, error } = await ctx.db
    .from("users")
    .select("*")
    .eq("clinic_id", ctx.clinicId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[GET /api/clinic/staff] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enriched = await Promise.all(
    (profiles ?? []).map(async (p) => {
      const { data: auth } = await ctx.db.auth.admin.getUserById(p.id);
      return { ...p, email: auth?.user?.email ?? "" };
    }),
  );

  return NextResponse.json(enriched);
}

export async function POST(request: NextRequest) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  if (ctx.profile.role !== "admin") {
    return NextResponse.json({ error: "Solo administradores pueden agregar miembros" }, { status: 403 });
  }

  const body = await request.json() as {
    full_name?: string;
    email?: string;
    password?: string;
    role?: "admin" | "staff";
  };

  if (!body.full_name?.trim() || !body.email?.trim() || !body.password) {
    return NextResponse.json({ error: "Nombre, email y contraseña son requeridos" }, { status: 400 });
  }
  if (body.password.length < 6) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
  }

  // Crear auth user con metadata role='staff' para que el trigger handle_new_user
  // lo asigne a esta clínica (el flujo admin del trigger CREARÍA una clínica nueva)
  const { data: created, error: createError } = await ctx.db.auth.admin.createUser({
    email: body.email.trim(),
    password: body.password,
    email_confirm: true,
    user_metadata: {
      full_name: body.full_name.trim(),
      role: "staff",
      clinic_id: ctx.clinicId,
    },
  });

  if (createError || !created.user) {
    console.error("[POST /api/clinic/staff] Auth error:", createError);
    return NextResponse.json({ error: createError?.message ?? "Error al crear usuario" }, { status: 500 });
  }

  // Si el admin quiere crear otro admin, ajustar el rol después del trigger
  if (body.role === "admin") {
    await ctx.db.from("users").update({ role: "admin" }).eq("id", created.user.id);
  }

  const { data: profile } = await ctx.db
    .from("users")
    .select("*")
    .eq("id", created.user.id)
    .single();

  return NextResponse.json(
    { ...profile, email: created.user.email ?? body.email.trim() },
    { status: 201 },
  );
}
