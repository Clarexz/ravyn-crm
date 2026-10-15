// Fase 6, escenario 1: Clinica Medica. Mensaje -> orquestador -> especialista -> herramienta -> base,
// por las rutas HTTP reales, con el LLM preprogramado del modo demo.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_OTHER_ORG_ID, DEMO_ORG_ID, World } from "./world";

vi.mock("@/lib/supabase/auth", async () => (await import("./world")).authMock);

let w: World;
beforeEach(() => {
  w = new World();
});
afterEach(() => w.dispose());

const NAME = "Valeria Ortiz Campos";

describe("Escenario Clinica Medica", () => {
  it("prospecto -> cita (aprobada) -> cancelacion con aprobacion humana -> bitacora completa", async () => {
    const otherBefore = w.snapshot(DEMO_OTHER_ORG_ID);

    // 1. Entrada del prospecto por la recepcionista: se ejecuta sola (alta de contacto no es de riesgo medio).
    const intake = await w.chat(`Registra un nuevo paciente llamado ${NAME}, telefono 55 1234 5678, valeria.ortiz@correo.mx`);
    expect(intake.status).toBe(200);
    expect(intake.body.agent).toBe("receptionist");
    expect(intake.body.tools.map((t) => t.name)).toEqual(["search_contact", "create_contact"]);
    const contact = w.contactByName(NAME);
    expect(contact).toMatchObject({ organization_id: DEMO_ORG_ID, source: "agent_receptionist", phone: "55 1234 5678" });

    // 2. Calificacion y cita por el agente de agenda: disponibilidad real y cita que espera aprobacion (nivel equilibrado).
    const date = "2026-10-16";
    const booking = await w.chat(`Agenda una cita de valoracion para ${NAME} el ${date}`);
    expect(booking.body.agent).toBe("booking");
    expect(booking.body.tools.map((t) => t.name)).toEqual(["search_contact", "check_availability", "create_booking"]);
    const pendingBooking = booking.body.tools[2].pending;
    expect(pendingBooking?.actionId).toBeTruthy();
    expect(w.rows("bookings").some((b) => b.contact_id === contact.id)).toBe(false); // aun no existe

    // La persona la aprueba desde la bandeja (cita no critica: cualquier usuario, tambien staff).
    w.login("staff");
    const inbox = await w.inbox();
    expect(inbox.body.actions.map((a) => a.id)).toContain(pendingBooking!.actionId);
    const approved = await w.approve(pendingBooking!.actionId as string);
    expect(approved.status).toBe(200);
    expect(approved.body.executed).toBe(true);
    const created = w.rows("bookings").find((b) => b.contact_id === contact.id);
    expect(created).toMatchObject({ status: "pending", source: "agent_booking", organization_id: DEMO_ORG_ID });

    // 3. Cancelacion: el agente la propone, queda pendiente y staff no puede aprobarla (critica).
    w.login("admin");
    const cancel = await w.chat(`Cancela la cita de ${NAME}`);
    expect(cancel.body.agent).toBe("booking");
    expect(cancel.body.tools.map((t) => t.name)).toEqual(["search_contact", "cancel_booking"]);
    const cancelPending = cancel.body.tools[1].pending;
    expect(cancelPending).toBeTruthy();
    expect(cancel.body.reply).toMatch(/espera de aprobacion/);
    expect(w.rows("bookings").find((b) => b.id === created!.id)?.status).toBe("pending"); // sigue viva

    w.login("staff");
    const denied = await w.approve(cancelPending!.actionId);
    expect(denied.status).toBe(403);
    expect(w.rows("bookings").find((b) => b.id === created!.id)?.status).toBe("pending");
    expect(w.action(cancelPending!.actionId).status).toBe("pending");

    w.login("admin");
    const done = await w.approve(cancelPending!.actionId, { notes: "Confirmado con el paciente" });
    expect(done.status).toBe(200);
    expect(w.rows("bookings").find((b) => b.id === created!.id)?.status).toBe("cancelled");

    // 4. Registros: agent_actions (propuesta, revision, ejecucion) y activities con autor persona y agente.
    const actions = w.rows("agent_actions").filter((a) => ["create_contact", "create_booking", "cancel_booking"].includes(a.action_type as string));
    const byType = Object.fromEntries(actions.map((a) => [a.action_type, a]));
    expect(byType.create_contact).toMatchObject({ agent_name: "receptionist", status: "executed", requires_approval: false });
    expect(byType.create_booking).toMatchObject({ agent_name: "booking", status: "executed", requires_approval: true });
    expect(byType.cancel_booking).toMatchObject({ agent_name: "booking", status: "executed", requires_approval: true, review_notes: "Confirmado con el paciente" });
    expect((byType.cancel_booking.payload as { critical: boolean }).critical).toBe(true);
    expect(byType.cancel_booking.reviewed_by).toBeTruthy();
    expect(byType.create_booking.reviewed_by).toBeTruthy();

    const acts = await w.activities(contact.id as string);
    const titles = acts.map((a) => `${a.performed_by_type}:${a.title}`);
    expect(titles).toEqual(expect.arrayContaining(["agent:Contacto creado por agente", "agent:Cita agendada por agente"]));
    const cancelNote = acts.find((a) => String(a.title).startsWith("Cita cancelada por agente"));
    expect(cancelNote).toMatchObject({ performed_by_type: "agent", performed_by_id: "booking", booking_id: created!.id, organization_id: DEMO_ORG_ID });

    // Un cambio hecho por una persona sobre la misma cita queda con autor persona (regresion de gestion de citas).
    const { PATCH } = await import("@/app/api/appointments/[id]/route");
    const { NextRequest } = await import("next/server");
    const patch = await PATCH(
      new NextRequest(`http://localhost/api/appointments/${created!.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "confirmed", note: "Reabierta por recepcion" }) }),
      { params: { id: String(created!.id) } },
    );
    expect(patch.status).toBe(200);
    const human = (await w.activities(contact.id as string)).find((a) => a.performed_by_type === "human");
    expect(human).toMatchObject({ booking_id: created!.id, organization_id: DEMO_ORG_ID });
    expect(human?.author_name).toBeTruthy();

    // 5. La otra organizacion no vio ni cambio nada.
    expect(w.snapshot(DEMO_OTHER_ORG_ID)).toBe(otherBefore);
    expect(JSON.stringify(w.rows("contacts", DEMO_OTHER_ORG_ID))).not.toContain(NAME);
  });

  it("rechazar la cancelacion deja la cita intacta", async () => {
    const seeded = w.rows("bookings").find((b) => ["pending", "confirmed"].includes(b.status as string) && Date.parse(String(b.scheduled_at)) > w.clock.getTime());
    expect(seeded, "la demo trae citas futuras").toBeTruthy();
    const contact = w.rows("contacts").find((c) => c.id === seeded!.contact_id)!;
    const r = await w.chat(`Cancela la cita de ${contact.full_name}`);
    const pending = r.body.tools.find((t) => t.pending)?.pending;
    expect(pending).toBeTruthy();
    const rej = await w.reject(pending!.actionId, { notes: "El paciente reconsidero" });
    expect(rej.status).toBe(200);
    expect(w.rows("bookings").find((b) => b.id === seeded!.id)?.status).toBe(seeded!.status);
    expect(w.action(pending!.actionId)).toMatchObject({ status: "rejected", review_notes: "El paciente reconsidero" });
  });

  it("un paciente sin citas proximas: el agente lo dice y no propone nada", async () => {
    await w.chat(`Registra un nuevo paciente llamado ${NAME}`);
    const r = await w.chat(`Cancela la cita de ${NAME}`);
    expect(r.body.tools.map((t) => t.name)).toEqual(["search_contact"]);
    expect(r.body.reply).toMatch(/no tiene/);
    expect(w.rows("agent_actions").filter((a) => a.action_type === "cancel_booking")).toHaveLength(0);
  });
});
