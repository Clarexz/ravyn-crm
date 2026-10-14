// DEMO: respuestas preprogramadas de los agentes. No llama a ningun modelo ni toca la base de datos.
// Se reemplaza por el motor real de agentes (lib/agents) en la Fase 1.

export type DemoAgentId = "orchestrator" | "receptionist" | "sales" | "booking" | "follow_up" | "analyst";

export type DemoAgent = {
  id: DemoAgentId;
  name: string;
  role: string;
  color: string;
};

export const DEMO_AGENTS: DemoAgent[] = [
  { id: "orchestrator", name: "Orquestador", role: "Clasifica la peticion y delega", color: "#6366f1" },
  { id: "receptionist", name: "Recepcionista", role: "Contactos y primera atencion", color: "#0ea5e9" },
  { id: "sales", name: "Ventas", role: "Cotizaciones y oportunidades", color: "#10b981" },
  { id: "booking", name: "Agenda", role: "Disponibilidad y citas", color: "#f59e0b" },
  { id: "follow_up", name: "Seguimiento", role: "Prospectos sin respuesta", color: "#ec4899" },
  { id: "analyst", name: "Analista", role: "Metricas y briefing", color: "#8b5cf6" },
];

export type ToolCall = { name: string; result: string };

export type Proposal = {
  actionType: string;
  title: string;
  detail: string;
  reason: string;
  diff: { label: string; before: string; after: string }[];
};

export type ScriptedReply = {
  agent: DemoAgentId;
  text: string;
  tools: ToolCall[];
  proposal?: Proposal;
};

type Rule = { match: RegExp; reply: ScriptedReply };

const RULES: Rule[] = [
  {
    match: /(descuento|cotiz|precio|presupuesto|blanqueamiento|ortodoncia)/i,
    reply: {
      agent: "sales",
      text:
        "Prepare la cotizacion de Blanqueamiento dental para Mariana Lopez: subtotal $4,800 MXN. Como pides 20% de descuento, supera el limite de 10% que puedo aplicar sola, asi que deje la propuesta en la bandeja para que la apruebe una persona.",
      tools: [
        { name: "search_contact", result: "Mariana Lopez (1 coincidencia)" },
        { name: "calculate_quote", result: "Subtotal $4,800.00 MXN" },
      ],
      proposal: {
        actionType: "apply_discount",
        title: "Aplicar 20% de descuento a cotizacion",
        detail: "Mariana Lopez - Blanqueamiento dental",
        reason: "La paciente pidio cerrar esta semana y tiene 2 citas completadas. El descuento supera el 10% autorizado.",
        diff: [
          { label: "Descuento", before: "0%", after: "20%" },
          { label: "Total", before: "$4,800.00", after: "$3,840.00" },
        ],
      },
    },
  },
  {
    match: /(cita|agend|reserv|disponib|horario|manana|mañana)/i,
    reply: {
      agent: "booking",
      text:
        "Revise la agenda de manana. Hay 3 espacios libres: 10:00, 12:30 y 16:00. Reserve el de las 12:30 con Carlos Morales para una limpieza dental. Como es un horario regular, queda a tu aprobacion antes de confirmarlo.",
      tools: [
        { name: "check_availability", result: "3 espacios libres" },
        { name: "search_contact", result: "Carlos Morales (1 coincidencia)" },
      ],
      proposal: {
        actionType: "create_booking",
        title: "Crear cita de limpieza dental",
        detail: "Carlos Morales - manana 12:30 (30 min)",
        reason: "Es el espacio mas cercano a la preferencia que indico el paciente (medio dia).",
        diff: [
          { label: "Cita", before: "Sin cita", after: "Manana 12:30 - Limpieza" },
          { label: "Estado", before: "-", after: "Pendiente de confirmar" },
        ],
      },
    },
  },
  {
    match: /(seguimiento|sin respuesta|pendiente|recordatorio|prospecto|lead)/i,
    reply: {
      agent: "follow_up",
      text:
        "Detecte 3 prospectos sin actividad en mas de 48 horas: Andrea Ruiz, Luis Herrera y Patricia Soto. Cree una tarea de recordatorio para cada uno y las asigne al equipo. Son acciones de bajo riesgo, asi que ya quedaron registradas.",
      tools: [
        { name: "find_stale_leads", result: "3 prospectos con mas de 48 h sin respuesta" },
        { name: "create_task", result: "3 tareas creadas" },
      ],
    },
  },
  {
    match: /(resumen|reporte|briefing|metric|ventas del|como vamos|cómo vamos|semana)/i,
    reply: {
      agent: "analyst",
      text:
        "Briefing de la semana (datos de ejemplo):\n- Citas: 23 agendadas, 3 inasistencias (13%).\n- Conversion de cotizaciones: 42%, 6 puntos arriba de la semana pasada.\n- Tiempo medio de respuesta a nuevos prospectos: 18 min.\n- Atencion prioritaria: 2 oportunidades llevan 15 dias sin actividad.",
      tools: [
        { name: "aggregate_metrics", result: "Periodo: ultimos 7 dias" },
        { name: "list_stale_opportunities", result: "2 oportunidades estancadas" },
      ],
    },
  },
  {
    match: /(hola|nuevo|registr|contacto|paciente|buenas)/i,
    reply: {
      agent: "receptionist",
      text:
        "Hola, soy la recepcionista virtual. Busque el numero en la base y no existia, asi que cree el contacto Daniela Torres con origen WhatsApp y le envie la bienvenida. Quedo lista para agendar su primera valoracion.",
      tools: [
        { name: "search_contact", result: "Sin coincidencias" },
        { name: "create_contact", result: "Contacto creado: Daniela Torres" },
      ],
    },
  },
];

export const FALLBACK: ScriptedReply = {
  agent: "orchestrator",
  text:
    "Entendi tu mensaje pero necesito mas contexto para elegir al especialista. Puedes pedirme, por ejemplo: agendar una cita, cotizar con descuento, dar seguimiento a prospectos, o un resumen de la semana.",
  tools: [],
};

export const SUGGESTIONS = [
  "Cotiza un blanqueamiento con 20% de descuento para Mariana Lopez",
  "Agenda una limpieza para Carlos Morales manana",
  "Dame el resumen de la semana",
  "Dale seguimiento a los prospectos sin respuesta",
  "Hola, soy un paciente nuevo",
];

export function findReply(message: string, forcedAgent?: DemoAgentId): ScriptedReply {
  if (forcedAgent && forcedAgent !== "orchestrator") {
    const byAgent = RULES.find((r) => r.reply.agent === forcedAgent);
    if (byAgent) return byAgent.reply;
  }
  const rule = RULES.find((r) => r.match.test(message));
  return rule ? rule.reply : FALLBACK;
}
