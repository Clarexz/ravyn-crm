// Utilidades compartidas por las herramientas de agentes.
// Regla de oro: toda consulta filtra por ctx.organizationId y todo insert lleva organization_id.
import type { ToolContext, ToolErrorCode } from "@/lib/agents/types";
import { DEFAULT_TIMEZONE, safeTimeZone, zonedParts, zonedToUtc } from "@/lib/industry/time";

// Error tipado: el ejecutor lo traduce a un ToolResult con su codigo y mensaje (seguros para el modelo).
export class ToolError extends Error {
  readonly code: ToolErrorCode;
  constructor(code: ToolErrorCode, message: string) {
    super(message);
    this.name = "ToolError";
    this.code = code;
  }
}

export const notFound = (label: string): ToolError =>
  new ToolError("NOT_FOUND", `No se encontro ${label} en esta organizacion.`);

export const invalid = (message: string): ToolError => new ToolError("INVALID_INPUT", message);

export type Row = Record<string, unknown>;

export const nowOf = (ctx: ToolContext): Date => ctx.now ?? new Date();

// Convierte un error de la base en una excepcion generica (el detalle no sale hacia el modelo).
export function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`db: ${res.error.message}`);
  return res.data;
}

// Busca una fila por id DENTRO de la organizacion. Un id ajeno se comporta como inexistente.
export async function getOwned(
  ctx: ToolContext,
  table: string,
  id: string,
  label: string,
): Promise<Row> {
  const res = await ctx.db
    .from(table)
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .eq("id", id)
    .maybeSingle();
  const row = check(res) as Row | null;
  if (!row) throw notFound(label);
  return row;
}

// Verifica que el id (si viene) pertenece a la organizacion.
export async function assertOwned(
  ctx: ToolContext,
  table: string,
  id: string | undefined,
  label: string,
): Promise<void> {
  if (id) await getOwned(ctx, table, id, label);
}

export type ActivityInput = {
  type: "call" | "message" | "meeting" | "task" | "note" | "stage_change" | "agent_interaction";
  title: string;
  description?: string | null;
  status?: "pending" | "completed" | "cancelled";
  contact_id?: string | null;
  opportunity_id?: string | null;
  booking_id?: string | null;
  due_date?: string | null;
  // Persona (users.id de la organizacion) a quien se asigna la tarea (D-19).
  assigned_to?: string | null;
};

// Inserta una activity con la autoria del agente.
export async function insertActivity(ctx: ToolContext, a: ActivityInput): Promise<Row> {
  const res = await ctx.db
    .from("activities")
    .insert({
      organization_id: ctx.organizationId,
      contact_id: a.contact_id ?? null,
      opportunity_id: a.opportunity_id ?? null,
      booking_id: a.booking_id ?? null,
      type: a.type,
      title: a.title,
      description: a.description ?? null,
      status: a.status ?? "completed",
      performed_by_type: "agent",
      performed_by_id: ctx.agent,
      due_date: a.due_date ?? null,
      assigned_to: a.assigned_to ?? null,
    })
    .select()
    .single();
  return check(res) as Row;
}

// Escapa un termino para usarlo dentro de ilike: \ % _ son literales.
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Entrecomilla un valor para un filtro .or() de PostgREST (comas, parentesis, puntos, comillas).
export function quoteOrValue(value: string): string {
  return `"${value.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

export const roundMoney = (n: number): number => Math.round(n * 100) / 100;

// --- Horario laboral y disponibilidad (las horas del negocio se interpretan en la zona horaria de la organizacion; D-13) ---

export type BusinessHours = { startMin: number; endMin: number; days: number[]; timeZone?: string };

const DEFAULT_HOURS: BusinessHours = { startMin: 9 * 60, endMin: 18 * 60, days: [1, 2, 3, 4, 5], timeZone: DEFAULT_TIMEZONE };

function parseHm(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h <= 24 && mi < 60 ? h * 60 + mi : null;
}

export const tzOf = (hours: BusinessHours): string => hours.timeZone ?? DEFAULT_TIMEZONE;

export async function loadBusinessHours(ctx: ToolContext): Promise<BusinessHours> {
  const res = await ctx.db
    .from("organizations")
    .select("settings")
    .eq("id", ctx.organizationId)
    .maybeSingle();
  const org = check(res) as { settings?: { business_hours?: Row; timezone?: unknown } } | null;
  if (!org) throw notFound("la organizacion");
  const timeZone = org.settings?.timezone === undefined ? DEFAULT_TIMEZONE : safeTimeZone(org.settings.timezone);
  const bh = org.settings?.business_hours;
  if (!bh) return { ...DEFAULT_HOURS, timeZone };
  const startMin = parseHm(bh.start);
  const endMin = parseHm(bh.end);
  const days = Array.isArray(bh.days) ? bh.days.filter((d): d is number => typeof d === "number") : null;
  if (startMin === null || endMin === null || !days || endMin <= startMin) return { ...DEFAULT_HOURS, timeZone };
  return { startMin, endMin, days, timeZone };
}

// Lunes=1 ... Domingo=7 (acepta 0 como domingo en la configuracion).
export function isoWeekday(date: Date, timeZone: string = DEFAULT_TIMEZONE): number {
  return zonedParts(date, timeZone).isoWeekday;
}

function weekdayOpen(hours: BusinessHours, wd: number): boolean {
  return hours.days.includes(wd) || (wd === 7 && hours.days.includes(0));
}

// El instante cae en un dia habil (dia local de la organizacion).
export function dayIsOpen(hours: BusinessHours, date: Date): boolean {
  return weekdayOpen(hours, isoWeekday(date, tzOf(hours)));
}

// El dia local YYYY-MM-DD es habil.
export function dateIsOpen(hours: BusinessHours, ymd: string): boolean {
  return dayIsOpen(hours, zonedToUtc(ymd, 12 * 60, tzOf(hours)));
}

export function minutesOfDay(date: Date, timeZone: string = DEFAULT_TIMEZONE): number {
  return zonedParts(date, timeZone).minutes;
}

// true si [start, end) cae completo dentro de un dia habil y su horario (hora local de la organizacion).
export function withinBusinessHours(hours: BusinessHours, start: Date, end: Date): boolean {
  const tz = tzOf(hours);
  const s = zonedParts(start, tz);
  const e = zonedParts(end, tz);
  if (!weekdayOpen(hours, s.isoWeekday)) return false;
  if (s.date !== e.date && e.minutes !== 0) return false;
  const endMin = e.minutes === 0 && end > start ? 24 * 60 : e.minutes;
  return s.minutes >= hours.startMin && endMin <= hours.endMin;
}

export type Interval = { start: Date; end: Date; id?: string };

const MAX_BOOKING_MINUTES = 8 * 60;

// Bookings no cancelados de la organizacion que podrian solaparse con [from, to).
export async function loadBlockingBookings(ctx: ToolContext, from: Date, to: Date): Promise<Interval[]> {
  const lowerBound = new Date(from.getTime() - MAX_BOOKING_MINUTES * 60_000);
  const res = await ctx.db
    .from("bookings")
    .select("id, scheduled_at, duration_minutes, status")
    .eq("organization_id", ctx.organizationId)
    .neq("status", "cancelled")
    .gte("scheduled_at", lowerBound.toISOString())
    .lte("scheduled_at", to.toISOString())
    .order("scheduled_at", { ascending: true });
  const rows = (check(res) ?? []) as Array<{ id: string; scheduled_at: string; duration_minutes: number }>;
  return rows.map((b) => {
    const start = new Date(b.scheduled_at);
    return { id: b.id, start, end: new Date(start.getTime() + b.duration_minutes * 60_000) };
  });
}

export const overlaps = (a: Interval, b: Interval): boolean => a.start < b.end && b.start < a.end;

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}
