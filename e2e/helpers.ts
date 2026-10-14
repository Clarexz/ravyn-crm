import { expect, type APIRequestContext, type Page } from "@playwright/test";

export type ApiAction = {
  id: string;
  status: string;
  agent_name: string;
  payload: { summary: string; reason: string; input: Record<string, unknown>; critical?: boolean };
};

// El LLM de demo es determinista: este mensaje deja una accion critica pendiente del agente de Ventas.
export const DISCOUNT_MESSAGE = "Cotiza un blanqueamiento con 20% de descuento para Mariana Vega";

export async function pendingCount(request: APIRequestContext): Promise<number> {
  const res = await request.get("/api/agents/pending-count");
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { count: number }).count;
}

// Crea una accion pendiente por la API de chat (igual que lo haria un usuario) y la devuelve.
export async function proposeDiscount(request: APIRequestContext): Promise<ApiAction> {
  const before = await listPending(request);
  const res = await request.post("/api/agents/chat", { data: { text: DISCOUNT_MESSAGE } });
  expect(res.ok()).toBeTruthy();
  const after = await listPending(request);
  const created = after.find((a) => !before.some((b) => b.id === a.id));
  expect(created, "el chat debio dejar una accion pendiente").toBeTruthy();
  return created!;
}

export async function listPending(request: APIRequestContext): Promise<ApiAction[]> {
  const res = await request.get("/api/agents/actions?status=pending&limit=100");
  return ((await res.json()) as { actions: ApiAction[] }).actions;
}

export const bellCount = async (page: Page): Promise<number> => {
  const badge = page.getByTestId("pending-count");
  return (await badge.count()) === 0 ? 0 : Number((await badge.textContent())?.trim());
};
