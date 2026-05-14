import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/webhooks/n8n/appointment-created
 *
 * Called by n8n when a new appointment is created via WhatsApp or web form.
 *
 * Expected body example:
 * {
 *   "appointment_id": "uuid",
 *   "patient_name": "Juan Pérez",
 *   "patient_phone": "+52 55 1234 5678",
 *   "patient_email": "juan@example.com",     // optional
 *   "scheduled_at": "2025-06-01T10:00:00Z",
 *   "duration_minutes": 60,
 *   "service": "Consulta general",           // optional
 *   "notes": "Primera vez",                  // optional
 *   "source": "whatsapp",                    // "whatsapp" | "web" | "manual"
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

    // TODO: Fase 3 — validar body con Zod, insertar en Supabase, etc.
    console.log("[webhook] appointment-created received:", body);

    return NextResponse.json(
      { success: true, message: "Appointment creation acknowledged" },
      { status: 200 }
    );
  } catch (err) {
    console.error("[webhook] appointment-created error:", err);
    return NextResponse.json(
      { error: "Bad Request" },
      { status: 400 }
    );
  }
}
