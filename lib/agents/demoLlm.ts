// LLM preprogramado para el modo demo (D-08). Sin red ni aleatoriedad: reglas por palabra clave
// que PROPONEN tool_calls reales (con ids tomados de resultados previos) y redactan la respuesta
// final a partir de los resultados de las herramientas. Es una funcion pura de la conversacion.
import type { LlmClient, LlmMessage, LlmRequest, LlmResponse, LlmToolCall } from "@/lib/agents/llm";
import { classifyByKeywords } from "@/lib/agents/orchestrator";
import type { SpecialistName } from "@/lib/agents/prompts";
import type { ToolResult } from "@/lib/agents/types";
import { packFor, type IndustryPack } from "@/lib/industry/packs";

type Entry = { name: string; input: unknown; result: ToolResult | null };
type Row = Record<string, unknown>;

const DAY_MS = 86_400_000;

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function collectHistory(messages: LlmMessage[]): Entry[] {
  const entries: Entry[] = [];
  const byId = new Map<string, Entry>();
  for (const m of messages) {
    if (m.role === "assistant") {
      for (const c of m.toolCalls) {
        const e: Entry = { name: c.name, input: c.input, result: null };
        entries.push(e);
        byId.set(c.id, e);
      }
    } else if (m.role === "tool") {
      for (const r of m.results) {
        const e = byId.get(r.id);
        if (!e) continue;
        try {
          e.result = JSON.parse(r.content) as ToolResult;
        } catch {
          e.result = { ok: false, error: { code: "EXECUTION_FAILED", message: "Resultado ilegible" } };
        }
      }
    }
  }
  return entries;
}

const NAME_WORD = "[A-ZÁÉÍÓÚÑ][\\p{L}'-]+";
const NAME_SEQ = `${NAME_WORD}(?:\\s+${NAME_WORD}){0,2}`;
const STOP_NAMES = new Set(["MXN", "Hola", "Quiero", "Necesito", "Por", "Dale", "Agenda", "Agendar", "Cotiza", "Registra"]);

// Strong prefixes ("para", "cliente"...) name the person; weak ones ("de", "a", "con") are often
// followed by a service ("cotizacion de Blanqueamiento"). Prefer strong, and the last match.
function lastMatch(text: string, prefixes: string): string | null {
  const re = new RegExp(`\\b(?:${prefixes})\\s+(${NAME_SEQ})`, "gu");
  const all = Array.from(text.matchAll(re));
  return all.length > 0 ? all[all.length - 1][1] : null;
}

export function extractName(text: string): string | null {
  const candidate =
    lastMatch(text, "para|cliente|paciente|comensal|prospecto|contacto|llamado|llamada") ??
    lastMatch(text, "a|de|con") ??
    firstCapitalizedAfterStart(text);
  if (!candidate) return null;
  const words = candidate.split(/\s+/).filter((w) => !STOP_NAMES.has(w));
  return words.length > 0 ? words.join(" ") : null;
}

function firstCapitalizedAfterStart(text: string): string | null {
  const tokens = text.split(/(\s+)/);
  let offset = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    offset += t.length;
    if (i === 0) continue;
    if (new RegExp(`^${NAME_WORD}$`, "u").test(t.replace(/[.,;:!?]+$/, ""))) {
      const m = new RegExp(`^(${NAME_SEQ})`, "u").exec(text.slice(offset - t.length));
      if (m) return m[1];
    }
  }
  return null;
}

function extractPercent(text: string): number | undefined {
  const m = /(\d{1,3}(?:[.,]\d+)?)\s*(?:%|por ciento)/i.exec(text);
  if (!m) return undefined;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined;
}

// "grupo de 12", "para 12 personas", "12 comensales": numero de personas de una reservacion.
function extractPartySize(text: string): number | undefined {
  const n = normalize(text);
  const m =
    /\b(\d{1,3})\s*(?:personas|comensales|invitados|asistentes|lugares|pax)\b/.exec(n) ??
    /\b(?:grupo|mesa|reservacion|reserva)\s+(?:de|para)\s+(\d{1,3})\b/.exec(n);
  if (!m) return undefined;
  const v = Number(m[1]);
  return Number.isInteger(v) && v >= 1 && v <= 500 ? v : undefined;
}

// "48 horas", "2 dias": ventana de inactividad pedida de forma explicita, en horas.
function extractWindowHours(text: string): number | undefined {
  const n = normalize(text);
  const h = /\b(\d{1,4})\s*(?:horas|hrs|h)\b/.exec(n);
  if (h) return Number(h[1]);
  const d = /\b(\d{1,3})\s*dias?\b/.exec(n);
  return d ? Number(d[1]) * 24 : undefined;
}

function extractAmount(text: string): number | undefined {
  const m = /\$\s?(\d[\d,]*(?:\.\d+)?)/.exec(text);
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

// Industria inyectada por el orquestador en el prompt ("(industria: real_estate)"); sin ella, vocabulario neutro.
function packFromSystem(system: string): IndustryPack {
  const m = /\(industria:\s*([a-z_]+)\)/.exec(system);
  return packFor(m ? m[1] : "general");
}

function nowFromSystem(system: string): Date {
  const m = /\(UTC\):\s*(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/.exec(system);
  const d = m ? new Date(m[1]) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function targetDate(text: string, now: Date): string {
  const explicit = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text);
  if (explicit) return explicit[1];
  const n = normalize(text);
  const base = /\bhoy\b/.test(n) ? now : new Date(now.getTime() + DAY_MS);
  return base.toISOString().slice(0, 10);
}

function detectAgent(system: string, text: string): SpecialistName {
  if (system.includes("agente Recepcionista")) return "receptionist";
  if (system.includes("agente de Ventas")) return "sales";
  if (system.includes("agente de Agenda")) return "booking";
  if (system.includes("agente de Seguimiento")) return "follow_up";
  if (system.includes("agente Analista")) return "analyst";
  return classifyByKeywords(text).agent;
}

const reply = (text: string): LlmResponse => ({ text, toolCalls: [], stopReason: "end_turn" });

function call(history: Entry[], name: string, input: unknown): LlmResponse {
  const toolCalls: LlmToolCall[] = [{ id: `demo_call_${history.length + 1}`, name, input }];
  return { text: "", toolCalls, stopReason: "tool_use" };
}

const money = (n: unknown): string => `$${Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

// Si el resultado es un error o una accion en espera, devuelve la redaccion adecuada.
function special(entry: Entry): string | null {
  const r = entry.result;
  if (!r) return "No obtuve respuesta de la herramienta. Intenta de nuevo.";
  if (!r.ok) return `No pude completar la accion: ${r.error.message}`;
  const d = r.data as Row | null;
  if (d && d.status === "pending_approval") {
    return `La accion quedo en espera de aprobacion: ${String(d.summary)} Una persona de tu equipo debe aprobarla en la bandeja antes de que se ejecute.`;
  }
  return null;
}

function contactsOf(entry: Entry | undefined): Row[] {
  const d = entry?.result && entry.result.ok ? (entry.result.data as { contacts?: Row[] }) : null;
  return d?.contacts ?? [];
}

function last(history: Entry[], name: string): Entry | undefined {
  return [...history].reverse().find((e) => e.name === name);
}

function pickContact(history: Entry[], name: string, pack: IndustryPack): { contact?: Row; response?: LlmResponse } {
  const search = last(history, "search_contact");
  const err = search ? special(search) : null;
  if (err) return { response: reply(err) };
  const contacts = contactsOf(search);
  if (contacts.length === 0) {
    return { response: reply(`No encontre a "${name}" entre los ${pack.labels.contact.plural.toLowerCase()}. Puedo darlo de alta si me compartes su telefono o correo.`) };
  }
  const exact = contacts.filter((c) => normalize(String(c.full_name)) === normalize(name));
  if (contacts.length > 1 && exact.length !== 1) {
    const names = contacts.map((c) => String(c.full_name)).join(", ");
    return { response: reply(`Encontre varios ${pack.labels.contact.plural.toLowerCase()} (${names}). Indica el nombre completo para continuar.`) };
  }
  return { contact: exact[0] ?? contacts[0] };
}


const needName = (pack: IndustryPack): string => `Necesito el nombre del ${pack.labels.contact.singular.toLowerCase()} para continuar. Indicalo, por favor.`;

function salesFlow(text: string, history: Entry[], pack: IndustryPack): LlmResponse {
  const name = extractName(text);
  if (history.length === 0) {
    return name ? call(history, "search_contact", { query: name, limit: 5 }) : reply(needName(pack));
  }
  const created = last(history, "create_opportunity");
  if (created) {
    const s = special(created);
    if (s) return reply(s);
    const opp = (created.result as { ok: true; data: { opportunity?: Row } }).data.opportunity ?? {};
    return reply(`Cree la oportunidad "${String(opp.title)}" por ${money(opp.value)}. Ya aparece en tu embudo.`);
  }
  const { contact, response } = pickContact(history, name ?? "", pack);
  if (response || !contact) return response ?? reply(needName(pack));
  const pct = extractPercent(text);
  const value = extractAmount(text);
  return call(history, "create_opportunity", {
    contact_id: contact.id,
    title: `Propuesta para ${String(contact.full_name)}`,
    ...(value !== undefined ? { value } : {}),
    ...(pct !== undefined && pct > 0 ? { discount_percent: pct } : {}),
    notes: `Solicitud recibida: ${text.slice(0, 300)}`,
  });
}

function bookingFlow(text: string, history: Entry[], now: Date, pack: IndustryPack): LlmResponse {
  const name = extractName(text);
  const n = normalize(text);
  const intent = /\bcancel/.test(n) ? "cancel" : /\breprogram/.test(n) ? "reschedule" : "create";
  if (history.length === 0) {
    return name ? call(history, "search_contact", { query: name, limit: 5 }) : reply(needName(pack));
  }
  const booked = last(history, "create_booking");
  if (booked) {
    const s = special(booked);
    if (s) return reply(s);
    const b = (booked.result as { ok: true; data: { booking?: Row } }).data.booking ?? {};
    return reply(`Agende la ${pack.labels.booking.singular.toLowerCase()} para el ${String(b.scheduled_at)}.`);
  }
  const cancelled = last(history, "cancel_booking");
  if (cancelled) {
    return reply(special(cancelled) ?? `Cancele la ${pack.labels.booking.singular.toLowerCase()} y quedo registrado en el historial.`);
  }
  const moved = last(history, "reschedule_booking");
  if (moved) {
    const s = special(moved);
    if (s) return reply(s);
    const b = (moved.result as { ok: true; data: { booking?: Row } }).data.booking ?? {};
    return reply(`Reprograme la ${pack.labels.booking.singular.toLowerCase()} para el ${String(b.scheduled_at)}.`);
  }
  const { contact, response } = pickContact(history, name ?? "", pack);
  if (response || !contact) return response ?? reply(needName(pack));

  if (intent === "cancel" || intent === "reschedule") {
    const upcoming = (contact.upcoming_bookings as Row[] | undefined) ?? [];
    const target = upcoming[0];
    const noun = pack.labels.booking.singular.toLowerCase();
    if (!target) return reply(`${String(contact.full_name)} no tiene ${pack.labels.booking.plural.toLowerCase()} proximas que ${intent === "cancel" ? "cancelar" : "reprogramar"}.`);
    if (intent === "cancel") {
      return call(history, "cancel_booking", { booking_id: target.id, reason: "Cancelacion solicitada por mensaje" });
    }
    const availability = last(history, "check_availability");
    if (!availability) {
      const date = targetDate(text, now);
      return call(history, "check_availability", { date_from: date, date_to: date, duration_minutes: Number(target.duration_minutes) || 30 });
    }
    const err = special(availability);
    if (err) return reply(err);
    const first = availabilityDays(availability).flatMap((d) => d.slots)[0];
    if (!first) return reply(`No hay espacios libres en esa fecha para reprogramar la ${noun}. Indica otro dia.`);
    return call(history, "reschedule_booking", { booking_id: target.id, new_scheduled_at: first.start });
  }

  // Una reservacion para un grupo dura mas (90 min) y declara party_size: si supera el limite sera una llamada critica.
  const party = extractPartySize(text);
  const minutes = party !== undefined ? 90 : 30;
  const availability = last(history, "check_availability");
  if (!availability) {
    const date = targetDate(text, now);
    return call(history, "check_availability", { date_from: date, date_to: date, duration_minutes: minutes });
  }
  const s = special(availability);
  if (s) return reply(s);
  const first = availabilityDays(availability).flatMap((d) => d.slots)[0];
  if (!first) return reply("No hay espacios libres en esa fecha. Indica otro dia para revisar la agenda.");
  return call(history, "create_booking", {
    contact_id: contact.id,
    scheduled_at: first.start,
    duration_minutes: minutes,
    ...(party !== undefined ? { party_size: party } : {}),
    notes: "Cita propuesta por el asistente",
  });
}

function availabilityDays(entry: Entry): Array<{ slots: Array<{ start: string }> }> {
  return (entry.result as { ok: true; data: { days?: Array<{ slots: Array<{ start: string }> }> } }).data.days ?? [];
}

function followUpFlow(text: string, history: Entry[], now: Date): LlmResponse {
  // Con una ventana explicita ("48 horas", "2 dias") se buscan prospectos (lead/contactado) sin actividad en ese lapso
  // y se deja una tarea de recordatorio para el asesor de cada uno (hasta 3 por turno). Sin ventana: modo general (7 dias, una tarea).
  const hours = extractWindowHours(text);
  if (history.length === 0) {
    return hours !== undefined
      ? call(history, "find_stale_opportunities", { hours, stages: ["lead", "contacted"], limit: 10 })
      : call(history, "find_stale_opportunities", { days: 7 });
  }
  const tasks = history.filter((e) => e.name === "create_task");
  if (tasks.length > 0) {
    const pendings = tasks.map(special).filter((m): m is string => m !== null);
    const done = tasks.length - pendings.length;
    if (hours !== undefined) {
      const total = Number((last(history, "find_stale_opportunities")?.result as { data?: { count?: number } } | null | undefined)?.data?.count ?? tasks.length);
      const parts = [
        done > 0 ? `Cree ${done} tarea(s) de recordatorio para el asesor responsable.` : "",
        ...pendings,
        total > tasks.length ? `Quedan ${total - tasks.length} prospecto(s) mas sin respuesta; pideme revisarlos otra vez para continuar.` : "",
      ].filter(Boolean);
      return reply(parts.join(" "));
    }
    return reply(pendings[0] ?? "Cree la tarea de seguimiento y quedo registrada.");
  }
  const stale = last(history, "find_stale_opportunities");
  const s = stale ? special(stale) : null;
  if (s) return reply(s);
  const opps = (stale?.result && stale.result.ok ? (stale.result.data as { opportunities?: Row[] }).opportunities : null) ?? [];
  if (opps.length === 0) {
    return reply(hours !== undefined ? `No hay prospectos sin respuesta en las ultimas ${hours} horas. Todo al dia.` : "No hay oportunidades sin actividad en los ultimos 7 dias. Todo al dia.");
  }
  if (hours === undefined) {
    const o = opps[0];
    return call(history, "create_task", {
      title: `Dar seguimiento a ${String(o.title)}`,
      description: `Hay ${opps.length} oportunidad(es) sin actividad reciente.`,
      ...(typeof o.contact_id === "string" ? { contact_id: o.contact_id } : {}),
      ...(typeof o.id === "string" ? { opportunity_id: o.id } : {}),
    });
  }
  const toolCalls: LlmToolCall[] = opps.slice(0, 3).map((o, i) => ({
    id: `demo_call_${history.length + i + 1}`,
    name: "create_task",
    input: {
      title: `Dar seguimiento a ${String(o.title)}`,
      description: `Sin respuesta ni actividad desde hace ${Number(o.hours_since_activity ?? hours)} horas (limite de ${hours} horas).`,
      due_date: new Date(now.getTime() + DAY_MS).toISOString(),
      ...(typeof o.contact_id === "string" ? { contact_id: o.contact_id } : {}),
      ...(typeof o.id === "string" ? { opportunity_id: o.id } : {}),
      ...(typeof o.assigned_to === "string" ? { assigned_to: o.assigned_to } : {}),
    },
  }));
  return { text: "", toolCalls, stopReason: "tool_use" };
}

function analystFlow(history: Entry[]): LlmResponse {
  if (history.length === 0) return call(history, "generate_briefing", { days: 30 });
  const b = last(history, "generate_briefing");
  const s = b ? special(b) : null;
  if (s) return reply(s);
  // El texto ya viene redactado de forma determinista por el Analista (cifras de la base): se entrega tal cual.
  const d = (b?.result as { ok: true; data: Row }).data as { summary?: string };
  return reply(typeof d.summary === "string" ? d.summary : "No pude generar el briefing.");
}

function receptionistFlow(text: string, history: Entry[], pack: IndustryPack): LlmResponse {
  const n = normalize(text);
  const wantsCreate = /\b(alta|registr|nuevo cliente|nuevo contacto|dar de alta)/.test(n);
  const name = extractName(text);
  if (!wantsCreate || !name) {
    return reply(
      wantsCreate
        ? needName(pack)
        : pack.agent.greeting,
    );
  }
  if (history.length === 0) return call(history, "search_contact", { query: name, limit: 5 });
  const created = last(history, "create_contact");
  if (created) {
    const s = special(created);
    if (s) return reply(s);
    const d = (created.result as { ok: true; data: { created: boolean; contact: Row } }).data;
    return reply(d.created ? `Di de alta a ${String(d.contact.full_name)}.` : `${String(d.contact.full_name)} ya existia con esos datos; no lo duplique.`);
  }
  const search = last(history, "search_contact");
  const s = search ? special(search) : null;
  if (s) return reply(s);
  const found = contactsOf(search);
  if (found.some((c) => normalize(String(c.full_name)) === normalize(name))) {
    return reply(`${name} ya esta registrado; no lo duplique.`);
  }
  const phone = /\+?\d[\d\s\-().]{5,}\d/.exec(text)?.[0].trim();
  const email = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(text)?.[0];
  return call(history, "create_contact", {
    full_name: name,
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
  });
}

export class DemoLlmClient implements LlmClient {
  async complete(request: LlmRequest): Promise<LlmResponse> {
    const first = request.messages.find((m) => m.role === "user");
    const text = first && first.role === "user" ? first.content : "";

    if (request.tier === "classifier") {
      const c = classifyByKeywords(text);
      return reply(JSON.stringify({ agent: c.agent, reason: c.reason }));
    }

    const history = collectHistory(request.messages);
    const allowed = new Set((request.tools ?? []).map((t) => t.name));
    const agent = detectAgent(request.system, text);
    const now = nowFromSystem(request.system);
    const pack = packFromSystem(request.system);

    let response: LlmResponse;
    switch (agent) {
      case "sales":
        response = salesFlow(text, history, pack);
        break;
      case "booking":
        response = bookingFlow(text, history, now, pack);
        break;
      case "follow_up":
        response = followUpFlow(text, history, now);
        break;
      case "analyst":
        response = analystFlow(history);
        break;
      default:
        response = receptionistFlow(text, history, pack);
    }
    // Nunca se propone una herramienta que el agente no tiene disponible.
    if (allowed.size > 0 && response.toolCalls.some((c) => !allowed.has(c.name))) {
      return reply("Esa solicitud no corresponde a mi area. Reformula el mensaje o pide ayuda a otro agente.");
    }
    return response;
  }
}
