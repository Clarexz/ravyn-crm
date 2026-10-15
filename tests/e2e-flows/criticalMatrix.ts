// Matriz de acciones criticas (Fase 6). Para CADA regla de CRITICAL_RULES (lib/agents/tools/index.ts) hay casos
// positivos (deben ser criticos) y negativos (justo en el limite, no lo son). La prueba critical-actions.test.ts
// recorre la matriz completa; otra prueba falla si una regla no tiene casos (ver findUncoveredCriticalRules).
import type { CriticalRule } from "@/lib/agents/tools";

export type Fixture = { contactId: string; opportunityId: string; bookingId: string; itemId: string; slot: string };
export type Sample = { label: string; input: Record<string, unknown> };
export type RuleCases = { positive: (fx: Fixture) => Sample[]; negative: (fx: Fixture) => Sample[] };

export const CASES: Record<string, RuleCases> = {
  "update_stage.close": {
    positive: (fx) => [
      { label: "ganada", input: { opportunity_id: fx.opportunityId, stage: "won" } },
      { label: "perdida con motivo", input: { opportunity_id: fx.opportunityId, stage: "lost", reason: "Eligio otra opcion" } },
    ],
    negative: (fx) => [{ label: "a propuesta", input: { opportunity_id: fx.opportunityId, stage: "proposal" } }],
  },
  "calculate_quote.discount": {
    positive: (fx) => [
      { label: "10.5%", input: { items: [{ item_id: fx.itemId, quantity: 1 }], discount_percent: 10.5 } },
      { label: "11%", input: { items: [{ item_id: fx.itemId, quantity: 2 }], discount_percent: 11 } },
      { label: "100%", input: { items: [{ item_id: fx.itemId, quantity: 1 }], discount_percent: 100 } },
    ],
    negative: (fx) => [
      { label: "10% exacto", input: { items: [{ item_id: fx.itemId, quantity: 1 }], discount_percent: 10 } },
      { label: "sin descuento", input: { items: [{ item_id: fx.itemId, quantity: 1 }] } },
    ],
  },
  "create_opportunity.discount": {
    positive: (fx) => [
      { label: "10.01%", input: { contact_id: fx.contactId, title: "Oportunidad con descuento", discount_percent: 10.01 } },
      { label: "25%", input: { contact_id: fx.contactId, title: "Oportunidad con descuento", value: 5000, discount_percent: 25 } },
    ],
    negative: (fx) => [{ label: "10% exacto", input: { contact_id: fx.contactId, title: "Oportunidad normal", discount_percent: 10 } }],
  },
  "cancel_booking.always": {
    positive: (fx) => [
      { label: "sin motivo", input: { booking_id: fx.bookingId } },
      { label: "con motivo", input: { booking_id: fx.bookingId, reason: "El paciente no podra asistir" } },
    ],
    negative: () => [], // cancelar siempre es critico: no hay caso no critico (lo verifica la prueba de la regla)
  },
  "create_booking.large_party": {
    positive: (fx) => [
      { label: "9 personas", input: { contact_id: fx.contactId, scheduled_at: fx.slot, duration_minutes: 60, party_size: 9 } },
      { label: "12 personas", input: { contact_id: fx.contactId, scheduled_at: fx.slot, duration_minutes: 90, party_size: 12 } },
      { label: "500 personas", input: { contact_id: fx.contactId, scheduled_at: fx.slot, duration_minutes: 60, party_size: 500 } },
    ],
    negative: (fx) => [
      { label: "8 personas (limite)", input: { contact_id: fx.contactId, scheduled_at: fx.slot, duration_minutes: 60, party_size: 8 } },
      { label: "sin party_size", input: { contact_id: fx.contactId, scheduled_at: fx.slot, duration_minutes: 60 } },
    ],
  },
};

// Reglas sin casos positivos, o con casos pero sin negativos cuando la regla es condicional.
// `alwaysCritical` marca las reglas que no tienen negativo posible.
export function findUncoveredCriticalRules(rules: readonly CriticalRule[], cases: Record<string, RuleCases>, fx: Fixture): string[] {
  const problems: string[] = [];
  for (const rule of rules) {
    const c = cases[rule.id];
    if (!c) {
      problems.push(`${rule.id}: sin casos en la matriz`);
      continue;
    }
    if (c.positive(fx).length === 0) problems.push(`${rule.id}: sin casos positivos`);
    const conditional = !rule.applies({ __probe: true });
    if (conditional && c.negative(fx).length === 0) problems.push(`${rule.id}: regla condicional sin casos negativos`);
  }
  for (const id of Object.keys(cases)) {
    if (!rules.some((r) => r.id === id)) problems.push(`${id}: caso huerfano (la regla ya no existe)`);
  }
  return problems;
}
