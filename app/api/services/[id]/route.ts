import { NextRequest, NextResponse } from "next/server";
import { getClinicContext } from "@/lib/supabase/auth";
import { itemToService } from "@/lib/supabase/mappers";
import type { Item } from "@/types/database";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json() as {
    name?: string;
    description?: string;
    cost?: number;
    color?: string;
    active?: boolean;
  };

  const updates: Record<string, string | number | boolean | null> = {};
  if (body.name !== undefined) {
    if (!body.name.trim()) return NextResponse.json({ error: "Nombre vacío" }, { status: 400 });
    updates.name = body.name.trim();
  }
  if (body.description !== undefined) updates.description = body.description.trim() || null;
  if (body.cost !== undefined) {
    if (typeof body.cost !== "number" || body.cost < 0) {
      return NextResponse.json({ error: "Costo inválido" }, { status: 400 });
    }
    updates.price = body.cost;
  }
  if (body.color !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(body.color)) {
      return NextResponse.json({ error: "Color inválido" }, { status: 400 });
    }
    updates.color = body.color;
  }
  if (body.active !== undefined) updates.active = body.active;

  const { data, error } = await ctx.db
    .from("items")
    .update(updates)
    .eq("id", params.id)
    .eq("organization_id", ctx.organizationId)
    .eq("type", "service")
    .select()
    .single();

  if (error || !data) {
    console.error("[PATCH /api/services/[id]] Error:", error);
    return NextResponse.json({ error: error?.message ?? "No encontrado" }, { status: 404 });
  }

  return NextResponse.json(itemToService(data as Item));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { error } = await ctx.db
    .from("items")
    .delete()
    .eq("id", params.id)
    .eq("organization_id", ctx.organizationId)
    .eq("type", "service");

  if (error) {
    console.error("[DELETE /api/services/[id]] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
