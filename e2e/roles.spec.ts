import { expect, test, type BrowserContext } from "@playwright/test";
import { proposeDiscount } from "./helpers";

// R-01 en la UI. El staff se simula con la cookie ravyn_demo_role=staff (solo activa en modo demo, D-12).
const HINT = "Solo un administrador puede aprobar acciones criticas";
const asStaff = (context: BrowserContext) =>
  context.addCookies([{ name: "ravyn_demo_role", value: "staff", url: "http://localhost:3123" }]);

test.describe("Rol para aprobar acciones criticas (R-01)", () => {
  test("staff: Aprobar deshabilitado con explicacion en bandeja, modal y campana; puede rechazar", async ({ page, request, context }) => {
    const action = await proposeDiscount(request);
    await asStaff(context);
    await page.goto("/agents/inbox");
    const card = page.locator(`[data-testid="action-card"][data-action-id="${action.id}"]`);
    await expect(card.getByTestId("quick-approve")).toBeDisabled();
    await expect(card.getByTestId("admin-only-hint")).toHaveText(HINT);
    await expect(card.getByTestId("quick-reject")).toBeEnabled();

    await card.getByTestId("review-button").click();
    const modal = page.getByTestId("approval-modal");
    await expect(modal.getByTestId("approve-button")).toBeDisabled();
    await expect(modal.getByTestId("admin-only-hint")).toContainText(HINT);
    await page.keyboard.press("Escape");

    await page.getByTestId("pending-bell").click();
    // Pueden existir varias pendientes iguales de otras pruebas: todas son criticas, basta la primera.
    const row = page.getByTestId("pending-panel").locator("li", { hasText: action.payload.summary }).first();
    await expect(row.getByTestId("bell-approve")).toBeDisabled();
    await expect(row.getByTestId("admin-only-hint")).toHaveText(HINT);

    // El servidor lo confirma aunque se salte la UI.
    const forced = await page.request.post(`/api/agents/actions/${action.id}/approve`, { data: {} });
    expect(forced.status()).toBe(403);

    await page.keyboard.press("Escape");
    await page.getByTestId("pending-bell").click(); // cierra el panel
    await card.getByTestId("quick-reject").click();
    await expect.poll(async () => (await (await request.get(`/api/agents/actions/${action.id}`)).json()).action.status).toBe("rejected");
  });

  test("admin: Aprobar habilitado", async ({ page, request }) => {
    const action = await proposeDiscount(request);
    await page.goto("/agents/inbox");
    const card = page.locator(`[data-testid="action-card"][data-action-id="${action.id}"]`);
    await expect(card.getByTestId("quick-approve")).toBeEnabled();
    await expect(card.getByTestId("admin-only-hint")).toHaveCount(0);
    await card.getByTestId("quick-reject").click();
  });
});
