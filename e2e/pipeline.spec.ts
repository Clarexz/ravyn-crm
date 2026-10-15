import fs from "node:fs";
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

// Fase 5: tablero Kanban y briefing diario del Agente Analista.
const SHOTS = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};

type ApiCard = { id: string; title: string; stage: string; contact_id: string | null; contact_name: string | null };
const board = async (request: APIRequestContext): Promise<{ cards: ApiCard[]; is_admin: boolean }> => (await request.get("/api/pipeline")).json();
const setIndustry = async (request: APIRequestContext, industry: string) => {
  const res = await request.patch("/api/organization/schema", { data: { industry } });
  expect(res.ok()).toBeTruthy();
};
const moveApi = (request: APIRequestContext, id: string, stage: string) => request.post(`/api/pipeline/${id}/move`, { data: { stage } });
const asStaff = (context: BrowserContext) => context.addCookies([{ name: "ravyn_demo_role", value: "staff", url: "http://localhost:3123" }]);
const cardOf = (page: Page, id: string) => page.locator(`[data-testid="pipeline-card"][data-card-id="${id}"]`);

// Arrastre con el puntero real: del asa de la tarjeta a la misma altura de la columna destino
// (las columnas se estiran a la misma altura, asi el punto siempre cae dentro de la ventana visible).
async function dragTo(page: Page, id: string, stage: string) {
  const handle = cardOf(page, id).getByTestId("card-handle");
  await page.getByTestId(`column-${stage}`).scrollIntoViewIfNeeded();
  await handle.scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox())!;
  const to = (await page.getByTestId(`column-${stage}`).boundingBox())!;
  const y = from.y + from.height / 2;
  await page.mouse.move(from.x + from.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, y + 12, { steps: 3 });
  await expect(handle).toHaveAttribute("aria-pressed", "true"); // dnd-kit ya inicio el arrastre
  await page.mouse.move(to.x + to.width / 2, y, { steps: 8 });
  await page.waitForTimeout(100); // deja que dnd-kit calcule la columna bajo el puntero
  await page.mouse.up();
}

test.describe("Pipeline Kanban (Fase 5)", () => {
  test.afterEach(async ({ request, context }) => {
    await context.clearCookies();
    await setIndustry(request, "health");
  });

  test("arrastrar una tarjeta cambia su etapa, persiste y deja actividad en el perfil del contacto", async ({ page, request }) => {
    await page.goto("/pipeline");
    await expect(page.getByRole("heading", { name: "Pipeline de Tratamientos" })).toBeVisible();
    await expect(page.getByTestId("sidebar-nav").last().getByRole("link", { name: "Tratamientos" })).toBeVisible();
    const { cards } = await board(request);
    const card = cards.find((c) => c.stage === "lead" && c.contact_id)!;
    expect(card).toBeTruthy();
    await shot(page, "pipeline-salud-escritorio");

    const before = Number(await page.getByTestId("count-contacted").textContent());
    await dragTo(page, card.id, "contacted");
    await expect(page.getByTestId("column-contacted").locator(`[data-card-id="${card.id}"]`)).toBeVisible();
    await expect(page.getByTestId("count-contacted")).toHaveText(String(before + 1));
    // Persistencia en el servidor.
    await expect.poll(async () => (await board(request)).cards.find((c) => c.id === card.id)?.stage).toBe("contacted");

    // Actividad automatica, con autor persona, en el perfil del contacto.
    await page.goto(`/patients/${card.contact_id}`);
    await expect(page.getByText("Cambio de etapa").first()).toBeVisible();
    await expect(page.getByText("Etapa: lead a contacted").first()).toBeVisible();
    await page.getByText("Etapa: lead a contacted").first().scrollIntoViewIfNeeded();
    await shot(page, "pipeline-actividad-contacto");

    await moveApi(request, card.id, "lead");
  });

  test("tiempo de respuesta de la UI al mover una tarjeta (< 200 ms, actualizacion optimista)", async ({ page, request }) => {
    await page.goto("/pipeline");
    const { cards } = await board(request);
    const card = cards.find((c) => c.stage === "qualified")!;
    // Se retrasa la respuesta del servidor para demostrar que la UI no la espera.
    await page.route("**/api/pipeline/*/move", async (route) => {
      await new Promise((r) => setTimeout(r, 700));
      await route.continue();
    });
    const select = cardOf(page, card.id).getByTestId("card-move");
    await select.selectOption("proposal");
    await expect(page.getByTestId("column-proposal").locator(`[data-card-id="${card.id}"]`)).toBeVisible({ timeout: 400 });
    const ms = Number(await page.getByTestId("last-move-ms").getAttribute("data-ms"));
    console.log(`[medicion] movimiento de tarjeta: ${ms} ms hasta pintar la nueva columna`);
    expect(ms).toBeLessThan(200);
    await expect.poll(async () => (await board(request)).cards.find((c) => c.id === card.id)?.stage).toBe("proposal");
    await page.unroute("**/api/pipeline/*/move");
    await moveApi(request, card.id, "qualified");
  });

  test("si el servidor falla, la tarjeta vuelve a su columna con un aviso", async ({ page, request }) => {
    await page.goto("/pipeline");
    const { cards } = await board(request);
    const card = cards.find((c) => c.stage === "contacted") ?? cards.find((c) => c.stage === "lead")!;
    await page.route("**/api/pipeline/*/move", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Error interno" }) }));
    await cardOf(page, card.id).getByTestId("card-move").selectOption("negotiation");
    await expect(page.getByText(/No se pudo mover/)).toBeVisible();
    await expect(page.getByTestId(`column-${card.stage}`).locator(`[data-card-id="${card.id}"]`)).toBeVisible();
    expect((await board(request)).cards.find((c) => c.id === card.id)?.stage).toBe(card.stage);
  });

  test("teclado: tomar con espacio, flecha derecha a la columna vecina y soltar", async ({ page, request }) => {
    await page.goto("/pipeline");
    const { cards } = await board(request);
    const card = cards.find((c) => c.stage === "lead")!;
    const handle = cardOf(page, card.id).getByTestId("card-handle");
    await handle.focus();
    await page.keyboard.press("Space");
    await expect(handle).toHaveAttribute("aria-pressed", "true"); // el sensor ya escucha las flechas
    await page.waitForTimeout(100);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
    await page.keyboard.press("Space");
    await expect(page.getByTestId("column-contacted").locator(`[data-card-id="${card.id}"]`)).toBeVisible();
    await expect.poll(async () => (await board(request)).cards.find((c) => c.id === card.id)?.stage).toBe("contacted");
    await moveApi(request, card.id, "lead");
  });

  test("staff: cerrar como Ganado se bloquea con explicacion; mover entre abiertas si se permite", async ({ page, request, context }) => {
    await asStaff(context);
    await page.goto("/pipeline");
    await expect(page.getByTestId("staff-notice")).toContainText("Solo un administrador puede cerrar");
    const { cards, is_admin } = await board(page.request);
    expect(is_admin).toBe(false);
    const card = cards.find((c) => c.stage === "negotiation")!;
    await cardOf(page, card.id).getByTestId("card-move").selectOption("won");
    await expect(page.getByText(/No se movió/)).toBeVisible();
    await expect(page.getByText("Solo un administrador puede cerrar o reabrir oportunidades.").last()).toBeVisible();
    await expect(page.getByTestId("column-negotiation").locator(`[data-card-id="${card.id}"]`)).toBeVisible();
    // El servidor lo confirma aunque se salte la UI.
    expect((await moveApi(page.request, card.id, "won")).status()).toBe(403);
    expect((await board(page.request)).cards.find((c) => c.id === card.id)?.stage).toBe("negotiation");
    await cardOf(page, card.id).getByTestId("card-move").selectOption("proposal");
    await expect(page.getByTestId("column-proposal").locator(`[data-card-id="${card.id}"]`)).toBeVisible();
    await expect.poll(async () => (await board(page.request)).cards.find((c) => c.id === card.id)?.stage).toBe("proposal");
    await context.clearCookies();
    await moveApi(request, card.id, "negotiation");
  });

  for (const [industry, title, link] of [
    ["health", "Pipeline de Tratamientos", "Tratamientos"],
    ["real_estate", "Pipeline de Operaciones", "Operaciones"],
    ["professional_services", "Pipeline de Oportunidades", "Oportunidades"],
  ] as const) {
    test(`vertical ${industry}: tablero con su vocabulario, escritorio y movil sin desborde de pagina`, async ({ page, request }) => {
      await setIndustry(request, industry);
      await page.goto("/pipeline");
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      await expect(page.getByTestId("sidebar-nav").last().getByRole("link", { name: link })).toBeVisible();
      await expect(page.getByTestId("pipeline-card").first()).toBeVisible();
      for (const stage of ["lead", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]) await expect(page.getByTestId(`column-${stage}`)).toBeAttached();
      await shot(page, `pipeline-${industry}-escritorio`);
      await page.setViewportSize({ width: 390, height: 800 });
      await page.goto("/pipeline");
      await expect(page.getByTestId("pipeline-card").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await shot(page, `pipeline-${industry}-movil`);
    });
  }

  test("restaurante: sin modulo de pipeline en el menu; la ruta avisa que no esta activo", async ({ page, request }) => {
    await setIndustry(request, "restaurant");
    await page.goto("/dashboard");
    await expect(page.getByTestId("sidebar-nav").last().getByRole("link", { name: /Eventos|Tratamientos|Operaciones|Oportunidades/ })).toHaveCount(0);
    await page.goto("/pipeline");
    await expect(page.getByTestId("module-disabled")).toBeVisible();
  });
});

test.describe("Briefing diario (Fase 5)", () => {
  test.afterEach(async ({ request }) => setIndustry(request, "health"));

  test("la tarjeta muestra metricas, alertas y acciones, con enlaces al pipeline y a las aprobaciones", async ({ page }) => {
    await page.goto("/dashboard");
    const card = page.getByTestId("briefing-card");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("briefing-headline")).toBeVisible();
    await expect(card.getByTestId("briefing-metrics")).toContainText("Valor del embudo (tratamientos)");
    await expect(card.getByTestId("briefing-actions")).toContainText("Dar seguimiento a");
    await expect(card.getByTestId("briefing-alerts")).toContainText("Sin actividad desde hace 15 días o más");
    await expect(card.getByTestId("briefing-link-pipeline")).toHaveAttribute("href", "/pipeline");
    await expect(card.getByTestId("briefing-link-inbox")).toHaveAttribute("href", "/agents/inbox");
    await shot(page, "briefing-salud-escritorio");
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/dashboard");
    await expect(page.getByTestId("briefing-card")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await shot(page, "briefing-salud-movil");
  });

  test("estados de carga y de error con reintento", async ({ page }) => {
    let fail = true;
    await page.route("**/api/briefing", async (route) => {
      await new Promise((r) => setTimeout(r, 400));
      if (fail) await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Error interno" }) });
      else await route.continue();
    });
    await page.goto("/dashboard");
    await expect(page.getByTestId("briefing-loading")).toBeVisible();
    await expect(page.getByTestId("briefing-error")).toBeVisible();
    fail = false;
    await page.getByTestId("briefing-error").getByRole("button", { name: "Reintentar" }).click();
    await expect(page.getByTestId("briefing-headline")).toBeVisible();
  });

  test("vocabulario de la vertical y chat del Analista con el mismo resumen", async ({ page, request }) => {
    await setIndustry(request, "real_estate");
    await page.goto("/dashboard");
    await expect(page.getByTestId("briefing-metrics")).toContainText("Valor del embudo (operaciones)");
    await expect(page.getByTestId("briefing-link-pipeline")).toContainText("Operaciones");
    const chat = await request.post("/api/agents/chat", { data: { text: "Dame el reporte de metricas del mes" } });
    expect(chat.ok()).toBeTruthy();
    const body = (await chat.json()) as { agent: string; reply: string; tools: Array<{ name: string }> };
    expect(body.agent).toBe("analyst");
    expect(body.tools.map((t) => t.name)).toEqual(["generate_briefing"]);
    expect(body.reply).toContain("Acciones recomendadas");
    const briefing = ((await (await request.get("/api/briefing")).json()) as { briefing: { summary: string } }).briefing;
    expect(body.reply.replace(/\s+/g, " ")).toContain(briefing.summary.split("\n").find((l) => l.startsWith("- Valor del embudo"))!.replace(/\s+/g, " "));
  });
});
