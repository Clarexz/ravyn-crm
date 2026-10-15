// Esquema de las tablas v2 (migraciones 001, 006 y 007) para el motor en memoria:
// columnas, NOT NULL, defaults, CHECKs, UNIQUE y claves foraneas con su ON DELETE.
export type Row = Record<string, unknown>;

export type ColType =
  | "uuid"
  | "text"
  | "int"
  | "numeric"
  | "bool"
  | "timestamptz"
  | "date"
  | "jsonb"
  | "text[]";

export interface DefaultCtx {
  now: () => Date;
  uuid: () => string;
}

export interface ColDef {
  type: ColType;
  notNull?: boolean;
  def?: (c: DefaultCtx) => unknown;
  // CHECK (col IN (...)); se omite cuando la columna es NULL.
  values?: readonly string[];
}

export interface FkDef {
  col: string;
  ref: string;
  onDelete: "cascade" | "set null";
}

export interface UniqueDef {
  name: string;
  cols: string[];
}

export interface CheckDef {
  name: string;
  test: (row: Row) => boolean;
}

export interface TableDef {
  name: string;
  cols: Record<string, ColDef>;
  fks: FkDef[];
  unique: UniqueDef[];
  checks: CheckDef[];
  // true si tiene la columna updated_at mantenida por el trigger update_updated_at().
  updatedAt: boolean;
}

const id = (): ColDef => ({ type: "uuid", notNull: true, def: (c) => c.uuid() });
const createdAt = (): ColDef => ({ type: "timestamptz", notNull: true, def: (c) => c.now().toISOString() });
const orgId = (): ColDef => ({ type: "uuid", notNull: true });
const uuidCol = (notNull = false): ColDef => ({ type: "uuid", notNull });
const text = (notNull = false): ColDef => ({ type: "text", notNull });
const enumCol = (values: readonly string[], def?: string): ColDef => ({
  type: "text",
  notNull: true,
  values,
  def: def === undefined ? undefined : () => def,
});
const money = (def?: number): ColDef => ({
  type: "numeric",
  notNull: def !== undefined,
  def: def === undefined ? undefined : () => def,
});

function table(
  name: string,
  cols: Record<string, ColDef>,
  extra: Partial<Pick<TableDef, "fks" | "unique" | "checks">> = {},
): TableDef {
  return {
    name,
    cols,
    fks: extra.fks ?? [],
    unique: extra.unique ?? [],
    checks: extra.checks ?? [],
    updatedAt: "updated_at" in cols,
  };
}

const cascadeOrg = (): FkDef => ({ col: "organization_id", ref: "organizations", onDelete: "cascade" });

export const DEFAULT_ORG_SETTINGS = {
  active_modules: ["contacts", "bookings", "pipeline", "activities"],
  business_hours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
  agent_autonomy: "balanced",
} as const;

export const INDUSTRIES = ["health", "restaurant", "real_estate", "professional_services", "retail", "general"] as const;

export const SCHEMA: Record<string, TableDef> = {
  organizations: table(
    "organizations",
    {
      id: id(),
      name: text(true),
      industry: enumCol(INDUSTRIES),
      phone: text(),
      email: text(),
      subdomain: text(),
      plan: enumCol(["starter", "standard", "enterprise"], "standard"),
      settings: { type: "jsonb", notNull: true, def: () => structuredClone(DEFAULT_ORG_SETTINGS) },
      created_at: createdAt(),
      updated_at: createdAt(),
    },
    { unique: [{ name: "organizations_subdomain_key", cols: ["subdomain"] }] },
  ),
  // public.users del esquema v1 (clinic_id) con organization_id agregado en la migracion 001.
  // Su id referencia auth.users con ON DELETE CASCADE (se maneja en db.auth.admin.deleteUser).
  users: table(
    "users",
    {
      id: { type: "uuid", notNull: true },
      clinic_id: orgId(),
      organization_id: uuidCol(),
      full_name: { type: "text", notNull: true, def: () => "" },
      role: enumCol(["admin", "staff"], "staff"),
      created_at: createdAt(),
    },
    { fks: [{ col: "organization_id", ref: "organizations", onDelete: "cascade" }] },
  ),
  contacts: table(
    "contacts",
    {
      id: id(),
      organization_id: orgId(),
      full_name: text(true),
      phone: text(),
      email: text(),
      company_name: text(),
      tags: { type: "text[]", notNull: true, def: () => [] },
      custom_fields: { type: "jsonb", notNull: true, def: () => ({}) },
      source: enumCol(["whatsapp", "web", "manual", "agent_receptionist", "import"], "manual"),
      notes: text(),
      created_at: createdAt(),
      updated_at: createdAt(),
    },
    { fks: [cascadeOrg()] },
  ),
  items: table(
    "items",
    {
      id: id(),
      organization_id: orgId(),
      name: text(true),
      type: enumCol(["service", "product", "experience"], "service"),
      description: text(),
      price: money(0),
      color: { type: "text", notNull: true, def: () => "#6366f1" },
      active: { type: "bool", notNull: true, def: () => true },
      metadata: { type: "jsonb", notNull: true, def: () => ({}) },
      created_at: createdAt(),
      updated_at: createdAt(),
    },
    { fks: [cascadeOrg()] },
  ),
  opportunities: table(
    "opportunities",
    {
      id: id(),
      organization_id: orgId(),
      contact_id: uuidCol(),
      title: text(true),
      stage: enumCol(["lead", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]),
      value: money(0),
      currency: { type: "text", notNull: true, def: () => "MXN" },
      probability: { type: "int", notNull: true, def: () => 0 },
      assigned_to: uuidCol(),
      expected_close_date: { type: "date" },
      closed_at: { type: "timestamptz" },
      notes: text(),
      created_at: createdAt(),
      updated_at: createdAt(),
    },
    {
      fks: [
        cascadeOrg(),
        { col: "contact_id", ref: "contacts", onDelete: "set null" },
        { col: "assigned_to", ref: "users", onDelete: "set null" },
      ],
      checks: [
        {
          name: "opportunities_probability_check",
          test: (r) => typeof r.probability === "number" && r.probability >= 0 && r.probability <= 100,
        },
      ],
    },
  ),
  bookings: table(
    "bookings",
    {
      id: id(),
      organization_id: orgId(),
      contact_id: uuidCol(),
      item_id: uuidCol(),
      scheduled_at: { type: "timestamptz", notNull: true },
      duration_minutes: { type: "int", notNull: true, def: () => 30 },
      status: enumCol(["pending", "confirmed", "cancelled", "completed", "no_show"], "pending"),
      service_snapshot: text(),
      cost_at_booking: money(),
      notes: text(),
      source: enumCol(["whatsapp", "web", "manual", "agent_booking"], "manual"),
      n8n_execution_id: text(),
      metadata: { type: "jsonb", notNull: true, def: () => ({}) },
      created_at: createdAt(),
      updated_at: createdAt(),
    },
    {
      fks: [
        cascadeOrg(),
        { col: "contact_id", ref: "contacts", onDelete: "set null" },
        { col: "item_id", ref: "items", onDelete: "set null" },
      ],
    },
  ),
  activities: table(
    "activities",
    {
      id: id(),
      organization_id: orgId(),
      contact_id: uuidCol(),
      opportunity_id: uuidCol(),
      booking_id: uuidCol(),
      type: enumCol(["call", "message", "meeting", "task", "note", "stage_change", "agent_interaction"]),
      title: text(true),
      description: text(),
      status: enumCol(["pending", "completed", "cancelled"], "completed"),
      performed_by_type: enumCol(["human", "agent"]),
      performed_by_id: text(true),
      due_date: { type: "timestamptz" },
      assigned_to: uuidCol(),
      created_at: createdAt(),
    },
    {
      fks: [
        cascadeOrg(),
        { col: "assigned_to", ref: "users", onDelete: "set null" },
        { col: "contact_id", ref: "contacts", onDelete: "cascade" },
        { col: "opportunity_id", ref: "opportunities", onDelete: "set null" },
        { col: "booking_id", ref: "bookings", onDelete: "set null" },
      ],
    },
  ),
  agent_actions: table(
    "agent_actions",
    {
      id: id(),
      organization_id: orgId(),
      agent_name: enumCol(["orchestrator", "receptionist", "sales", "follow_up", "booking", "analyst"]),
      action_type: text(true),
      payload: { type: "jsonb", notNull: true },
      requires_approval: { type: "bool", notNull: true, def: () => false },
      status: enumCol(["pending", "approved", "rejected", "executed", "failed"], "pending"),
      proposed_at: createdAt(),
      reviewed_by: uuidCol(),
      reviewed_at: { type: "timestamptz" },
      review_notes: text(),
      execution_result: { type: "jsonb" },
      error_message: text(),
    },
    { fks: [cascadeOrg(), { col: "reviewed_by", ref: "users", onDelete: "set null" }] },
  ),
  budget_counters: table(
    "budget_counters",
    {
      organization_id: orgId(),
      last_number: { type: "int", notNull: true, def: () => 0 },
    },
    { fks: [cascadeOrg()], unique: [{ name: "budget_counters_pkey", cols: ["organization_id"] }] },
  ),
  budgets: table(
    "budgets",
    {
      id: id(),
      organization_id: orgId(),
      budget_number: text(true),
      responsible_id: uuidCol(),
      responsible_name: text(true),
      responsible_phone: text(),
      responsible_email: text(),
      status: enumCol(["draft", "active", "accepted", "expired"], "active"),
      subtotal: money(0),
      discount_value: money(0),
      discount_type: enumCol(["percentage", "fixed"], "percentage"),
      total: money(0),
      validity_days: { type: "int", notNull: true, def: () => 15 },
      payment_method: text(),
      doctor_notes: text(),
      patient_notes: text(),
      expires_at: { type: "timestamptz", notNull: true },
      created_at: createdAt(),
      updated_at: createdAt(),
    },
    {
      fks: [cascadeOrg(), { col: "responsible_id", ref: "contacts", onDelete: "set null" }],
      unique: [{ name: "budgets_org_number_key", cols: ["organization_id", "budget_number"] }],
    },
  ),
  budget_members: table(
    "budget_members",
    {
      id: id(),
      organization_id: orgId(),
      budget_id: { type: "uuid", notNull: true },
      full_name: text(true),
      relationship: enumCol(["responsible", "spouse", "child", "other"]),
      created_at: createdAt(),
    },
    { fks: [cascadeOrg(), { col: "budget_id", ref: "budgets", onDelete: "cascade" }] },
  ),
  budget_services: table(
    "budget_services",
    {
      id: id(),
      organization_id: orgId(),
      budget_member_id: { type: "uuid", notNull: true },
      service_id: uuidCol(),
      name: text(true),
      sessions: { type: "int", notNull: true, def: () => 1 },
      unit_price: money(0),
      is_manual_price: { type: "bool", notNull: true, def: () => false },
      created_at: createdAt(),
    },
    {
      fks: [
        cascadeOrg(),
        { col: "budget_member_id", ref: "budget_members", onDelete: "cascade" },
        { col: "service_id", ref: "items", onDelete: "set null" },
      ],
      checks: [
        {
          name: "budget_services_sessions_check",
          test: (r) => typeof r.sessions === "number" && r.sessions > 0,
        },
      ],
    },
  ),
};

// Orden de creacion respetando dependencias (padres antes que hijos).
export const TABLE_ORDER = [
  "organizations",
  "users",
  "contacts",
  "items",
  "opportunities",
  "bookings",
  "activities",
  "agent_actions",
  "budget_counters",
  "budgets",
  "budget_members",
  "budget_services",
] as const;
