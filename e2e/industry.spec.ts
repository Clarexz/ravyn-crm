import fs from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Fase 4: IND-01 (el cambio de industria altera menu y etiquetas) e IND-02 (el agente usa el vocabulario del giro).
const SHOTS = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};
const menu = async (page: Page) => (await page.getByTestId("sidebar-nav").last().locator("a").allTextContents()).map((t) => t.trim());

const setIndustry = async (request: APIRequestContext, industry: string) => {
  const res = await request.patch("/api/organization/schema", { data: { industry } });
  expect(res.ok()).toBeTruthy();
};

test.describe("Industria dinamica (Fase 4)", () => {
  // La demo es compartida: siempre se deja la organizacion en salud.
  test.afterEach(async ({ request }) => setIndustry(request, "health"));

  test("IND-01: cambiar la vertical con el selector altera el menu lateral y las etiquetas", async ({ page }) => {
    await page.goto("/dashboard");
    expect(await menu(page)).toEqual(["Dashboard", "Citas", "Pacientes", "Servicios", "Presupuestos", "Agentes", "Reportes", "Configuración"]);
    await shot(page, "salud-dashboard");

    await page.getByTestId("industry-switcher").selectOption("restaurant");
    await expect(page.getByRole("link", { name: "Reservaciones" }).last()).toBeVisible();
    expect(await menu(page)).toEqual(["Dashboard", "Reservaciones", "Comensales", "Mesas", "Agentes", "Reportes", "Configuración"]);
    await expect(page.getByTestId("sidebar-nav").last().getByRole("link", { name: "Presupuestos" })).toHaveCount(0);
    await shot(page, "restaurante-dashboard");

    await page.goto("/appointments");
    await expect(page.getByRole("heading", { name: "Agenda de Reservaciones" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Nueva Reservacion/ })).toBeVisible();
    await shot(page, "restaurante-reservaciones");
    await page.goto("/patients");
    await expect(page.getByRole("heading", { name: "Directorio de Comensales" })).toBeVisible();
    await expect(page.getByText("Sofia Beltran Aguirre")).toBeVisible();
    await page.goto("/services");
    await expect(page.getByRole("heading", { name: "Catálogo de Mesas" })).toBeVisible();
    await expect(page.getByText("Mesa 1 - Terraza (2 personas)")).toBeVisible();
    await shot(page, "restaurante-mesas");

    // Modulo inactivo: aviso en lugar de la pantalla.
    await page.goto("/budgets");
    await expect(page.getByTestId("module-disabled")).toBeVisible();

    await page.goto("/dashboard");
    await page.getByTestId("industry-switcher").selectOption("real_estate");
    await expect(page.getByRole("link", { name: "Visitas" }).last()).toBeVisible();
    expect(await menu(page)).toEqual(["Dashboard", "Visitas", "Prospectos", "Propiedades", "Agentes", "Reportes", "Configuración"]);
    await shot(page, "inmobiliaria-dashboard");
    await page.goto("/patients");
    await expect(page.getByRole("heading", { name: "Directorio de Prospectos" })).toBeVisible();
    await shot(page, "inmobiliaria-prospectos");
    await page.goto("/services");
    await expect(page.getByRole("heading", { name: "Catálogo de Propiedades" })).toBeVisible();
    await expect(page.getByText("Depto 2 rec. Roma Norte (renta)")).toBeVisible();
    await shot(page, "inmobiliaria-propiedades");

    await page.goto("/dashboard");
    await page.getByTestId("industry-switcher").selectOption("professional_services");
    await expect(page.getByRole("link", { name: "Cotizaciones" }).last()).toBeVisible();
    await page.goto("/budgets");
    await expect(page.getByRole("heading", { name: "Cotizaciones" })).toBeVisible();
    await expect(page.getByText("PRES-0001").first()).toBeVisible();
    await shot(page, "servicios-cotizaciones");

    await page.goto("/dashboard");
    await page.getByTestId("industry-switcher").selectOption("health");
    await expect(page.getByRole("link", { name: "Presupuestos" }).last()).toBeVisible();
  });

  test("IND-01 (API): el esquema activa pipeline en inmobiliarias y desactiva presupuestos", async ({ request }) => {
    await setIndustry(request, "real_estate");
    const s = await (await request.get("/api/organization/schema")).json();
    const byId = (id: string) => s.modules.find((m: { id: string }) => m.id === id);
    expect(byId("pipeline").active).toBe(true);
    expect(byId("budgets").active).toBe(false);
    expect(s.labels.contact.plural).toBe("Prospectos");
  });

  test("IND-02: el agente recepcionista habla con el vocabulario de la vertical activa", async ({ request }) => {
    const ask = async () => (await (await request.post("/api/agents/chat", { data: { text: "Hola, buenos dias" } })).json()).reply as string;
    await setIndustry(request, "real_estate");
    expect(await ask()).toMatch(/comprar o rentar/);
    await setIndustry(request, "restaurant");
    expect(await ask()).toMatch(/reservacion/i);
    await setIndustry(request, "health");
    expect(await ask()).toMatch(/pacientes/i);
  });

  test("IND-02 (chat): la pantalla de agentes muestra la respuesta orientada a inmuebles", async ({ page, request }) => {
    await setIndustry(request, "real_estate");
    await page.goto("/agents");
    await page.getByTestId("chat-input").fill("Hola, buenos dias");
    await page.getByTestId("chat-send").click();
    await expect(page.getByTestId("chat-agent").last()).toContainText("comprar o rentar");
    await shot(page, "inmobiliaria-agentes");
  });

  test("staff no ve el selector ni puede cambiar la vertical", async ({ page, context }) => {
    await context.addCookies([{ name: "ravyn_demo_role", value: "staff", url: "http://localhost:3123" }]);
    await page.goto("/dashboard");
    await expect(page.getByTestId("sidebar-nav").last()).toBeVisible();
    await expect(page.getByTestId("industry-switcher")).toHaveCount(0);
    const res = await page.request.patch("/api/organization/schema", { data: { industry: "restaurant" } });
    expect(res.status()).toBe(403);
  });

  test("movil: el menu sigue sin desborde horizontal en cada vertical", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    for (const industry of ["restaurant", "real_estate", "professional_services"]) {
      await setIndustry(request, industry);
      await page.goto("/dashboard");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
    await page.getByRole("button", { name: "Toggle sidebar" }).click();
    await shot(page, "movil-profesionales-menu");
  });
});
