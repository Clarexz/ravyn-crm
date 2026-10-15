// Paquetes de industria (Fase 4, D-13). Datos puros y sin dependencias de servidor: los usan el
// servidor (esquema, prompts de agentes) y el navegador (sidebar, etiquetas). Una sola definicion
// por vertical; nada de ramas por industria en los componentes.
import type { IndustryType } from "@/types/database";
import { DEFAULT_TIMEZONE, formatInZone, safeTimeZone } from "@/lib/industry/time";

export type ModuleId = "contacts" | "bookings" | "items" | "budgets" | "pipeline" | "reports" | "activities";

// Catalogo de modulos. `route` es la ruta del menu; `available` es false mientras la pantalla no exista
// (sin pantalla no se muestra en el menu): el modulo figura en el esquema pero el menu no lo muestra.
export type ModuleDef = { id: ModuleId; route: string | null; available: boolean; icon: string; labelKey: LabelKey | null; fallbackLabel: string };

export type LabelKey = "contact" | "booking" | "item" | "budget" | "pipeline";
export type Noun = { singular: string; plural: string };
export type Labels = Record<LabelKey, Noun>;

export const MODULES: Record<ModuleId, ModuleDef> = {
  contacts: { id: "contacts", route: "/patients", available: true, icon: "users", labelKey: "contact", fallbackLabel: "Contactos" },
  bookings: { id: "bookings", route: "/appointments", available: true, icon: "calendar", labelKey: "booking", fallbackLabel: "Agenda" },
  items: { id: "items", route: "/services", available: true, icon: "tag", labelKey: "item", fallbackLabel: "Catalogo" },
  budgets: { id: "budgets", route: "/budgets", available: true, icon: "receipt", labelKey: "budget", fallbackLabel: "Presupuestos" },
  pipeline: { id: "pipeline", route: "/pipeline", available: true, icon: "kanban", labelKey: "pipeline", fallbackLabel: "Pipeline de ventas" },
  reports: { id: "reports", route: "/reports", available: true, icon: "chart", labelKey: null, fallbackLabel: "Reportes" },
  activities: { id: "activities", route: null, available: true, icon: "list", labelKey: null, fallbackLabel: "Actividades" },
};

export const MODULE_IDS = Object.keys(MODULES) as ModuleId[];

export type IndustryPack = {
  id: IndustryType;
  label: string; // nombre de la vertical para el selector
  modules: ModuleId[];
  labels: Labels;
  // Etiqueta del boton principal de agenda ("Agendar Cita", "Nueva reservacion"...).
  newBookingLabel: string;
  timezone: string;
  businessHours: { start: string; end: string; days: number[] };
  // Directrices para los agentes (terminologia, limites de tiempo, politicas de cancelacion).
  agent: { business: string; greeting: string; intake: string; rules: string[] };
};

const noun = (singular: string, plural: string): Noun => ({ singular, plural });

const PACKS: Record<IndustryType, IndustryPack> = {
  health: {
    id: "health",
    label: "Salud / Clinicas",
    modules: ["contacts", "bookings", "items", "budgets", "reports", "activities", "pipeline"],
    labels: {
      contact: noun("Paciente", "Pacientes"),
      booking: noun("Cita", "Citas"),
      item: noun("Servicio", "Servicios"),
      budget: noun("Presupuesto", "Presupuestos"),
      pipeline: noun("Tratamiento", "Tratamientos"),
    },
    newBookingLabel: "Agendar Cita",
    timezone: "America/Mexico_City",
    businessHours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
    agent: {
      business: "una clinica de salud",
      greeting: "Hola, soy el asistente de recepcion de la clinica. Puedo registrar pacientes, consultar la disponibilidad de citas y orientarte sobre servicios y presupuestos. Con que paciente o servicio te ayudo?",
      intake: "nombre completo del paciente, telefono, motivo de la consulta y si es primera vez",
      rules: [
        "Los clientes son pacientes; la agenda son citas medicas y el catalogo son servicios clinicos.",
        "Cancelaciones o cambios de cita con al menos 24 horas de anticipacion; avisa si el cambio es con menos tiempo.",
        "No des diagnosticos ni indicaciones medicas: canaliza esas dudas al profesional.",
        "Los tratamientos se cotizan con presupuestos.",
      ],
    },
  },
  restaurant: {
    id: "restaurant",
    label: "Restaurantes",
    modules: ["contacts", "bookings", "items", "reports", "activities"],
    labels: {
      contact: noun("Comensal", "Comensales"),
      booking: noun("Reservacion", "Reservaciones"),
      item: noun("Mesa", "Mesas"),
      budget: noun("Cotizacion", "Cotizaciones"),
      pipeline: noun("Evento", "Eventos"),
    },
    newBookingLabel: "Nueva Reservacion",
    timezone: "America/Mexico_City",
    businessHours: { start: "13:00", end: "23:00", days: [1, 2, 3, 4, 5, 6, 7] },
    agent: {
      business: "un restaurante",
      greeting: "Bienvenido al restaurante. Soy el asistente de reservaciones: puedo registrar comensales, revisar mesas disponibles y apartar tu reservacion. Para cuantas personas y que dia te gustaria venir?",
      intake: "nombre del comensal, numero de personas, fecha y hora, y si hay alguna ocasion especial o alergia",
      rules: [
        "Los clientes son comensales; la agenda son reservaciones de mesa y el catalogo son mesas y zonas.",
        "Grupos grandes (mas de 8 comensales) requieren confirmacion del gerente.",
        "Las reservaciones se cancelan o modifican sin costo hasta 2 horas antes; la mesa se libera 15 minutos despues de la hora.",
        "Pregunta siempre por alergias o restricciones alimentarias.",
      ],
    },
  },
  real_estate: {
    id: "real_estate",
    label: "Inmobiliarias",
    modules: ["contacts", "bookings", "items", "pipeline", "reports", "activities"],
    labels: {
      contact: noun("Prospecto", "Prospectos"),
      booking: noun("Visita", "Visitas"),
      item: noun("Propiedad", "Propiedades"),
      budget: noun("Oferta", "Ofertas"),
      pipeline: noun("Operacion", "Operaciones"),
    },
    newBookingLabel: "Agendar Visita",
    timezone: "America/Mexico_City",
    businessHours: { start: "09:00", end: "19:00", days: [1, 2, 3, 4, 5, 6] },
    agent: {
      business: "una inmobiliaria",
      greeting: "Hola, soy el asistente de la inmobiliaria. Te ayudo a encontrar una propiedad en compra o renta y a agendar una visita. Buscas comprar o rentar, en que zona y con que presupuesto aproximado?",
      intake: "si busca compra o renta, zona, presupuesto, tipo de propiedad, numero de recamaras y fecha deseada para visitar",
      rules: [
        "Los clientes son prospectos o compradores; la agenda son visitas a propiedades y el catalogo son propiedades.",
        "Distingue siempre entre compra y renta antes de proponer propiedades.",
        "Las visitas se confirman con 24 horas de anticipacion; cada visita dura 45 minutos.",
        "No prometas precios ni condiciones de credito: canaliza las negociaciones al asesor.",
      ],
    },
  },
  professional_services: {
    id: "professional_services",
    label: "Servicios profesionales",
    modules: ["contacts", "bookings", "items", "budgets", "pipeline", "reports", "activities"],
    labels: {
      contact: noun("Cliente", "Clientes"),
      booking: noun("Reunion", "Reuniones"),
      item: noun("Servicio", "Servicios"),
      budget: noun("Cotizacion", "Cotizaciones"),
      pipeline: noun("Oportunidad", "Oportunidades"),
    },
    newBookingLabel: "Agendar Reunion",
    timezone: "America/Mexico_City",
    businessHours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
    agent: {
      business: "una firma de servicios profesionales",
      greeting: "Hola, soy el asistente de la firma. Puedo registrar a tu empresa como cliente, agendar una reunion de consultoria y preparar una cotizacion. Que servicio te interesa y para que fecha?",
      intake: "nombre del cliente o empresa, servicio de interes, alcance del proyecto y fecha tentativa de reunion",
      rules: [
        "Los clientes son empresas o personas con proyectos; la agenda son reuniones de consultoria y las propuestas son cotizaciones.",
        "Reuniones de consultoria de 60 minutos; reprogramar con 24 horas de anticipacion.",
        "Toda propuesta economica pasa por cotizacion; descuentos mayores al 10% requieren aprobacion.",
      ],
    },
  },
  retail: {
    id: "retail",
    label: "Comercio",
    modules: ["contacts", "bookings", "items", "reports", "activities"],
    labels: {
      contact: noun("Cliente", "Clientes"),
      booking: noun("Cita", "Citas"),
      item: noun("Producto", "Productos"),
      budget: noun("Cotizacion", "Cotizaciones"),
      pipeline: noun("Oportunidad", "Oportunidades"),
    },
    newBookingLabel: "Agendar Cita",
    timezone: DEFAULT_TIMEZONE,
    businessHours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
    agent: { business: "un comercio", greeting: "Hola, soy el asistente del comercio. En que te ayudo?", intake: "nombre del cliente y producto de interes", rules: [] },
  },
  general: {
    id: "general",
    label: "General",
    modules: ["contacts", "bookings", "items", "budgets", "reports", "activities"],
    labels: {
      contact: noun("Contacto", "Contactos"),
      booking: noun("Cita", "Citas"),
      item: noun("Servicio", "Servicios"),
      budget: noun("Presupuesto", "Presupuestos"),
      pipeline: noun("Oportunidad", "Oportunidades"),
    },
    newBookingLabel: "Agendar Cita",
    timezone: DEFAULT_TIMEZONE,
    businessHours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
    agent: { business: "una organizacion", greeting: "Hola, soy el asistente de recepcion. Puedo buscar o dar de alta contactos y consultar disponibilidad. Que necesitas?", intake: "nombre, telefono y motivo del contacto", rules: [] },
  },
};

// Verticales ofrecidas en el selector de la demo (las del plan).
export const SELECTABLE_INDUSTRIES = ["health", "restaurant", "real_estate", "professional_services"] as const satisfies readonly IndustryType[];

export function packFor(industry: unknown): IndustryPack {
  return typeof industry === "string" && industry in PACKS ? PACKS[industry as IndustryType] : PACKS.general;
}

// --- Configuracion resuelta de una organizacion ---

export type TenantModule = { id: ModuleId; label: string; route: string | null; active: boolean; available: boolean };

export type TenantConfig = {
  industry: IndustryType;
  industryLabel: string;
  organizationName: string;
  timezone: string;
  businessHours: { start: string; end: string; days: number[] };
  labels: Labels;
  newBookingLabel: string;
  modules: TenantModule[];
  activeModules: ModuleId[];
  agent: IndustryPack["agent"];
};

type OrgLike = { name?: unknown; industry?: unknown; settings?: unknown };

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

// settings.active_modules manda si existe (ignora ids desconocidos); si no, los del paquete.
// settings.labels puede sobrescribir etiquetas sueltas ({contact: {singular, plural}}).
export function resolveTenantConfig(org: OrgLike | null | undefined): TenantConfig {
  const pack = packFor(org?.industry);
  const settings = asRecord(org?.settings);
  const configured = Array.isArray(settings.active_modules)
    ? (settings.active_modules as unknown[]).filter((m): m is ModuleId => typeof m === "string" && m in MODULES)
    : null;
  const activeModules = configured && configured.length > 0 ? configured : pack.modules;

  const labels = structuredClone(pack.labels);
  const overrides = asRecord(settings.labels);
  for (const key of Object.keys(labels) as LabelKey[]) {
    const o = asRecord(overrides[key]);
    if (typeof o.singular === "string" && typeof o.plural === "string" && o.singular && o.plural) {
      labels[key] = { singular: o.singular.slice(0, 40), plural: o.plural.slice(0, 40) };
    }
  }

  const bh = asRecord(settings.business_hours);
  const businessHours =
    typeof bh.start === "string" && typeof bh.end === "string" && Array.isArray(bh.days)
      ? { start: bh.start, end: bh.end, days: (bh.days as unknown[]).filter((d): d is number => typeof d === "number") }
      : pack.businessHours;

  const modules = MODULE_IDS.map((id): TenantModule => {
    const def = MODULES[id];
    return {
      id,
      label: def.labelKey ? labels[def.labelKey].plural : def.fallbackLabel,
      route: def.route,
      active: activeModules.includes(id),
      available: def.available,
    };
  });

  return {
    industry: pack.id,
    industryLabel: pack.label,
    organizationName: typeof org?.name === "string" ? org.name : "",
    timezone: settings.timezone === undefined ? DEFAULT_TIMEZONE : safeTimeZone(settings.timezone),
    businessHours,
    labels,
    newBookingLabel: pack.newBookingLabel,
    modules,
    activeModules,
    agent: pack.agent,
  };
}

// Los textos editables por la organizacion (nombre, etiquetas) llegan al prompt: una sola linea, sin comillas ni longitud excesiva.
const oneLine = (v: string, max = 60): string => v.replace(/[\r\n"\\]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

// Texto que se inyecta en el prompt de los agentes (hueco `industryContext`).
export function buildIndustryContext(config: TenantConfig, now: Date = new Date()): string {
  const l = {
    contact: { singular: oneLine(config.labels.contact.singular), plural: oneLine(config.labels.contact.plural) },
    booking: { singular: oneLine(config.labels.booking.singular), plural: oneLine(config.labels.booking.plural) },
    item: { singular: oneLine(config.labels.item.singular), plural: oneLine(config.labels.item.plural) },
    budget: { singular: oneLine(config.labels.budget.singular), plural: oneLine(config.labels.budget.plural) },
  };
  const days = ["", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
  const open = config.businessHours.days.map((d) => days[d === 0 ? 7 : d]).filter(Boolean).join(", ");
  const lines = [
    `Negocio: ${oneLine(config.organizationName, 80) || "la organizacion"}, ${config.agent.business} (industria: ${config.industry}).`,
    `Vocabulario obligatorio: al cliente final llamalo "${l.contact.singular.toLowerCase()}" (plural "${l.contact.plural.toLowerCase()}"); a la agenda, "${l.booking.plural.toLowerCase()}" (una "${l.booking.singular.toLowerCase()}"); al catalogo, "${l.item.plural.toLowerCase()}"; a las propuestas economicas, "${l.budget.plural.toLowerCase()}". No uses otros terminos para estos conceptos.`,
    `Zona horaria de la organizacion: ${config.timezone}. Hora local actual: ${formatInZone(now, config.timezone)}. Horario laboral (hora local): ${config.businessHours.start} a ${config.businessHours.end}, ${open}. Las herramientas reciben y devuelven horas en UTC; al hablar con la persona usa siempre la hora local.`,
    `Al atender a un ${l.contact.singular.toLowerCase()} nuevo, solicita: ${config.agent.intake}.`,
    ...config.agent.rules.map((r) => `Regla: ${r}`),
  ];
  return lines.join("\n");
}
