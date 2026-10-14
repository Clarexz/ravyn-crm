import { NextRequest, NextResponse } from "next/server";
import { getClinicContext } from "@/lib/supabase/auth";
import { contactToPatient } from "@/lib/supabase/mappers";
import type { Contact, ContactSource } from "@/types/database";

const CONTACT_SOURCES: ContactSource[] = ["whatsapp", "web", "manual", "agent_receptionist", "import"];

export async function GET(request: NextRequest) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // Se quitan caracteres que rompen la sintaxis del filtro .or() de PostgREST.
  const q = (request.nextUrl.searchParams.get("q") ?? "").replace(/[,()]/g, " ").trim();

  let query = ctx.db
    .from("contacts")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false });

  if (q.length >= 1) {
    query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`).limit(20);
  } else {
    query = query.limit(10);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(((data ?? []) as Contact[]).map(contactToPatient));
}

export async function POST(request: NextRequest) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json() as {
    full_name?: string;
    phone?: string;
    email?: string;
    notes?: string;
    source?: string;
  };

  if (!body.full_name?.trim()) {
    return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  }

  const source: ContactSource =
    body.source && (CONTACT_SOURCES as string[]).includes(body.source)
      ? (body.source as ContactSource)
      : "manual";

  const payload = {
    organization_id: ctx.organizationId,
    full_name: body.full_name,
    phone: body.phone || null,
    email: body.email || null,
    notes: body.notes || null,
    source,
  };

  const { data, error } = await ctx.db
    .from("contacts")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("[POST /api/patients] Supabase error:", error);
    return NextResponse.json({ error: `${error.message}${error.hint ? ` — ${error.hint}` : ""}` }, { status: 500 });
  }

  return NextResponse.json(contactToPatient(data as Contact), { status: 201 });
}
