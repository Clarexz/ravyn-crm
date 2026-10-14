// Base falsa en memoria con la API minima de supabase-js que usan las herramientas.
// Incluye datos de DOS organizaciones para probar aislamiento.
import type { SupabaseClient } from "@supabase/supabase-js";

export type FakeRow = Record<string, unknown>;
type Tables = Record<string, FakeRow[]>;
type DbError = { message: string };
type Result = { data: unknown; error: DbError | null; count?: number | null };

export const uid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const ORG_A = uid(1);
export const ORG_B = uid(2);
export const NOW = new Date("2026-10-14T12:00:00.000Z"); // miercoles

const ENUMS: Record<string, Record<string, readonly string[]>> = {
  opportunities: { stage: ["lead", "contacted", "qualified", "proposal", "negotiation", "won", "lost"] },
  bookings: {
    status: ["pending", "confirmed", "cancelled", "completed", "no_show"],
    source: ["whatsapp", "web", "manual", "agent_booking"],
  },
  contacts: { source: ["whatsapp", "web", "manual", "agent_receptionist", "import"] },
  activities: {
    type: ["call", "message", "meeting", "task", "note", "stage_change", "agent_interaction"],
    status: ["pending", "completed", "cancelled"],
    performed_by_type: ["human", "agent"],
  },
};
const REQUIRED: Record<string, string[]> = {
  contacts: ["organization_id", "full_name"],
  opportunities: ["organization_id", "title", "stage"],
  bookings: ["organization_id", "scheduled_at"],
  activities: ["organization_id", "type", "title", "performed_by_type", "performed_by_id"],
};

const ISO = /^\d{4}-\d{2}-\d{2}T/;
function cmp(a: unknown, b: unknown): number {
  if (typeof a === "string" && typeof b === "string") {
    if (ISO.test(a) && ISO.test(b)) return Date.parse(a) - Date.parse(b);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const na = Number(a);
  const nb = Number(b);
  return na - nb;
}

function likeToRegex(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\" && i + 1 < pattern.length) {
      out += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else if (c === "%") out += ".*";
    else if (c === "_") out += ".";
    else out += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`, "is");
}

// Parte "a.ilike.\"x,y\",b.eq.z" respetando comillas y escapes.
function parseOr(expr: string): Array<(r: FakeRow) => boolean> {
  const parts: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === "\\" && quoted) {
      cur += c + expr[++i];
      continue;
    }
    if (c === '"') quoted = !quoted;
    if (c === "," && !quoted) {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  parts.push(cur);
  return parts.map((p) => {
    const m = /^([a-z_]+)\.(ilike|eq)\.([\s\S]*)$/.exec(p);
    if (!m) throw new Error(`or() invalido: ${p}`);
    let value = m[3];
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/\\(["\\])/g, "$1");
    const [, col, op] = m;
    if (op === "eq") return (r) => String(r[col]) === value;
    const re = likeToRegex(value);
    return (r) => typeof r[col] === "string" && re.test(r[col] as string);
  });
}

export class FakeDb {
  tables: Tables;
  // Registro de operaciones para verificar que "la base no se toco".
  calls: Array<{ table: string; op: "select" | "insert" | "update" | "delete" }> = [];
  // Tablas que fallan (error devuelto) o lanzan, para probar captura de errores.
  failTables = new Set<string>();
  throwTables = new Set<string>();

  constructor(seed: Tables) {
    this.tables = structuredClone(seed);
  }

  snapshot(): Tables {
    return structuredClone(this.tables);
  }

  get writes(): number {
    return this.calls.filter((c) => c.op !== "select").length;
  }

  from(table: string): Query {
    return new Query(this, table);
  }

  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }
}

type Op = "select" | "insert" | "update" | "delete";

class Query implements PromiseLike<Result> {
  private op: Op = "select";
  private filters: Array<(r: FakeRow) => boolean> = [];
  private payload: FakeRow[] = [];
  private patch: FakeRow = {};
  private columns = "*";
  private head = false;
  private wantCount = false;
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select(columns = "*", opts?: { count?: "exact"; head?: boolean }): this {
    this.columns = columns;
    this.head = Boolean(opts?.head);
    this.wantCount = Boolean(opts?.count);
    return this;
  }
  insert(rows: FakeRow | FakeRow[]): this {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: FakeRow): this {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  private f(fn: (r: FakeRow) => boolean): this {
    this.filters.push(fn);
    return this;
  }
  eq(col: string, v: unknown): this {
    return this.f((r) => r[col] === v);
  }
  neq(col: string, v: unknown): this {
    return this.f((r) => r[col] !== v);
  }
  in(col: string, vs: readonly unknown[]): this {
    return this.f((r) => vs.includes(r[col]));
  }
  gte(col: string, v: unknown): this {
    return this.f((r) => r[col] != null && cmp(r[col], v) >= 0);
  }
  lte(col: string, v: unknown): this {
    return this.f((r) => r[col] != null && cmp(r[col], v) <= 0);
  }
  gt(col: string, v: unknown): this {
    return this.f((r) => r[col] != null && cmp(r[col], v) > 0);
  }
  lt(col: string, v: unknown): this {
    return this.f((r) => r[col] != null && cmp(r[col], v) < 0);
  }
  ilike(col: string, pattern: string): this {
    const re = likeToRegex(pattern);
    return this.f((r) => typeof r[col] === "string" && re.test(r[col] as string));
  }
  is(col: string, v: unknown): this {
    return this.f((r) => (v === null ? r[col] == null : r[col] === v));
  }
  or(expr: string): this {
    const preds = parseOr(expr);
    return this.f((r) => preds.some((p) => p(r)));
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number): this {
    this.max = n;
    return this;
  }
  single(): this {
    this.mode = "single";
    return this;
  }
  maybeSingle(): this {
    this.mode = "maybe";
    return this;
  }

  private project(row: FakeRow): FakeRow {
    if (this.columns.trim() === "*") return { ...row };
    const out: FakeRow = {};
    for (const c of this.columns.split(",").map((s) => s.trim())) out[c] = row[c];
    return out;
  }

  private validate(row: FakeRow): DbError | null {
    for (const col of REQUIRED[this.table] ?? []) {
      if (row[col] === undefined || row[col] === null) return { message: `null en ${this.table}.${col}` };
    }
    for (const [col, allowed] of Object.entries(ENUMS[this.table] ?? {})) {
      if (row[col] !== undefined && !allowed.includes(row[col] as string)) {
        return { message: `check ${this.table}.${col}` };
      }
    }
    return null;
  }

  private execute(): Result {
    if (this.db.throwTables.has(this.table)) throw new Error("fallo simulado (interno)");
    this.db.calls.push({ table: this.table, op: this.op });
    if (this.db.failTables.has(this.table)) return { data: null, error: { message: "fallo simulado (interno)" } };
    const rows = (this.db.tables[this.table] ??= []);

    let affected: FakeRow[];
    if (this.op === "insert") {
      affected = [];
      for (const p of this.payload) {
        const row: FakeRow = {
          id: crypto.randomUUID(),
          created_at: NOW.toISOString(),
          updated_at: NOW.toISOString(),
          ...p,
        };
        const err = this.validate(row);
        if (err) return { data: null, error: err };
        affected.push(row);
      }
      rows.push(...affected);
    } else {
      affected = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === "update") {
        for (const r of affected) Object.assign(r, this.patch);
        for (const r of affected) {
          const err = this.validate(r);
          if (err) return { data: null, error: err };
        }
      } else if (this.op === "delete") {
        this.db.tables[this.table] = rows.filter((r) => !affected.includes(r));
      }
    }

    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      affected = [...affected].sort((a, b) => (asc ? 1 : -1) * cmp(a[col], b[col]));
    }
    const total = affected.length;
    if (this.max !== null) affected = affected.slice(0, this.max);
    const count = this.wantCount ? total : null;
    if (this.head) return { data: null, error: null, count };

    const data = affected.map((r) => this.project(r));
    if (this.mode === "many") return { data, error: null, count };
    if (data.length === 0) {
      return this.mode === "maybe"
        ? { data: null, error: null }
        : { data: null, error: { message: "sin filas" } };
    }
    if (data.length > 1) return { data: null, error: { message: "mas de una fila" } };
    return { data: data[0], error: null };
  }

  then<R1 = Result, R2 = never>(
    onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return new Promise<Result>((resolve) => resolve(this.execute())).then(onfulfilled, onrejected);
  }
}

export const IDS = {
  contactA1: uid(101),
  contactA2: uid(102),
  contactB1: uid(201),
  itemA1: uid(111),
  itemA2: uid(112),
  itemAInactive: uid(113),
  itemB1: uid(211),
  oppA1: uid(121),
  oppA2: uid(122),
  oppB1: uid(221),
  bookingA1: uid(131),
  bookingACancelled: uid(132),
  bookingB1: uid(231),
};

export function seedData(): Tables {
  const ts = (iso: string) => iso;
  return {
    organizations: [
      {
        id: ORG_A,
        name: "Org A",
        settings: { business_hours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] } },
      },
      {
        id: ORG_B,
        name: "Org B",
        settings: { business_hours: { start: "10:00", end: "14:00", days: [1, 2, 3, 4, 5, 6] } },
      },
    ],
    contacts: [
      { id: IDS.contactA1, organization_id: ORG_A, full_name: "Maria Lopez", phone: "+52 55 1111 2222", email: "maria@a.mx", company_name: null, tags: [], notes: "Cliente frecuente", source: "manual", created_at: ts("2026-09-01T10:00:00.000Z") },
      { id: IDS.contactA2, organization_id: ORG_A, full_name: "Juan 100% Perez_Jr", phone: "+52 55 3333 4444", email: "juan@a.mx", company_name: "ACME", tags: [], notes: null, source: "web", created_at: ts("2026-10-10T10:00:00.000Z") },
      { id: IDS.contactB1, organization_id: ORG_B, full_name: "Maria Ajena", phone: "+52 33 9999 0000", email: "maria@b.mx", company_name: null, tags: [], notes: "Secreto de B", source: "manual", created_at: ts("2026-09-05T10:00:00.000Z") },
    ],
    items: [
      { id: IDS.itemA1, organization_id: ORG_A, name: "Consulta", type: "service", price: "500.00", active: true },
      { id: IDS.itemA2, organization_id: ORG_A, name: "Limpieza", type: "service", price: 250.5, active: true },
      { id: IDS.itemAInactive, organization_id: ORG_A, name: "Descontinuado", type: "product", price: 10, active: false },
      { id: IDS.itemB1, organization_id: ORG_B, name: "Servicio B", type: "service", price: 9999, active: true },
    ],
    opportunities: [
      // A1: sin actividad reciente (vieja). A2: con actividad reciente.
      { id: IDS.oppA1, organization_id: ORG_A, contact_id: IDS.contactA1, title: "Opp vieja A", stage: "proposal", value: 1000, currency: "MXN", probability: 50, closed_at: null, created_at: ts("2026-08-01T10:00:00.000Z") },
      { id: IDS.oppA2, organization_id: ORG_A, contact_id: IDS.contactA2, title: "Opp activa A", stage: "lead", value: 2000, currency: "MXN", probability: 10, closed_at: null, created_at: ts("2026-08-02T10:00:00.000Z") },
      { id: IDS.oppB1, organization_id: ORG_B, contact_id: IDS.contactB1, title: "Opp de B", stage: "lead", value: 77777, currency: "MXN", probability: 10, closed_at: null, created_at: ts("2026-07-01T10:00:00.000Z") },
    ],
    bookings: [
      // Miercoles 14-oct: A ocupado 14:00-15:00 UTC; cancelado 15:00-16:00 (no bloquea).
      { id: IDS.bookingA1, organization_id: ORG_A, contact_id: IDS.contactA1, scheduled_at: "2026-10-14T14:00:00.000Z", duration_minutes: 60, status: "confirmed" },
      { id: IDS.bookingACancelled, organization_id: ORG_A, contact_id: IDS.contactA1, scheduled_at: "2026-10-14T15:00:00.000Z", duration_minutes: 60, status: "cancelled" },
      { id: IDS.bookingB1, organization_id: ORG_B, contact_id: IDS.contactB1, scheduled_at: "2026-10-15T10:00:00.000Z", duration_minutes: 60, status: "confirmed" },
    ],
    activities: [
      { id: uid(141), organization_id: ORG_A, opportunity_id: IDS.oppA1, contact_id: IDS.contactA1, type: "note", title: "Nota vieja", status: "completed", performed_by_type: "human", performed_by_id: "u1", created_at: ts("2026-09-01T10:00:00.000Z") },
      { id: uid(142), organization_id: ORG_A, opportunity_id: IDS.oppA2, contact_id: IDS.contactA2, type: "call", title: "Llamada reciente", status: "completed", performed_by_type: "human", performed_by_id: "u1", created_at: ts("2026-10-13T10:00:00.000Z") },
      { id: uid(143), organization_id: ORG_A, opportunity_id: null, contact_id: IDS.contactA1, type: "task", title: "Pendiente A", status: "pending", performed_by_type: "human", performed_by_id: "u1", created_at: ts("2026-10-01T10:00:00.000Z") },
      { id: uid(241), organization_id: ORG_B, opportunity_id: IDS.oppB1, contact_id: IDS.contactB1, type: "task", title: "Pendiente B", status: "pending", performed_by_type: "human", performed_by_id: "u2", created_at: ts("2026-10-01T10:00:00.000Z") },
    ],
  };
}

export function createFakeDb(seed: Tables = seedData()): FakeDb {
  return new FakeDb(seed);
}
