// Mappers between v2 rows (contacts, items, bookings) and the view-models the
// existing UI components still consume (Patient, Service, Appointment).
// Rows come from the v2 tables; the UI shapes are kept stable during Fase 0b so
// that components do not change. See docs/v2/decisiones.md (D-03).
import type {
  Appointment,
  Booking,
  Contact,
  Item,
  Patient,
  Service,
} from "@/types/database";

export function contactToPatient(c: Contact): Patient {
  return {
    id: c.id,
    clinic_id: c.organization_id,
    full_name: c.full_name,
    phone: c.phone ?? undefined,
    email: c.email ?? undefined,
    notes: c.notes ?? undefined,
    // Patient.source only knows the v1 values.
    source: c.source === "whatsapp" || c.source === "web" ? c.source : "manual",
    created_at: c.created_at,
  };
}

export function itemToService(i: Item): Service {
  return {
    id: i.id,
    clinic_id: i.organization_id,
    name: i.name,
    description: i.description ?? null,
    cost: Number(i.price),
    color: i.color,
    active: i.active,
    created_at: i.created_at,
    updated_at: i.updated_at,
  };
}

export function bookingToAppointment(b: Booking): Appointment {
  return {
    id: b.id,
    clinic_id: b.organization_id,
    patient_id: b.contact_id ?? undefined,
    scheduled_at: b.scheduled_at,
    duration_minutes: b.duration_minutes,
    status: b.status,
    service: b.service_snapshot ?? undefined,
    service_id: b.item_id ?? null,
    cost_at_booking: b.cost_at_booking == null ? null : Number(b.cost_at_booking),
    notes: b.notes ?? undefined,
    // Appointment.source only knows the v1 values.
    source: b.source === "whatsapp" || b.source === "web" ? b.source : "manual",
    n8n_execution_id: b.n8n_execution_id ?? undefined,
    created_at: b.created_at,
    updated_at: b.updated_at,
  };
}
