// Fase 6: cero regresiones en autenticacion. Sin Supabase real: se simulan @supabase/ssr y next/headers.
//  - Modo demo (por defecto): sin sesion; /login manda a la app.
//  - Modo live (RAVYN_DATA_MODE=live) sin sesion: el middleware redirige a /login y TODAS las rutas /api responden 401
//    sin tocar la base; con sesion valida simulada el camino completo (perfil -> organizacion) funciona.
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoDb, seedDemoData } from "@/lib/demo";
import { DEMO_ORG_ID, DEMO_USER_ID } from "@/lib/demo/config";
import { ROOT } from "../helpers";

const auth = vi.hoisted(() => ({ user: null as null | { id: string; email?: string }, throws: false, dbCalls: 0, db: null as unknown, staffCookie: false }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => {
        if (auth.throws) throw new Error("supabase caido");
        return { data: { user: auth.user }, error: null };
      },
    },
  }),
}));
// cookies() se usa de forma sincrona (modo demo) y con await (cliente de servidor): el objeto sirve para ambas.
vi.mock("next/headers", () => ({
  cookies: () => {
    const jar = {
      getAll: () => [],
      set: () => undefined,
      get: (name: string) => (name === "ravyn_demo_role" && auth.staffCookie ? { name, value: "staff" } : undefined),
    };
    return Object.assign(Object.create(null), jar, { then: (resolve: (v: typeof jar) => void) => resolve(jar) });
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () =>
    auth.db ??
    new Proxy(
      {},
      {
        get() {
          auth.dbCalls += 1;
          throw new Error("la base no debe consultarse sin sesion");
        },
      },
    ),
}));

import { middleware } from "@/middleware";

const ORIGINAL_ENV = { ...process.env };
function env(mode: "demo" | "live") {
  delete process.env.RAVYN_DATA_MODE;
  delete process.env.NEXT_PUBLIC_RAVYN_DATA_MODE;
  if (mode === "live") {
    process.env.RAVYN_DATA_MODE = "live";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ejemplo.supabase.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-ejemplo";
  }
}
beforeEach(() => {
  auth.user = null;
  auth.throws = false;
  auth.dbCalls = 0;
  auth.db = null;
  auth.staffCookie = false;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(`http://localhost${url}`, init);
const isPassThrough = (res: Response) => res.status === 200 && res.headers.get("x-middleware-next") === "1";

describe("middleware: modo demo", () => {
  beforeEach(() => env("demo"));
  it("deja pasar cualquier pagina sin sesion", async () => {
    for (const url of ["/dashboard", "/appointments", "/agents/inbox", "/pipeline", "/api/agents/pending-count"]) {
      expect(isPassThrough(await middleware(req(url))), url).toBe(true);
    }
  });
  it("/login redirige a la app (no hay sesion que iniciar)", async () => {
    const res = await middleware(req("/login"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
  });
});

describe("middleware: modo live (sin Supabase real)", () => {
  beforeEach(() => env("live"));
  it("sin sesion: toda pagina protegida redirige a /login", async () => {
    for (const url of ["/dashboard", "/appointments", "/patients", "/agents/inbox", "/pipeline", "/"]) {
      const res = await middleware(req(url));
      expect(res.status, url).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname, url).toBe("/login");
    }
  });
  it("sin sesion: /login se muestra", async () => {
    expect(isPassThrough(await middleware(req("/login")))).toBe(true);
  });
  it("con sesion: la app pasa y /login redirige a /", async () => {
    auth.user = { id: DEMO_USER_ID, email: "a@b.mx" };
    expect(isPassThrough(await middleware(req("/dashboard")))).toBe(true);
    const res = await middleware(req("/login"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
  });
  it("el login no se ve afectado por la cookie de rol de demo", async () => {
    const res = await middleware(req("/dashboard", { headers: { cookie: "ravyn_demo_role=staff" } }));
    expect(res.status).toBe(307);
  });
});

// --- Rutas /api: enumeradas del sistema de archivos para que una ruta nueva no escape a la prueba ---

function apiRoutes(dir = path.join(ROOT, "app/api")): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...apiRoutes(full));
    else if (e.name === "route.ts") out.push(full);
  }
  return out;
}
const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;
const UUID = "00000000-0000-4000-8000-0000000000ff";
const isWebhook = (file: string) => file.includes(`${path.sep}webhooks${path.sep}`);

async function callAll(file: string): Promise<Array<{ label: string; status: number }>> {
  const mod = (await import(/* @vite-ignore */ file)) as Record<string, (r: NextRequest, c: { params: Record<string, string> }) => Promise<Response>>;
  const rel = path.relative(path.join(ROOT, "app/api"), path.dirname(file)).split(path.sep).join("/");
  const results: Array<{ label: string; status: number }> = [];
  for (const method of METHODS) {
    if (typeof mod[method] !== "function") continue;
    const params = { id: UUID };
    const url = `/api/${rel.replace(/\[id\]/g, UUID)}`;
    const request = req(url, method === "GET" || method === "DELETE" ? { method } : { method, headers: { "content-type": "application/json", origin: "http://localhost" }, body: "{}" });
    const res = await mod[method](request, { params });
    results.push({ label: `${method} /api/${rel}`, status: res.status });
  }
  return results;
}

describe("rutas /api sin sesion en modo live: 401 y sin consultar la base", () => {
  beforeEach(() => env("live"));
  const files = apiRoutes().filter((f) => !isWebhook(f));

  it("se enumeran todas las rutas de la app (28 archivos de ruta, 2 son webhooks)", () => {
    expect(apiRoutes()).toHaveLength(28);
    expect(files).toHaveLength(26);
  });

  it("cada metodo de cada ruta responde 401", async () => {
    let calls = 0;
    const bad: string[] = [];
    for (const f of files) {
      for (const r of await callAll(f)) {
        calls += 1;
        if (r.status !== 401) bad.push(`${r.label} -> ${r.status}`);
      }
    }
    expect(bad).toEqual([]);
    expect(calls).toBeGreaterThanOrEqual(38); // metodos HTTP exportados por las 26 rutas con sesion
    expect(auth.dbCalls).toBe(0);
  });

  it("aunque el middleware falle abierto (error de Supabase), las rutas siguen cerradas", async () => {
    auth.throws = true;
    // El middleware es solo la primera barrera: la autoridad esta en cada ruta (getClinicContext).
    const mw = await middleware(req("/dashboard"));
    expect(mw.status).toBe(200);
    const { GET } = await import("@/app/api/agents/pending-count/route");
    let status = 0;
    try {
      status = (await GET()).status;
    } catch {
      status = 500; // la excepcion de getUser no se traduce en acceso
    }
    expect(status).not.toBe(200);
    expect(auth.dbCalls).toBe(0);
  });

  it("los webhooks sin secreto compartido responden 401", async () => {
    for (const f of apiRoutes().filter(isWebhook)) {
      const mod = (await import(/* @vite-ignore */ f)) as { POST: (r: Request) => Promise<Response> };
      const res = await mod.POST(new Request("http://localhost/api/webhooks", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
      expect(res.status, f).toBe(401);
    }
    expect(auth.dbCalls).toBe(0);
  });
});

describe("camino live con sesion simulada", () => {
  beforeEach(() => env("live"));
  it("con sesion valida y perfil, la ruta responde y usa solo la organizacion del perfil", async () => {
    const db = new DemoDb();
    seedDemoData(db);
    auth.db = db.asClient();
    auth.user = { id: DEMO_USER_ID, email: "a@b.mx" };
    const { GET } = await import("@/app/api/agents/pending-count/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: db.tables.agent_actions.filter((a) => a.organization_id === DEMO_ORG_ID && a.status === "pending").length });
  });

  it("con sesion de un usuario sin perfil/organizacion: 401", async () => {
    const db = new DemoDb();
    seedDemoData(db);
    auth.db = db.asClient();
    auth.user = { id: "00000000-0000-4000-8000-00000000dead" };
    const { GET } = await import("@/app/api/agents/pending-count/route");
    expect((await GET()).status).toBe(401);
  });

  it("la cookie ravyn_demo_role no cambia el usuario ni el rol en modo live (en demo si simula a staff)", async () => {
    const db = new DemoDb();
    seedDemoData(db);
    auth.db = db.asClient();
    auth.user = { id: DEMO_USER_ID };
    auth.staffCookie = true;
    const { getClinicContext } = await import("@/lib/supabase/auth");
    const live = await getClinicContext();
    expect(live?.user.id).toBe(DEMO_USER_ID);
    expect(live?.profile.role).toBe("admin");
    expect(live?.supabase).not.toBeNull();

    env("demo");
    const demo = await getClinicContext();
    expect(demo?.profile.role).toBe("staff"); // contraste: solo en demo la cookie tiene efecto
  });
});
