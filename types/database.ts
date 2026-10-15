export type Clinic = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  subdomain?: string;
  plan: string;
  created_at: string;
};

export type User = {
  id: string;
  clinic_id: string;
  organization_id?: string | null;
  full_name: string;
  role: "admin" | "staff";
  created_at: string;
};

export type StaffMember = User & { email: string };

export type Patient = {
  id: string;
  clinic_id: string;
  full_name: string;
  phone?: string;
  email?: string;
  notes?: string;
  source: "whatsapp" | "web" | "manual";
  created_at: string;
};

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

export type Appointment = {
  id: string;
  clinic_id: string;
  patient_id?: string;
  scheduled_at: string;
  duration_minutes: number;
  status: AppointmentStatus;
  service?: string;
  service_id?: string | null;
  cost_at_booking?: number | null;
  notes?: string;
  source: "whatsapp" | "web" | "manual";
  n8n_execution_id?: string;
  created_at: string;
  updated_at: string;
};

export type Service = {
  id: string;
  clinic_id: string;
  name: string;
  description?: string | null;
  cost: number;
  color: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type AppointmentLog = {
  id: string;
  appointment_id: string;
  changed_by: string;
  old_status?: string;
  new_status?: string;
  note?: string;
  created_at: string;
};

export type BudgetStatus = "draft" | "active" | "accepted" | "expired";

export type BudgetMemberRelationship = "responsible" | "spouse" | "child" | "other";

export type BudgetService = {
  service_id: string;
  name: string;
  sessions: number;
  unit_price: number;
  is_manual_price: boolean;
};

export type BudgetMember = {
  id: string;
  full_name: string;
  relationship: BudgetMemberRelationship;
  services: BudgetService[];
};

export type Budget = {
  id: string;
  clinic_id: string;
  budget_number: string;
  responsible_id: string;
  responsible_name: string;
  responsible_phone?: string;
  responsible_email?: string;
  status: BudgetStatus;
  subtotal: number;
  discount_value: number;
  discount_type: "percentage" | "fixed";
  total: number;
  validity_days: number;
  payment_method?: string;
  doctor_notes?: string;
  patient_notes?: string;
  members: BudgetMember[];
  created_at: string;
  expires_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Ravyn CRM v2: esquema universal (migraciones supabase/migrations/001 a 004)
// Conviven con los tipos v1 hasta que la app migre a las tablas v2.
// ---------------------------------------------------------------------------

export type IndustryType =
  | "health"
  | "restaurant"
  | "real_estate"
  | "professional_services"
  | "retail"
  | "general";

export type OrganizationSettings = {
  active_modules: string[];
  business_hours: {
    start: string;
    end: string;
    days: number[];
  };
  agent_autonomy: "conservative" | "balanced" | "autonomous";
};

export type Organization = {
  id: string;
  name: string;
  industry: IndustryType;
  phone?: string | null;
  email?: string | null;
  subdomain?: string | null;
  plan: "starter" | "standard" | "enterprise";
  settings: OrganizationSettings;
  created_at: string;
  updated_at: string;
};

export type ContactSource = "whatsapp" | "web" | "manual" | "agent_receptionist" | "import";

export type Contact = {
  id: string;
  organization_id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  company_name?: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  source: ContactSource;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type OpportunityStage =
  | "lead"
  | "contacted"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost";

export type Opportunity = {
  id: string;
  organization_id: string;
  contact_id?: string | null;
  title: string;
  stage: OpportunityStage;
  value: number;
  currency: string;
  probability: number;
  assigned_to?: string | null;
  expected_close_date?: string | null;
  closed_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type ItemType = "service" | "product" | "experience";

export type Item = {
  id: string;
  organization_id: string;
  name: string;
  type: ItemType;
  description?: string | null;
  price: number;
  color: string;
  active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed" | "no_show";

export type BookingSource = "whatsapp" | "web" | "manual" | "agent_booking";

export type Booking = {
  id: string;
  organization_id: string;
  contact_id?: string | null;
  item_id?: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: BookingStatus;
  service_snapshot?: string | null;
  cost_at_booking?: number | null;
  notes?: string | null;
  source: BookingSource;
  n8n_execution_id?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ActivityType =
  | "call"
  | "message"
  | "meeting"
  | "task"
  | "note"
  | "stage_change"
  | "agent_interaction";

export type Activity = {
  id: string;
  organization_id: string;
  contact_id?: string | null;
  opportunity_id?: string | null;
  booking_id?: string | null;
  type: ActivityType;
  title: string;
  description?: string | null;
  status: "pending" | "completed" | "cancelled";
  performed_by_type: "human" | "agent";
  performed_by_id: string;
  due_date?: string | null;
  // Persona responsable de la tarea (Fase 6, migracion 008).
  assigned_to?: string | null;
  created_at: string;
};

export type AgentName =
  | "orchestrator"
  | "receptionist"
  | "sales"
  | "follow_up"
  | "booking"
  | "analyst";

export type AgentActionStatus = "pending" | "approved" | "rejected" | "executed" | "failed";

export type AgentAction = {
  id: string;
  organization_id: string;
  agent_name: AgentName;
  action_type: string;
  payload: Record<string, unknown>;
  requires_approval: boolean;
  status: AgentActionStatus;
  proposed_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  execution_result?: Record<string, unknown> | null;
  error_message?: string | null;
};
