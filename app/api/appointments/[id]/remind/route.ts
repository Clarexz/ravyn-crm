import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardMutation } from "@/lib/http/requestGuard";
import { getClinicContext } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

// Simulacion del envio de un recordatorio (aun no hay integracion con n8n). Fase 6 (R6-01): exige sesion y que
// la cita sea de la organizacion de la sesion; antes respondia 200 a cualquiera, sin sesion y con cualquier id.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const blocked = guardMutation(request);
  if (blocked) return blocked;
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const id = params.id;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  const { data: booking, error } = await ctx.db
    .from("bookings")
    .select("id")
    .eq("id", id)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Error al procesar el recordatorio" }, { status: 500 });
  if (!booking) return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });

  // Simulamos un retraso de red; el envio real se conectara a n8n.
  await new Promise((resolve) => setTimeout(resolve, 500));

  return NextResponse.json({
    message: "Recordatorio enviado correctamente",
    success: true,
  });
}
