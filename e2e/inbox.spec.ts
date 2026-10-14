import { expect, test } from "@playwright/test";
import { bellCount, listPending, pendingCount, proposeDiscount } from "./helpers";

test.describe("Bandeja de aprobaciones", () => {
  // UI-01: el modal de aprobacion muestra el motivo del agente y el payload exacto.
  test("UI-01: el modal muestra el motivo del agente y el payload exacto", async ({ page, request }) => {
    const action = await proposeDiscount(request);
    await page.goto("/agents/inbox");

    const card = page.locator(`[data-testid="action-card"][data-action-id="${action.id}"]`);
    await expect(card).toBeVisible();
    await card.getByTestId("review-button").click();

    const modal = page.getByTestId("approval-modal");
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId("agent-reason")).toHaveText(action.payload.reason);
    expect(action.payload.reason).toMatch(/10%/);

    // Payload exacto: el JSON mostrado es identico al input guardado por el agente.
    const shown = JSON.parse((await modal.getByTestId("action-payload").textContent()) ?? "null");
    expect(shown).toEqual(action.payload.input);
    await expect(modal.getByTestId("action-payload")).toContainText('"discount_percent": 20');

    // Vista de diferencia con el cambio propuesto.
    await expect(modal.getByTestId("action-diff")).toContainText("Descuento (%)");
    await expect(modal.getByTestId("action-diff")).toContainText("20");
  });

  // UI-02: aprobar desde la interfaz quita el elemento de pendientes y baja el contador de la campana.
  test("UI-02: aprobar desde la interfaz quita la accion de pendientes y baja la campana", async ({ page, request }) => {
    const action = await proposeDiscount(request);
    const total = await pendingCount(request);
    await page.goto("/agents/inbox");

    await expect.poll(() => bellCount(page)).toBe(total);
    const card = page.locator(`[data-testid="action-card"][data-action-id="${action.id}"]`);
    await card.getByTestId("review-button").click();
    await page.getByTestId("approve-button").click();

    await expect(card).toHaveCount(0);
    await expect.poll(() => bellCount(page)).toBe(total - 1);
    expect(await pendingCount(request)).toBe(total - 1);

    const done = await (await request.get(`/api/agents/actions/${action.id}`)).json();
    expect(done.action.status).toBe("executed");
    expect(done.action.reviewed_by).toBeTruthy();
  });

  test("rechazar con comentario deja la accion rechazada y sin ejecutar", async ({ page, request }) => {
    const action = await proposeDiscount(request);
    await page.goto("/agents/inbox");
    const card = page.locator(`[data-testid="action-card"][data-action-id="${action.id}"]`);
    await card.getByTestId("review-button").click();
    await page.getByTestId("review-notes").fill("El descuento no esta autorizado");
    await page.getByTestId("reject-button").click();
    await expect(card).toHaveCount(0);

    const res = await (await request.get(`/api/agents/actions/${action.id}`)).json();
    expect(res.action).toMatchObject({ status: "rejected", review_notes: "El descuento no esta autorizado" });
  });

  test("modificar valores reenvia el input cambiado", async ({ page, request }) => {
    const action = await proposeDiscount(request);
    await page.goto("/agents/inbox");
    const card = page.locator(`[data-testid="action-card"][data-action-id="${action.id}"]`);
    await card.getByTestId("review-button").click();
    await page.getByTestId("modify-button").click();
    await page.getByTestId("edit-discount_percent").fill("12");
    await page.getByTestId("approve-button").click();
    await expect(card).toHaveCount(0);

    const res = await (await request.get(`/api/agents/actions/${action.id}`)).json();
    expect(res.action.payload.input.discount_percent).toBe(12);
    expect(res.action.payload.original_input.discount_percent).toBe(20);
    expect(res.action.status).toBe("executed");
  });

  test("aprobar o rechazar desde la campana toma 2 clics", async ({ page, request }) => {
    const action = await proposeDiscount(request);
    const total = await pendingCount(request);
    await page.goto("/dashboard");
    await expect.poll(() => bellCount(page)).toBe(total);
    await page.getByTestId("pending-bell").click(); // clic 1
    const panel = page.getByTestId("pending-panel");
    await expect(panel).toContainText("Aprobar");
    // La accion mas reciente va primero en la lista de la campana.
    await panel.getByRole("button", { name: "Rechazar" }).first().click(); // clic 2
    await expect.poll(() => bellCount(page)).toBe(total - 1);
    const res = await (await request.get(`/api/agents/actions/${action.id}`)).json();
    expect(res.action.status).toBe("rejected");
  });

  test("filtra por agente y por criticas", async ({ page, request }) => {
    await proposeDiscount(request);
    await page.goto("/agents/inbox");
    await expect(page.getByTestId("action-card").first()).toBeVisible();
    await page.getByTestId("filter-agent").selectOption("booking");
    for (const card of await page.getByTestId("action-card").all()) {
      await expect(card).toContainText("Agenda");
    }
    await page.getByTestId("filter-agent").selectOption("all");
    await page.getByTestId("filter-critical").check();
    expect(await page.getByTestId("action-card").count()).toBeGreaterThan(0);
    for (const card of await page.getByTestId("action-card").all()) {
      await expect(card).toContainText("Critica");
    }
  });

  test("la bandeja se actualiza sola cuando un agente propone algo", async ({ page, request }) => {
    await page.goto("/agents/inbox");
    const before = (await listPending(request)).length;
    const action = await proposeDiscount(request); // otro "usuario" dispara la propuesta
    await expect(page.locator(`[data-action-id="${action.id}"]`)).toBeVisible({ timeout: 15_000 });
    expect((await listPending(request)).length).toBe(before + 1);
  });
});
