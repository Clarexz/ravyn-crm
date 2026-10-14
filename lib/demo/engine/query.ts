// Constructor de consultas con la sintaxis de supabase-js/PostgREST que usa la app.
// Es "thenable": no ejecuta nada hasta que se hace await, igual que supabase-js.
import type { DemoDb } from "./db";
import { SCHEMA, type ColDef, type Row, type TableDef } from "./schema";
import {
  coerceValue,
  comparable,
  compareValues,
  contains,
  likeToRegex,
  PgFail,
  type PostgrestErrorLike,
} from "./values";

export interface QueryResult {
  data: unknown;
  error: PostgrestErrorLike | null;
  count: number | null;
  status: number;
  statusText: string;
}

type CmpOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "is" | "in" | "cs";
const CMP_OPS: readonly string[] = ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "cs"];

type Cond =
  | { t: "cmp"; col: string; op: CmpOp; value: unknown; neg: boolean }
  | { t: "group"; kind: "and" | "or"; items: Cond[]; neg: boolean }
  // Texto de un filtro .or()/.and() de PostgREST; se interpreta al ejecutar para devolver errores como supabase-js.
  | { t: "raw"; kind: "and" | "or"; expr: string };

type Tri = boolean | null;
type Pred = (row: Row) => Tri;

// ------------------------------------------------------------------ select con embeds

interface SelNode {
  kind: "star" | "col" | "rel";
  name: string;
  alias?: string;
  hint?: string;
  inner?: boolean;
  children?: SelNode[];
}

function splitTop(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      cur += c;
      if (c === "\\" && i + 1 < s.length) cur += s[++i];
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') {
      quoted = true;
      cur += c;
    } else if (c === "(") {
      depth++;
      cur += c;
    } else if (c === ")") {
      depth--;
      cur += c;
    } else if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  parts.push(cur);
  return parts;
}

export function parseSelect(select: string): SelNode[] {
  const nodes: SelNode[] = [];
  for (const raw of splitTop(select)) {
    const p = raw.trim();
    if (!p) continue;
    const open = p.indexOf("(");
    if (open === -1) {
      if (p === "*") {
        nodes.push({ kind: "star", name: "*" });
        continue;
      }
      const head = p.split("::")[0].trim();
      const c = head.indexOf(":");
      nodes.push(c >= 0 ? { kind: "col", name: head.slice(c + 1).trim(), alias: head.slice(0, c).trim() } : { kind: "col", name: head });
      continue;
    }
    let head = p.slice(0, open).trim();
    const close = p.lastIndexOf(")");
    const children = parseSelect(p.slice(open + 1, close));
    let alias: string | undefined;
    const c = head.indexOf(":");
    if (c >= 0) {
      alias = head.slice(0, c).trim();
      head = head.slice(c + 1).trim();
    }
    const [name, ...flags] = head.split("!").map((x) => x.trim());
    nodes.push({
      kind: "rel",
      name,
      alias,
      inner: flags.includes("inner"),
      hint: flags.find((f) => f !== "inner" && f !== "left"),
      children,
    });
  }
  return nodes;
}

interface Relation {
  kind: "one" | "many";
  target: string;
  // one: columna de la tabla actual que apunta al destino; many: columna del destino que apunta a la actual.
  col: string;
}

function resolveRelation(table: string, node: SelNode): Relation {
  const own = SCHEMA[table];
  const matchesHint = (col: string, owner: string): boolean =>
    !node.hint || node.hint === col || node.hint === `${owner}_${col}_fkey`;
  const one = own.fks.find((f) => f.ref === node.name && matchesHint(f.col, table));
  if (one) return { kind: "one", target: node.name, col: one.col };
  const child = SCHEMA[node.name];
  const many = child?.fks.find((f) => f.ref === table && matchesHint(f.col, node.name));
  if (child && many) return { kind: "many", target: node.name, col: many.col };
  throw new PgFail(
    "PGRST200",
    `Could not find a relationship between '${table}' and '${node.name}' in the schema cache`,
    `Searched for a foreign key relationship between '${table}' and '${node.name}' in the schema 'public', but no matches were found.`,
  );
}

function related(db: DemoDb, table: string, row: Row, rel: Relation): Row[] {
  if (rel.kind === "one") {
    const fk = row[rel.col];
    if (fk === null) return [];
    return db.tables[rel.target].filter((r) => r.id === fk);
  }
  return db.tables[rel.target].filter((r) => r[rel.col] === row.id);
}

function project(db: DemoDb, table: string, row: Row, nodes: SelNode[]): Row {
  const def = db.def(table);
  const out: Row = {};
  for (const n of nodes) {
    if (n.kind === "star") {
      for (const [k, v] of Object.entries(row)) out[k] = structuredClone(v);
    } else if (n.kind === "col") {
      if (!(n.name in def.cols)) {
        throw new PgFail("42703", `column ${table}.${n.name} does not exist`);
      }
      out[n.alias ?? n.name] = structuredClone(row[n.name]);
    } else {
      const rel = resolveRelation(table, n);
      const kids = related(db, table, row, rel);
      const children = n.children && n.children.length > 0 ? n.children : [{ kind: "star", name: "*" } as SelNode];
      const mapped = kids.map((k) => project(db, rel.target, k, children));
      out[n.alias ?? n.name] = rel.kind === "one" ? (mapped[0] ?? null) : mapped;
    }
  }
  return out;
}

// ------------------------------------------------------------------ filtros

function unquote(raw: string): string {
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/\\(["\\])/g, "$1");
  return s;
}

function parseTermValue(op: CmpOp, raw: string): unknown {
  if (op === "in") {
    const inner = raw.trim().replace(/^\(/, "").replace(/\)$/, "");
    return inner === "" ? [] : splitTop(inner).map(unquote);
  }
  if (op === "is") {
    const v = raw.trim().toLowerCase();
    if (v === "null") return null;
    if (v === "true") return true;
    if (v === "false") return false;
    throw new PgFail("PGRST100", `"failed to parse filter (is.${raw})"`);
  }
  return unquote(raw);
}

function parseLogic(kind: "and" | "or", expr: string): Cond {
  const items: Cond[] = [];
  for (const rawTerm of splitTop(expr)) {
    let term = rawTerm.trim();
    if (!term) continue;
    let neg = false;
    const grp = /^(not\.)?(and|or)\(([\s\S]*)\)$/.exec(term);
    if (grp) {
      const g = parseLogic(grp[2] as "and" | "or", grp[3]);
      items.push(grp[1] && g.t === "group" ? { ...g, neg: true } : g);
      continue;
    }
    const m = /^([^.]+)\.(not\.)?([a-z]+)\.([\s\S]*)$/.exec(term);
    if (!m || !CMP_OPS.includes(m[3])) {
      throw new PgFail("PGRST100", `"failed to parse logic tree ((${expr}))"`, `unexpected "${term}" in logic expression`);
    }
    neg = Boolean(m[2]);
    const op = m[3] as CmpOp;
    term = m[4];
    items.push({ t: "cmp", col: m[1], op, value: parseTermValue(op, term), neg });
  }
  return { t: "group", kind, items, neg: false };
}

const not = (v: Tri): Tri => (v === null ? null : !v);

function compile(cond: Cond, def: TableDef): Pred {
  if (cond.t === "raw") return compile(parseLogic(cond.kind, cond.expr), def);
  if (cond.t === "group") {
    const preds = cond.items.map((c) => compile(c, def));
    const base: Pred =
      cond.kind === "and"
        ? (r) => {
            let unknown = false;
            for (const p of preds) {
              const v = p(r);
              if (v === false) return false;
              if (v === null) unknown = true;
            }
            return unknown ? null : true;
          }
        : (r) => {
            let unknown = false;
            for (const p of preds) {
              const v = p(r);
              if (v === true) return true;
              if (v === null) unknown = true;
            }
            return unknown ? null : false;
          };
    return cond.neg ? (r) => not(base(r)) : base;
  }
  const col: ColDef | undefined = def.cols[cond.col];
  if (!col) throw new PgFail("42703", `column ${def.name}.${cond.col} does not exist`);
  const name = cond.col;
  let pred: Pred;
  switch (cond.op) {
    case "is": {
      const want = cond.value === undefined ? null : cond.value;
      pred = (r) => (want === null ? r[name] === null : r[name] === want);
      break;
    }
    case "in": {
      const list = Array.isArray(cond.value) ? cond.value : [cond.value];
      const targets = list.map((v) => comparable(col, v));
      pred = (r) => (r[name] === null ? null : targets.includes(comparable(col, r[name])));
      break;
    }
    case "like":
    case "ilike": {
      const re = likeToRegex(String(cond.value), cond.op === "ilike");
      pred = (r) => (r[name] === null ? null : typeof r[name] === "string" && re.test(r[name] as string));
      break;
    }
    case "cs": {
      const part = typeof cond.value === "string" && col.type !== "text" ? safeJson(cond.value) : cond.value;
      pred = (r) => (r[name] === null ? null : contains(r[name], part));
      break;
    }
    default: {
      if (cond.value === null || cond.value === undefined) {
        pred = () => null;
        break;
      }
      const target = comparable(col, cond.value);
      const op = cond.op;
      pred = (r) => {
        if (r[name] === null || target === null) return null;
        const cmp = compareValues(comparable(col, r[name]) as string | number | boolean, target);
        switch (op) {
          case "eq": return cmp === 0;
          case "neq": return cmp !== 0;
          case "gt": return cmp > 0;
          case "gte": return cmp >= 0;
          case "lt": return cmp < 0;
          default: return cmp <= 0;
        }
      };
    }
  }
  return cond.neg ? (r) => not(pred(r)) : pred;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

// ------------------------------------------------------------------ constructor

type Op = "select" | "insert" | "update" | "delete" | "upsert";
type Mode = "many" | "single" | "maybe";

export class QueryBuilder implements PromiseLike<QueryResult> {
  private op: Op = "select";
  private returning = true;
  private columns = "*";
  private head = false;
  private wantCount = false;
  private conds: Cond[] = [];
  private orders: Array<{ col: string; asc: boolean; nullsFirst?: boolean }> = [];
  private maxRows: number | null = null;
  private offset = 0;
  private mode: Mode = "many";
  private payload: Row[] = [];
  private patch: Row = {};
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private shouldThrow = false;

  constructor(
    private readonly db: DemoDb,
    private readonly table: string,
  ) {}

  // ---- operaciones
  select(columns?: string, opts?: { count?: "exact" | "planned" | "estimated"; head?: boolean }): this {
    this.columns = columns && columns.trim() !== "" ? columns : "*";
    this.returning = true;
    if (this.op === "select") {
      this.head = Boolean(opts?.head);
      this.wantCount = Boolean(opts?.count);
    }
    return this;
  }
  insert(rows: Row | Row[]): this {
    this.op = "insert";
    this.returning = false;
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(
    rows: Row | Row[],
    opts?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): this {
    this.op = "upsert";
    this.returning = false;
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.upsertOpts = { onConflict: opts?.onConflict, ignoreDuplicates: opts?.ignoreDuplicates };
    return this;
  }
  update(patch: Row): this {
    this.op = "update";
    this.returning = false;
    this.patch = patch;
    return this;
  }
  delete(): this {
    this.op = "delete";
    this.returning = false;
    return this;
  }

  // ---- filtros
  private cmp(col: string, op: CmpOp, value: unknown, neg = false): this {
    this.conds.push({ t: "cmp", col, op, value, neg });
    return this;
  }
  eq(col: string, value: unknown): this { return this.cmp(col, "eq", value); }
  neq(col: string, value: unknown): this { return this.cmp(col, "neq", value); }
  gt(col: string, value: unknown): this { return this.cmp(col, "gt", value); }
  gte(col: string, value: unknown): this { return this.cmp(col, "gte", value); }
  lt(col: string, value: unknown): this { return this.cmp(col, "lt", value); }
  lte(col: string, value: unknown): this { return this.cmp(col, "lte", value); }
  like(col: string, pattern: string): this { return this.cmp(col, "like", pattern); }
  ilike(col: string, pattern: string): this { return this.cmp(col, "ilike", pattern); }
  is(col: string, value: unknown): this { return this.cmp(col, "is", value); }
  in(col: string, values: readonly unknown[]): this { return this.cmp(col, "in", [...values]); }
  contains(col: string, value: unknown): this { return this.cmp(col, "cs", value); }
  not(col: string, op: string, value: unknown): this {
    if (!CMP_OPS.includes(op)) {
      this.conds.push({ t: "raw", kind: "and", expr: `${col}.not.${op}.${String(value)}` });
      return this;
    }
    if (op === "in" && typeof value === "string") {
      this.conds.push({ t: "raw", kind: "and", expr: `${col}.not.in.${value}` });
      return this;
    }
    return this.cmp(col, op as CmpOp, value, true);
  }
  match(query: Record<string, unknown>): this {
    for (const [k, v] of Object.entries(query)) this.eq(k, v);
    return this;
  }
  filter(col: string, op: string, value: unknown): this {
    if (!CMP_OPS.includes(op)) {
      this.conds.push({ t: "raw", kind: "and", expr: `${col}.${op}.${String(value)}` });
      return this;
    }
    if (op === "in" && typeof value === "string") {
      this.conds.push({ t: "raw", kind: "and", expr: `${col}.in.${value}` });
      return this;
    }
    return this.cmp(col, op as CmpOp, value);
  }
  or(expr: string): this {
    this.conds.push({ t: "raw", kind: "or", expr });
    return this;
  }
  and(expr: string): this {
    this.conds.push({ t: "raw", kind: "and", expr });
    return this;
  }

  // ---- modificadores
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.orders.push({ col, asc: opts?.ascending !== false, nullsFirst: opts?.nullsFirst });
    return this;
  }
  limit(n: number): this {
    this.maxRows = n;
    return this;
  }
  range(from: number, to: number): this {
    this.offset = from;
    this.maxRows = Math.max(0, to - from + 1);
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
  throwOnError(): this {
    this.shouldThrow = true;
    return this;
  }
  returns(): this { return this; }
  overrideTypes(): this { return this; }
  abortSignal(): this { return this; }

  // ---- ejecucion
  private sortRows(rows: Row[], def: TableDef): Row[] {
    if (this.orders.length === 0) return rows;
    for (const o of this.orders) {
      if (!(o.col in def.cols)) throw new PgFail("42703", `column ${def.name}.${o.col} does not exist`);
    }
    return [...rows].sort((a, b) => {
      for (const o of this.orders) {
        const col = def.cols[o.col];
        const va = a[o.col] === null ? null : comparable(col, a[o.col]);
        const vb = b[o.col] === null ? null : comparable(col, b[o.col]);
        if (va === null && vb === null) continue;
        // Postgres: ASC deja los NULL al final y DESC al principio, salvo NULLS FIRST/LAST explicito.
        const nullsFirst = o.nullsFirst ?? !o.asc;
        if (va === null) return nullsFirst ? -1 : 1;
        if (vb === null) return nullsFirst ? 1 : -1;
        const c = col.type === "text" ? String(va).localeCompare(String(vb), "es") : compareValues(va, vb);
        if (c !== 0) return o.asc ? c : -c;
      }
      return 0;
    });
  }

  private finish(rows: Row[], def: TableDef, status: number): QueryResult {
    const nodes = parseSelect(this.columns);
    // !inner: descarta las filas sin relacionados (solo en el nivel superior).
    let kept = rows;
    for (const n of nodes) {
      if (n.kind === "rel" && n.inner) {
        const rel = resolveRelation(this.table, n);
        kept = kept.filter((r) => related(this.db, this.table, r, rel).length > 0);
      }
    }
    kept = this.sortRows(kept, def);
    const total = kept.length;
    const count = this.wantCount ? total : null;
    if (this.head) return { data: null, error: null, count, status: 200, statusText: "OK" };
    const end = this.maxRows === null ? undefined : this.offset + this.maxRows;
    const page = kept.slice(this.offset, end);
    const data = page.map((r) => project(this.db, this.table, r, nodes));
    if (this.mode === "many") return { data, error: null, count, status, statusText: "OK" };
    if (data.length === 1) return { data: data[0], error: null, count, status, statusText: "OK" };
    if (data.length === 0 && this.mode === "maybe") return { data: null, error: null, count, status, statusText: "OK" };
    throw new PgFail(
      "PGRST116",
      "JSON object requested, multiple (or no) rows returned",
      `The result contains ${data.length} rows`,
    );
  }

  private exec(): QueryResult {
    const db = this.db;
    const def = db.def(this.table);
    const preds = this.conds.map((c) => compile(c, def));
    const matches = (r: Row): boolean => preds.every((p) => p(r) === true);
    const empty = (status: number): QueryResult => ({ data: null, error: null, count: null, status, statusText: "OK" });

    switch (this.op) {
      case "select":
        return this.finish(db.tables[this.table].filter(matches), def, 200);
      case "insert": {
        const rows = this.payload.map((p) => db.insertRow(this.table, p));
        return this.returning ? this.finish(rows, def, 201) : empty(201);
      }
      case "upsert": {
        const keys = (this.upsertOpts.onConflict ?? "id").split(",").map((k) => k.trim());
        for (const k of keys) {
          if (!(k in def.cols)) throw new PgFail("42703", `column ${this.table}.${k} does not exist`);
        }
        const rows: Row[] = [];
        for (const p of this.payload) {
          const existing = db.tables[this.table].find((r) =>
            keys.every((k) => p[k] !== undefined && p[k] !== null && r[k] === coerceValue(def.cols[k].type, p[k])),
          );
          if (!existing) rows.push(db.insertRow(this.table, p));
          else if (!this.upsertOpts.ignoreDuplicates) {
            db.updateRow(this.table, existing, p);
            rows.push(existing);
          }
        }
        return this.returning ? this.finish(rows, def, 201) : empty(201);
      }
      case "update": {
        const rows = db.tables[this.table].filter(matches);
        for (const r of rows) db.updateRow(this.table, r, this.patch);
        return this.returning ? this.finish(rows, def, 200) : empty(204);
      }
      case "delete": {
        const rows = db.tables[this.table].filter(matches);
        // Se proyecta antes de borrar para que los embeds todavia encuentren sus relacionados.
        const result = this.returning ? this.finish(rows, def, 200) : empty(204);
        db.deleteRows(this.table, rows);
        return result;
      }
    }
  }

  private run(): QueryResult {
    try {
      return this.op === "select" ? this.exec() : this.db.transaction(() => this.exec());
    } catch (e) {
      if (e instanceof PgFail) {
        return { data: null, error: e.toError(), count: null, status: e.code === "PGRST116" ? 406 : 400, statusText: "Error" };
      }
      throw e;
    }
  }

  then<R1 = QueryResult, R2 = never>(
    onfulfilled?: ((value: QueryResult) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve()
      .then(() => {
        const res = this.run();
        if (this.shouldThrow && res.error) throw Object.assign(new Error(res.error.message), res.error);
        return res;
      })
      .then(onfulfilled, onrejected);
  }
}
