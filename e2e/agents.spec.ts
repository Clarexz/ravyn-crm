import { expect, test } from "@playwright/test";
import { DISCOUNT_MESSAGE } from "./helpers";

test.describe("Chat con el equipo de agentes", () => {
  test("muestra agente, herramientas y la tarjeta de accion en espera con enlace a la bandeja", async ({ page }) => {
    await page.goto("/agents");
    await page.getByTestId("chat-input").fill(DISCOUNT_MESSAGE);
    await page.getByTestId("chat-send").click();

    const reply = page.getByTestId("chat-agent").last();
    await expect(reply).toHaveAttribute("data-agent", "sales", { timeout: 15_000 });
    await expect(reply.getByTestId("tool-chip").first()).toBeVisible();
    const card = reply.getByTestId("pending-card");
    await expect(card).toContainText("Accion en espera de aprobacion");
    await card.getByRole("link", { name: "Revisar en la bandeja" }).click();
    await expect(page).toHaveURL(/\/agents\/inbox$/);
  });
});

test.describe("Centro de control", () => {
  test("deshabilitar un agente se guarda y el chat avisa que no atiende", async ({ page, request }) => {
    try {
      await page.goto("/agents/settings");
      const toggle = page.getByTestId("toggle-sales");
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await page.reload();
      await expect(page.getByTestId("toggle-sales")).toHaveAttribute("aria-checked", "false");

      await page.goto("/agents");
      await page.getByTestId("chat-input").fill(DISCOUNT_MESSAGE);
      await page.getByTestId("chat-send").click();
      const reply = page.getByTestId("chat-agent").last();
      await expect(reply).toContainText("deshabilitado", { timeout: 15_000 });
      await expect(reply.getByTestId("pending-card")).toHaveCount(0);
    } finally {
      await request.patch("/api/agents/settings", { data: { agents: { sales: { enabled: true } } } });
    }
  });

  test("el nivel de autonomia es por agente", async ({ page, request }) => {
    try {
      await page.goto("/agents/settings");
      await page.getByTestId("autonomy-booking-conservative").check();
      await expect(page.getByTestId("autonomy-booking-conservative")).toBeChecked();
      await page.reload();
      await expect(page.getByTestId("autonomy-booking-conservative")).toBeChecked();
      await expect(page.getByTestId("autonomy-sales-conservative")).not.toBeChecked();
    } finally {
      await request.patch("/api/agents/settings", { data: { agents: { booking: { autonomy: "balanced" } } } });
    }
  });
});

test.describe("Insignias de autor", () => {
  test("el perfil de contacto distingue personas de agentes", async ({ page, request }) => {
    const res = await request.get("/api/patients");
    const patients = (await res.json()) as Array<{ id: string }>;
    let humans = 0;
    let agents = 0;
    for (const p of patients.slice(0, 20)) {
      await page.goto(`/patients/${p.id}`);
      await expect(page.getByTestId("activity-timeline").or(page.getByText("Sin actividad registrada."))).toBeVisible();
      humans += await page.locator('[data-testid="author-badge"][data-author-type="human"]').count();
      agents += await page.locator('[data-testid="author-badge"][data-author-type="agent"]').count();
      if (humans > 0 && agents > 0) break;
    }
    expect(humans).toBeGreaterThan(0);
    expect(agents).toBeGreaterThan(0);
  });
});

test.describe("Responsive", () => {
  test("la bandeja y la configuracion caben en un telefono", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    for (const path of ["/agents", "/agents/inbox", "/agents/settings"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Centro de Agentes" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} desborda horizontalmente`).toBeLessThanOrEqual(1);
    }
  });
});
