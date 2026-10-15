// Zona horaria por organizacion (Fase 4, D-13). Sin dependencias: usa Intl.
// Las horas del negocio (settings.business_hours) se interpretan en la zona de la organizacion.
export const DEFAULT_TIMEZONE = "UTC";

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function safeTimeZone(tz: unknown): string {
  return isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE;
}

export type ZonedParts = { date: string; minutes: number; isoWeekday: number };

const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    formatters.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

// Fecha (YYYY-MM-DD), minutos desde medianoche y dia ISO (lunes=1 ... domingo=7) de un instante en la zona.
export function zonedParts(date: Date, tz: string): ZonedParts {
  const p: Record<string, string> = {};
  for (const part of fmt(safeTimeZone(tz)).formatToParts(date)) p[part.type] = part.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    isoWeekday: WEEKDAYS[p.weekday] ?? 1,
  };
}

// Instante UTC en que el reloj de la zona marca `minutes` del dia `ymd`. Maneja desfases con DST.
export function zonedToUtc(ymd: string, minutes: number, tz: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, minutes);
  let guess = wall;
  for (let i = 0; i < 3; i += 1) {
    const p = zonedParts(new Date(guess), tz);
    const [py, pm, pd] = p.date.split("-").map(Number);
    const shown = Date.UTC(py, pm - 1, pd, 0, p.minutes);
    const diff = wall - shown;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Presentacion legible en la zona de la organizacion, p. ej. "15/10/2026 09:30".
export function formatInZone(date: Date | string, tz: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const p = zonedParts(d, tz);
  const [y, m, day] = p.date.split("-");
  const hh = String(Math.floor(p.minutes / 60)).padStart(2, "0");
  const mm = String(p.minutes % 60).padStart(2, "0");
  return `${day}/${m}/${y} ${hh}:${mm}`;
}

// Hora local en formato ISO sin desfase, p. ej. "2026-10-15T09:30" (para el modelo y los registros).
export function localIso(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.date}T${String(Math.floor(p.minutes / 60)).padStart(2, "0")}:${String(p.minutes % 60).padStart(2, "0")}`;
}
