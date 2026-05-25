import { NextRequest, NextResponse } from "next/server";
import { getClinicContext } from "@/lib/supabase/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const body = await request.json();
    const { status } = body;

    const { data, error } = await ctx.db
      .from("budgets")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("clinic_id", ctx.clinicId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error(`[PATCH /api/budgets/${params.id}] Error:`, error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    // Delete cascading should be handled by DB or manually here if needed
    // Assuming DB has ON DELETE CASCADE for members and services
    const { error } = await ctx.db
      .from("budgets")
      .delete()
      .eq("id", params.id)
      .eq("clinic_id", ctx.clinicId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error(`[DELETE /api/budgets/${params.id}] Error:`, error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
