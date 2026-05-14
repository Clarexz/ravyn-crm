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
  notes?: string;
  source: "whatsapp" | "web" | "manual";
  n8n_execution_id?: string;
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
