// Datos de ejemplo del modo demo. Deterministas (sin Math.random): los ids y el contenido son
// fijos; solo las fechas son relativas al "ahora" con el que se siembra, para que el dashboard
// siempre tenga datos recientes y futuros. Todo es ficticio (nada de personas reales).
//
// Horario: las herramientas de agentes interpretan el horario laboral en UTC (09:00-18:00), asi que
// todas las citas caen entre 15:00 y 18:00 UTC. En Ciudad de Mexico (UTC-6, sin horario de verano)
// eso se ve como 09:00-12:00, dentro del horario laboral tambien en hora local.
import { DEMO_ORG_ID, DEMO_OTHER_ORG_ID, DEMO_USER_ID } from "./config";
import type { DemoDb, Row } from "./engine";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// uuid determinista: etiqueta hexadecimal + contador. Las filas de la segunda organizacion usan n >= 500.
const mk =
  (tag: string) =>
  (n: number): string =>
    `00000000-0000-4000-8000-${tag}${String(n).padStart(12 - tag.length, "0")}`;
const contactId = mk("c");
const itemId = mk("d");
const oppId = mk("e");
const bookingId = mk("b");
const activityId = mk("f");
const actionId = mk("a");
const budgetId = mk("9");
const memberId = mk("8");
const budgetServiceId = mk("7");

export const DEMO_STAFF_IDS = {
  admin: DEMO_USER_ID,
  reception: "00000000-0000-4000-8000-0000000000a2",
  assistant: "00000000-0000-4000-8000-0000000000a3",
} as const;
export const DEMO_OTHER_USER_ID = "00000000-0000-4000-8000-0000000000a4";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

interface ContactSpec {
  name: string;
  email: string;
  source: "whatsapp" | "web" | "manual" | "agent_receptionist" | "import";
  company?: string;
  tags: string[];
  notes?: string;
  custom?: Record<string, unknown>;
}

const CONTACTS: ContactSpec[] = [
  { name: "Mariana Vega Torres", email: "mariana.vega@correo-demo.mx", source: "whatsapp", tags: ["ortodoncia", "vip"], notes: "Prefiere citas por la manana." },
  { name: "Jose Luis Hernandez Ruiz", email: "jose.hernandez@correo-demo.mx", source: "web", tags: ["cirugia"] },
  { name: "Fernanda Castillo Mora", email: "fernanda.castillo@correo-demo.mx", source: "whatsapp", tags: ["endodoncia"], custom: { alergias: "penicilina" } },
  { name: "Ricardo Salazar Ortega", email: "ricardo.salazar@correo-demo.mx", source: "manual", company: "Constructora Salazar", tags: ["rehabilitacion"] },
  { name: "Daniela Ibarra Soto", email: "daniela.ibarra@correo-demo.mx", source: "agent_receptionist", tags: ["estetica"], notes: "Interesada en carillas." },
  { name: "Carlos Mendoza Aguilar", email: "carlos.mendoza@correo-demo.mx", source: "manual", tags: ["blanqueamiento"] },
  { name: "Ximena Rojas Delgado", email: "ximena.rojas@correo-demo.mx", source: "web", tags: [] },
  { name: "Alejandro Peña Cordero", email: "alejandro.pena@correo-demo.mx", source: "whatsapp", company: "Distribuidora Peña", tags: ["implantes"] },
  { name: "Valeria Navarro Ibañez", email: "valeria.navarro@correo-demo.mx", source: "import", tags: ["familiar"] },
  { name: "Gabriela Ortiz Fuentes", email: "gabriela.ortiz@correo-demo.mx", source: "whatsapp", tags: ["familiar", "limpieza"], custom: { aseguradora: "Seguro Demo" } },
  { name: "Diego Ramirez Lara", email: "diego.ramirez@correo-demo.mx", source: "web", tags: [] },
  { name: "Paola Guzman Cabrera", email: "paola.guzman@correo-demo.mx", source: "agent_receptionist", tags: ["ortodoncia"] },
  { name: "Emiliano Cruz Barrios", email: "emiliano.cruz@correo-demo.mx", source: "manual", tags: ["protesis"], notes: "Paciente de la tercera edad, requiere acompanante." },
  { name: "Andrea Solis Montoya", email: "andrea.solis@correo-demo.mx", source: "import", company: "Estudio Solis", tags: [] },
];

interface ItemSpec {
  name: string;
  description: string;
  price: number;
  color: string;
  minutes: number;
  active?: boolean;
}

const ITEMS: ItemSpec[] = [
  { name: "Consulta de valoracion", description: "Revision general y plan de tratamiento", price: 500, color: "#6366f1", minutes: 30 },
  { name: "Limpieza dental", description: "Profilaxis con ultrasonido y pulido", price: 800, color: "#0ea5e9", minutes: 45 },
  { name: "Blanqueamiento dental", description: "Blanqueamiento en consultorio con lampara LED", price: 3500, color: "#f59e0b", minutes: 60 },
  { name: "Resina (empaste)", description: "Restauracion de una pieza con resina", price: 1200, color: "#10b981", minutes: 45 },
  { name: "Endodoncia", description: "Tratamiento de conductos de una pieza", price: 4500, color: "#ef4444", minutes: 60 },
  { name: "Extraccion simple", description: "Extraccion de una pieza sin complicaciones", price: 1000, color: "#8b5cf6", minutes: 30 },
  { name: "Ortodoncia: ajuste mensual", description: "Control y ajuste de brackets", price: 900, color: "#ec4899", minutes: 30 },
  { name: "Corona de porcelana", description: "Corona de porcelana sobre metal", price: 6500, color: "#14b8a6", minutes: 60 },
  { name: "Paquete verano (descontinuado)", description: "Promocion de temporada ya terminada", price: 2990, color: "#94a3b8", minutes: 60, active: false },
];

const BOOKING_COUNT = 35;
const PAST_STATUSES = ["completed", "completed", "completed", "no_show", "completed", "cancelled"] as const;
const FUTURE_STATUSES = ["confirmed", "confirmed", "pending", "confirmed", "pending", "cancelled"] as const;
const BOOKING_SOURCES = ["manual", "whatsapp", "web", "agent_booking", "whatsapp"] as const;
const BOOKING_NOTES = [null, "Trae radiografias previas.", null, null, "Solicita recordatorio por WhatsApp.", null, null];

interface ActivitySpec {
  at: string;
  row: Row;
}

interface BudgetServiceSpec {
  item: number | null;
  name?: string;
  sessions: number;
  unitPrice?: number;
}
interface BudgetMemberSpec {
  name: string;
  relationship: "responsible" | "spouse" | "child" | "other";
  services: BudgetServiceSpec[];
}
interface BudgetSpec {
  contact: number;
  status: "draft" | "active" | "accepted" | "expired";
  createdDaysAgo: number;
  validityDays: number;
  discountType: "percentage" | "fixed";
  discountValue: number;
  paymentMethod: string | null;
  doctorNotes: string | null;
  patientNotes: string | null;
  members: BudgetMemberSpec[];
}

const BUDGETS: BudgetSpec[] = [
  {
    contact: 9, status: "expired", createdDaysAgo: 45, validityDays: 15, discountType: "percentage", discountValue: 15,
    paymentMethod: "Efectivo", doctorNotes: "Limpiezas preventivas para toda la familia.", patientNotes: "Pendiente de confirmar fechas.",
    members: [
      { name: "Gabriela Ortiz Fuentes", relationship: "responsible", services: [{ item: 1, sessions: 3 }] },
      { name: "Marco Antonio Ortiz", relationship: "spouse", services: [{ item: 1, sessions: 3 }] },
      { name: "Lucia Ortiz Fuentes", relationship: "child", services: [{ item: 1, sessions: 3 }, { item: 0, sessions: 1 }] },
    ],
  },
  {
    contact: 5, status: "accepted", createdDaysAgo: 20, validityDays: 30, discountType: "fixed", discountValue: 300,
    paymentMethod: "Transferencia", doctorNotes: "Blanqueamiento posterior a limpieza.", patientNotes: null,
    members: [{ name: "Carlos Mendoza Aguilar", relationship: "responsible", services: [{ item: 2, sessions: 1 }, { item: 1, sessions: 1 }] }],
  },
  {
    contact: 0, status: "active", createdDaysAgo: 6, validityDays: 15, discountType: "percentage", discountValue: 10,
    paymentMethod: "Tarjeta (3 meses sin intereses)", doctorNotes: "Plan de ortodoncia de 12 meses mas limpiezas.", patientNotes: "Incluye revision inicial.",
    members: [
      { name: "Mariana Vega Torres", relationship: "responsible", services: [{ item: 6, sessions: 12 }, { item: 0, sessions: 1 }] },
      { name: "Sofia Vega Torres", relationship: "other", services: [{ item: 1, sessions: 2 }] },
    ],
  },
  {
    contact: 7, status: "draft", createdDaysAgo: 1, validityDays: 15, discountType: "percentage", discountValue: 0,
    paymentMethod: null, doctorNotes: "Rehabilitacion de pieza con endodoncia, poste y corona.", patientNotes: null,
    members: [
      {
        name: "Alejandro Peña Cordero", relationship: "responsible",
        services: [{ item: 4, sessions: 1 }, { item: null, name: "Poste de fibra de vidrio", sessions: 1, unitPrice: 1800 }, { item: 7, sessions: 1 }],
      },
    ],
  },
];

interface OppSpec {
  title: string;
  contact: number;
  stage: "lead" | "contacted" | "qualified" | "proposal" | "negotiation" | "won" | "lost";
  value: number;
  probability: number;
  createdDaysAgo: number;
  closedDaysAgo?: number;
  staff: keyof typeof DEMO_STAFF_IDS;
  notes: string | null;
}

const OPPORTUNITIES: OppSpec[] = [
  { title: "Ortodoncia completa - Mariana Vega", contact: 0, stage: "negotiation", value: 38000, probability: 75, createdDaysAgo: 40, staff: "admin", notes: "Esta comparando precios con otra clinica." },
  { title: "Rehabilitacion con coronas", contact: 3, stage: "proposal", value: 26000, probability: 50, createdDaysAgo: 33, staff: "admin", notes: "Esperando respuesta del paciente." },
  { title: "Blanqueamiento y limpieza", contact: 5, stage: "qualified", value: 4300, probability: 40, createdDaysAgo: 20, staff: "reception", notes: null },
  { title: "Implante unitario", contact: 7, stage: "proposal", value: 21000, probability: 55, createdDaysAgo: 28, staff: "admin", notes: "Presupuesto en borrador." },
  { title: "Tratamiento de endodoncia", contact: 2, stage: "contacted", value: 4500, probability: 25, createdDaysAgo: 12, staff: "assistant", notes: null },
  { title: "Paquete familiar de limpiezas", contact: 9, stage: "lead", value: 3200, probability: 10, createdDaysAgo: 9, staff: "reception", notes: null },
  { title: "Ortodoncia invisible", contact: 11, stage: "lead", value: 52000, probability: 10, createdDaysAgo: 45, staff: "admin", notes: "Sin seguimiento desde la primera consulta." },
  { title: "Carillas esteticas", contact: 4, stage: "contacted", value: 18000, probability: 20, createdDaysAgo: 35, staff: "reception", notes: null },
  { title: "Protesis removible", contact: 12, stage: "won", value: 15000, probability: 100, createdDaysAgo: 50, closedDaysAgo: 9, staff: "admin", notes: "Cerrado con pago en parcialidades." },
  { title: "Cirugia de terceros molares", contact: 1, stage: "lost", value: 9000, probability: 0, createdDaysAgo: 44, closedDaysAgo: 14, staff: "assistant", notes: "Eligio otra clinica por cercania." },
];

// Dias desde la ultima actividad de cada oportunidad (en el mismo orden que OPPORTUNITIES).
const LAST_ACTIVITY_DAYS = [3, 18, 4, 6, 2, 1, 30, 22, 9, 14];

export interface DemoSeedSummary {
  organizationId: string;
  otherOrganizationId: string;
  contacts: number;
  items: number;
  bookings: number;
  opportunities: number;
  activities: number;
  agentActions: number;
  budgets: number;
}

// Siembra la base (que debe estar vacia) con los datos de ejemplo relativos a `now`.
export function seedDemoData(db: DemoDb, now: Date = db.now()): DemoSeedSummary {
  return db.transaction(() => seed(db, now));
}

function seed(db: DemoDb, now: Date): DemoSeedSummary {
  const t0 = now.getTime();
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const ago = (days: number, hours = 0): string => new Date(t0 - days * DAY - hours * HOUR).toISOString();
  const clampPast = (ms: number, marginMin = 5): string => new Date(Math.min(ms, t0 - marginMin * MIN)).toISOString();
  const atDay = (offset: number, hh: number, mm: number): number => dayStart + offset * DAY + (hh * 60 + mm) * MIN;
  const isWeekend = (offset: number): boolean => {
    const d = new Date(dayStart + offset * DAY).getUTCDay();
    return d === 0 || d === 6;
  };
  // Desplazamiento (en dias) del k-esimo dia habil respecto al ultimo dia habil <= hoy.
  const bizOffset = (k: number): number => {
    let off = 0;
    while (isWeekend(off)) off -= 1;
    const step = k >= 0 ? 1 : -1;
    for (let n = Math.abs(k); n > 0; ) {
      off += step;
      if (!isWeekend(off)) n--;
    }
    return off;
  };
  const put = (table: string, row: Row): Row => db.insertRow(table, row);

  // ------------------------------------------------------------ organizaciones
  put("organizations", {
    id: DEMO_ORG_ID,
    name: "Clinica Demo",
    industry: "health",
    phone: "+52 55 5550 0000",
    email: "contacto@clinica-demo.ejemplo.mx",
    subdomain: "clinica-demo",
    plan: "standard",
    settings: {
      active_modules: ["contacts", "bookings", "pipeline", "activities", "budgets", "reports"],
      business_hours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
      agent_autonomy: "balanced",
    },
    created_at: ago(120),
    updated_at: ago(30),
  });
  put("organizations", {
    id: DEMO_OTHER_ORG_ID,
    name: "Sonrisas del Norte",
    industry: "health",
    phone: "+52 81 5550 0100",
    email: "contacto@sonrisas-norte.ejemplo.mx",
    subdomain: "sonrisas-norte",
    plan: "starter",
    settings: {
      active_modules: ["contacts", "bookings", "pipeline", "activities"],
      business_hours: { start: "10:00", end: "14:00", days: [1, 2, 3, 4, 5, 6] },
      agent_autonomy: "conservative",
    },
    created_at: ago(90),
    updated_at: ago(40),
  });

  // ------------------------------------------------------------ usuarios (auth + public.users)
  const staff: Array<{ id: string; name: string; email: string; role: "admin" | "staff"; days: number; org: string }> = [
    { id: DEMO_STAFF_IDS.admin, name: "Dra. Demo", email: "dra.demo@ejemplo.mx", role: "admin", days: 120, org: DEMO_ORG_ID },
    { id: DEMO_STAFF_IDS.reception, name: "Jorge Medina (recepcion)", email: "jorge.medina@ejemplo.mx", role: "staff", days: 100, org: DEMO_ORG_ID },
    { id: DEMO_STAFF_IDS.assistant, name: "Karla Duran (asistente)", email: "karla.duran@ejemplo.mx", role: "staff", days: 60, org: DEMO_ORG_ID },
    { id: DEMO_OTHER_USER_ID, name: "Dr. Otro Demo", email: "admin@sonrisas-norte.ejemplo.mx", role: "admin", days: 90, org: DEMO_OTHER_ORG_ID },
  ];
  for (const u of staff) {
    db.seedAuthUser({
      id: u.id,
      email: u.email,
      email_confirm: true,
      user_metadata: { full_name: u.name, role: u.role, clinic_id: u.org, organization_id: u.org },
      created_at: ago(u.days),
    });
    put("users", { id: u.id, clinic_id: u.org, organization_id: u.org, full_name: u.name, role: u.role, created_at: ago(u.days) });
  }
  const staffIds = [DEMO_STAFF_IDS.admin, DEMO_STAFF_IDS.reception, DEMO_STAFF_IDS.assistant];
  const staffOf = (k: keyof typeof DEMO_STAFF_IDS): string => DEMO_STAFF_IDS[k];

  // ------------------------------------------------------------ contactos
  CONTACTS.forEach((c, i) => {
    const created = ago(100 - i * 6, i);
    put("contacts", {
      id: contactId(i + 1),
      organization_id: DEMO_ORG_ID,
      full_name: c.name,
      phone: `+52 55 5550 ${1001 + i}`,
      email: c.email,
      company_name: c.company ?? null,
      tags: c.tags,
      custom_fields: c.custom ?? {},
      source: c.source,
      notes: c.notes ?? null,
      created_at: created,
      updated_at: created,
    });
  });
  const otherContacts = [
    { name: "Hector Garza Villarreal", email: "hector.garza@correo-demo.mx", source: "manual" },
    { name: "Lorena Trevino Salinas", email: "lorena.trevino@correo-demo.mx", source: "whatsapp" },
    { name: "Mauricio Elizondo Cantu", email: "mauricio.elizondo@correo-demo.mx", source: "web" },
  ] as const;
  otherContacts.forEach((c, i) => {
    put("contacts", {
      id: contactId(500 + i + 1),
      organization_id: DEMO_OTHER_ORG_ID,
      full_name: c.name,
      phone: `+52 81 5550 ${2001 + i}`,
      email: c.email,
      source: c.source,
      created_at: ago(60 - i * 10),
      updated_at: ago(60 - i * 10),
    });
  });

  // ------------------------------------------------------------ items (catalogo)
  ITEMS.forEach((it, i) => {
    put("items", {
      id: itemId(i + 1),
      organization_id: DEMO_ORG_ID,
      name: it.name,
      type: "service",
      description: it.description,
      price: it.price,
      color: it.color,
      active: it.active ?? true,
      created_at: ago(110),
      updated_at: ago(110),
    });
  });
  const otherItems = [
    { name: "Consulta general", price: 400, color: "#2563eb" },
    { name: "Limpieza", price: 650, color: "#16a34a" },
  ];
  otherItems.forEach((it, i) => {
    put("items", {
      id: itemId(500 + i + 1),
      organization_id: DEMO_OTHER_ORG_ID,
      name: it.name,
      type: "service",
      price: it.price,
      color: it.color,
      created_at: ago(80),
      updated_at: ago(80),
    });
  });

  // ------------------------------------------------------------ bookings
  interface BookingInfo { id: string; status: string; created: number; contact: number; source: string; scheduled: number }
  const bookings: BookingInfo[] = [];
  const perDay = new Map<number, number>();
  let pastN = 0;
  let futureN = 0;
  for (let i = 0; i < BOOKING_COUNT; i++) {
    const k = Math.floor((i * 31) / BOOKING_COUNT) - 20;
    const off = bizOffset(k);
    const slot = perDay.get(off) ?? 0;
    perDay.set(off, slot + 1);
    // Franja 0: 15:00 o 15:30; franja 1: 16:30 o 17:00. Con duraciones <= 60 min nunca se solapan.
    const [hh, mm] = slot === 0 ? [15, i % 2 === 0 ? 0 : 30] : [i % 2 === 0 ? 16 : 17, i % 2 === 0 ? 30 : 0];
    const scheduled = atDay(off, hh, mm);
    const contact = (i * 5 + 3) % CONTACTS.length;
    const item = (i * 3) % 8;
    const past = scheduled < t0;
    const status = past ? PAST_STATUSES[pastN++ % PAST_STATUSES.length] : FUTURE_STATUSES[futureN++ % FUTURE_STATUSES.length];
    const source = BOOKING_SOURCES[i % BOOKING_SOURCES.length];
    const created = Math.min(scheduled - (3 + (i % 5)) * DAY, t0 - (1 + (i % 36)) * HOUR);
    const spec = ITEMS[item];
    put("bookings", {
      id: bookingId(i + 1),
      organization_id: DEMO_ORG_ID,
      contact_id: contactId(contact + 1),
      item_id: itemId(item + 1),
      scheduled_at: new Date(scheduled).toISOString(),
      duration_minutes: Math.min(spec.minutes, 60),
      status,
      service_snapshot: spec.name,
      cost_at_booking: spec.price,
      notes: BOOKING_NOTES[i % BOOKING_NOTES.length],
      source,
      n8n_execution_id: source === "whatsapp" ? `demo-n8n-${String(i + 1).padStart(4, "0")}` : null,
      created_at: new Date(created).toISOString(),
      updated_at: new Date(created).toISOString(),
    });
    bookings.push({ id: bookingId(i + 1), status, created, contact, source, scheduled });
  }
  // Segunda organizacion: una cita pasada y una futura (horario 10:00-14:00 UTC).
  [
    { n: 1, off: bizOffset(-3), status: "completed", contact: 1, item: 1, hh: 10 },
    { n: 2, off: bizOffset(4), status: "confirmed", contact: 2, item: 2, hh: 11 },
  ].forEach((b) => {
    put("bookings", {
      id: bookingId(500 + b.n),
      organization_id: DEMO_OTHER_ORG_ID,
      contact_id: contactId(500 + b.contact),
      item_id: itemId(500 + b.item),
      scheduled_at: new Date(atDay(b.off, b.hh, 0)).toISOString(),
      duration_minutes: 45,
      status: b.status,
      service_snapshot: otherItems[b.item - 1].name,
      cost_at_booking: otherItems[b.item - 1].price,
      source: "manual",
      created_at: ago(8),
      updated_at: ago(8),
    });
  });

  // ------------------------------------------------------------ oportunidades
  OPPORTUNITIES.forEach((o, i) => {
    const open = o.stage !== "won" && o.stage !== "lost";
    put("opportunities", {
      id: oppId(i + 1),
      organization_id: DEMO_ORG_ID,
      contact_id: contactId(o.contact + 1),
      title: o.title,
      stage: o.stage,
      value: o.value,
      currency: "MXN",
      probability: o.probability,
      assigned_to: staffOf(o.staff),
      expected_close_date: open ? new Date(atDay(5 + i * 3, 0, 0)).toISOString().slice(0, 10) : null,
      closed_at: o.closedDaysAgo === undefined ? null : ago(o.closedDaysAgo),
      notes: o.notes,
      created_at: ago(o.createdDaysAgo),
      updated_at: ago(LAST_ACTIVITY_DAYS[i]),
    });
  });
  put("opportunities", {
    id: oppId(501),
    organization_id: DEMO_OTHER_ORG_ID,
    contact_id: contactId(501),
    title: "Plan de limpiezas semestral",
    stage: "qualified",
    value: 3900,
    probability: 40,
    assigned_to: DEMO_OTHER_USER_ID,
    created_at: ago(15),
    updated_at: ago(5),
  });

  // ------------------------------------------------------------ actividades
  const acts: ActivitySpec[] = [];
  const addAct = (at: string, row: Row): void => {
    acts.push({ at, row: { status: "completed", ...row, organization_id: DEMO_ORG_ID, created_at: at } });
  };
  const humans = staffIds;

  // Cambios de estado de citas (humanos) y citas agendadas por el agente.
  let agentBookings = 0;
  bookings.forEach((b, i) => {
    if (b.source === "agent_booking" && agentBookings < 3) {
      agentBookings++;
      addAct(clampPast(b.created + MIN), {
        contact_id: contactId(b.contact + 1),
        booking_id: b.id,
        type: "meeting",
        title: "Cita agendada por agente",
        performed_by_type: "agent",
        performed_by_id: "booking",
      });
    }
    if (b.status !== "pending" && i % 4 === 0) {
      const from = b.status === "completed" || b.status === "no_show" ? "confirmed" : "pending";
      addAct(clampPast(b.created + 2 * HOUR), {
        contact_id: contactId(b.contact + 1),
        booking_id: b.id,
        type: "note",
        title: `Cambio de estado: ${from} -> ${b.status}`,
        description:
          b.status === "no_show" ? "El paciente no se presento ni aviso."
          : b.status === "cancelled" ? "El paciente aviso por WhatsApp."
          : null,
        performed_by_type: "human",
        performed_by_id: humans[i % humans.length],
      });
    }
  });

  // Historial de oportunidades. Las abiertas 2, 7 y 8 quedan sin actividad en mas de 15 dias (estancadas).
  const opp = (n: number): { opportunity_id: string; contact_id: string } => ({
    opportunity_id: oppId(n),
    contact_id: contactId(OPPORTUNITIES[n - 1].contact + 1),
  });
  addAct(ago(12), { ...opp(1), type: "call", title: "Llamada de seguimiento al presupuesto", description: "Pide opciones de pago en parcialidades.", performed_by_type: "human", performed_by_id: staffIds[0] });
  addAct(ago(3), { ...opp(1), type: "stage_change", title: "Etapa: proposal a negotiation", performed_by_type: "human", performed_by_id: staffIds[0] });
  addAct(ago(25), { ...opp(2), type: "call", title: "Llamada para explicar el plan de coronas", performed_by_type: "human", performed_by_id: staffIds[0] });
  addAct(ago(18), { ...opp(2), type: "meeting", title: "Consulta de valoracion de rehabilitacion", performed_by_type: "human", performed_by_id: staffIds[0] });
  addAct(ago(4), { ...opp(3), type: "message", title: "WhatsApp: costo del blanqueamiento", description: "Se envio el costo y la duracion del tratamiento.", performed_by_type: "human", performed_by_id: staffIds[1] });
  addAct(ago(6), { ...opp(4), type: "call", title: "Llamada: dudas sobre el implante", performed_by_type: "human", performed_by_id: staffIds[0] });
  addAct(ago(2), { ...opp(5), type: "agent_interaction", title: "Consulta atendida por el agente de recepcion", description: "Pregunto por horarios y costo de la endodoncia.", performed_by_type: "agent", performed_by_id: "receptionist" });
  addAct(ago(1), { ...opp(6), type: "message", title: "Mensaje de seguimiento enviado", description: "Recordatorio del paquete familiar.", performed_by_type: "agent", performed_by_id: "follow_up" });
  addAct(ago(30), { ...opp(7), type: "note", title: "Primera consulta de ortodoncia invisible", performed_by_type: "human", performed_by_id: staffIds[0] });
  addAct(ago(22), { ...opp(8), type: "call", title: "Llamada sobre carillas esteticas", description: "Quedo de confirmar presupuesto.", performed_by_type: "human", performed_by_id: staffIds[1] });
  addAct(ago(9), { ...opp(9), type: "stage_change", title: "Etapa: negotiation a won", description: "Acepto el plan y pago el anticipo.", performed_by_type: "human", performed_by_id: staffIds[0] });
  addAct(ago(14), { ...opp(10), type: "stage_change", title: "Etapa: proposal a lost", description: "Eligio otra clinica por cercania.", performed_by_type: "human", performed_by_id: staffIds[2] });

  // Tareas pendientes (2 vencidas y 3 por vencer). Las de las oportunidades estancadas se ligan solo al
  // contacto: una tarea ligada a la oportunidad contaria como actividad reciente. Una la crea el agente.
  const task = (
    daysAgoCreated: number,
    dueInDays: number,
    title: string,
    link: Row,
    by: { type: "human" | "agent"; id: string },
  ): void => {
    addAct(ago(daysAgoCreated), {
      ...link,
      type: "task",
      title,
      status: "pending",
      due_date: new Date(dayStart + dueInDays * DAY + 16 * HOUR).toISOString(),
      performed_by_type: by.type,
      performed_by_id: by.id,
    });
  };
  task(7, -2, "Llamar a Ricardo Salazar con el presupuesto", { contact_id: contactId(4) }, { type: "human", id: staffIds[0] });
  task(9, -5, "Pedir radiografias de Carlos Mendoza", { contact_id: contactId(6) }, { type: "human", id: staffIds[1] });
  task(3, 1, "Enviar presupuesto del implante", opp(4), { type: "human", id: staffIds[0] });
  task(2, 3, "Confirmar cita de ajuste de ortodoncia", { contact_id: contactId(1) }, { type: "human", id: staffIds[1] });
  task(1, 7, "Dar seguimiento a la propuesta de ortodoncia invisible", { contact_id: contactId(12) }, { type: "agent", id: "follow_up" });

  // Ordenadas por fecha para que sus ids reflejen el orden cronologico.
  acts.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  acts.forEach((a, i) => put("activities", { id: activityId(i + 1), ...a.row }));
  put("activities", {
    id: activityId(501),
    organization_id: DEMO_OTHER_ORG_ID,
    contact_id: contactId(501),
    opportunity_id: oppId(501),
    type: "call",
    title: "Llamada de bienvenida",
    status: "completed",
    performed_by_type: "human",
    performed_by_id: DEMO_OTHER_USER_ID,
    created_at: ago(5),
  });
  const futureTask = acts.findIndex((a) => a.row.title === "Dar seguimiento a la propuesta de ortodoncia invisible");

  // ------------------------------------------------------------ acciones de agentes
  const upcoming = bookings.find((b) => b.scheduled > t0 && (b.status === "pending" || b.status === "confirmed"));
  const rescheduleTarget = upcoming ?? bookings[bookings.length - 1];
  const newSlot = atDay(bizOffset(11), 15, 0);
  put("agent_actions", {
    id: actionId(1),
    organization_id: DEMO_ORG_ID,
    agent_name: "sales",
    action_type: "update_stage",
    payload: {
      tool: "update_stage",
      input: { opportunity_id: oppId(1), stage: "won", reason: "La paciente acepto el plan de ortodoncia." },
      summary: "Marcar como ganada la oportunidad Ortodoncia completa - Mariana Vega",
    },
    requires_approval: true,
    status: "pending",
    proposed_at: ago(0, 3),
  });
  put("agent_actions", {
    id: actionId(2),
    organization_id: DEMO_ORG_ID,
    agent_name: "booking",
    action_type: "reschedule_booking",
    payload: {
      tool: "reschedule_booking",
      input: { booking_id: rescheduleTarget.id, new_scheduled_at: new Date(newSlot).toISOString(), duration_minutes: 45 },
      summary: "Reprogramar una cita a peticion del paciente",
    },
    requires_approval: true,
    status: "pending",
    proposed_at: ago(0, 1),
  });
  put("agent_actions", {
    id: actionId(3),
    organization_id: DEMO_ORG_ID,
    agent_name: "follow_up",
    action_type: "create_task",
    payload: {
      tool: "create_task",
      input: { title: "Dar seguimiento a la propuesta de ortodoncia invisible", contact_id: contactId(12) },
      summary: "Crear tarea de seguimiento para una oportunidad estancada",
    },
    requires_approval: true,
    status: "executed",
    proposed_at: ago(1, 2),
    reviewed_by: DEMO_USER_ID,
    reviewed_at: ago(1, 1),
    review_notes: "Aprobado.",
    execution_result: { ok: true, activity_id: futureTask >= 0 ? activityId(futureTask + 1) : null },
  });

  // ------------------------------------------------------------ presupuestos
  // Cronologico (el correlativo PRES-000N lo asigna el motor al insertar).
  const budgetsSorted = [...BUDGETS].sort((a, b) => b.createdDaysAgo - a.createdDaysAgo);
  let memberN = 0;
  let serviceN = 0;
  budgetsSorted.forEach((b, bi) => {
    const contact = CONTACTS[b.contact];
    const created = ago(b.createdDaysAgo);
    const lines = b.members.flatMap((m) =>
      m.services.map((s) => ({
        s,
        price: s.unitPrice ?? ITEMS[s.item ?? 0].price,
        name: s.name ?? ITEMS[s.item ?? 0].name,
      })),
    );
    const subtotal = round2(lines.reduce((acc, l) => acc + l.s.sessions * l.price, 0));
    const discount = b.discountType === "percentage" ? round2((subtotal * b.discountValue) / 100) : b.discountValue;
    const bid = budgetId(bi + 1);
    put("budgets", {
      id: bid,
      organization_id: DEMO_ORG_ID,
      budget_number: "PENDIENTE", // el trigger lo reemplaza
      responsible_id: contactId(b.contact + 1),
      responsible_name: contact.name,
      responsible_phone: `+52 55 5550 ${1001 + b.contact}`,
      responsible_email: contact.email,
      status: b.status,
      subtotal,
      discount_value: b.discountValue,
      discount_type: b.discountType,
      total: round2(subtotal - discount),
      validity_days: b.validityDays,
      payment_method: b.paymentMethod,
      doctor_notes: b.doctorNotes,
      patient_notes: b.patientNotes,
      expires_at: new Date(t0 - b.createdDaysAgo * DAY + b.validityDays * DAY).toISOString(),
      created_at: created,
      updated_at: created,
    });
    for (const m of b.members) {
      const mid = memberId(++memberN);
      put("budget_members", {
        id: mid,
        organization_id: DEMO_ORG_ID,
        budget_id: bid,
        full_name: m.name,
        relationship: m.relationship,
        created_at: created,
      });
      for (const s of m.services) {
        put("budget_services", {
          id: budgetServiceId(++serviceN),
          organization_id: DEMO_ORG_ID,
          budget_member_id: mid,
          service_id: s.item === null ? null : itemId(s.item + 1),
          name: s.name ?? ITEMS[s.item ?? 0].name,
          sessions: s.sessions,
          unit_price: s.unitPrice ?? ITEMS[s.item ?? 0].price,
          is_manual_price: s.item === null,
          created_at: created,
        });
      }
    }
  });
  // Presupuesto de la segunda organizacion (tambien es PRES-0001 en la suya).
  put("budgets", {
    id: budgetId(501),
    organization_id: DEMO_OTHER_ORG_ID,
    budget_number: "PENDIENTE",
    responsible_id: contactId(502),
    responsible_name: otherContacts[1].name,
    status: "active",
    subtotal: 1300,
    discount_value: 0,
    discount_type: "percentage",
    total: 1300,
    validity_days: 15,
    expires_at: new Date(t0 - 3 * DAY + 15 * DAY).toISOString(),
    created_at: ago(3),
    updated_at: ago(3),
  });
  put("budget_members", {
    id: memberId(501),
    organization_id: DEMO_OTHER_ORG_ID,
    budget_id: budgetId(501),
    full_name: otherContacts[1].name,
    relationship: "responsible",
    created_at: ago(3),
  });
  put("budget_services", {
    id: budgetServiceId(501),
    organization_id: DEMO_OTHER_ORG_ID,
    budget_member_id: memberId(501),
    service_id: itemId(502),
    name: otherItems[1].name,
    sessions: 2,
    unit_price: otherItems[1].price,
    is_manual_price: false,
    created_at: ago(3),
  });

  return {
    organizationId: DEMO_ORG_ID,
    otherOrganizationId: DEMO_OTHER_ORG_ID,
    contacts: CONTACTS.length,
    items: ITEMS.length,
    bookings: BOOKING_COUNT,
    opportunities: OPPORTUNITIES.length,
    activities: acts.length,
    agentActions: 3,
    budgets: BUDGETS.length,
  };
}
