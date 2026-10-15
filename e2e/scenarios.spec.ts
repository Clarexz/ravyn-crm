import fs from "node:fs";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { listPending, type ApiAction } from "./helpers";

// Fase 6: los tres escenarios de certificacion por la interfaz real (chat -> bandeja -> aprobacion -> registros).
// Capturas (escritorio 1360x860 y movil 390x800) solo con E2E_SHOTS=/ruta. La demo es compartida y en serie: cada prueba usa
// nombres unicos o restablece su giro (D-21) y deja la organizacion en salud.
const SHOTS = process.env.E2E_SHOTS;
const STAFF = { name: "ravyn_demo_role", value: "staff", url: "http://localhost:3123" };

// `focus`: elemento que debe quedar a la vista (se vuelve a desplazar tras cada cambio de tamano).
async function shot(page: Page, name: string, focus?: Locator) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const reveal = async () => {
    if (focus) await focus.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(250);
  };
  await reveal();
  await page.screenshot({ path: `${SHOTS}/${name}-escritorio.png` });
  await page.setViewportSize({ width: 390, height: 800 });
  await reveal();
  await page.screenshot({ path: `${SHOTS}/${name}-movil.png` });
  await page.setViewportSize({ width: 1360, height: 860 });
  await reveal();
}

const letters = "abcdefghijklmnopqrstuvwxyz";
// Apellido unico solo con letras (el LLM de demo extrae nombres con palabras capitalizadas sin digitos).
const unique = () => {
  let s = "";
  for (let i = 0; i < 7; i += 1) s += letters[Math.floor(Math.random() * letters.length)];
  return s[0].toUpperCase() + s.slice(1);
};
// Telefono unico: create_contact no duplica contactos con el mismo telefono o correo.
const phone = () => `55 ${String(Math.floor(1000 + Math.random() * 9000))} ${String(Math.floor(1000 + Math.random() * 9000))}`;
// Proximo dia habil (lun-vie) a `ahead` dias o mas, en ISO local (el servidor corre en la misma maquina).
function weekday(ahead: number): string {
  const d = new Date(Date.now() + ahead * 86_400_000);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function say(page: Page, text: string) {
  if (!page.url().endsWith("/agents")) await page.goto("/agents");
  const before = await page.getByTestId("chat-agent").count();
  await page.getByTestId("chat-input").fill(text);
  await page.getByTestId("chat-send").click();
  await expect(page.getByTestId("chat-agent")).toHaveCount(before + 1, { timeout: 15_000 });
  await expect(page.getByTestId("chat-typing")).toHaveCount(0);
  return page.getByTestId("chat-agent").last();
}

async function newPending(request: APIRequestContext, before: ApiAction[]): Promise<ApiAction> {
  const after = await listPending(request);
  const created = after.find((a) => !before.some((b) => b.id === a.id));
  expect(created, "debio quedar una accion pendiente nueva").toBeTruthy();
  return created!;
}
const setIndustry = (request: APIRequestContext, industry: string, reset = false) =>
  request.patch("/api/organization/schema", { data: reset ? { industry, reset: true } : { industry } });

test.describe("Escenario Clinica Medica", () => {
  test("prospecto -> cita -> cancelacion con aprobacion -> bitacora con autor persona y agente", async ({ page, request, context }) => {
    const name = `Valeria Ortiz ${unique()}`;

    // 1. Recepcionista: alta del prospecto.
    const intake = await say(page, `Registra un nuevo paciente llamado ${name}, telefono ${phone()}`);
    await expect(intake).toHaveAttribute("data-agent", "receptionist");
    await expect(intake.getByTestId("tool-chip")).toHaveCount(2);
    await shot(page, "clinica-1-recepcionista-alta");

    // 2. Agente de agenda: la cita queda en espera.
    let before = await listPending(request);
    const booking = await say(page, `Agenda una cita de valoracion para ${name} el ${weekday(7)}`);
    await expect(booking).toHaveAttribute("data-agent", "booking");
    await expect(booking.getByTestId("pending-card")).toBeVisible();
    const bookingAction = await newPending(request, before);
    expect(bookingAction.payload.input).toMatchObject({ duration_minutes: 30 });

    await page.goto("/agents/inbox");
    const bookingCard = page.locator(`[data-testid="action-card"][data-action-id="${bookingAction.id}"]`);
    await expect(bookingCard).toBeVisible();
    await shot(page, "clinica-2-bandeja-cita-pendiente");
    await bookingCard.getByTestId("quick-approve").click();
    await expect(bookingCard).toHaveCount(0);
    expect((await (await request.get(`/api/agents/actions/${bookingAction.id}`)).json()).action.status).toBe("executed");

    // 3. Cancelacion: critica. Staff no puede aprobarla (boton deshabilitado y 403 del servidor).
    before = await listPending(request);
    const cancel = await say(page, `Cancela la cita de ${name}`);
    await expect(cancel).toHaveAttribute("data-agent", "booking");
    await expect(cancel.getByTestId("pending-card")).toBeVisible();
    const cancelAction = await newPending(request, before);
    expect(cancelAction.payload.critical).toBe(true);

    await context.addCookies([STAFF]);
    await page.goto("/agents/inbox");
    const cancelCard = page.locator(`[data-testid="action-card"][data-action-id="${cancelAction.id}"]`);
    await expect(cancelCard.getByTestId("quick-approve")).toBeDisabled();
    await expect(cancelCard.getByTestId("admin-only-hint")).toBeVisible();
    await shot(page, "clinica-3-bandeja-cancelacion-staff-bloqueado");
    expect((await page.request.post(`/api/agents/actions/${cancelAction.id}/approve`, { data: {} })).status()).toBe(403);
    await context.clearCookies();

    // 4. El administrador la revisa y la aprueba.
    await page.goto("/agents/inbox");
    await page.locator(`[data-testid="action-card"][data-action-id="${cancelAction.id}"]`).getByTestId("review-button").click();
    const modal = page.getByTestId("approval-modal");
    await expect(modal.getByTestId("agent-reason")).toContainText("critica");
    await expect(modal.getByTestId("action-diff")).toContainText("cancelled");
    await shot(page, "clinica-4-aprobacion-cancelacion");
    await modal.getByTestId("review-notes").fill("Confirmado con el paciente");
    await modal.getByTestId("approve-button").click();
    await expect(page.locator(`[data-testid="action-card"][data-action-id="${cancelAction.id}"]`)).toHaveCount(0);
    const done = (await (await request.get(`/api/agents/actions/${cancelAction.id}`)).json()).action;
    expect(done).toMatchObject({ status: "executed", review_notes: "Confirmado con el paciente" });

    // 5. Registros: el perfil muestra actividades de agente (alta, cita, cancelacion).
    const found = (await (await request.get("/api/patients")).json()) as Array<{ id: string; name?: string; full_name?: string }>;
    const patient = found.find((p) => (p.name ?? p.full_name) === name)!;
    expect(patient, "el paciente creado por el agente aparece en el directorio").toBeTruthy();
    await page.goto(`/patients/${patient.id}`);
    const timeline = page.getByTestId("activity-timeline");
    await expect(timeline).toContainText("Contacto creado por agente");
    await expect(timeline).toContainText("Cita agendada por agente");
    await expect(timeline).toContainText("Cita cancelada por agente");
    expect(await page.locator('[data-testid="author-badge"][data-author-type="agent"]').count()).toBeGreaterThanOrEqual(3);
    await shot(page, "clinica-5-bitacora-del-paciente", timeline);

    const bookings = (await (await request.get(`/api/appointments`)).json()) as Array<{ patientId?: string; patient_id?: string; status: string }>;
    const mine = bookings.filter((b) => (b.patientId ?? b.patient_id) === patient.id);
    expect(mine.length).toBe(1);
    expect(mine[0].status).toBe("cancelled");
  });
});

test.describe("Escenario Restaurante", () => {
  test.beforeEach(async ({ request }) => {
    expect((await setIndustry(request, "restaurant", true)).ok()).toBeTruthy();
  });
  test.afterEach(async ({ request }) => {
    await setIndustry(request, "health");
  });

  test("grupo de 12: aprobacion obligatoria del administrador desde la bandeja y confirmacion de estado", async ({ page, request, context }) => {
    const before = await listPending(request);
    const reply = await say(page, `Reserva una mesa para 12 personas a nombre de Hugo Cardenas Lima el ${weekday(3)}`);
    await expect(reply).toHaveAttribute("data-agent", "booking");
    await expect(reply.getByTestId("pending-card")).toBeVisible();
    await expect(reply).toContainText("12 personas");
    const action = await newPending(request, before);
    expect(action.payload).toMatchObject({ critical: true });
    expect(action.payload.input).toMatchObject({ party_size: 12 });
    expect(action.payload.reason).toMatch(/limite de 8/);

    // Staff: bloqueado.
    await context.addCookies([STAFF]);
    await page.goto("/agents/inbox");
    const card = page.locator(`[data-testid="action-card"][data-action-id="${action.id}"]`);
    await expect(card).toContainText("12 personas");
    await expect(card.getByTestId("quick-approve")).toBeDisabled();
    expect((await page.request.post(`/api/agents/actions/${action.id}/approve`, { data: {} })).status()).toBe(403);
    await context.clearCookies();

    // Administrador: revisa el motivo y aprueba.
    await page.goto("/agents/inbox");
    await expect(card).toBeVisible();
    await shot(page, "restaurante-1-bandeja-grupo-grande");
    await card.getByTestId("review-button").click();
    const modal = page.getByTestId("approval-modal");
    await expect(modal.getByTestId("agent-reason")).toContainText("limite de 8");
    await expect(modal.getByTestId("action-payload")).toContainText('"party_size": 12');
    await shot(page, "restaurante-2-modal-limite-de-comensales");
    await modal.getByTestId("approve-button").click();
    await expect(card).toHaveCount(0);

    const done = (await (await request.get(`/api/agents/actions/${action.id}`)).json()).action;
    expect(done.status).toBe("executed");
    expect(done.reviewed_by).toBeTruthy();

    // Confirmacion de estado: la reservacion existe en la agenda del restaurante.
    await page.goto("/appointments");
    await expect(page.getByRole("heading", { name: "Agenda de Reservaciones" })).toBeVisible();
    const list = (await (await request.get("/api/appointments")).json()) as Array<{ notes?: string | null }>;
    expect(list.some((a) => (a.notes ?? "").includes("Cita propuesta por el asistente"))).toBe(true);
    await shot(page, "restaurante-3-reservaciones-confirmadas");
  });

  test("una mesa de 4 personas no es critica: queda pendiente solo por el nivel equilibrado y staff puede aprobarla", async ({ page, request, context }) => {
    const before = await listPending(request);
    const reply = await say(page, `Reserva una mesa para 4 personas a nombre de Sofia Beltran Aguirre el ${weekday(4)}`);
    await expect(reply.getByTestId("pending-card")).toBeVisible();
    const action = await newPending(request, before);
    expect(action.payload.critical).toBe(false);
    await context.addCookies([STAFF]);
    await page.goto("/agents/inbox");
    const card = page.locator(`[data-testid="action-card"][data-action-id="${action.id}"]`);
    await expect(card.getByTestId("quick-approve")).toBeEnabled();
    await card.getByTestId("quick-approve").click();
    await expect(card).toHaveCount(0);
    await context.clearCookies();
    expect((await (await request.get(`/api/agents/actions/${action.id}`)).json()).action.status).toBe("executed");
  });
});

test.describe("Escenario Inmobiliario", () => {
  test.beforeEach(async ({ request }) => {
    expect((await setIndustry(request, "real_estate", true)).ok()).toBeTruthy();
  });
  test.afterEach(async ({ request }) => {
    await setIndustry(request, "health");
  });

  test("prospecto sin respuesta tras 48 horas: tarea de recordatorio asignada al asesor", async ({ page, request }) => {
    type Card = { contact_id: string | null; contact_name: string | null; stage: string; days_since_activity: number };
    const cards = ((await (await request.get("/api/pipeline")).json()) as { cards: Card[] }).cards;
    const targets = cards.filter((c) => ["lead", "contacted"].includes(c.stage) && c.days_since_activity >= 2 && c.contact_id);
    expect(targets.length, "la demo inmobiliaria trae prospectos vencidos").toBeGreaterThan(0);

    const reply = await say(page, "Revisa los prospectos sin respuesta despues de 48 horas y deja un recordatorio para el asesor");
    await expect(reply).toHaveAttribute("data-agent", "follow_up");
    await expect(reply.getByTestId("tool-chip").first()).toContainText("find_stale_opportunities");
    await expect(reply).toContainText("recordatorio");
    await expect(reply.getByTestId("pending-card")).toHaveCount(0); // tarea de bajo riesgo: se ejecuta sola
    await shot(page, "inmobiliaria-1-chat-seguimiento");

    // La tarea quedo ligada al prospecto, creada por el agente y asignada a una persona del equipo.
    const target = targets[0];
    const acts = ((await (await request.get(`/api/activities?contact_id=${target.contact_id}`)).json()) as {
      activities: Array<{ type: string; status: string; performed_by_type: string; assigned_to: string | null; assignee_name: string | null; title: string }>;
    }).activities;
    const task = acts.find((a) => a.type === "task" && a.performed_by_type === "agent");
    expect(task, `tarea del agente para ${target.contact_name}`).toBeTruthy();
    expect(task).toMatchObject({ status: "pending" });
    expect(task!.assigned_to).toBeTruthy();
    expect(task!.assignee_name).toBeTruthy();

    await page.goto(`/patients/${target.contact_id}`);
    const timeline = page.getByTestId("activity-timeline");
    await expect(timeline.getByTestId("activity-assignee").first()).toContainText(`Asignada a ${task!.assignee_name}`);
    await expect(timeline).toContainText("Dar seguimiento a");
    await shot(page, "inmobiliaria-2-tarea-asignada-al-asesor", timeline);

    // Ya no esta estancado: la tarea cuenta como actividad (no se duplica).
    const after = ((await (await request.get("/api/pipeline")).json()) as { cards: Card[] }).cards.find((c) => c.contact_id === target.contact_id && c.stage === target.stage);
    expect(after?.days_since_activity).toBe(0);
  });
});
