// Base en memoria que imita el cliente de supabase-js (rol service role, sin RLS).
// Emula defaults, NOT NULL, CHECK, UNIQUE, FKs con ON DELETE y los triggers de las migraciones
// 001/006/007 (updated_at, correlativo de presupuestos, coherencia de organizacion).
import type { SupabaseClient } from "@supabase/supabase-js";
import { QueryBuilder } from "./query";
import { INDUSTRIES, SCHEMA, TABLE_ORDER, type Row, type TableDef } from "./schema";
import { coerceValue, isUuid, PgFail } from "./values";

export interface DemoDbOptions {
  // Reloj inyectable (por defecto la hora real). Define created_at/updated_at.
  now?: () => Date;
  // Generador de uuid inyectable (por defecto crypto.randomUUID).
  uuid?: () => string;
}

export interface AuthUser {
  id: string;
  aud: string;
  role: string;
  email: string;
  email_confirmed_at: string | null;
  phone: string;
  confirmed_at: string | null;
  last_sign_in_at: string | null;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  identities: unknown[];
  created_at: string;
  updated_at: string;
}

export interface AuthUserAttrs {
  id?: string;
  email?: string;
  password?: string;
  email_confirm?: boolean;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  created_at?: string;
}

export class DemoAuthError extends Error {
  readonly __isAuthError = true;
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}

type AuthResult = { data: { user: AuthUser | null }; error: DemoAuthError | null };

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export class DemoDb {
  tables: Record<string, Row[]> = {};
  authUsers: AuthUser[] = [];
  readonly now: () => Date;
  readonly uuid: () => string;

  readonly auth: {
    admin: {
      getUserById: (id: string) => Promise<AuthResult>;
      createUser: (attrs: AuthUserAttrs) => Promise<AuthResult>;
      deleteUser: (id: string) => Promise<AuthResult>;
      updateUserById: (id: string, attrs: AuthUserAttrs) => Promise<AuthResult>;
      listUsers: (params?: { page?: number; perPage?: number }) => Promise<{
        data: { users: AuthUser[]; aud: string; nextPage: number | null; lastPage: number; total: number };
        error: null;
      }>;
    };
  };

  constructor(opts: DemoDbOptions = {}) {
    this.now = opts.now ?? (() => new Date());
    this.uuid = opts.uuid ?? (() => crypto.randomUUID());
    this.clear();
    this.auth = {
      admin: {
        getUserById: async (id) => this.getUserById(id),
        createUser: async (attrs) => this.createUser(attrs),
        deleteUser: async (id) => this.deleteUser(id),
        updateUserById: async (id, attrs) => this.updateUserById(id, attrs),
        listUsers: async (params) => this.listUsers(params),
      },
    };
  }

  // Vacia todas las tablas y usuarios de auth (la instancia sigue siendo la misma).
  clear(): void {
    this.tables = {};
    for (const name of TABLE_ORDER) this.tables[name] = [];
    this.authUsers = [];
  }

  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }

  // Copia profunda del estado (para pruebas).
  dump(): Record<string, Row[]> {
    return structuredClone(this.tables);
  }

  from(table: string): QueryBuilder {
    return new QueryBuilder(this, table);
  }

  rpc(fn: string): PromiseLike<{ data: null; error: { message: string; details: null; hint: null; code: string }; count: null; status: number; statusText: string }> {
    const result = {
      data: null,
      error: { message: `Could not find the function public.${fn} in the schema cache`, details: null, hint: null, code: "PGRST202" },
      count: null,
      status: 404,
      statusText: "Not Found",
    };
    return Promise.resolve(result);
  }

  def(table: string): TableDef {
    const def = SCHEMA[table];
    if (!def) {
      throw new PgFail("PGRST205", `Could not find the table 'public.${table}' in the schema cache`);
    }
    return def;
  }

  // Ejecuta fn de forma atomica: si lanza, el estado vuelve a como estaba.
  transaction<T>(fn: () => T): T {
    const saved = { tables: structuredClone(this.tables), auth: structuredClone(this.authUsers) };
    try {
      return fn();
    } catch (e) {
      this.tables = saved.tables;
      this.authUsers = saved.auth;
      throw e;
    }
  }

  // ---------------------------------------------------------------- escritura de filas

  insertRow(table: string, input: Row): Row {
    const def = this.def(table);
    for (const k of Object.keys(input)) {
      if (input[k] !== undefined && !(k in def.cols)) {
        throw new PgFail("PGRST204", `Could not find the '${k}' column of '${table}' in the schema cache`);
      }
    }
    const row: Row = {};
    for (const [name, col] of Object.entries(def.cols)) {
      const raw = input[name];
      const value = raw === undefined ? (col.def ? col.def({ now: this.now, uuid: this.uuid }) : null) : raw;
      row[name] = coerceValue(col.type, value);
    }
    this.beforeInsert(table, row);
    this.checkRow(def, row, null);
    this.tables[table].push(row);
    return row;
  }

  // Modifica la fila en sitio (misma referencia interna) tras validar todo.
  updateRow(table: string, row: Row, patch: Row): void {
    const def = this.def(table);
    const next: Row = { ...row };
    const changed: string[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      const col = def.cols[k];
      if (!col) throw new PgFail("PGRST204", `Could not find the '${k}' column of '${table}' in the schema cache`);
      next[k] = coerceValue(col.type, v);
      changed.push(k);
    }
    if (changed.length === 0) return;
    this.beforeUpdate(table, row, next, changed);
    this.checkRow(def, next, row);
    Object.assign(row, next);
  }

  deleteRows(table: string, rows: Row[]): void {
    for (const row of rows) {
      const arr = this.tables[table];
      const i = arr.indexOf(row);
      if (i < 0) continue;
      arr.splice(i, 1);
      for (const [childName, childDef] of Object.entries(SCHEMA)) {
        for (const fk of childDef.fks) {
          if (fk.ref !== table) continue;
          const kids = this.tables[childName].filter((k) => k[fk.col] === row.id);
          if (kids.length === 0) continue;
          if (fk.onDelete === "cascade") this.deleteRows(childName, kids);
          else for (const k of kids) k[fk.col] = null;
        }
      }
    }
  }

  // ---------------------------------------------------------------- restricciones

  private checkRow(def: TableDef, row: Row, self: Row | null): void {
    const table = def.name;
    for (const [name, col] of Object.entries(def.cols)) {
      if (col.notNull && row[name] === null) {
        throw new PgFail(
          "23502",
          `null value in column "${name}" of relation "${table}" violates not-null constraint`,
          `Failing row contains (${Object.values(row).map((v) => (v === null ? "null" : String(v))).join(", ")}).`,
        );
      }
    }
    for (const [name, col] of Object.entries(def.cols)) {
      if (col.values && row[name] !== null && !col.values.includes(row[name] as string)) {
        throw new PgFail("23514", `new row for relation "${table}" violates check constraint "${table}_${name}_check"`);
      }
    }
    for (const chk of def.checks) {
      if (!chk.test(row)) {
        throw new PgFail("23514", `new row for relation "${table}" violates check constraint "${chk.name}"`);
      }
    }
    const uniques = [...def.unique];
    if ("id" in def.cols) uniques.push({ name: `${table}_pkey`, cols: ["id"] });
    for (const u of uniques) {
      const vals = u.cols.map((c) => row[c]);
      if (vals.some((v) => v === null)) continue;
      const clash = this.tables[table].some((r) => r !== self && u.cols.every((c, i) => r[c] === vals[i]));
      if (clash) {
        throw new PgFail(
          "23505",
          `duplicate key value violates unique constraint "${u.name}"`,
          `Key (${u.cols.join(", ")})=(${vals.join(", ")}) already exists.`,
        );
      }
    }
    for (const fk of def.fks) {
      const v = row[fk.col];
      if (v === null) continue;
      if (!this.tables[fk.ref].some((r) => r.id === v)) {
        throw new PgFail(
          "23503",
          `insert or update on table "${table}" violates foreign key constraint "${table}_${fk.col}_fkey"`,
          `Key (${fk.col})=(${String(v)}) is not present in table "${fk.ref}".`,
        );
      }
    }
  }

  // ---------------------------------------------------------------- triggers

  // assert_same_org (migracion 007): la referencia debe existir y ser de la misma organizacion.
  private assertSameOrg(refTable: string, refId: unknown, org: unknown): void {
    if (refId === null || refId === undefined) return;
    const ref = this.tables[refTable].find((r) => r.id === refId);
    if (!ref || ref.organization_id !== org) {
      throw new PgFail(
        "23514",
        `Referencia ${refTable} ${String(refId)} no pertenece a la organizacion ${String(org)}`,
      );
    }
  }

  private beforeInsert(table: string, row: Row): void {
    const org = row.organization_id;
    switch (table) {
      case "budgets":
        this.assignBudgetNumber(row);
        this.budgetsCheckOrg(row);
        break;
      case "budget_members":
        this.budgetMembersCheckOrg(row);
        break;
      case "budget_services":
        this.budgetServicesCheckOrg(row);
        break;
      case "bookings":
        this.assertSameOrg("contacts", row.contact_id, org);
        this.assertSameOrg("items", row.item_id, org);
        break;
      case "activities":
        this.assertSameOrg("contacts", row.contact_id, org);
        this.assertSameOrg("opportunities", row.opportunity_id, org);
        this.assertSameOrg("bookings", row.booking_id, org);
        break;
      case "opportunities":
        this.assertSameOrg("contacts", row.contact_id, org);
        break;
    }
  }

  private beforeUpdate(table: string, old: Row, next: Row, changed: string[]): void {
    const touches = (...cols: string[]): boolean => cols.some((c) => changed.includes(c));
    const org = next.organization_id;
    switch (table) {
      case "budgets":
        if (next.organization_id !== old.organization_id) {
          throw new PgFail("P0001", "budgets.organization_id no se puede cambiar");
        }
        next.budget_number = old.budget_number;
        if (touches("organization_id", "responsible_id")) this.budgetsCheckOrg(next);
        break;
      case "budget_members":
        if (touches("organization_id", "budget_id")) this.budgetMembersCheckOrg(next);
        break;
      case "budget_services":
        if (touches("organization_id", "budget_member_id", "service_id")) this.budgetServicesCheckOrg(next);
        break;
      case "bookings":
        if (touches("organization_id", "contact_id", "item_id")) {
          this.assertSameOrg("contacts", next.contact_id, org);
          this.assertSameOrg("items", next.item_id, org);
        }
        break;
      case "activities":
        if (touches("organization_id", "contact_id", "opportunity_id", "booking_id")) {
          this.assertSameOrg("contacts", next.contact_id, org);
          this.assertSameOrg("opportunities", next.opportunity_id, org);
          this.assertSameOrg("bookings", next.booking_id, org);
        }
        break;
      case "opportunities":
        if (touches("organization_id", "contact_id")) this.assertSameOrg("contacts", next.contact_id, org);
        break;
    }
    // update_updated_at(): siempre sobrescribe lo que envie el cliente.
    if (this.def(table).updatedAt) next.updated_at = this.now().toISOString();
  }

  // budgets_assign_number: correlativo por organizacion; ignora el valor enviado.
  private assignBudgetNumber(row: Row): void {
    const org = row.organization_id;
    if (org === null) return; // lo reporta el NOT NULL
    const counter = this.tables.budget_counters.find((c) => c.organization_id === org);
    let next: number;
    if (counter) {
      next = (counter.last_number as number) + 1;
      counter.last_number = next;
    } else {
      this.insertRow("budget_counters", { organization_id: org, last_number: 1 });
      next = 1;
    }
    row.budget_number = `PRES-${String(next).padStart(4, "0")}`;
  }

  private budgetsCheckOrg(row: Row): void {
    const rid = row.responsible_id;
    if (rid === null) return;
    const ok = this.tables.contacts.some((c) => c.id === rid && c.organization_id === row.organization_id);
    if (!ok) {
      throw new PgFail("P0001", `responsible_id ${String(rid)} no pertenece a la organizacion ${String(row.organization_id)}`);
    }
  }

  private budgetMembersCheckOrg(row: Row): void {
    const ok = this.tables.budgets.some((b) => b.id === row.budget_id && b.organization_id === row.organization_id);
    if (!ok) {
      throw new PgFail("P0001", `budget_id ${String(row.budget_id)} no pertenece a la organizacion ${String(row.organization_id)}`);
    }
  }

  private budgetServicesCheckOrg(row: Row): void {
    const member = this.tables.budget_members.some(
      (m) => m.id === row.budget_member_id && m.organization_id === row.organization_id,
    );
    if (!member) {
      throw new PgFail(
        "P0001",
        `budget_member_id ${String(row.budget_member_id)} no pertenece a la organizacion ${String(row.organization_id)}`,
      );
    }
    if (row.service_id !== null) {
      const item = this.tables.items.some((i) => i.id === row.service_id && i.organization_id === row.organization_id);
      if (!item) {
        throw new PgFail("P0001", `service_id ${String(row.service_id)} no pertenece a la organizacion ${String(row.organization_id)}`);
      }
    }
  }

  // ---------------------------------------------------------------- auth.admin

  private publicUser(u: AuthUser): AuthUser {
    return structuredClone(u);
  }

  private notFound(): DemoAuthError {
    return new DemoAuthError("User not found", 404, "user_not_found");
  }

  private getUserById(id: string): AuthResult {
    const u = isUuid(id) ? this.authUsers.find((x) => x.id === id.toLowerCase()) : undefined;
    if (!u) return { data: { user: null }, error: this.notFound() };
    return { data: { user: this.publicUser(u) }, error: null };
  }

  private buildAuthUser(attrs: AuthUserAttrs): AuthUser {
    const email = str(attrs.email)?.toLowerCase();
    if (!email) throw new DemoAuthError("To create a user, an email or phone must be provided", 400, "validation_failed");
    if (attrs.password !== undefined && attrs.password.length < 6) {
      throw new DemoAuthError("Password should be at least 6 characters.", 422, "weak_password");
    }
    if (this.authUsers.some((u) => u.email === email)) {
      throw new DemoAuthError("A user with this email address has already been registered", 422, "email_exists");
    }
    const id = attrs.id ?? this.uuid();
    if (!isUuid(id)) throw new DemoAuthError("Invalid user id", 400, "validation_failed");
    if (this.authUsers.some((u) => u.id === id.toLowerCase())) {
      throw new DemoAuthError("A user with this id already exists", 422, "user_already_exists");
    }
    const ts = attrs.created_at ?? this.now().toISOString();
    const confirmed = attrs.email_confirm === false ? null : ts;
    return {
      id: id.toLowerCase(),
      aud: "authenticated",
      role: "authenticated",
      email,
      email_confirmed_at: confirmed,
      phone: "",
      confirmed_at: confirmed,
      last_sign_in_at: null,
      app_metadata: { provider: "email", providers: ["email"], ...(attrs.app_metadata ?? {}) },
      user_metadata: structuredClone(attrs.user_metadata ?? {}),
      identities: [],
      created_at: ts,
      updated_at: ts,
    };
  }

  // Alta con el trigger handle_new_user (migracion 004): crea la fila en public.users y,
  // para role 'admin', tambien la organizacion nueva.
  private createUser(attrs: AuthUserAttrs): AuthResult {
    try {
      const user = this.transaction(() => {
        const created = this.buildAuthUser(attrs);
        this.authUsers.push(created);
        this.handleNewUser(created);
        return created;
      });
      return { data: { user: this.publicUser(user) }, error: null };
    } catch (e) {
      if (e instanceof DemoAuthError) return { data: { user: null }, error: e };
      if (e instanceof PgFail) {
        return { data: { user: null }, error: new DemoAuthError("Database error creating new user", 500, "unexpected_failure") };
      }
      throw e;
    }
  }

  private handleNewUser(user: AuthUser): void {
    const meta = user.user_metadata;
    const role = typeof meta.role === "string" ? meta.role : "admin";
    let clinicId: unknown;
    let organizationId: unknown;
    if (role === "admin") {
      const wanted = str(meta.industry) ?? "general";
      const industry = (INDUSTRIES as readonly string[]).includes(wanted) ? wanted : "general";
      const org = this.insertRow("organizations", {
        name: str(meta.clinic_name) ?? "Sin nombre",
        industry,
        phone: str(meta.clinic_phone),
        email: str(meta.clinic_email),
        plan: "starter",
      });
      clinicId = org.id;
      organizationId = org.id;
    } else {
      clinicId = meta.clinic_id ?? meta.organization_id ?? null;
      organizationId = meta.organization_id ?? clinicId;
    }
    this.insertRow("users", {
      id: user.id,
      clinic_id: clinicId,
      organization_id: organizationId,
      full_name: str(meta.full_name) ?? "",
      role,
      created_at: user.created_at,
    });
  }

  // Alta de un usuario de auth SIN el trigger (para sembrar datos con ids fijos).
  seedAuthUser(attrs: AuthUserAttrs): AuthUser {
    const user = this.buildAuthUser(attrs);
    this.authUsers.push(user);
    return this.publicUser(user);
  }

  private deleteUser(id: string): AuthResult {
    const u = isUuid(id) ? this.authUsers.find((x) => x.id === id.toLowerCase()) : undefined;
    if (!u) return { data: { user: null }, error: this.notFound() };
    this.transaction(() => {
      this.authUsers = this.authUsers.filter((x) => x !== u);
      // public.users.id REFERENCES auth.users ON DELETE CASCADE
      this.deleteRows("users", this.tables.users.filter((p) => p.id === u.id));
    });
    return { data: { user: null }, error: null };
  }

  private updateUserById(id: string, attrs: AuthUserAttrs): AuthResult {
    const u = isUuid(id) ? this.authUsers.find((x) => x.id === id.toLowerCase()) : undefined;
    if (!u) return { data: { user: null }, error: this.notFound() };
    const email = str(attrs.email)?.toLowerCase();
    if (email && email !== u.email) {
      if (this.authUsers.some((x) => x.email === email)) {
        return {
          data: { user: null },
          error: new DemoAuthError("A user with this email address has already been registered", 422, "email_exists"),
        };
      }
      u.email = email;
    }
    if (attrs.user_metadata) u.user_metadata = { ...u.user_metadata, ...structuredClone(attrs.user_metadata) };
    if (attrs.app_metadata) u.app_metadata = { ...u.app_metadata, ...structuredClone(attrs.app_metadata) };
    u.updated_at = this.now().toISOString();
    return { data: { user: this.publicUser(u) }, error: null };
  }

  private listUsers(params: { page?: number; perPage?: number } = {}) {
    const page = Math.max(1, params.page ?? 1);
    const perPage = Math.max(1, params.perPage ?? 50);
    const total = this.authUsers.length;
    const lastPage = Math.max(1, Math.ceil(total / perPage));
    const users = this.authUsers.slice((page - 1) * perPage, page * perPage).map((u) => this.publicUser(u));
    return {
      data: { users, aud: "authenticated", nextPage: page < lastPage ? page + 1 : null, lastPage, total },
      error: null as null,
    };
  }
}
