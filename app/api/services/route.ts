import { NextRequest, NextResponse } from "next/server";
import { getClinicContext } from "@/lib/supabase/auth";
import { itemToService } from "@/lib/supabase/mappers";
import type { Item } from "@/types/database";

export async function GET(request: NextRequest) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const activeOnly = request.nextUrl.searchParams.get("active") === "true";

  let query = ctx.db
    .from("items")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .eq("type", "service")
    .order("name", { ascending: true });

  if (activeOnly) query = query.eq("active", true);

  const { data, error } = await query;
  if (error) {
    console.error("[GET /api/services] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(((data ?? []) as Item[]).map(itemToService));
}

export async function POST(request: NextRequest) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json() as {
    name?: string;
    description?: string;
    cost?: number;
    color?: string;
    active?: boolean;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  }
  if (typeof body.cost !== "number" || body.cost < 0) {
    return NextResponse.json({ error: "Costo inválido" }, { status: 400 });
  }
  if (body.color && !/^#[0-9a-fA-F]{6}$/.test(body.color)) {
    return NextResponse.json({ error: "Color inválido" }, { status: 400 });
  }

  const { data, error } = await ctx.db
    .from("items")
    .insert({
      organization_id: ctx.organizationId,
      type: "service",
      name: body.name.trim(),
      description: body.description?.trim() || null,
      price: body.cost,
      color: body.color ?? "#6366f1",
      active: body.active ?? true,
    })
    .select()
    .single();

  if (error) {
    console.error("[POST /api/services] Error:", error);
    return NextResponse.json({ error: `${error.message}${error.hint ? ` — ${error.hint}` : ""}` }, { status: 500 });
  }

  return NextResponse.json(itemToService(data as Item), { status: 201 });
}
