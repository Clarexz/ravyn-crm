import type { Clinic, User, Patient, Appointment, AppointmentStatus } from "@/types/database";
import { addDays, addHours, startOfDay, subDays } from "date-fns";

export const MOCK_CLINIC: Clinic = {
  id: "mock-clinic-001",
  name: "Clínica Dental Sonrisa",
  phone: "5512345678",
  email: "contacto@sonrisa.mx",
  subdomain: "sonrisa",
  plan: "basic",
  created_at: "2024-01-15T00:00:00Z",
};

export const MOCK_USER: User = {
  id: "mock-user-001",
  clinic_id: "mock-clinic-001",
  full_name: "Admin Demo",
  role: "admin",
  created_at: "2024-01-15T00:00:00Z",
};

export const MOCK_STAFF: User[] = [
  MOCK_USER,
  {
    id: "mock-user-002",
    clinic_id: "mock-clinic-001",
    full_name: "Laura Jiménez",
    role: "staff",
    created_at: "2024-02-01T00:00:00Z",
  },
  {
    id: "mock-user-003",
    clinic_id: "mock-clinic-001",
    full_name: "Carlos Ruiz",
    role: "staff",
    created_at: "2024-03-10T00:00:00Z",
  },
];

export const MOCK_PATIENTS: Patient[] = [
  { id: "p-001", clinic_id: "mock-clinic-001", full_name: "Ana García López", phone: "5591234567", email: "ana.garcia@gmail.com", notes: "Alérgica a la penicilina", source: "whatsapp", created_at: "2024-02-10T00:00:00Z" },
  { id: "p-002", clinic_id: "mock-clinic-001", full_name: "Carlos Mendoza Reyes", phone: "5598765432", email: "carlos.m@outlook.com", notes: "", source: "web", created_at: "2024-02-15T00:00:00Z" },
  { id: "p-003", clinic_id: "mock-clinic-001", full_name: "María Torres Vega", phone: "5511223344", email: "", notes: "Prefiere citas por la mañana", source: "manual", created_at: "2024-03-01T00:00:00Z" },
  { id: "p-004", clinic_id: "mock-clinic-001", full_name: "Roberto Sánchez Flores", phone: "5544556677", email: "rsanchez@empresa.com", notes: "", source: "whatsapp", created_at: "2024-03-05T00:00:00Z" },
  { id: "p-005", clinic_id: "mock-clinic-001", full_name: "Sofía Ramírez Castro", phone: "5577889900", email: "sofia.rc@gmail.com", notes: "Ortodoncia en proceso", source: "web", created_at: "2024-03-12T00:00:00Z" },
  { id: "p-006", clinic_id: "mock-clinic-001", full_name: "Miguel Ángel Hernández", phone: "5533221100", email: "", notes: "", source: "manual", created_at: "2024-04-01T00:00:00Z" },
  { id: "p-007", clinic_id: "mock-clinic-001", full_name: "Valentina Cruz Morales", phone: "5566778899", email: "vcruz@hotmail.com", notes: "Ansiosa, necesita tiempo extra", source: "whatsapp", created_at: "2024-04-10T00:00:00Z" },
  { id: "p-008", clinic_id: "mock-clinic-001", full_name: "Diego Martínez López", phone: "5522334455", email: "diego.ml@gmail.com", notes: "", source: "web", created_at: "2024-04-20T00:00:00Z" },
  { id: "p-009", clinic_id: "mock-clinic-001", full_name: "Gabriela Ortiz Peña", phone: "5599887766", email: "", notes: "Bruxismo severo", source: "manual", created_at: "2024-05-01T00:00:00Z" },
  { id: "p-010", clinic_id: "mock-clinic-001", full_name: "Fernando Delgado Vega", phone: "5511998877", email: "fdelgado@empresa.mx", notes: "", source: "whatsapp", created_at: "2024-05-15T00:00:00Z" },
];

function makeAppt(
  id: string,
  patientIdx: number,
  offsetDays: number,
  hour: number,
  status: AppointmentStatus,
  service: string,
  source: "whatsapp" | "web" | "manual" = "manual",
  durationMinutes = 30
): Appointment & { patients: { full_name: string; phone: string } | null } {
  const base = startOfDay(new Date());
  const scheduled_at = addHours(addDays(base, offsetDays), hour).toISOString();
  const patient = MOCK_PATIENTS[patientIdx];
  return {
    id,
    clinic_id: "mock-clinic-001",
    patient_id: patient.id,
    scheduled_at,
    duration_minutes: durationMinutes,
    status,
    service,
    notes: "",
    source,
    n8n_execution_id: undefined,
    created_at: subDays(new Date(scheduled_at), 3).toISOString(),
    updated_at: subDays(new Date(scheduled_at), 1).toISOString(),
    patients: { full_name: patient.full_name, phone: patient.phone ?? "" },
  };
}

export const MOCK_APPOINTMENTS = [
  // Hoy
  makeAppt("a-001", 0, 0, 9,  "confirmed", "Limpieza", "whatsapp"),
  makeAppt("a-002", 1, 0, 10, "confirmed", "Ortodoncia", "web"),
  makeAppt("a-003", 2, 0, 11, "pending",   "Revisión general", "manual"),
  makeAppt("a-004", 3, 0, 12, "confirmed", "Extracción", "whatsapp"),
  makeAppt("a-005", 4, 0, 15, "pending",   "Blanqueamiento", "web"),
  makeAppt("a-006", 5, 0, 16, "confirmed", "Limpieza", "manual"),
  // Mañana
  makeAppt("a-007", 6, 1, 9,  "pending",   "Revisión general", "whatsapp"),
  makeAppt("a-008", 7, 1, 11, "confirmed", "Ortodoncia", "web"),
  makeAppt("a-009", 8, 1, 14, "confirmed", "Extracción", "manual", 45),
  // Esta semana
  makeAppt("a-010", 9, 2, 10, "pending",   "Limpieza", "whatsapp"),
  makeAppt("a-011", 0, 2, 12, "confirmed", "Blanqueamiento", "web"),
  makeAppt("a-012", 1, 3, 9,  "confirmed", "Ortodoncia", "manual"),
  makeAppt("a-013", 2, 3, 11, "pending",   "Revisión general", "whatsapp"),
  makeAppt("a-014", 3, 4, 10, "confirmed", "Limpieza", "web"),
  makeAppt("a-015", 4, 4, 15, "pending",   "Extracción", "manual", 60),
  // Próximas semanas
  makeAppt("a-016", 5, 7,  9,  "confirmed", "Limpieza", "whatsapp"),
  makeAppt("a-017", 6, 7,  11, "pending",   "Ortodoncia", "web"),
  makeAppt("a-018", 7, 8,  10, "confirmed", "Blanqueamiento", "manual"),
  makeAppt("a-019", 8, 10, 9,  "pending",   "Revisión general", "whatsapp"),
  makeAppt("a-020", 9, 12, 14, "confirmed", "Limpieza", "web"),
  // Pasadas (historial)
  makeAppt("a-021", 0, -7, 10, "completed", "Limpieza", "whatsapp"),
  makeAppt("a-022", 1, -7, 11, "completed", "Extracción", "web"),
  makeAppt("a-023", 2, -5, 9,  "no_show",   "Revisión general", "manual"),
  makeAppt("a-024", 3, -3, 14, "completed", "Ortodoncia", "whatsapp"),
  makeAppt("a-025", 4, -2, 10, "cancelled", "Blanqueamiento", "web"),
];
