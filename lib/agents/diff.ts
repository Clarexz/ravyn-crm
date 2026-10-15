// Vista de diferencia para la bandeja (Fase 3): estado actual de la entidad vs cambio propuesto.
// Solo lectura. Toda consulta filtra por organization_id; un id ajeno se comporta como inexistente.
// Los valores son texto plano: la UI los pinta como texto (React los escapa).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentAction } from "@/types/database";

export type DiffRow = { field: string; label: string; current: string | null; proposed: string | null };
export type ActionDiff = {
  kind: "create" | "update";
  entity: string;
  // Nombre de la entidad afectada cuando ya existe (p. ej. el titulo de la oportunidad).
  target: string | null;
  rows: DiffRow[];
};

type Row = Record<string, unknown>;
type Input = Record<string, unknown>;

const FIELD_LABELS: Record<string, string> = {
  title: "Titulo",
  stage: "Etapa",
  value: "Valor",
  currency: "Moneda",
  probability: "Probabilidad",
  discount_percent: "Descuento (%)",
  expected_close_date: "Cierre estimado",
  notes: "Notas",
  full_name: "Nombre",
  phone: "Telefono",
  email: "Correo",
  company_name: "Empresa",
  scheduled_at: "Fecha y hora",
  duration_minutes: "Duracion (min)",
  due_date: "Vence",
  description: "Descripcion",
  party_size: "Personas",
  reason: "Motivo",
};

const labelOf = (key: string): string => FIELD_LABELS[key] ?? key;

export function formatValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

async function fetchOwned(db: SupabaseClient, organizationId: string, table: string, id: unknown): Promise<Row | null> {
  if (typeof id !== "string" || !id) return null;
  try {
    const res = await db.from(table).select("*").eq("organization_id", organizationId).eq("id", id).maybeSingle();
    return res.error ? null : ((res.data as Row | null) ?? null);
  } catch {
    return null;
  }
}

const rowsFromInput = (input: Input, skip: string[] = []): DiffRow[] =>
  Object.entries(input)
    .filter(([key]) => !skip.includes(key) && !key.endsWith("_id"))
    .map(([key, value]) => ({ field: key, label: labelOf(key), current: null, proposed: formatValue(value) }))
    .filter((r) => r.proposed !== null);

const contactRow = (contact: Row | null): DiffRow[] =>
  contact ? [{ field: "contact", label: "Contacto", current: null, proposed: formatValue(contact.full_name) }] : [];

export async function buildActionDiff(
  db: SupabaseClient,
  organizationId: string,
  action: Pick<AgentAction, "action_type" | "payload">,
): Promise<ActionDiff> {
  const payload = (action.payload ?? {}) as { tool?: unknown; input?: unknown };
  const tool = typeof payload.tool === "string" ? payload.tool : action.action_type;
  const input: Input = payload.input && typeof payload.input === "object" ? (payload.input as Input) : {};

  switch (tool) {
    case "update_stage": {
      const opp = await fetchOwned(db, organizationId, "opportunities", input.opportunity_id);
      return {
        kind: "update",
        entity: "Oportunidad",
        target: formatValue(opp?.title),
        rows: [
          { field: "stage", label: "Etapa", current: formatValue(opp?.stage), proposed: formatValue(input.stage) },
          ...(input.reason ? [{ field: "reason", label: "Motivo", current: null, proposed: formatValue(input.reason) }] : []),
        ],
      };
    }
    case "reschedule_booking": {
      const booking = await fetchOwned(db, organizationId, "bookings", input.booking_id);
      const contact = await fetchOwned(db, organizationId, "contacts", booking?.contact_id);
      const rows: DiffRow[] = [
        { field: "scheduled_at", label: "Fecha y hora", current: formatValue(booking?.scheduled_at), proposed: formatValue(input.new_scheduled_at) },
      ];
      if (input.duration_minutes !== undefined) {
        rows.push({ field: "duration_minutes", label: "Duracion (min)", current: formatValue(booking?.duration_minutes), proposed: formatValue(input.duration_minutes) });
      }
      return { kind: "update", entity: "Cita", target: formatValue(contact?.full_name), rows };
    }
    case "cancel_booking": {
      const booking = await fetchOwned(db, organizationId, "bookings", input.booking_id);
      const contact = await fetchOwned(db, organizationId, "contacts", booking?.contact_id);
      return {
        kind: "update",
        entity: "Cita",
        target: formatValue(contact?.full_name),
        rows: [
          { field: "status", label: "Estado", current: formatValue(booking?.status), proposed: "cancelled" },
          { field: "scheduled_at", label: "Fecha y hora", current: formatValue(booking?.scheduled_at), proposed: null },
          ...(input.reason ? [{ field: "reason", label: "Motivo", current: null, proposed: formatValue(input.reason) }] : []),
        ],
      };
    }
    case "update_contact_notes": {
      const contact = await fetchOwned(db, organizationId, "contacts", input.contact_id);
      return {
        kind: "update",
        entity: "Contacto",
        target: formatValue(contact?.full_name),
        rows: [{ field: "note", label: "Nota agregada", current: formatValue(contact?.notes), proposed: formatValue(input.note) }],
      };
    }
    case "create_booking": {
      const contact = await fetchOwned(db, organizationId, "contacts", input.contact_id);
      return { kind: "create", entity: "Cita", target: null, rows: [...contactRow(contact), ...rowsFromInput(input)] };
    }
    case "create_opportunity": {
      const contact = await fetchOwned(db, organizationId, "contacts", input.contact_id);
      return { kind: "create", entity: "Oportunidad", target: null, rows: [...contactRow(contact), ...rowsFromInput(input)] };
    }
    case "create_contact":
      return { kind: "create", entity: "Contacto", target: null, rows: rowsFromInput(input) };
    case "create_task":
    case "set_reminder": {
      const contact = await fetchOwned(db, organizationId, "contacts", input.contact_id);
      return { kind: "create", entity: tool === "create_task" ? "Tarea" : "Recordatorio", target: null, rows: [...contactRow(contact), ...rowsFromInput(input)] };
    }
    case "calculate_quote":
      return { kind: "create", entity: "Cotizacion", target: null, rows: rowsFromInput(input, ["items"]) };
    default:
      return { kind: "create", entity: tool, target: null, rows: rowsFromInput(input) };
  }
}
