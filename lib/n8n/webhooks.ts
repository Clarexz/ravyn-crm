/**
 * n8n Webhook triggers
 * Used to notify n8n workflows about appointment events.
 * All requests include X-Webhook-Secret for validation.
 */

const WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET ?? "";

async function callWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Secret": WEBHOOK_SECRET,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Webhook call failed: ${response.status} ${response.statusText}`
    );
  }
}

export async function triggerAppointmentCreated(appointmentId: string): Promise<void> {
  const url = process.env.N8N_WEBHOOK_APPOINTMENT_CREATED;
  if (!url) {
    throw new Error("N8N_WEBHOOK_APPOINTMENT_CREATED env var is not set");
  }

  await callWebhook(url, {
    event: "appointment.created",
    appointment_id: appointmentId,
    timestamp: new Date().toISOString(),
  });
}

export async function triggerAppointmentCancelled(
  appointmentId: string,
  reason?: string
): Promise<void> {
  const url = process.env.N8N_WEBHOOK_APPOINTMENT_CANCELLED;
  if (!url) {
    throw new Error("N8N_WEBHOOK_APPOINTMENT_CANCELLED env var is not set");
  }

  await callWebhook(url, {
    event: "appointment.cancelled",
    appointment_id: appointmentId,
    reason: reason ?? null,
    timestamp: new Date().toISOString(),
  });
}
