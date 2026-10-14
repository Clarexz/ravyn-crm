import { NextRequest, NextResponse } from "next/server";
import { getClinicContext } from "@/lib/supabase/auth";
import { contactToPatient } from "@/lib/supabase/mappers";
import type { Contact } from "@/types/database";

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
