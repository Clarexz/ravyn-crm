import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/webhooks/n8n/appointment-updated
 *
 * Called by n8n when an appointment status changes (confirmed, cancelled, etc.)
 *
 * Expected body example:
 * {
 *   "appointment_id": "uuid",
 *   "old_status": "pending",
 *   "new_status": "confirmed",               // "pending" | "confirmed" | "cancelled" | "completed" | "no_show"
 *   "changed_by": "n8n-bot",
 *   "note": "Confirmado por WhatsApp",       // optional
 *   "n8n_execution_id": "abc123"             // optional
 * }
 */

const WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET;

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Validate secret header
  const incomingSecret = req.headers.get("x-webhook-secret");
  if (!WEBHOOK_SECRET || incomingSecret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: unknown = await req.json();

    // TODO: Fase 3 — validar body con Zod, actualizar cita en Supabase,
    // insertar log en appointment_logs, etc.
    console.log("[webhook] appointment-updated received:", body);

    return NextResponse.json(
      { success: true, message: "Appointment update acknowledged" },
      { status: 200 }
    );
  } catch (err) {
    console.error("[webhook] appointment-updated error:", err);
    return NextResponse.json(
      { error: "Bad Request" },
      { status: 400 }
    );
  }
}
