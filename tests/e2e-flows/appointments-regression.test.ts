// Fase 6: cero regresiones en la gestion de citas (rutas humanas de v2) y convivencia con las citas de los agentes.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_OTHER_ORG_ID, DEMO_ORG_ID, World, JSON_HEADERS } from "./world";

vi.mock("@/lib/supabase/auth", async () => (await import("./world")).authMock);

import { GET as listRoute, POST as createRoute } from "@/app/api/appointments/route";
import { PATCH as patchRoute } from "@/app/api/appointments/[id]/route";
import { POST as remindRoute } from "@/app/api/appointments/[id]/remind/route";

let w: World;
beforeEach(() => {
  w = new World();
});
afterEach(() => w.dispose());

const url = (p: string) => `http://localhost${p}`;
const patch = (id: unknown, body: unknown) =>
  patchRoute(new NextRequest(url(`/api/appointments/${id}`), { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body) }), { params: { id: String(id) } });
const remind = (id: unknown, headers: Record<string, string> = JSON_HEADERS) =>
  remindRoute(new NextRequest(url(`/api/appointments/${id}/remind`), { method: "POST", headers, body: "{}" }), { params: { id: String(id) } });

describe("gestion de citas (humana)", () => {
  it("lista solo las citas de la organizacion de la sesion", async () => {
    const mine = await (await listRoute(new NextRequest(url("/api/appointments")))).json();
    expect(mine).toHaveLength(w.rows("bookings").length);
    expect(mine.every((a: { id: string }) => w.rows("bookings").some((b) => b.id === a.id))).toBe(true);
    w.login("admin", DEMO_OTHER_ORG_ID);
    const other = await (await listRoute(new NextRequest(url("/api/appointments")))).json();
    expect(other).toHaveLength(w.rows("bookings", DEMO_OTHER_ORG_ID).length);
    const ids = new Set(mine.map((a: { id: string }) => a.id));
    expect(other.some((a: { id: string }) => ids.has(a.id))).toBe(false);
  });

  it("crear, cambiar de estado (queda actividad con autor persona) y no tocar citas ajenas", async () => {
    const contact = w.rows("contacts")[0];
    const created = await createRoute(
      new NextRequest(url("/api/appointments"), { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ patient_id: contact.id, scheduled_at: "2026-11-03T16:00:00.000Z", duration_minutes: 45, service: "Consulta" }) }),
    );
    expect(created.status).toBe(201);
    const appt = await created.json();
    expect(w.rows("bookings").find((b) => b.id === appt.id)).toMatchObject({ organization_id: DEMO_ORG_ID, contact_id: contact.id, source: "manual" });

    const res = await patch(appt.id, { status: "confirmed", note: "Confirmada por telefono" });
    expect(res.status).toBe(200);
    const log = w.rows("activities").find((a) => a.booking_id === appt.id && a.performed_by_type === "human");
    expect(log).toMatchObject({ title: "Cambio de estado: pending -> confirmed", description: "Confirmada por telefono", status: "completed" });

    const foreign = w.rows("bookings", DEMO_OTHER_ORG_ID)[0];
    const before = JSON.stringify(foreign);
    expect((await patch(foreign.id, { status: "cancelled" })).status).toBe(404);
    expect(JSON.stringify(w.rows("bookings", DEMO_OTHER_ORG_ID)[0])).toBe(before);
  });

  it("no se puede agendar a un contacto de otra organizacion", async () => {
    const foreignContact = w.rows("contacts", DEMO_OTHER_ORG_ID)[0];
    const res = await createRoute(
      new NextRequest(url("/api/appointments"), { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ patient_id: foreignContact.id, scheduled_at: "2026-11-03T16:00:00.000Z" }) }),
    );
    expect(res.status).toBe(404);
  });

  it("las citas que crea un agente y aprueba una persona aparecen en la misma lista de citas", async () => {
    const r = await w.chat("Agenda una cita para Mariana Vega Torres el 2026-11-03");
    expect(r.body.tools.at(-1)?.pending).toBeTruthy();
    await w.approve(r.body.tools.at(-1)!.pending!.actionId);
    const created = w.rows("bookings").find((b) => b.source === "agent_booking")!;
    const list = await (await listRoute(new NextRequest(url("/api/appointments")))).json();
    expect(list.some((a: { id: string }) => a.id === created.id)).toBe(true);
  });
});

describe("recordatorio de cita (R6-01: antes respondia 200 sin sesion)", () => {
  it("con sesion y cita propia responde 200", async () => {
    const res = await remind(w.rows("bookings")[0].id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
  });
  it("cita de otra organizacion o id invalido: 404", async () => {
    expect((await remind(w.rows("bookings", DEMO_OTHER_ORG_ID)[0].id)).status).toBe(404);
    expect((await remind("no-es-uuid")).status).toBe(404);
  });
  it("sin sesion: 401; sin JSON: 415", async () => {
    expect((await remind(w.rows("bookings")[0].id, { "content-type": "text/plain" })).status).toBe(415);
    w.logout();
    expect((await remind(w.rows("bookings")[0].id)).status).toBe(401);
  });
});
