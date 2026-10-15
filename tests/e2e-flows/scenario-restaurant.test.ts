// Fase 6, escenario 2: Restaurante. Reservacion de un grupo grande = llamada critica (D-18):
// mas de 8 personas exigen aprobacion de un administrador en CUALQUIER nivel de autonomia.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PARTY_SIZE_APPROVAL_THRESHOLD } from "@/lib/agents/tools/booking_tools";
import { DEMO_OTHER_ORG_ID, DEMO_ORG_ID, World, setAutonomy } from "./world";

vi.mock("@/lib/supabase/auth", async () => (await import("./world")).authMock);

let w: World;
beforeEach(() => {
  w = new World({ vertical: "restaurant" });
});
afterEach(() => w.dispose());

const GUEST = "Hugo Cardenas Lima";
const reserve = (party: number, date = "2026-10-16") => `Reserva una mesa para ${party} personas a nombre de ${GUEST} el ${date}`;
const bookingsOf = (guest = GUEST) => w.rows("bookings").filter((b) => b.contact_id === w.contactByName(guest).id);

describe("Escenario Restaurante", () => {
  it("grupo de 12: queda pendiente y critico, staff no lo aprueba, el admin lo aprueba desde la bandeja", async () => {
    const otherBefore = w.snapshot(DEMO_OTHER_ORG_ID);
    expect(w.db.tables.organizations.find((o) => o.id === DEMO_ORG_ID)?.industry).toBe("restaurant");

    const countBefore = bookingsOf().length;
    const r = await w.chat(reserve(12));
    expect(r.body.agent).toBe("booking");
    expect(r.body.tools.map((t) => t.name)).toEqual(["search_contact", "check_availability", "create_booking"]);
    const pending = r.body.tools[2].pending;
    expect(pending?.summary).toMatch(/12 personas/);
    expect(r.body.reply).toMatch(/espera de aprobacion/);
    expect(bookingsOf()).toHaveLength(countBefore); // aun no existe

    // Bandeja: la accion esta marcada como critica, con el motivo del limite y el numero de comensales.
    const inbox = await w.inbox();
    const listed = inbox.body.actions.find((a) => a.id === pending!.actionId)!;
    const payload = listed.payload as { critical: boolean; reason: string; risk: string; input: { party_size: number; contact_id: string } };
    expect(payload).toMatchObject({ critical: true, risk: "high" });
    expect(payload.reason).toContain(`limite de ${PARTY_SIZE_APPROVAL_THRESHOLD}`);
    expect(payload.input.party_size).toBe(12);
    expect(payload.input.contact_id).toBe(w.contactByName(GUEST).id);

    // Staff: 403 y nada cambia, ni siquiera bajando el numero de comensales para esquivar la regla.
    w.login("staff");
    const before = JSON.stringify(bookingsOf());
    expect((await w.approve(pending!.actionId)).status).toBe(403);
    expect((await w.approve(pending!.actionId, { input: { ...payload.input, party_size: 4 } })).status).toBe(403);
    expect(w.action(pending!.actionId).status).toBe("pending");
    expect(JSON.stringify(bookingsOf())).toBe(before);

    // Admin: aprueba, la reservacion existe con el numero de comensales y la accion queda ejecutada.
    w.login("admin");
    const ok = await w.approve(pending!.actionId, { notes: "Gerente confirma el salon privado" });
    expect(ok.status).toBe(200);
    expect(ok.body.executed).toBe(true);
    const booked = bookingsOf().find((b) => (b.metadata as { party_size?: number }).party_size === 12);
    expect(booked).toMatchObject({ organization_id: DEMO_ORG_ID, status: "pending", source: "agent_booking", duration_minutes: 90 });
    expect(w.action(pending!.actionId)).toMatchObject({ status: "executed", review_notes: "Gerente confirma el salon privado" });
    expect((await w.inbox()).body.actions.map((a) => a.id)).not.toContain(pending!.actionId);
    expect(w.snapshot(DEMO_OTHER_ORG_ID)).toBe(otherBefore);
  });

  it(`el limite es exactamente ${PARTY_SIZE_APPROVAL_THRESHOLD}: con autonomia total 8 se ejecuta solo y 9 pide aprobacion`, async () => {
    setAutonomy(w, "autonomous");
    const small = await w.chat(reserve(PARTY_SIZE_APPROVAL_THRESHOLD));
    expect(small.body.tools.at(-1)).toMatchObject({ name: "create_booking", ok: true });
    expect(small.body.tools.at(-1)?.pending).toBeUndefined();
    expect(bookingsOf().filter((b) => (b.metadata as { party_size?: number }).party_size === PARTY_SIZE_APPROVAL_THRESHOLD)).toHaveLength(1);

    const big = await w.chat(reserve(PARTY_SIZE_APPROVAL_THRESHOLD + 1, "2026-10-17"));
    const pending = big.body.tools.at(-1)?.pending;
    expect(pending).toBeTruthy();
    expect(bookingsOf().filter((b) => (b.metadata as { party_size?: number }).party_size === PARTY_SIZE_APPROVAL_THRESHOLD + 1)).toHaveLength(0);
    expect((w.action(pending!.actionId).payload as { critical: boolean }).critical).toBe(true);
  });

  it("una reservacion normal (4 personas) con autonomia total no pide aprobacion y queda registrada con su autor", async () => {
    setAutonomy(w, "autonomous");
    const r = await w.chat(reserve(4));
    expect(r.body.tools.at(-1)).toMatchObject({ name: "create_booking", ok: true });
    expect(r.body.reply).toMatch(/Agende la reservacion/);
    const acts = await w.activities(w.contactByName(GUEST).id as string);
    expect(acts.some((a) => a.title === "Cita agendada por agente" && a.performed_by_type === "agent")).toBe(true);
  });

  it("rechazar la reservacion grande no crea nada", async () => {
    const r = await w.chat(reserve(20));
    const pending = r.body.tools.at(-1)!.pending!;
    const count = bookingsOf().length;
    const rej = await w.reject(pending.actionId, { notes: "No hay capacidad" });
    expect(rej.status).toBe(200);
    expect(bookingsOf()).toHaveLength(count);
    expect(w.action(pending.actionId).status).toBe("rejected");
  });

  it("la regla del limite esta en el paquete de industria que ve el agente (misma cifra)", async () => {
    const { packFor } = await import("@/lib/industry/packs");
    const rules = packFor("restaurant").agent.rules.join(" ");
    expect(rules).toContain(`mas de ${PARTY_SIZE_APPROVAL_THRESHOLD} comensales`);
  });
});
