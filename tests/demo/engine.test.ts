import { beforeEach, describe, expect, it } from "vitest";
import { DemoDb, type Row } from "@/lib/demo/engine";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";
const uid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let clock = NOW.getTime();
let counter = 0;
let db: DemoDb;

beforeEach(() => {
  clock = NOW.getTime();
  counter = 0;
  db = new DemoDb({ now: () => new Date(clock), uuid: () => uid(9000 + ++counter) });
});

async function must<T = Row>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

async function org(id: string, name = "Org"): Promise<void> {
  await must(db.from("organizations").insert({ id, name, industry: "health" }));
}

async function contact(id: string, organization_id: string, full_name: string, extra: Row = {}): Promise<Row> {
  return must(db.from("contacts").insert({ id, organization_id, full_name, ...extra }).select().single());
}

describe("insert, defaults y copias", () => {
  it("aplica defaults de organizations (plan, settings, ids y fechas)", async () => {
    const row = await must<Row>(db.from("organizations").insert({ name: "Mi org", industry: "retail" }).select().single());
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.plan).toBe("standard");
    expect(row.created_at).toBe(NOW.toISOString());
    expect(row.updated_at).toBe(NOW.toISOString());
    expect(row.settings).toEqual({
      active_modules: ["contacts", "bookings", "pipeline", "activities"],
      business_hours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
      agent_autonomy: "balanced",
    });
  });

  it("insert sin select no devuelve datos y acepta arreglos", async () => {
    await org(A);
    const res = await db.from("contacts").insert([
      { organization_id: A, full_name: "Uno" },
      { organization_id: A, full_name: "Dos" },
    ]);
    expect(res.error).toBeNull();
    expect(res.data).toBeNull();
    const all = await must<Row[]>(db.from("contacts").select("*"));
    expect(all.map((c) => c.full_name)).toEqual(["Uno", "Dos"]);
    expect(all[0].tags).toEqual([]);
    expect(all[0].source).toBe("manual");
  });

  it("los objetos devueltos son copias, no referencias al estado interno", async () => {
    await org(A);
    const created = await contact(uid(1), A, "Ana", { tags: ["x"], custom_fields: { a: { b: 1 } } });
    (created.tags as string[]).push("mutado");
    (created.custom_fields as { a: { b: number } }).a.b = 99;
    const fetched = await must<Row>(db.from("contacts").select("*").eq("id", uid(1)).single());
    expect(fetched.tags).toEqual(["x"]);
    expect(fetched.custom_fields).toEqual({ a: { b: 1 } });
    (fetched.tags as string[]).push("otra");
    const again = await must<Row>(db.from("contacts").select("*").eq("id", uid(1)).single());
    expect(again.tags).toEqual(["x"]);
  });

  it("el payload insertado tampoco queda enlazado", async () => {
    await org(A);
    const payload = { organization_id: A, full_name: "Ana", tags: ["a"] };
    await must(db.from("contacts").insert(payload));
    payload.tags.push("b");
    const row = await must<Row>(db.from("contacts").select("tags").single());
    expect(row.tags).toEqual(["a"]);
  });

  it("normaliza numeric a 2 decimales y timestamps a ISO UTC", async () => {
    await org(A);
    const item = await must<Row>(db.from("items").insert({ organization_id: A, name: "S", price: "10.456" }).select().single());
    expect(item.price).toBe(10.46);
    await contact(uid(1), A, "Ana");
    const b = await must<Row>(
      db.from("bookings").insert({ organization_id: A, contact_id: uid(1), scheduled_at: "2026-10-20T10:00:00+02:00" }).select().single(),
    );
    expect(b.scheduled_at).toBe("2026-10-20T08:00:00.000Z");
    expect(b.duration_minutes).toBe(30);
    expect(b.status).toBe("pending");
  });
});

describe("constraints", () => {
  it("NOT NULL (23502) y columna desconocida (PGRST204)", async () => {
    await org(A);
    const nn = await db.from("contacts").insert({ organization_id: A });
    expect(nn.error?.code).toBe("23502");
    expect(nn.error?.message).toContain("full_name");
    const unk = await db.from("contacts").insert({ organization_id: A, full_name: "X", nope: 1 });
    expect(unk.error?.code).toBe("PGRST204");
    const nullOrg = await db.from("contacts").insert({ organization_id: null, full_name: "X" });
    expect(nullOrg.error?.code).toBe("23502");
  });

  it("CHECK de enums en todas las tablas v2 (insert y update)", async () => {
    await org(A);
    await contact(uid(1), A, "Ana");
    const bad = async (table: string, row: Row): Promise<string | undefined> =>
      (await db.from(table).insert(row)).error?.code;
    expect(await bad("organizations", { name: "X", industry: "otra" })).toBe("23514");
    expect(await bad("organizations", { name: "X", industry: "health", plan: "gold" })).toBe("23514");
    expect(await bad("contacts", { organization_id: A, full_name: "X", source: "tiktok" })).toBe("23514");
    expect(await bad("items", { organization_id: A, name: "X", type: "otro" })).toBe("23514");
    expect(await bad("opportunities", { organization_id: A, title: "X", stage: "ganada" })).toBe("23514");
    expect(await bad("opportunities", { organization_id: A, title: "X", stage: "lead", probability: 101 })).toBe("23514");
    expect(await bad("bookings", { organization_id: A, scheduled_at: NOW.toISOString(), status: "done" })).toBe("23514");
    expect(await bad("bookings", { organization_id: A, scheduled_at: NOW.toISOString(), source: "fax" })).toBe("23514");
    expect(await bad("activities", { organization_id: A, type: "email", title: "X", performed_by_type: "human", performed_by_id: "u" })).toBe("23514");
    expect(await bad("activities", { organization_id: A, type: "note", title: "X", performed_by_type: "bot", performed_by_id: "u" })).toBe("23514");
    expect(await bad("agent_actions", { organization_id: A, agent_name: "x", action_type: "t", payload: {} })).toBe("23514");
    expect(await bad("agent_actions", { organization_id: A, agent_name: "sales", action_type: "t", payload: {}, status: "x" })).toBe("23514");
    expect(await bad("users", { id: uid(5), clinic_id: A, role: "root" })).toBe("23514");
    const upd = await db.from("contacts").update({ source: "tiktok" }).eq("id", uid(1));
    expect(upd.error?.code).toBe("23514");
    const unchanged = await must<Row>(db.from("contacts").select("source").eq("id", uid(1)).single());
    expect(unchanged.source).toBe("manual");
  });

  it("UNIQUE de subdomain (los NULL no chocan)", async () => {
    await must(db.from("organizations").insert({ name: "A", industry: "retail" }));
    await must(db.from("organizations").insert({ name: "B", industry: "retail" }));
    await must(db.from("organizations").insert({ name: "C", industry: "retail", subdomain: "uno" }));
    const dup = await db.from("organizations").insert({ name: "D", industry: "retail", subdomain: "uno" });
    expect(dup.error?.code).toBe("23505");
  });

  it("FK inexistente (23503) y uuid invalido (22P02)", async () => {
    await org(A);
    const fk = await db.from("opportunities").insert({ organization_id: A, title: "X", stage: "lead", assigned_to: uid(77) });
    expect(fk.error?.code).toBe("23503");
    const badOrg = await db.from("contacts").insert({ organization_id: uid(55), full_name: "X" });
    expect(badOrg.error?.code).toBe("23503");
    const badUuid = await db.from("contacts").select("*").eq("id", "no-es-uuid");
    expect(badUuid.error?.code).toBe("22P02");
  });

  it("insert multiple es atomico: si una fila falla no queda ninguna", async () => {
    await org(A);
    const res = await db.from("contacts").insert([
      { organization_id: A, full_name: "Ok" },
      { organization_id: A },
    ]);
    expect(res.error).not.toBeNull();
    const all = await must<Row[]>(db.from("contacts").select("*"));
    expect(all).toHaveLength(0);
  });
});

describe("trigger update_updated_at", () => {
  it("actualiza updated_at en cada update y no en insert", async () => {
    await org(A);
    await contact(uid(1), A, "Ana");
    clock += 60_000;
    const u = await must<Row>(db.from("contacts").update({ notes: "n" }).eq("id", uid(1)).select().single());
    expect(u.created_at).toBe(NOW.toISOString());
    expect(u.updated_at).toBe(new Date(clock).toISOString());
  });

  it("ignora un updated_at enviado por el cliente", async () => {
    await org(A);
    const bud = await must<Row>(
      db.from("budgets").insert({ organization_id: A, responsible_name: "R", expires_at: NOW.toISOString() }).select().single(),
    );
    clock += 1000;
    const u = await must<Row>(
      db.from("budgets").update({ status: "accepted", updated_at: "2000-01-01T00:00:00.000Z" }).eq("id", bud.id).select().single(),
    );
    expect(u.updated_at).toBe(new Date(clock).toISOString());
  });
});

describe("filtros", () => {
  beforeEach(async () => {
    await org(A);
    await org(B, "Otra");
    await contact(uid(1), A, "Maria Lopez", { phone: "+52 55 1111", email: "maria@a.mx", source: "web" });
    await contact(uid(2), A, "Juan 100% Perez_Jr", { phone: "+52 55 2222", email: null, source: "whatsapp" });
    await contact(uid(3), A, "Ana Maria", { phone: null, email: "ana@a.mx" });
    await contact(uid(4), B, "Maria Ajena");
  });

  const names = async (q: PromiseLike<{ data: unknown; error: unknown }>): Promise<string[]> =>
    ((await must<Row[]>(q as never)) ?? []).map((r) => r.full_name as string);

  it("eq, neq, in", async () => {
    expect(await names(db.from("contacts").select("*").eq("organization_id", A).eq("source", "web"))).toEqual(["Maria Lopez"]);
    expect(await names(db.from("contacts").select("*").eq("organization_id", A).neq("source", "manual"))).toEqual(["Maria Lopez", "Juan 100% Perez_Jr"]);
    expect(await names(db.from("contacts").select("*").in("id", [uid(1), uid(4)]))).toEqual(["Maria Lopez", "Maria Ajena"]);
    expect(await names(db.from("contacts").select("*").in("id", []))).toEqual([]);
  });

  it("is null / is true", async () => {
    expect(await names(db.from("contacts").select("*").eq("organization_id", A).is("email", null))).toEqual(["Juan 100% Perez_Jr"]);
    expect(await names(db.from("contacts").select("*").eq("organization_id", A).not("phone", "is", null))).toEqual(["Maria Lopez", "Juan 100% Perez_Jr"]);
    const items = db.from("items");
    await must(items.insert([{ organization_id: A, name: "a" }, { organization_id: A, name: "b", active: false }]));
    const act = await must<Row[]>(db.from("items").select("name").is("active", true));
    expect(act.map((r) => r.name)).toEqual(["a"]);
  });

  it("ilike con %, sin distinguir mayusculas", async () => {
    expect(await names(db.from("contacts").select("*").eq("organization_id", A).ilike("full_name", "%MARIA%"))).toEqual(["Maria Lopez", "Ana Maria"]);
    expect(await names(db.from("contacts").select("*").eq("organization_id", A).ilike("full_name", "maria%"))).toEqual(["Maria Lopez"]);
    expect(await names(db.from("contacts").select("*").eq("organization_id", A).like("full_name", "%maria%"))).toEqual([]);
  });

  it("ilike con escapes \\% \\_ \\\\", async () => {
    expect(await names(db.from("contacts").select("*").ilike("full_name", "%100\\%%"))).toEqual(["Juan 100% Perez_Jr"]);
    expect(await names(db.from("contacts").select("*").ilike("full_name", "%100%%"))).toEqual(["Juan 100% Perez_Jr"]);
    expect(await names(db.from("contacts").select("*").ilike("full_name", "%z\\_jr"))).toEqual(["Juan 100% Perez_Jr"]);
    expect(await names(db.from("contacts").select("*").ilike("full_name", "%z_jr"))).toEqual(["Juan 100% Perez_Jr"]);
    expect(await names(db.from("contacts").select("*").ilike("full_name", "%za\\_jr"))).toEqual([]);
    await contact(uid(5), A, "Ruta C:\\temp");
    expect(await names(db.from("contacts").select("*").ilike("full_name", "%c:\\\\temp"))).toEqual(["Ruta C:\\temp"]);
  });

  it("or con ilike y eq, valores entrecomillados y escapes", async () => {
    expect(await names(db.from("contacts").select("*").eq("organization_id", A).or("full_name.ilike.%lopez%,phone.ilike.%2222%"))).toEqual([
      "Maria Lopez",
      "Juan 100% Perez_Jr",
    ]);
    expect(await names(db.from("contacts").select("*").or("email.eq.ana@a.mx,source.eq.web"))).toEqual(["Maria Lopez", "Ana Maria"]);
    expect(await names(db.from("contacts").select("*").or('full_name.ilike."%100\\\\%%",email.eq."x,y"'))).toEqual(["Juan 100% Perez_Jr"]);
    expect(await names(db.from("contacts").select("*").or("and(source.eq.web,email.ilike.%a.mx),full_name.eq.Ana Maria"))).toEqual([
      "Maria Lopez",
      "Ana Maria",
    ]);
    expect(await names(db.from("contacts").select("*").or("phone.is.null,email.is.null"))).toEqual(["Juan 100% Perez_Jr", "Ana Maria", "Maria Ajena"]);
    const bad = await db.from("contacts").select("*").or("full_name.zzz.x");
    expect(bad.error?.code).toBe("PGRST100");
  });

  it("gt, gte, lt, lte sobre timestamps (zonas distintas) y numeros", async () => {
    await contact(uid(6), A, "Vieja", { created_at: "2026-09-01T00:00:00.000Z" });
    await must(
      db.from("bookings").insert([
        { organization_id: A, scheduled_at: "2026-10-14T10:00:00.000Z" },
        { organization_id: A, scheduled_at: "2026-10-14T12:00:00.000Z" },
        { organization_id: A, scheduled_at: "2026-10-14T14:00:00.000Z" },
      ]),
    );
    const at = async (q: PromiseLike<{ data: unknown; error: unknown }>): Promise<string[]> =>
      (await must<Row[]>(q as never)).map((r) => (r.scheduled_at as string).slice(11, 16));
    expect(await at(db.from("bookings").select("*").gte("scheduled_at", "2026-10-14T12:00:00.000Z"))).toEqual(["12:00", "14:00"]);
    expect(await at(db.from("bookings").select("*").gt("scheduled_at", "2026-10-14T12:00:00.000Z"))).toEqual(["14:00"]);
    expect(await at(db.from("bookings").select("*").lt("scheduled_at", "2026-10-14T14:00:00+00:00"))).toEqual(["10:00", "12:00"]);
    expect(await at(db.from("bookings").select("*").lte("scheduled_at", "2026-10-14T14:00:00+02:00"))).toEqual(["10:00", "12:00"]);
    await must(db.from("items").insert([{ organization_id: A, name: "i1", price: 5 }, { organization_id: A, name: "i2", price: 15 }]));
    const cheap = await must<Row[]>(db.from("items").select("name").lte("price", 10));
    expect(cheap.map((r) => r.name)).toEqual(["i1"]);
  });

  it("not(...), contains y match", async () => {
    expect(await names(db.from("contacts").select("*").eq("organization_id", A).not("source", "eq", "manual"))).toEqual(["Maria Lopez", "Juan 100% Perez_Jr"]);
    await must(db.from("contacts").update({ tags: ["vip", "x"] }).eq("id", uid(1)));
    expect(await names(db.from("contacts").select("*").contains("tags", ["vip"]))).toEqual(["Maria Lopez"]);
    expect(await names(db.from("contacts").select("*").match({ organization_id: A, source: "web" }))).toEqual(["Maria Lopez"]);
  });

  it("columna inexistente en un filtro da 42703", async () => {
    const r = await db.from("contacts").select("*").eq("nada", 1);
    expect(r.error?.code).toBe("42703");
  });
});

describe("order, limit, range, count, head", () => {
  beforeEach(async () => {
    await org(A);
    for (const [i, n] of Array.from(["Beto", "ana", "Carla", "Dario"].entries())) {
      await contact(uid(i + 1), A, n, { created_at: `2026-10-0${i + 1}T00:00:00.000Z`, phone: i === 3 ? null : `${i}` });
    }
  });
  const names = async (q: PromiseLike<{ data: unknown; error: unknown }>): Promise<string[]> =>
    (await must<Row[]>(q as never)).map((r) => r.full_name as string);

  it("order asc/desc (texto insensible a mayusculas en el orden) y por fecha", async () => {
    expect(await names(db.from("contacts").select("*").order("full_name", { ascending: true }))).toEqual(["ana", "Beto", "Carla", "Dario"]);
    expect(await names(db.from("contacts").select("*").order("created_at", { ascending: false }))).toEqual(["Dario", "Carla", "ana", "Beto"]);
  });

  it("order por varias columnas y NULLs: asc al final, desc al principio", async () => {
    expect(await names(db.from("contacts").select("*").order("phone", { ascending: true }))).toEqual(["Beto", "ana", "Carla", "Dario"]);
    expect(await names(db.from("contacts").select("*").order("phone", { ascending: false }))).toEqual(["Dario", "Carla", "ana", "Beto"]);
    expect(await names(db.from("contacts").select("*").order("phone", { ascending: true, nullsFirst: true }))).toEqual(["Dario", "Beto", "ana", "Carla"]);
    expect(await names(db.from("contacts").select("*").order("source").order("full_name", { ascending: false }))).toEqual(["Dario", "Carla", "Beto", "ana"]);
  });

  it("limit y range", async () => {
    expect(await names(db.from("contacts").select("*").order("created_at").limit(2))).toEqual(["Beto", "ana"]);
    expect(await names(db.from("contacts").select("*").order("created_at").range(1, 2))).toEqual(["ana", "Carla"]);
  });

  it("count exact con y sin head", async () => {
    const head = await db.from("contacts").select("id", { count: "exact", head: true }).ilike("full_name", "%a%");
    expect(head.error).toBeNull();
    expect(head.data).toBeNull();
    expect(head.count).toBe(3);
    const withData = await db.from("contacts").select("id", { count: "exact" }).limit(1);
    expect(withData.count).toBe(4);
    expect(withData.data).toHaveLength(1);
    const noCount = await db.from("contacts").select("id");
    expect(noCount.count).toBeNull();
  });

  it("select de columnas especificas y columna inexistente", async () => {
    const rows = await must<Row[]>(db.from("contacts").select("id, full_name").limit(1));
    expect(Object.keys(rows[0])).toEqual(["id", "full_name"]);
    const bad = await db.from("contacts").select("id, nada");
    expect(bad.error?.code).toBe("42703");
  });
});

describe("single y maybeSingle", () => {
  beforeEach(async () => {
    await org(A);
    await contact(uid(1), A, "Ana");
    await contact(uid(2), A, "Ana");
  });

  it("single: una fila ok; cero o varias dan PGRST116", async () => {
    const one = await db.from("contacts").select("*").eq("id", uid(1)).single();
    expect(one.error).toBeNull();
    expect((one.data as Row).id).toBe(uid(1));
    const none = await db.from("contacts").select("*").eq("id", uid(3)).single();
    expect(none.data).toBeNull();
    expect(none.error?.code).toBe("PGRST116");
    expect(none.error?.details).toBe("The result contains 0 rows");
    const many = await db.from("contacts").select("*").eq("full_name", "Ana").single();
    expect(many.error?.code).toBe("PGRST116");
  });

  it("maybeSingle: sin filas es data null sin error; varias filas es error", async () => {
    const none = await db.from("contacts").select("*").eq("id", uid(3)).maybeSingle();
    expect(none).toMatchObject({ data: null, error: null });
    const many = await db.from("contacts").select("*").eq("full_name", "Ana").maybeSingle();
    expect(many.error?.code).toBe("PGRST116");
    const one = await db.from("contacts").select("*").eq("id", uid(2)).maybeSingle();
    expect((one.data as Row).id).toBe(uid(2));
  });

  it("update().select().single() sin coincidencias da PGRST116 y no modifica nada", async () => {
    const r = await db.from("contacts").update({ notes: "x" }).eq("id", uid(9)).select().single();
    expect(r.error?.code).toBe("PGRST116");
    const multi = await db.from("contacts").update({ notes: "x" }).eq("full_name", "Ana").select().single();
    expect(multi.error?.code).toBe("PGRST116");
    const rows = await must<Row[]>(db.from("contacts").select("notes"));
    expect(rows.map((x) => x.notes)).toEqual([null, null]);
  });

  it("throwOnError convierte el error en excepcion", async () => {
    await expect(db.from("contacts").select("*").eq("id", uid(3)).single().throwOnError()).rejects.toMatchObject({ code: "PGRST116" });
  });
});

describe("update, delete y upsert", () => {
  beforeEach(async () => {
    await org(A);
    await contact(uid(1), A, "Ana");
    await contact(uid(2), A, "Beto");
  });

  it("update con filtros devuelve las filas actualizadas y respeta el alcance", async () => {
    const res = await must<Row[]>(db.from("contacts").update({ notes: "n" }).eq("full_name", "Beto").select());
    expect(res).toHaveLength(1);
    const ana = await must<Row>(db.from("contacts").select("notes").eq("id", uid(1)).single());
    expect(ana.notes).toBeNull();
    const noSelect = await db.from("contacts").update({ notes: "z" }).eq("id", uid(1));
    expect(noSelect.error).toBeNull();
    expect(noSelect.data).toBeNull();
  });

  it("update con parche vacio no falla", async () => {
    const r = await db.from("contacts").update({}).eq("id", uid(1)).select().single();
    expect(r.error).toBeNull();
  });

  it("delete con y sin select", async () => {
    const del = await must<Row[]>(db.from("contacts").delete().eq("id", uid(1)).select("id, full_name"));
    expect(del).toEqual([{ id: uid(1), full_name: "Ana" }]);
    const r = await db.from("contacts").delete().eq("id", uid(2));
    expect(r.error).toBeNull();
    expect(await must<Row[]>(db.from("contacts").select("*"))).toHaveLength(0);
  });

  it("upsert por id y por onConflict, con ignoreDuplicates", async () => {
    await must(db.from("contacts").upsert({ id: uid(1), organization_id: A, full_name: "Ana Nueva" }));
    await must(db.from("contacts").upsert({ id: uid(3), organization_id: A, full_name: "Carla" }));
    let all = await must<Row[]>(db.from("contacts").select("full_name"));
    expect(all.map((r) => r.full_name)).toEqual(["Ana Nueva", "Beto", "Carla"]);
    await must(db.from("contacts").upsert({ id: uid(2), organization_id: A, full_name: "Ignorado" }, { ignoreDuplicates: true }));
    await must(db.from("organizations").upsert({ name: "Z", industry: "retail", subdomain: "z" }, { onConflict: "subdomain" }));
    await must(db.from("organizations").upsert({ name: "Z2", industry: "retail", subdomain: "z" }, { onConflict: "subdomain" }));
    all = await must<Row[]>(db.from("organizations").select("name").eq("subdomain", "z"));
    expect(all.map((r) => r.name)).toEqual(["Z2"]);
    const ign = await must<Row>(db.from("contacts").select("full_name").eq("id", uid(2)).single());
    expect(ign.full_name).toBe("Beto");
  });
});

describe("embeds", () => {
  let bookingId: string;
  beforeEach(async () => {
    await org(A);
    await contact(uid(1), A, "Ana", { phone: "555" });
    await must(db.from("items").insert({ id: uid(20), organization_id: A, name: "Limpieza", color: "#ff0000" }));
    const b = await must<Row>(
      db
        .from("bookings")
        .insert({ organization_id: A, contact_id: uid(1), item_id: uid(20), scheduled_at: NOW.toISOString() })
        .select()
        .single(),
    );
    bookingId = b.id as string;
    await must(db.from("bookings").insert({ organization_id: A, scheduled_at: NOW.toISOString() }));
  });

  it("muchos a uno: contacts(full_name, phone) e items(color); null si no hay relacion", async () => {
    const rows = await must<Row[]>(db.from("bookings").select("id, contacts(full_name, phone), items(color)").order("created_at"));
    expect(rows[0]).toEqual({ id: bookingId, contacts: { full_name: "Ana", phone: "555" }, items: { color: "#ff0000" } });
    expect(rows[1].contacts).toBeNull();
    expect(rows[1].items).toBeNull();
  });

  it("'*, rel(...)' mezcla columnas con el embed y funciona tras update().select()", async () => {
    const row = await must<Row>(
      db.from("bookings").update({ status: "confirmed" }).eq("id", bookingId).select("*, contacts(full_name, phone), items(color)").single(),
    );
    expect(row.status).toBe("confirmed");
    expect(row.contacts).toEqual({ full_name: "Ana", phone: "555" });
    expect(row.items).toEqual({ color: "#ff0000" });
  });

  it("uno a muchos con alias y anidado (members:budget_members(*, services:budget_services(*)))", async () => {
    const bud = await must<Row>(
      db.from("budgets").insert({ organization_id: A, responsible_name: "Ana", expires_at: NOW.toISOString() }).select().single(),
    );
    const m = await must<Row>(
      db.from("budget_members").insert({ organization_id: A, budget_id: bud.id, full_name: "Ana", relationship: "responsible" }).select().single(),
    );
    await must(
      db.from("budget_services").insert([
        { organization_id: A, budget_member_id: m.id, name: "S1", sessions: 2, unit_price: 100 },
        { organization_id: A, budget_member_id: m.id, name: "S2" },
      ]),
    );
    const rows = await must<Array<Row & { members: Array<Row & { services: Row[] }> }>>(
      db.from("budgets").select(`
        *,
        members:budget_members(
          *,
          services:budget_services(*)
        )
      `),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].members).toHaveLength(1);
    expect(rows[0].members[0].services.map((s) => s.name)).toEqual(["S1", "S2"]);
    expect(rows[0].budget_number).toBe("PRES-0001");
  });

  it("uno a muchos sin hijos devuelve []; !inner descarta padres sin hijos", async () => {
    const rows = await must<Row[]>(db.from("contacts").select("id, bookings(id)"));
    expect((rows[0].bookings as Row[]).map((b) => b.id)).toEqual([bookingId]);
    await contact(uid(2), A, "Sin citas");
    const inner = await must<Row[]>(db.from("contacts").select("id, bookings!inner(id)"));
    expect(inner.map((r) => r.id)).toEqual([uid(1)]);
    const all = await must<Row[]>(db.from("contacts").select("id, bookings(id)").eq("id", uid(2)));
    expect(all[0].bookings).toEqual([]);
  });

  it("una relacion inexistente da PGRST200", async () => {
    const r = await db.from("bookings").select("id, nada(x)");
    expect(r.error?.code).toBe("PGRST200");
  });

  it("el embed devuelve copias", async () => {
    const rows = await must<Array<{ contacts: { full_name: string } }>>(db.from("bookings").select("contacts(full_name)").limit(1));
    rows[0].contacts.full_name = "mutado";
    const again = await must<Row>(db.from("contacts").select("full_name").eq("id", uid(1)).single());
    expect(again.full_name).toBe("Ana");
  });
});

describe("ON DELETE", () => {
  it("contact: CASCADE a activities y SET NULL en bookings, opportunities y budgets", async () => {
    await org(A);
    await contact(uid(1), A, "Ana");
    const opp = await must<Row>(db.from("opportunities").insert({ organization_id: A, contact_id: uid(1), title: "O", stage: "lead" }).select().single());
    const bk = await must<Row>(db.from("bookings").insert({ organization_id: A, contact_id: uid(1), scheduled_at: NOW.toISOString() }).select().single());
    await must(
      db.from("activities").insert([
        { organization_id: A, contact_id: uid(1), type: "note", title: "n", performed_by_type: "human", performed_by_id: "u" },
        { organization_id: A, contact_id: null, opportunity_id: opp.id, type: "note", title: "sin contacto", performed_by_type: "human", performed_by_id: "u" },
      ]),
    );
    const bud = await must<Row>(db.from("budgets").insert({ organization_id: A, responsible_id: uid(1), responsible_name: "Ana", expires_at: NOW.toISOString() }).select().single());
    await must(db.from("contacts").delete().eq("id", uid(1)));
    expect((await must<Row>(db.from("opportunities").select("contact_id").eq("id", opp.id).single())).contact_id).toBeNull();
    expect((await must<Row>(db.from("bookings").select("contact_id").eq("id", bk.id).single())).contact_id).toBeNull();
    expect((await must<Row>(db.from("budgets").select("responsible_id").eq("id", bud.id).single())).responsible_id).toBeNull();
    const acts = await must<Row[]>(db.from("activities").select("title"));
    expect(acts.map((a) => a.title)).toEqual(["sin contacto"]);
  });

  it("item, opportunity y booking: SET NULL en referencias", async () => {
    await org(A);
    await contact(uid(1), A, "Ana");
    await must(db.from("items").insert({ id: uid(20), organization_id: A, name: "I" }));
    const opp = await must<Row>(db.from("opportunities").insert({ organization_id: A, title: "O", stage: "lead" }).select().single());
    const bk = await must<Row>(db.from("bookings").insert({ organization_id: A, item_id: uid(20), scheduled_at: NOW.toISOString() }).select().single());
    await must(
      db.from("activities").insert({
        organization_id: A, opportunity_id: opp.id, booking_id: bk.id, type: "note", title: "n", performed_by_type: "human", performed_by_id: "u",
      }),
    );
    await must(db.from("items").delete().eq("id", uid(20)));
    expect((await must<Row>(db.from("bookings").select("item_id").single())).item_id).toBeNull();
    await must(db.from("bookings").delete().eq("id", bk.id));
    await must(db.from("opportunities").delete().eq("id", opp.id));
    const act = await must<Row>(db.from("activities").select("opportunity_id, booking_id").single());
    expect(act).toEqual({ opportunity_id: null, booking_id: null });
  });

  it("budgets: CASCADE a members y services; items: SET NULL en budget_services", async () => {
    await org(A);
    await must(db.from("items").insert({ id: uid(20), organization_id: A, name: "I" }));
    const bud = await must<Row>(db.from("budgets").insert({ organization_id: A, responsible_name: "R", expires_at: NOW.toISOString() }).select().single());
    const m = await must<Row>(db.from("budget_members").insert({ organization_id: A, budget_id: bud.id, full_name: "R", relationship: "responsible" }).select().single());
    await must(db.from("budget_services").insert({ organization_id: A, budget_member_id: m.id, service_id: uid(20), name: "S" }));
    await must(db.from("items").delete().eq("id", uid(20)));
    expect((await must<Row>(db.from("budget_services").select("service_id").single())).service_id).toBeNull();
    await must(db.from("budgets").delete().eq("id", bud.id));
    expect(await must<Row[]>(db.from("budget_members").select("id"))).toHaveLength(0);
    expect(await must<Row[]>(db.from("budget_services").select("id"))).toHaveLength(0);
  });

  it("organization: CASCADE a todo lo suyo sin tocar a la otra", async () => {
    await org(A);
    await org(B);
    await contact(uid(1), A, "Ana");
    await contact(uid(2), B, "Beto");
    await must(db.from("budgets").insert({ organization_id: A, responsible_name: "R", expires_at: NOW.toISOString() }));
    await must(db.from("organizations").delete().eq("id", A));
    const left = await must<Row[]>(db.from("contacts").select("full_name"));
    expect(left.map((c) => c.full_name)).toEqual(["Beto"]);
    expect(await must<Row[]>(db.from("budgets").select("id"))).toHaveLength(0);
    expect(await must<Row[]>(db.from("budget_counters").select("organization_id"))).toHaveLength(0);
  });

  it("users: SET NULL en assigned_to y reviewed_by", async () => {
    await org(A);
    await must(db.from("users").insert({ id: uid(50), clinic_id: A, organization_id: A, full_name: "U", role: "staff" }));
    await must(db.from("opportunities").insert({ organization_id: A, title: "O", stage: "lead", assigned_to: uid(50) }));
    await must(db.from("agent_actions").insert({ organization_id: A, agent_name: "sales", action_type: "t", payload: {}, reviewed_by: uid(50) }));
    await must(db.from("users").delete().eq("id", uid(50)));
    expect((await must<Row>(db.from("opportunities").select("assigned_to").single())).assigned_to).toBeNull();
    expect((await must<Row>(db.from("agent_actions").select("reviewed_by").single())).reviewed_by).toBeNull();
  });
});

describe("budget_number (trigger de la migracion 006)", () => {
  const bud = (organization_id: string, extra: Row = {}): Row => ({
    organization_id, responsible_name: "R", expires_at: NOW.toISOString(), ...extra,
  });

  it("asigna PRES-0001, PRES-0002 por organizacion e ignora el valor enviado", async () => {
    await org(A);
    await org(B);
    const a1 = await must<Row>(db.from("budgets").insert(bud(A, { budget_number: "MANUAL-9" })).select().single());
    const a2 = await must<Row>(db.from("budgets").insert(bud(A)).select().single());
    const b1 = await must<Row>(db.from("budgets").insert(bud(B)).select().single());
    expect([a1.budget_number, a2.budget_number, b1.budget_number]).toEqual(["PRES-0001", "PRES-0002", "PRES-0001"]);
  });

  it("borrar un presupuesto no reutiliza su numero y el numero es inmutable en update", async () => {
    await org(A);
    const a1 = await must<Row>(db.from("budgets").insert(bud(A)).select().single());
    await must(db.from("budgets").delete().eq("id", a1.id));
    const a2 = await must<Row>(db.from("budgets").insert(bud(A)).select().single());
    expect(a2.budget_number).toBe("PRES-0002");
    const upd = await must<Row>(db.from("budgets").update({ budget_number: "OTRO" }).eq("id", a2.id).select().single());
    expect(upd.budget_number).toBe("PRES-0002");
  });

  it("un insert fallido no consume numero y la organizacion no se puede cambiar", async () => {
    await org(A);
    await org(B);
    const fail = await db.from("budgets").insert({ organization_id: A, expires_at: NOW.toISOString() }); // falta responsible_name
    expect(fail.error?.code).toBe("23502");
    const ok = await must<Row>(db.from("budgets").insert(bud(A)).select().single());
    expect(ok.budget_number).toBe("PRES-0001");
    const move = await db.from("budgets").update({ organization_id: B }).eq("id", ok.id);
    expect(move.error?.message).toContain("no se puede cambiar");
  });

  it("CHECK de status/discount_type y de sessions > 0", async () => {
    await org(A);
    expect((await db.from("budgets").insert(bud(A, { status: "otro" }))).error?.code).toBe("23514");
    expect((await db.from("budgets").insert(bud(A, { discount_type: "otro" }))).error?.code).toBe("23514");
    const b = await must<Row>(db.from("budgets").insert(bud(A)).select().single());
    const m = await must<Row>(db.from("budget_members").insert({ organization_id: A, budget_id: b.id, full_name: "R", relationship: "responsible" }).select().single());
    expect((await db.from("budget_members").insert({ organization_id: A, budget_id: b.id, full_name: "R", relationship: "tio" })).error?.code).toBe("23514");
    expect((await db.from("budget_services").insert({ organization_id: A, budget_member_id: m.id, name: "S", sessions: 0 })).error?.code).toBe("23514");
  });
});

describe("coherencia de organizacion (migracion 007 y 006)", () => {
  beforeEach(async () => {
    await org(A);
    await org(B);
    await contact(uid(1), A, "De A");
    await contact(uid(2), B, "De B");
    await must(db.from("items").insert([{ id: uid(20), organization_id: A, name: "IA" }, { id: uid(21), organization_id: B, name: "IB" }]));
  });

  it("bookings: contact_id e item_id de otra organizacion dan 23514", async () => {
    const c = await db.from("bookings").insert({ organization_id: A, contact_id: uid(2), scheduled_at: NOW.toISOString() });
    expect(c.error?.code).toBe("23514");
    const i = await db.from("bookings").insert({ organization_id: A, item_id: uid(21), scheduled_at: NOW.toISOString() });
    expect(i.error?.code).toBe("23514");
    const ok = await db.from("bookings").insert({ organization_id: A, contact_id: uid(1), item_id: uid(20), scheduled_at: NOW.toISOString() });
    expect(ok.error).toBeNull();
  });

  it("update de bookings, opportunities y activities tambien lo verifica", async () => {
    const bk = await must<Row>(db.from("bookings").insert({ organization_id: A, contact_id: uid(1), scheduled_at: NOW.toISOString() }).select().single());
    const up = await db.from("bookings").update({ contact_id: uid(2) }).eq("id", bk.id);
    expect(up.error?.code).toBe("23514");
    expect((await db.from("opportunities").insert({ organization_id: A, contact_id: uid(2), title: "O", stage: "lead" })).error?.code).toBe("23514");
    const opp = await must<Row>(db.from("opportunities").insert({ organization_id: B, title: "O", stage: "lead" }).select().single());
    const base = { organization_id: A, type: "note", title: "n", performed_by_type: "human", performed_by_id: "u" };
    expect((await db.from("activities").insert({ ...base, contact_id: uid(2) })).error?.code).toBe("23514");
    expect((await db.from("activities").insert({ ...base, opportunity_id: opp.id })).error?.code).toBe("23514");
    expect((await db.from("activities").insert({ ...base, booking_id: bk.id, organization_id: B })).error?.code).toBe("23514");
    expect((await db.from("activities").insert({ ...base, contact_id: uid(1), booking_id: bk.id })).error).toBeNull();
  });

  it("referencia a una fila inexistente tambien es 23514 (como assert_same_org)", async () => {
    const r = await db.from("bookings").insert({ organization_id: A, contact_id: uid(99), scheduled_at: NOW.toISOString() });
    expect(r.error?.code).toBe("23514");
  });

  it("presupuestos: responsable, miembro y servicio de otra organizacion se rechazan", async () => {
    const mk = (extra: Row): PromiseLike<{ error: { code: string; message: string } | null }> =>
      db.from("budgets").insert({ organization_id: A, responsible_name: "R", expires_at: NOW.toISOString(), ...extra });
    expect((await mk({ responsible_id: uid(2) })).error).not.toBeNull();
    const b = await must<Row>(db.from("budgets").insert({ organization_id: A, responsible_name: "R", expires_at: NOW.toISOString(), responsible_id: uid(1) }).select().single());
    expect((await db.from("budget_members").insert({ organization_id: B, budget_id: b.id, full_name: "x", relationship: "other" })).error).not.toBeNull();
    const m = await must<Row>(db.from("budget_members").insert({ organization_id: A, budget_id: b.id, full_name: "x", relationship: "other" }).select().single());
    expect((await db.from("budget_services").insert({ organization_id: A, budget_member_id: m.id, service_id: uid(21), name: "S" })).error).not.toBeNull();
    expect((await db.from("budget_services").insert({ organization_id: B, budget_member_id: m.id, name: "S" })).error).not.toBeNull();
    expect((await db.from("budget_services").insert({ organization_id: A, budget_member_id: m.id, service_id: uid(20), name: "S" })).error).toBeNull();
  });
});

describe("auth.admin", () => {
  beforeEach(async () => {
    await org(A);
  });

  it("createUser (staff) crea auth user y la fila en users con clinic_id y organization_id de user_metadata", async () => {
    const { data, error } = await db.auth.admin.createUser({
      email: "Nuevo@Ejemplo.mx",
      password: "secreto1",
      email_confirm: true,
      user_metadata: { full_name: "Nuevo Staff", role: "staff", clinic_id: A, organization_id: A },
    });
    expect(error).toBeNull();
    expect(data.user?.email).toBe("nuevo@ejemplo.mx");
    const id = data.user!.id;
    const profile = await must<Row>(db.from("users").select("*").eq("id", id).single());
    expect(profile).toMatchObject({ clinic_id: A, organization_id: A, full_name: "Nuevo Staff", role: "staff" });
    const got = await db.auth.admin.getUserById(id);
    expect(got.data.user?.email).toBe("nuevo@ejemplo.mx");
    expect(JSON.stringify(got.data.user)).not.toContain("secreto1");
  });

  it("createUser admin crea tambien una organizacion nueva (handle_new_user)", async () => {
    const { data, error } = await db.auth.admin.createUser({
      email: "dueno@ejemplo.mx",
      password: "secreto1",
      user_metadata: { full_name: "Dueno", clinic_name: "Clinica Nueva", industry: "inventada" },
    });
    expect(error).toBeNull();
    const profile = await must<Row>(db.from("users").select("*").eq("id", data.user!.id).single());
    expect(profile.role).toBe("admin");
    const o = await must<Row>(db.from("organizations").select("*").eq("id", profile.organization_id).single());
    expect(o).toMatchObject({ name: "Clinica Nueva", industry: "general", plan: "starter" });
  });

  it("createUser: email duplicado, sin email, clave corta y alta sin clinica no dejan restos", async () => {
    await db.auth.admin.createUser({ email: "a@ejemplo.mx", password: "secreto1", user_metadata: { role: "staff", clinic_id: A } });
    const dup = await db.auth.admin.createUser({ email: "A@ejemplo.mx", password: "secreto1", user_metadata: { role: "staff", clinic_id: A } });
    expect(dup.error?.code).toBe("email_exists");
    expect(dup.data.user).toBeNull();
    expect((await db.auth.admin.createUser({ password: "secreto1" })).error).not.toBeNull();
    expect((await db.auth.admin.createUser({ email: "b@ejemplo.mx", password: "123" })).error?.code).toBe("weak_password");
    const orphan = await db.auth.admin.createUser({ email: "c@ejemplo.mx", password: "secreto1", user_metadata: { role: "staff" } });
    expect(orphan.error?.message).toBe("Database error creating new user");
    const list = await db.auth.admin.listUsers();
    expect(list.data.users.map((u) => u.email)).toEqual(["a@ejemplo.mx"]);
    expect(await must<Row[]>(db.from("users").select("id"))).toHaveLength(1);
  });

  it("getUserById inexistente devuelve error 404 y user null", async () => {
    const r = await db.auth.admin.getUserById(uid(404));
    expect(r.data.user).toBeNull();
    expect(r.error?.status).toBe(404);
  });

  it("getUserById devuelve copias", async () => {
    const { data } = await db.auth.admin.createUser({ email: "x@ejemplo.mx", password: "secreto1", user_metadata: { role: "staff", clinic_id: A } });
    const u = (await db.auth.admin.getUserById(data.user!.id)).data.user!;
    u.email = "mutado@x.mx";
    expect((await db.auth.admin.getUserById(data.user!.id)).data.user?.email).toBe("x@ejemplo.mx");
  });

  it("deleteUser borra el usuario de auth y su fila en users (cascade)", async () => {
    const { data } = await db.auth.admin.createUser({ email: "x@ejemplo.mx", password: "secreto1", user_metadata: { role: "staff", clinic_id: A } });
    const id = data.user!.id;
    await must(db.from("opportunities").insert({ organization_id: A, title: "O", stage: "lead", assigned_to: id }));
    const del = await db.auth.admin.deleteUser(id);
    expect(del.error).toBeNull();
    expect(await must<Row[]>(db.from("users").select("id"))).toHaveLength(0);
    expect((await db.auth.admin.getUserById(id)).error).not.toBeNull();
    expect((await must<Row>(db.from("opportunities").select("assigned_to").single())).assigned_to).toBeNull();
    expect((await db.auth.admin.deleteUser(id)).error?.status).toBe(404);
  });

  it("listUsers pagina; updateUserById cambia email y mezcla metadata", async () => {
    for (const n of ["a", "b", "c"]) {
      await db.auth.admin.createUser({ email: `${n}@ejemplo.mx`, password: "secreto1", user_metadata: { role: "staff", clinic_id: A } });
    }
    const p1 = await db.auth.admin.listUsers({ page: 1, perPage: 2 });
    expect(p1.data.users).toHaveLength(2);
    expect(p1.data.nextPage).toBe(2);
    expect(p1.data.total).toBe(3);
    const p2 = await db.auth.admin.listUsers({ page: 2, perPage: 2 });
    expect(p2.data.users).toHaveLength(1);
    expect(p2.data.nextPage).toBeNull();
    const id = p1.data.users[0].id;
    const upd = await db.auth.admin.updateUserById(id, { email: "z@ejemplo.mx", user_metadata: { extra: 1 } });
    expect(upd.data.user?.email).toBe("z@ejemplo.mx");
    expect(upd.data.user?.user_metadata).toMatchObject({ role: "staff", extra: 1 });
    expect((await db.auth.admin.updateUserById(id, { email: "b@ejemplo.mx" })).error?.code).toBe("email_exists");
  });
});

describe("misc", () => {
  it("tabla inexistente da PGRST205 y rpc devuelve PGRST202", async () => {
    const r = await db.from("v1_patients").select("*");
    expect(r.error?.code).toBe("PGRST205");
    const rpc = await db.rpc("algo");
    expect(rpc.error.code).toBe("PGRST202");
  });

  it("clear deja la misma instancia vacia", async () => {
    await org(A);
    await db.auth.admin.createUser({ email: "x@ejemplo.mx", password: "secreto1", user_metadata: { role: "staff", clinic_id: A } });
    db.clear();
    expect(await must<Row[]>(db.from("organizations").select("id"))).toHaveLength(0);
    expect((await db.auth.admin.listUsers()).data.total).toBe(0);
  });

  it("la consulta es perezosa: no se ejecuta hasta el await", async () => {
    await org(A);
    const q = db.from("contacts").insert({ organization_id: A, full_name: "Lazy" });
    expect(db.tables.contacts).toHaveLength(0);
    await q;
    expect(db.tables.contacts).toHaveLength(1);
  });
});
