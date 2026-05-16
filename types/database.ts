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
