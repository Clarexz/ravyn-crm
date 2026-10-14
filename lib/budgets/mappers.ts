// Mapper de presupuestos v2 (budgets, budget_members, budget_services) hacia la
// forma Budget que consume la UI durante la Fase 0b.
import type { Budget, BudgetMember, BudgetService } from "@/types/database";

export const BUDGET_SELECT = `
  *,
  members:budget_members(
    *,
    services:budget_services(*)
  )
`;

type Row = Record<string, unknown>;

function serviceFromRow(r: Row): BudgetService {
  return {
    service_id: (r.service_id as string | null) ?? "",
    name: r.name as string,
    sessions: Number(r.sessions),
    unit_price: Number(r.unit_price),
    is_manual_price: Boolean(r.is_manual_price),
  };
}

function memberFromRow(r: Row): BudgetMember {
  return {
    id: r.id as string,
    full_name: r.full_name as string,
    relationship: r.relationship as BudgetMember["relationship"],
    services: ((r.services as Row[] | null) ?? []).map(serviceFromRow),
  };
}

export function budgetFromRow(r: Row): Budget {
  return {
    id: r.id as string,
    clinic_id: r.organization_id as string,
    budget_number: r.budget_number as string,
    responsible_id: (r.responsible_id as string | null) ?? "",
    responsible_name: r.responsible_name as string,
    responsible_phone: (r.responsible_phone as string | null) ?? undefined,
    responsible_email: (r.responsible_email as string | null) ?? undefined,
    status: r.status as Budget["status"],
    subtotal: Number(r.subtotal),
    discount_value: Number(r.discount_value),
    discount_type: r.discount_type as Budget["discount_type"],
    total: Number(r.total),
    validity_days: Number(r.validity_days),
    payment_method: (r.payment_method as string | null) ?? undefined,
    doctor_notes: (r.doctor_notes as string | null) ?? undefined,
    patient_notes: (r.patient_notes as string | null) ?? undefined,
    members: ((r.members as Row[] | null) ?? []).map(memberFromRow),
    created_at: r.created_at as string,
    expires_at: r.expires_at as string,
    updated_at: r.updated_at as string,
  };
}
