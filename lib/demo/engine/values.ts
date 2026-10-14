// Errores estilo Postgres/PostgREST, conversion de valores por tipo de columna y comparaciones.
import type { ColDef, ColType } from "./schema";

export interface PostgrestErrorLike {
  message: string;
  details: string | null;
  hint: string | null;
  code: string;
}

// Error de base de datos emulado. Se captura en el constructor de consultas y se devuelve
// como { data: null, error } igual que supabase-js; nunca llega al llamador como excepcion.
export class PgFail extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: string | null = null,
    readonly hint: string | null = null,
  ) {
    super(message);
    this.name = "PgFail";
  }

  toError(): PostgrestErrorLike {
    return { message: this.message, details: this.details, hint: this.hint, code: this.code };
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

const NO_ZONE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

// Milisegundos UTC de un timestamp; sin zona horaria se interpreta como UTC (sesion en UTC).
export function parseTimestamp(v: unknown): number {
  let ms = NaN;
  if (v instanceof Date) ms = v.getTime();
  else if (typeof v === "number") ms = v;
  else if (typeof v === "string") {
    const s = v.trim();
    ms = Date.parse(NO_ZONE.test(s) ? `${s.replace(" ", "T")}Z` : s);
  }
  if (Number.isNaN(ms)) {
    throw new PgFail("22007", `invalid input syntax for type timestamp with time zone: "${String(v)}"`);
  }
  return ms;
}

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return NaN;
}

// Convierte y valida un valor para una columna (como el cast de Postgres al insertar).
export function coerceValue(type: ColType, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  switch (type) {
    case "uuid":
      if (!isUuid(v)) throw new PgFail("22P02", `invalid input syntax for type uuid: "${String(v)}"`);
      return v.toLowerCase();
    case "text":
      if (typeof v === "string") return v;
      if (typeof v === "number" || typeof v === "boolean") return String(v);
      throw new PgFail("22P02", "invalid input syntax for type text");
    case "int": {
      const n = toNumber(v);
      if (!Number.isInteger(n)) throw new PgFail("22P02", `invalid input syntax for type integer: "${String(v)}"`);
      return n;
    }
    case "numeric": {
      const n = toNumber(v);
      if (!Number.isFinite(n)) throw new PgFail("22P02", `invalid input syntax for type numeric: "${String(v)}"`);
      return round2(n);
    }
    case "bool":
      if (typeof v === "boolean") return v;
      if (v === "true") return true;
      if (v === "false") return false;
      throw new PgFail("22P02", `invalid input syntax for type boolean: "${String(v)}"`);
    case "timestamptz":
      return new Date(parseTimestamp(v)).toISOString();
    case "date": {
      const s = v instanceof Date ? v.toISOString() : String(v);
      if (!/^\d{4}-\d{2}-\d{2}/.test(s) || Number.isNaN(Date.parse(s.slice(0, 10)))) {
        throw new PgFail("22007", `invalid input syntax for type date: "${s}"`);
      }
      return s.slice(0, 10);
    }
    case "jsonb":
      return structuredClone(v);
    case "text[]":
      if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
        throw new PgFail("22P02", "malformed array literal");
      }
      return [...(v as string[])];
  }
}

// Valor normalizado de una celda para comparar (eq, gt, ...) segun el tipo de la columna.
export function comparable(col: ColDef, v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  switch (col.type) {
    case "timestamptz":
      return parseTimestamp(v);
    case "int":
    case "numeric": {
      const n = toNumber(v);
      if (Number.isNaN(n)) throw new PgFail("22P02", `invalid input syntax for type numeric: "${String(v)}"`);
      return n;
    }
    case "bool":
      return coerceValue("bool", v) as boolean;
    case "uuid":
      return (coerceValue("uuid", v) as string).toLowerCase();
    case "date":
      return coerceValue("date", v) as string;
    default:
      return typeof v === "string" ? v : JSON.stringify(v);
  }
}

export function compareValues(a: string | number | boolean, b: string | number | boolean): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

// LIKE/ILIKE de Postgres: % cualquier cadena, _ un caracter, \ escapa el siguiente.
export function likeToRegex(pattern: string, caseInsensitive: boolean): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\" && i + 1 < pattern.length) {
      out += escapeRegex(pattern[++i]);
    } else if (c === "%") out += "[\\s\\S]*";
    else if (c === "_") out += "[\\s\\S]";
    else out += escapeRegex(c);
  }
  return new RegExp(`^${out}$`, caseInsensitive ? "i" : "");
}

const escapeRegex = (c: string): string => c.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");

// Contenencia de @> (contains) para arreglos y objetos jsonb.
export function contains(container: unknown, part: unknown): boolean {
  if (Array.isArray(container) && Array.isArray(part)) {
    return part.every((p) => container.some((c) => contains(c, p)));
  }
  if (
    container && part && typeof container === "object" && typeof part === "object" &&
    !Array.isArray(container) && !Array.isArray(part)
  ) {
    return Object.entries(part as Record<string, unknown>).every(([k, v]) =>
      contains((container as Record<string, unknown>)[k], v),
    );
  }
  return container === part;
}
