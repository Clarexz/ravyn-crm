// Verticales de la demo (Fase 4): datos de ejemplo de cada giro y cambio de vertical de una organizacion.
// Cada vertical conserva su propio espacio de trabajo (contactos, catalogo, citas, oportunidades...): al
// cambiar de giro el actual se guarda y se restaura al volver. Solo se tocan filas de UNA organizacion.
import type { IndustryType } from "@/types/database";
import { packFor, type IndustryPack } from "@/lib/industry/packs";
import { addDays, zonedParts, zonedToUtc } from "@/lib/industry/time";
import { DEMO_STAFF_IDS, mk } from "./seed";
import type { DemoDb, Row } from "./engine";

const DAY = 86_400_000;
const HOUR = 3_600_000;

type ContactSpec = { name: string; email: string; source: "whatsapp" | "web" | "manual" | "agent_receptionist" | "import"; company?: string; tags: string[]; notes?: string };
type ItemSpec = { name: string; type: "service" | "product" | "experience"; description: string; price: number; color: string; minutes: number };
type OppSpec = { title: string; contact: number; stage: "lead" | "contacted" | "qualified" | "proposal" | "negotiation" | "won" | "lost"; value: number; probability: number; createdDaysAgo: number; staleDays: number; notes?: string };
type QuoteSpec = { contact: number; status: "draft" | "active" | "accepted"; lines: Array<{ item: number; sessions: number }>; daysAgo: number };

type VerticalSample = {
  orgName: string;
  idBase: number;
  contacts: ContactSpec[];
  items: ItemSpec[];
  bookingNotes: Array<string | null>;
  opportunities: OppSpec[];
  quotes: QuoteSpec[];
  timeline: Array<{ contact: number; type: "call" | "note" | "message" | "meeting"; title: string; daysAgo: number }>;
};

const SAMPLES: Partial<Record<IndustryType, VerticalSample>> = {
  restaurant: {
    orgName: "Restaurante La Brasa (demo)",
    idBase: 1000,
    contacts: [
      { name: "Sofia Beltran Aguirre", email: "sofia.beltran@correo-demo.mx", source: "whatsapp", tags: ["cumpleanos", "frecuente"], notes: "Prefiere terraza. Celebra cumpleanos en octubre." },
      { name: "Andres Quintero Paz", email: "andres.quintero@correo-demo.mx", source: "web", tags: ["negocios"], notes: "Comidas de trabajo, factura siempre." },
      { name: "Marisol Fuentes Reyes", email: "marisol.fuentes@correo-demo.mx", source: "whatsapp", tags: ["vegetariana"], notes: "Alergia a los frutos secos." },
      { name: "Hugo Cardenas Lima", email: "hugo.cardenas@correo-demo.mx", source: "manual", company: "Grupo Cardenas", tags: ["grupo", "vip"] },
      { name: "Renata Olvera Dominguez", email: "renata.olvera@correo-demo.mx", source: "agent_receptionist", tags: [] },
      { name: "Tomas Arriaga Nieto", email: "tomas.arriaga@correo-demo.mx", source: "web", tags: ["frecuente"] },
      { name: "Camila Duarte Mena", email: "camila.duarte@correo-demo.mx", source: "whatsapp", tags: ["aniversario"] },
      { name: "Bruno Escobedo Salas", email: "bruno.escobedo@correo-demo.mx", source: "import", company: "Eventos Escobedo", tags: ["grupo"] },
      { name: "Lucia Montemayor Vela", email: "lucia.montemayor@correo-demo.mx", source: "manual", tags: ["vegana"] },
      { name: "Ivan Palacios Reyna", email: "ivan.palacios@correo-demo.mx", source: "web", tags: [] },
    ],
    items: [
      { name: "Mesa 1 - Terraza (2 personas)", type: "service", description: "Mesa para dos en terraza, vista al jardin", price: 0, color: "#10b981", minutes: 90 },
      { name: "Mesa 4 - Salon (4 personas)", type: "service", description: "Mesa familiar en el salon principal", price: 0, color: "#0ea5e9", minutes: 90 },
      { name: "Mesa 7 - Barra (2 personas)", type: "service", description: "Dos lugares en la barra de cocteleria", price: 0, color: "#f59e0b", minutes: 60 },
      { name: "Mesa 9 - Salon (6 personas)", type: "service", description: "Mesa redonda para grupos medianos", price: 0, color: "#8b5cf6", minutes: 120 },
      { name: "Salon privado (12 personas)", type: "service", description: "Salon privado con anticipo de consumo", price: 3000, color: "#ef4444", minutes: 120 },
      { name: "Mesa 12 - Terraza (8 personas)", type: "service", description: "Mesa larga en terraza para celebraciones", price: 800, color: "#ec4899", minutes: 120 },
    ],
    bookingNotes: ["Celebracion de cumpleanos, llevan pastel.", null, "Una persona con alergia a los frutos secos.", null, "Solicita silla para bebe.", null],
    opportunities: [
      { title: "Cena de empresa - Grupo Cardenas (40 personas)", contact: 3, stage: "negotiation", value: 48000, probability: 70, createdDaysAgo: 14, staleDays: 2, notes: "Pide menu cerrado y brindis." },
      { title: "Evento de aniversario - Camila Duarte", contact: 6, stage: "proposal", value: 18500, probability: 50, createdDaysAgo: 20, staleDays: 17, notes: "Esperando respuesta sobre el salon privado." },
      { title: "Posada corporativa - Eventos Escobedo", contact: 7, stage: "qualified", value: 36000, probability: 35, createdDaysAgo: 9, staleDays: 5 },
      { title: "Brunch de domingo - Sofia Beltran", contact: 0, stage: "won", value: 6400, probability: 100, createdDaysAgo: 30, staleDays: 10 },
    ],
    quotes: [],
    timeline: [
      { contact: 0, type: "note", title: "Prefiere mesa en terraza y pastel sorpresa", daysAgo: 20 },
      { contact: 3, type: "call", title: "Llamada para cotizar cena de empresa", daysAgo: 6 },
      { contact: 2, type: "message", title: "Confirmo alergia a frutos secos por WhatsApp", daysAgo: 3 },
    ],
  },
  real_estate: {
    orgName: "Inmobiliaria Horizonte (demo)",
    idBase: 2000,
    contacts: [
      { name: "Paulina Rivas Gutierrez", email: "paulina.rivas@correo-demo.mx", source: "web", tags: ["renta", "depto"], notes: "Busca renta de depto 2 recamaras en Roma Norte, hasta $20,000." },
      { name: "Eduardo Sandoval Prieto", email: "eduardo.sandoval@correo-demo.mx", source: "whatsapp", tags: ["compra", "casa"], notes: "Compra con credito Infonavit, 3 recamaras, zona sur." },
      { name: "Karen Villalobos Haro", email: "karen.villalobos@correo-demo.mx", source: "manual", tags: ["inversion"], notes: "Inversionista, busca locales comerciales." },
      { name: "Gerardo Leal Contreras", email: "gerardo.leal@correo-demo.mx", source: "agent_receptionist", tags: ["renta"] },
      { name: "Monica Estrada Ibarra", email: "monica.estrada@correo-demo.mx", source: "web", tags: ["compra", "depto"], notes: "Primera vivienda, presupuesto $2.2 M." },
      { name: "Fabian Rosales Cano", email: "fabian.rosales@correo-demo.mx", source: "whatsapp", company: "Rosales y Asociados", tags: ["oficina", "renta"] },
      { name: "Itzel Barrera Solano", email: "itzel.barrera@correo-demo.mx", source: "import", tags: ["compra"] },
      { name: "Rodrigo Maldonado Ortega", email: "rodrigo.maldonado@correo-demo.mx", source: "manual", tags: ["compra", "terreno"] },
      { name: "Natalia Zamudio Peña", email: "natalia.zamudio@correo-demo.mx", source: "web", tags: ["renta"] },
      { name: "Emilio Carrasco Luna", email: "emilio.carrasco@correo-demo.mx", source: "whatsapp", tags: [] },
    ],
    items: [
      { name: "Depto 2 rec. Roma Norte (renta)", type: "service", description: "78 m2, 1 estacionamiento, mascotas permitidas. Renta mensual.", price: 19500, color: "#0ea5e9", minutes: 45 },
      { name: "Casa 3 rec. Coyoacan (venta)", type: "service", description: "180 m2 de construccion, jardin, 2 estacionamientos.", price: 6850000, color: "#10b981", minutes: 45 },
      { name: "Depto 1 rec. Del Valle (venta)", type: "service", description: "55 m2, balcon, amenidades con gimnasio.", price: 2450000, color: "#f59e0b", minutes: 45 },
      { name: "Local comercial Polanco (renta)", type: "service", description: "95 m2 a pie de calle. Renta mensual.", price: 62000, color: "#8b5cf6", minutes: 45 },
      { name: "Oficina 120 m2 Santa Fe (renta)", type: "service", description: "Piso completo, 6 cajones. Renta mensual.", price: 78000, color: "#ef4444", minutes: 45 },
      { name: "Terreno 300 m2 Tecamachalco (venta)", type: "service", description: "Uso de suelo habitacional, esquina.", price: 4200000, color: "#ec4899", minutes: 45 },
    ],
    bookingNotes: ["Llega con su pareja.", null, "Quiere ver tambien las areas comunes.", null, "Pide confirmar por WhatsApp un dia antes.", null],
    opportunities: [
      { title: "Renta depto Roma Norte - Paulina Rivas", contact: 0, stage: "proposal", value: 19500, probability: 60, createdDaysAgo: 12, staleDays: 3, notes: "Envio de contrato pendiente." },
      { title: "Compra casa Coyoacan - Eduardo Sandoval", contact: 1, stage: "negotiation", value: 6850000, probability: 55, createdDaysAgo: 35, staleDays: 4, notes: "Negocia el precio y la fecha de escrituracion." },
      { title: "Locales para inversion - Karen Villalobos", contact: 2, stage: "qualified", value: 3100000, probability: 30, createdDaysAgo: 28, staleDays: 20 },
      { title: "Depto Del Valle - Monica Estrada", contact: 4, stage: "contacted", value: 2450000, probability: 25, createdDaysAgo: 9, staleDays: 6 },
      { title: "Oficina Santa Fe - Rosales y Asociados", contact: 5, stage: "won", value: 78000, probability: 100, createdDaysAgo: 45, staleDays: 12 },
      { title: "Terreno Tecamachalco - Rodrigo Maldonado", contact: 7, stage: "lost", value: 4200000, probability: 0, createdDaysAgo: 50, staleDays: 25, notes: "Compro con otra inmobiliaria." },
    ],
    quotes: [],
    timeline: [
      { contact: 0, type: "call", title: "Llamada: recorrido por Roma Norte", daysAgo: 8 },
      { contact: 1, type: "meeting", title: "Visita a la casa de Coyoacan", daysAgo: 5 },
      { contact: 2, type: "note", title: "Perfil de inversionista: rentabilidad minima del 7%", daysAgo: 21 },
    ],
  },
  professional_services: {
    orgName: "Consultoria Nexo (demo)",
    idBase: 3000,
    contacts: [
      { name: "Laura Becerra Montoya", email: "laura.becerra@empresa-demo.mx", source: "web", company: "Textiles Becerra", tags: ["manufactura"], notes: "Quiere ordenar sus procesos de compras." },
      { name: "Javier Serrano Alcala", email: "javier.serrano@empresa-demo.mx", source: "manual", company: "Logistica Serrano", tags: ["logistica", "recurrente"] },
      { name: "Adriana Paredes Vidal", email: "adriana.paredes@empresa-demo.mx", source: "whatsapp", company: "Clinica Paredes", tags: ["salud"] },
      { name: "Martin Orozco Beltran", email: "martin.orozco@empresa-demo.mx", source: "import", company: "Orozco Construcciones", tags: ["construccion"] },
      { name: "Veronica Lozano Ruiz", email: "veronica.lozano@empresa-demo.mx", source: "web", company: "Startup Lozano", tags: ["tecnologia"], notes: "Busca estrategia de crecimiento." },
      { name: "Sergio Avila Montes", email: "sergio.avila@empresa-demo.mx", source: "agent_receptionist", company: "Avila Alimentos", tags: ["alimentos"] },
      { name: "Daniela Pacheco Rios", email: "daniela.pacheco@empresa-demo.mx", source: "manual", company: "Pacheco Retail", tags: ["retail"] },
      { name: "Oscar Villanueva Prado", email: "oscar.villanueva@empresa-demo.mx", source: "web", company: "Villanueva y Cia", tags: [] },
    ],
    items: [
      { name: "Diagnostico estrategico", type: "service", description: "Analisis de la operacion y plan de accion a 90 dias", price: 18000, color: "#6366f1", minutes: 60 },
      { name: "Consultoria mensual (retainer)", type: "service", description: "Hasta 20 horas de acompanamiento al mes", price: 32000, color: "#0ea5e9", minutes: 60 },
      { name: "Taller de capacitacion", type: "service", description: "Taller de medio dia para equipos de hasta 15 personas", price: 24000, color: "#10b981", minutes: 60 },
      { name: "Auditoria de procesos", type: "service", description: "Revision y mapeo de procesos clave", price: 45000, color: "#f59e0b", minutes: 60 },
      { name: "Plan financiero a 12 meses", type: "service", description: "Proyeccion financiera y presupuesto anual", price: 28000, color: "#ec4899", minutes: 60 },
    ],
    bookingNotes: ["Reunion de descubrimiento, ya compartio su organigrama.", null, "Incluye a su director financiero.", null, "Videollamada.", null],
    opportunities: [
      { title: "Retainer anual - Logistica Serrano", contact: 1, stage: "negotiation", value: 384000, probability: 70, createdDaysAgo: 22, staleDays: 2, notes: "Pide descuento por contrato anual." },
      { title: "Auditoria de procesos - Textiles Becerra", contact: 0, stage: "proposal", value: 45000, probability: 55, createdDaysAgo: 16, staleDays: 4 },
      { title: "Plan de crecimiento - Startup Lozano", contact: 4, stage: "qualified", value: 28000, probability: 40, createdDaysAgo: 30, staleDays: 21, notes: "Sin respuesta desde la primera reunion." },
      { title: "Taller de ventas - Pacheco Retail", contact: 6, stage: "lead", value: 24000, probability: 10, createdDaysAgo: 5, staleDays: 5 },
      { title: "Diagnostico - Avila Alimentos", contact: 5, stage: "won", value: 18000, probability: 100, createdDaysAgo: 40, staleDays: 15 },
    ],
    quotes: [
      { contact: 0, status: "active", lines: [{ item: 3, sessions: 1 }, { item: 0, sessions: 1 }], daysAgo: 6 },
      { contact: 1, status: "accepted", lines: [{ item: 1, sessions: 12 }], daysAgo: 18 },
    ],
    timeline: [
      { contact: 1, type: "meeting", title: "Reunion de seguimiento del retainer", daysAgo: 7 },
      { contact: 4, type: "call", title: "Llamada de descubrimiento", daysAgo: 30 },
      { contact: 0, type: "note", title: "Compartio indicadores de compras de los ultimos 12 meses", daysAgo: 10 },
    ],
  },
};

export const SAMPLE_INDUSTRIES = Object.keys(SAMPLES) as IndustryType[];

const PAST = ["completed", "completed", "no_show", "completed", "cancelled"] as const;
const FUTURE = ["confirmed", "pending", "confirmed", "confirmed", "cancelled"] as const;
const SOURCES = ["manual", "whatsapp", "web", "agent_booking", "whatsapp"] as const;
const BOOKING_TOTAL = 14;

function parseHm(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
}

// Inserta el espacio de trabajo de ejemplo de un giro en una organizacion (tras retirar el anterior).
function insertSample(db: DemoDb, orgId: string, industry: IndustryType, pack: IndustryPack, now: Date): void {
  const sample = SAMPLES[industry];
  if (!sample) return;
  const id = (tag: string, n: number): string => mk(tag)(sample.idBase + n);
  const t0 = now.getTime();
  const ago = (days: number): string => new Date(t0 - days * DAY).toISOString();
  const put = (table: string, row: Row): Row => db.insertRow(table, row);
  const tz = pack.timezone;

  sample.contacts.forEach((c, i) => {
    put("contacts", {
      id: id("c", i + 1), organization_id: orgId, full_name: c.name, phone: `+52 55 5560 ${3001 + i}`, email: c.email,
      company_name: c.company ?? null, tags: c.tags, custom_fields: {}, source: c.source, notes: c.notes ?? null,
      created_at: ago(90 - i * 5), updated_at: ago(90 - i * 5),
    });
  });
  sample.items.forEach((it, i) => {
    put("items", {
      id: id("d", i + 1), organization_id: orgId, name: it.name, type: it.type, description: it.description,
      price: it.price, color: it.color, active: true, created_at: ago(100), updated_at: ago(100),
    });
  });

  // Citas: dias habiles de la organizacion (hora local), dos franjas por dia separadas 4 horas.
  const startMin = parseHm(pack.businessHours.start);
  const endMin = parseHm(pack.businessHours.end);
  const today = zonedParts(now, tz).date;
  const open = (ymd: string): boolean => {
    const wd = zonedParts(zonedToUtc(ymd, 12 * 60, tz), tz).isoWeekday;
    return pack.businessHours.days.includes(wd);
  };
  const dates: string[] = [];
  for (let off = -4; dates.length < Math.ceil(BOOKING_TOTAL / 2); off += 1) {
    const ymd = addDays(today, off);
    if (open(ymd)) dates.push(ymd);
  }
  let pastN = 0;
  let futureN = 0;
  for (let i = 0; i < BOOKING_TOTAL; i += 1) {
    const ymd = dates[Math.floor(i / 2)];
    const item = sample.items[i % sample.items.length];
    const minutes = Math.min(item.minutes, 120);
    const slotStart = startMin + (i % 2 === 0 ? 0 : 240) + (i % 4 < 2 ? 0 : 30);
    const start = zonedToUtc(ymd, Math.min(slotStart, endMin - minutes), tz);
    const scheduled = start.getTime();
    const past = scheduled < t0;
    const status = past ? PAST[pastN++ % PAST.length] : FUTURE[futureN++ % FUTURE.length];
    const created = Math.min(scheduled - (2 + (i % 4)) * DAY, t0 - HOUR);
    put("bookings", {
      id: id("b", i + 1), organization_id: orgId, contact_id: id("c", (i * 3) % sample.contacts.length + 1),
      item_id: id("d", (i % sample.items.length) + 1), scheduled_at: start.toISOString(), duration_minutes: minutes, status,
      service_snapshot: item.name, cost_at_booking: item.price, notes: sample.bookingNotes[i % sample.bookingNotes.length],
      source: SOURCES[i % SOURCES.length], n8n_execution_id: null,
      created_at: new Date(created).toISOString(), updated_at: new Date(created).toISOString(),
    });
  }

  const staff = [DEMO_STAFF_IDS.admin, DEMO_STAFF_IDS.reception, DEMO_STAFF_IDS.assistant];
  sample.opportunities.forEach((o, i) => {
    const open = o.stage !== "won" && o.stage !== "lost";
    put("opportunities", {
      id: id("e", i + 1), organization_id: orgId, contact_id: id("c", o.contact + 1), title: o.title, stage: o.stage,
      value: o.value, currency: "MXN", probability: o.probability, assigned_to: staff[i % staff.length],
      expected_close_date: open ? new Date(t0 + (10 + i * 4) * DAY).toISOString().slice(0, 10) : null,
      closed_at: open ? null : ago(o.staleDays), notes: o.notes ?? null,
      created_at: ago(o.createdDaysAgo), updated_at: ago(o.staleDays),
    });
    // Una actividad por oportunidad en la fecha de su ultima actividad (define las estancadas).
    put("activities", {
      id: id("f", i + 1), organization_id: orgId, contact_id: id("c", o.contact + 1), opportunity_id: id("e", i + 1),
      type: "note", title: `Seguimiento: ${o.title}`, status: "completed", performed_by_type: "human",
      performed_by_id: staff[i % staff.length], created_at: ago(o.staleDays),
    });
  });
  sample.timeline.forEach((a, i) => {
    put("activities", {
      id: id("f", 100 + i + 1), organization_id: orgId, contact_id: id("c", a.contact + 1), type: a.type, title: a.title,
      status: "completed", performed_by_type: "human", performed_by_id: staff[i % staff.length], created_at: ago(a.daysAgo),
    });
  });

  sample.quotes.forEach((q, qi) => {
    const lines = q.lines.map((l) => ({ ...l, item: sample.items[l.item] }));
    const subtotal = lines.reduce((a, l) => a + l.sessions * l.item.price, 0);
    const bid = id("9", qi + 1);
    const contact = sample.contacts[q.contact];
    put("budgets", {
      id: bid, organization_id: orgId, budget_number: "PENDIENTE", responsible_id: id("c", q.contact + 1),
      responsible_name: contact.name, responsible_email: contact.email, status: q.status, subtotal, discount_value: 0,
      discount_type: "percentage", total: subtotal, validity_days: 15,
      expires_at: new Date(t0 - q.daysAgo * DAY + 15 * DAY).toISOString(), created_at: ago(q.daysAgo), updated_at: ago(q.daysAgo),
    });
    const mid = id("8", qi + 1);
    put("budget_members", { id: mid, organization_id: orgId, budget_id: bid, full_name: contact.company ?? contact.name, relationship: "responsible", created_at: ago(q.daysAgo) });
    lines.forEach((l, li) => {
      put("budget_services", {
        id: id("7", qi * 10 + li + 1), organization_id: orgId, budget_member_id: mid, service_id: id("d", q.lines[li].item + 1),
        name: l.item.name, sessions: l.sessions, unit_price: l.item.price, is_manual_price: false, created_at: ago(q.daysAgo),
      });
    });
  });
}

export type VerticalSwitchResult = { industry: IndustryType; restored: boolean };

// Cambia la industria de una organizacion de la demo y su espacio de trabajo. Atomico: si algo falla, no cambia nada.
export function switchDemoVertical(db: DemoDb, orgId: string, industry: IndustryType, now: Date = db.now()): VerticalSwitchResult {
  const org = db.tables.organizations.find((o) => o.id === orgId);
  if (!org) throw new Error("Organizacion no encontrada");
  const current = org.industry as IndustryType;
  if (current === industry) return { industry, restored: false };
  const pack = packFor(industry);
  if (industry !== "health" && !SAMPLES[industry]) throw new Error("Vertical sin datos de ejemplo");

  let stash = db.workspaceStash.get(orgId);
  if (!stash) {
    stash = new Map();
    db.workspaceStash.set(orgId, stash);
  }
  const saved = stash;
  let restored = false;
  const currentName = String(org.name);
  db.transaction(() => {
    const taken = db.takeOrgRows(orgId);
    const next = saved.get(industry);
    if (next) {
      db.putOrgRows(next.rows);
      restored = true;
    } else {
      insertSample(db, orgId, industry, pack, now);
    }
    const settings = { ...((org.settings as Row | null) ?? {}) };
    settings.active_modules = [...pack.modules];
    settings.business_hours = structuredClone(pack.businessHours);
    delete settings.labels;
    db.updateRow("organizations", org, {
      industry,
      name: next?.name ?? SAMPLES[industry]?.orgName ?? currentName,
      settings,
    });
    saved.set(current, { rows: taken, name: currentName });
    saved.delete(industry);
  });
  return { industry, restored };
}
