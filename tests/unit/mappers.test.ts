import { describe, expect, it } from "vitest";
import {
  bookingToAppointment,
  contactToPatient,
  itemToService,
} from "@/lib/supabase/mappers";
import type { Booking, Contact, Item } from "@/types/database";

const TS = "2026-01-01T00:00:00Z";

const baseContact: Contact = {
  id: "c1",
  organization_id: "org1",
  full_name: "Ana Lopez",
  tags: [],
  custom_fields: {},
  source: "manual",
  created_at: TS,
  updated_at: TS,
};

const baseItem: Item = {
  id: "i1",
  organization_id: "org1",
  name: "Limpieza",
  type: "service",
  price: 100,
  color: "#fff",
  active: true,
  metadata: {},
  created_at: TS,
  updated_at: TS,
};

const baseBooking: Booking = {
  id: "b1",
  organization_id: "org1",
  scheduled_at: TS,
  duration_minutes: 30,
  status: "pending",
  source: "manual",
  metadata: {},
  created_at: TS,
  updated_at: TS,
};

describe("contactToPatient", () => {
  it("mapea organization_id a clinic_id", () => {
    expect(contactToPatient(baseContact).clinic_id).toBe("org1");
  });

  it("convierte null a undefined", () => {
    const p = contactToPatient({ ...baseContact, phone: null, email: null, notes: null });
    expect(p.phone).toBeUndefined();
    expect(p.email).toBeUndefined();
    expect(p.notes).toBeUndefined();
  });

  it("conserva valores presentes", () => {
    const p = contactToPatient({ ...baseContact, phone: "555", email: "a@b.c", notes: "n" });
    expect(p).toMatchObject({ phone: "555", email: "a@b.c", notes: "n", full_name: "Ana Lopez" });
  });

  it("conserva whatsapp y web", () => {
    expect(contactToPatient({ ...baseContact, source: "whatsapp" }).source).toBe("whatsapp");
    expect(contactToPatient({ ...baseContact, source: "web" }).source).toBe("web");
  });

  it.each(["agent_receptionist", "import"] as const)("mapea source %s a manual", (source) => {
    expect(contactToPatient({ ...baseContact, source }).source).toBe("manual");
  });
});

describe("itemToService", () => {
  it("mapea organization_id a clinic_id y price a cost", () => {
    const s = itemToService(baseItem);
    expect(s.clinic_id).toBe("org1");
    expect(s.cost).toBe(100);
  });

  it("convierte price string a number", () => {
    const s = itemToService({ ...baseItem, price: "250.50" as unknown as number });
    expect(s.cost).toBe(250.5);
    expect(typeof s.cost).toBe("number");
  });

  it("description null o ausente queda null", () => {
    expect(itemToService({ ...baseItem, description: null }).description).toBeNull();
    expect(itemToService({ ...baseItem, description: undefined }).description).toBeNull();
  });
});

describe("bookingToAppointment", () => {
  it("mapea organization_id a clinic_id", () => {
    expect(bookingToAppointment(baseBooking).clinic_id).toBe("org1");
  });

  it("convierte null a undefined en campos opcionales", () => {
    const a = bookingToAppointment({
      ...baseBooking,
      contact_id: null,
      service_snapshot: null,
      notes: null,
      n8n_execution_id: null,
    });
    expect(a.patient_id).toBeUndefined();
    expect(a.service).toBeUndefined();
    expect(a.notes).toBeUndefined();
    expect(a.n8n_execution_id).toBeUndefined();
  });

  it("item_id mapea a service_id (null si no hay)", () => {
    expect(bookingToAppointment({ ...baseBooking, item_id: null }).service_id).toBeNull();
    expect(bookingToAppointment({ ...baseBooking, item_id: "i1" }).service_id).toBe("i1");
  });

  it("cost_at_booking null se mantiene null", () => {
    expect(bookingToAppointment({ ...baseBooking, cost_at_booking: null }).cost_at_booking).toBeNull();
    expect(bookingToAppointment(baseBooking).cost_at_booking).toBeNull();
  });

  it("cost_at_booking string o numero se convierte a number", () => {
    const s = bookingToAppointment({ ...baseBooking, cost_at_booking: "80.25" as unknown as number });
    expect(s.cost_at_booking).toBe(80.25);
    expect(bookingToAppointment({ ...baseBooking, cost_at_booking: 0 }).cost_at_booking).toBe(0);
  });

  it("conserva whatsapp y web; agent_booking pasa a manual", () => {
    expect(bookingToAppointment({ ...baseBooking, source: "whatsapp" }).source).toBe("whatsapp");
    expect(bookingToAppointment({ ...baseBooking, source: "web" }).source).toBe("web");
    expect(bookingToAppointment({ ...baseBooking, source: "agent_booking" }).source).toBe("manual");
  });
});
