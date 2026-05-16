import { NextRequest, NextResponse } from "next/server";
import { getClinicContext } from "@/lib/supabase/auth";

export async function GET(request: NextRequest) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q") ?? "";

  let query = ctx.db
    .from("patients")
    .select("*")
    .eq("clinic_id", ctx.clinicId)
    .order("created_at", { ascending: false });

  if (q.length >= 1) {
    query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`).limit(20);
  } else {
    query = query.limit(10);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json() as {
    full_name?: string;
    phone?: string;
    email?: string;
    notes?: string;
    source?: "whatsapp" | "web" | "manual";
  };

  if (!body.full_name?.trim()) {
    return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  }

  const payload = {
    clinic_id: ctx.clinicId,
    full_name: body.full_name,
    phone: body.phone || null,
    email: body.email || null,
    notes: body.notes || null,
    source: body.source ?? "manual",
  };

  const { data, error } = await ctx.db
    .from("patients")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("[POST /api/patients] Supabase error:", error);
    return NextResponse.json({ error: `${error.message}${error.hint ? ` — ${error.hint}` : ""}` }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
