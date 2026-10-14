// Prueba de humo: ejecuta contra getDemoDb() las consultas reales de la app tal como estan
// escritas en las rutas api, paginas (dashboard), herramientas de agentes y mappers.
import { subDays, startOfDay } from "date-fns";
import { beforeEach, describe, expect, it } from "vitest";
import { executeTool } from "@/lib/agents/executor";
import { BUDGET_SELECT, budgetFromRow } from "@/lib/budgets/mappers";
import { DEMO_ORG_ID, DEMO_OTHER_ORG_ID, DEMO_USER_ID } from "@/lib/demo/config";
import { getDemoDb, resetDemoDb, type Row } from "@/lib/demo";
import { bookingToAppointment, contactToPatient, itemToService } from "@/lib/supabase/mappers";
import type { Booking, Contact, Item } from "@/types/database";

// Mismo contexto que devuelve getClinicContext() (db = cliente service role).
function ctx() {
  return {
    db: getDemoDb(),
    organizationId: DEMO_ORG_ID,
    profile: { id: DEMO_USER_ID, clinic_id: DEMO_ORG_ID, organization_id: DEMO_ORG_ID, full_name: "Dra. Demo", role: "admin" as const },
    user: { id: DEMO_USER_ID },
  };
}

beforeEach(() => resetDemoDb());

describe("getClinicContext (lib/supabase/auth.ts)", () => {
  it("el perfil del usuario demo se resuelve con .single()", async () => {
    const { db } = ctx();
    const { data: profile, error } = await db
      .from("users")
      .select("id, clinic_id, organization_id, full_name, role")
      .eq("id", DEMO_USER_ID)
      .single();
    expect(error).toBeNull();
    expect(profile).toEqual({
      id: DEMO_USER_ID,
      clinic_id: DEMO_ORG_ID,
      organization_id: DEMO_ORG_ID,
      full_name: "Dra. Demo",
      role: "admin",
    });
  });
});

describe("pacientes (contacts)", () => {
  it("GET /api/patients sin busqueda: los 10 mas recientes", async () => {
    const { db, organizationId } = ctx();
    const { data, error } = await db
      .from("contacts")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(10);
    expect(error).toBeNull();
    const patients = ((data ?? []) as Contact[]).map(contactToPatient);
    expect(patients).toHaveLength(10);
    expect(patients[0]).toMatchObject({ clinic_id: DEMO_ORG_ID, full_name: expect.any(String), source: expect.stringMatching(/^(whatsapp|web|manual)$/) });
    const dates = patients.map((p) => Date.parse(p.created_at));
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
  });

  it("GET /api/patients?q=: busqueda or() por nombre, telefono y correo", async () => {
    const { db, organizationId } = ctx();
    const search = async (raw: string): Promise<Row[]> => {
      const q = raw.replace(/[,()]/g, " ").trim();
      const { data, error } = await db
        .from("contacts")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(20);
      expect(error).toBeNull();
      return (data ?? []) as Row[];
    };
    expect((await search("mariana")).map((c) => c.full_name)).toEqual(["Mariana Vega Torres"]);
    expect((await search("VEGA")).length).toBe(1);
    expect((await search("5550 1003")).map((c) => c.full_name)).toEqual(["Fernanda Castillo Mora"]);
    expect((await search("correo-demo.mx")).length).toBe(14);
    expect(await search("zzzz")).toEqual([]);
    expect((await search("Peña")).map((c) => c.full_name)).toEqual(["Alejandro Peña Cordero"]);
  });

  it("POST /api/patients: insert().select().single() devuelve la fila creada", async () => {
    const { db, organizationId } = ctx();
    const { data, error } = await db
      .from("contacts")
      .insert({ organization_id: organizationId, full_name: "Paciente Nuevo", phone: "+52 55 0000 0000", email: null, notes: null, source: "manual" })
      .select()
      .single();
    expect(error).toBeNull();
    const patient = contactToPatient(data as Contact);
    expect(patient.full_name).toBe("Paciente Nuevo");
    expect(patient.id).toMatch(/^[0-9a-f-]{36}$/);
    const bad = await db.from("contacts").insert({ organization_id: organizationId, full_name: "X", source: "tiktok" }).select().single();
    expect(bad.error).toMatchObject({ code: "23514", hint: null });
  });

  it("GET /api/patients/[id] y pagina de perfil: .eq(id).eq(organization_id).single() + reservas del contacto", async () => {
    const { db, organizationId } = ctx();
    const { data: any1 } = await db.from("bookings").select("contact_id").eq("organization_id", organizationId).limit(1).single();
    const contactId = (any1 as Row).contact_id as string;
    const { data: contact, error } = await db.from("contacts").select("*").eq("id", contactId).eq("organization_id", organizationId).single();
    expect(error).toBeNull();
    expect(contact).toBeTruthy();
    const { data: bookings } = await db
      .from("bookings")
      .select("*")
      .eq("contact_id", contactId)
      .eq("organization_id", organizationId)
      .order("scheduled_at", { ascending: false });
    const appts = ((bookings ?? []) as Booking[]).map(bookingToAppointment);
    expect(appts.length).toBeGreaterThan(0);
    expect(appts.every((a) => a.patient_id === contactId)).toBe(true);
    // Un id de otra organizacion se comporta como inexistente.
    const foreign = await db.from("contacts").select("*").eq("id", contactId).eq("organization_id", DEMO_OTHER_ORG_ID).single();
    expect(foreign.data).toBeNull();
    expect(foreign.error?.code).toBe("PGRST116");
  });

  it("PATCH /api/patients/[id]: update().eq().eq().select().single()", async () => {
    const { db, organizationId } = ctx();
    const { data: first } = await db.from("contacts").select("id").eq("organization_id", organizationId).limit(1).single();
    const id = (first as Row).id as string;
    const { data, error } = await db
      .from("contacts")
      .update({ notes: "Actualizado", phone: null })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select()
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ id, notes: "Actualizado", phone: null });
  });
});

describe("servicios (items)", () => {
  it("GET /api/services y pagina /services: type=service ordenado por nombre", async () => {
    const { db, organizationId } = ctx();
    const { data, error } = await db
      .from("items")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("type", "service")
      .order("name", { ascending: true });
    expect(error).toBeNull();
    const services = ((data ?? []) as Item[]).map(itemToService);
    expect(services).toHaveLength(9);
    expect(services.map((s) => s.name)).toEqual([...services.map((s) => s.name)].sort((a, b) => a.localeCompare(b, "es")));
    expect(services[0]).toMatchObject({ clinic_id: DEMO_ORG_ID, cost: expect.any(Number), color: expect.stringMatching(/^#/) });
  });

  it("GET /api/services?active=true y /budgets/new: .eq('active', true).order('name')", async () => {
    const { db, organizationId } = ctx();
    const { data, error } = await db
      .from("items")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("type", "service")
      .eq("active", true)
      .order("name");
    expect(error).toBeNull();
    expect(data).toHaveLength(8);
  });

  it("POST/PATCH/DELETE /api/services", async () => {
    const { db, organizationId } = ctx();
    const created = await db
      .from("items")
      .insert({ organization_id: organizationId, type: "service", name: "Servicio nuevo", description: null, price: 123.456, color: "#112233", active: true })
      .select()
      .single();
    expect(created.error).toBeNull();
    const service = itemToService(created.data as Item);
    expect(service.cost).toBe(123.46);
    const updated = await db
      .from("items")
      .update({ name: "Renombrado", price: 200, active: false })
      .eq("id", service.id)
      .eq("organization_id", organizationId)
      .eq("type", "service")
      .select()
      .single();
    expect(itemToService(updated.data as Item)).toMatchObject({ name: "Renombrado", cost: 200, active: false });
    const del = await db.from("items").delete().eq("id", service.id).eq("organization_id", organizationId).eq("type", "service");
    expect(del.error).toBeNull();
    const gone = await db.from("items").select("id").eq("id", service.id).maybeSingle();
    expect(gone.data).toBeNull();
  });
});

describe("citas (bookings) con embeds", () => {
  type BookingRow = Booking & {
    contacts: { full_name: string; phone: string | null } | null;
    items: { color: string } | null;
  };

  it("pagina /appointments y GET /api/appointments: '*, contacts(full_name, phone), items(color)'", async () => {
    const { db, organizationId } = ctx();
    const { data, error } = await db
      .from("bookings")
      .select("*, contacts(full_name, phone), items(color)")
      .eq("organization_id", organizationId)
      .order("scheduled_at", { ascending: true });
    expect(error).toBeNull();
    const rows = (data ?? []) as BookingRow[];
    expect(rows).toHaveLength(35);
    const appointments = rows.map(({ contacts, items, ...booking }) => ({ ...bookingToAppointment(booking), patients: contacts, services: items }));
    for (const a of appointments) {
      expect(a.patients).toEqual({ full_name: expect.any(String), phone: expect.stringMatching(/^\+52/) });
      expect(a.services).toEqual({ color: expect.stringMatching(/^#[0-9a-f]{6}$/) });
      expect(a.service).toEqual(expect.any(String));
      expect(a.cost_at_booking).toEqual(expect.any(Number));
    }
    const times = appointments.map((a) => Date.parse(a.scheduled_at));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("GET /api/appointments con ?date= y ?month=&year= (gte/lte y gte/lt)", async () => {
    const { db, organizationId } = ctx();
    const { data: all } = await db.from("bookings").select("scheduled_at").eq("organization_id", organizationId);
    const sample = new Date((all as Row[])[10].scheduled_at as string);
    const y = sample.getFullYear();
    const m = sample.getMonth() + 1;
    const start = new Date(y, m - 1, 1).toISOString();
    const end = new Date(y, m, 1).toISOString();
    const month = await db
      .from("bookings")
      .select("*, contacts(full_name, phone), items(color)")
      .eq("organization_id", organizationId)
      .order("scheduled_at", { ascending: true })
      .gte("scheduled_at", start)
      .lt("scheduled_at", end);
    expect(month.error).toBeNull();
    expect((month.data ?? []).length).toBeGreaterThan(0);
    for (const r of month.data as Row[]) {
      expect(Date.parse(r.scheduled_at as string)).toBeGreaterThanOrEqual(Date.parse(start));
      expect(Date.parse(r.scheduled_at as string)).toBeLessThan(Date.parse(end));
    }
    const dayStr = sample.toISOString().slice(0, 10);
    const day = await db
      .from("bookings")
      .select("*, contacts(full_name, phone), items(color)")
      .eq("organization_id", organizationId)
      .gte("scheduled_at", new Date(`${dayStr}T00:00:00Z`).toISOString())
      .lte("scheduled_at", new Date(`${dayStr}T23:59:59.999Z`).toISOString());
    expect((day.data ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("pagina /dashboard: desde hace 30 dias con '*, contacts(full_name, phone)' y datos recientes y futuros", async () => {
    const { db, organizationId } = ctx();
    const since = startOfDay(subDays(new Date(), 30)).toISOString();
    const { data, error } = await db
      .from("bookings")
      .select("*, contacts(full_name, phone)")
      .eq("organization_id", organizationId)
      .gte("scheduled_at", since)
      .order("scheduled_at", { ascending: true });
    expect(error).toBeNull();
    const rows = (data ?? []) as Array<Booking & { contacts: { full_name: string; phone: string | null } | null }>;
    expect(rows.length).toBeGreaterThanOrEqual(30);
    const now = Date.now();
    expect(rows.some((r) => Date.parse(r.scheduled_at) < now)).toBe(true);
    expect(rows.some((r) => Date.parse(r.scheduled_at) > now)).toBe(true);
    expect(rows.every((r) => r.contacts && "full_name" in r.contacts)).toBe(true);
  });

  it("POST /api/appointments: valida contacto y servicio con maybeSingle() y crea la cita", async () => {
    const { db, organizationId } = ctx();
    const { data: c } = await db.from("contacts").select("id").eq("organization_id", organizationId).limit(1).single();
    const { data: s } = await db.from("items").select("id, price").eq("organization_id", organizationId).eq("active", true).limit(1).single();
    const patientId = (c as Row).id as string;
    const serviceId = (s as Row).id as string;
    const { data: contact } = await db.from("contacts").select("id").eq("id", patientId).eq("organization_id", organizationId).maybeSingle();
    expect(contact).toEqual({ id: patientId });
    const { data: ghost } = await db.from("contacts").select("id").eq("id", "00000000-0000-4000-8000-00000000dead").eq("organization_id", organizationId).maybeSingle();
    expect(ghost).toBeNull();
    const { data, error } = await db
      .from("bookings")
      .insert({
        organization_id: organizationId,
        contact_id: patientId,
        scheduled_at: new Date(Date.now() + 40 * 86_400_000).toISOString(),
        duration_minutes: 30,
        status: "pending",
        service_snapshot: "Servicio",
        item_id: serviceId,
        cost_at_booking: 500,
        notes: null,
        source: "manual",
      })
      .select("*, contacts(full_name, phone), items(color)")
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "pending", contacts: { full_name: expect.any(String) }, items: { color: expect.any(String) } });
  });

  it("PATCH /api/appointments/[id]: cambio de estado + actividad 'Cambio de estado: a -> b'", async () => {
    const { db, organizationId, user } = ctx();
    const { data: pending } = await db.from("bookings").select("id").eq("organization_id", organizationId).eq("status", "pending").limit(1).single();
    const id = (pending as Row).id as string;
    const { data: existing, error: fetchError } = await db.from("bookings").select("id, status, contact_id").eq("id", id).eq("organization_id", organizationId).single();
    expect(fetchError).toBeNull();
    const { data: updated, error: updateError } = await db
      .from("bookings")
      .update({ status: "confirmed" })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select("*, contacts(full_name, phone), items(color)")
      .single();
    expect(updateError).toBeNull();
    expect((updated as Row).status).toBe("confirmed");
    const { error: logError } = await db.from("activities").insert({
      organization_id: organizationId,
      contact_id: (existing as Row).contact_id,
      booking_id: id,
      type: "note",
      title: `Cambio de estado: ${(existing as Row).status} -> confirmed`,
      description: null,
      status: "completed",
      performed_by_type: "human",
      performed_by_id: user.id,
    });
    expect(logError).toBeNull();
    const logged = await db.from("activities").select("title").eq("booking_id", id).eq("title", "Cambio de estado: pending -> confirmed");
    expect(logged.data).toHaveLength(1);
  });

  it("webhook n8n: organizacion por nombre (ilike + limit 2), contacto por telefono y servicio por nombre", async () => {
    const supabase = getDemoDb();
    const escapeLike = (t: string): string => t.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data: orgs } = await supabase.from("organizations").select("id").ilike("name", escapeLike("clinica demo")).limit(2);
    expect(orgs).toEqual([{ id: DEMO_ORG_ID }]);
    const { data: byPhone } = await supabase.from("contacts").select("id").eq("organization_id", DEMO_ORG_ID).eq("phone", "+52 55 5550 1001").single();
    expect(byPhone).toBeTruthy();
    const { data: byName } = await supabase.from("contacts").select("id").eq("organization_id", DEMO_ORG_ID).ilike("full_name", escapeLike("MARIANA VEGA TORRES")).single();
    expect(byName).toEqual(byPhone);
    const { data: srv } = await supabase
      .from("items")
      .select("id, price")
      .eq("type", "service")
      .eq("organization_id", DEMO_ORG_ID)
      .ilike("name", `%${escapeLike("blanqueamiento")}%`)
      .single();
    expect(srv).toMatchObject({ price: 3500 });
    const { data: org } = await supabase.from("organizations").select("id").eq("id", DEMO_ORG_ID).maybeSingle();
    expect(org).toEqual({ id: DEMO_ORG_ID });
  });
});

describe("presupuestos (budgets)", () => {
  it("pagina /budgets y GET /api/budgets: BUDGET_SELECT con members y services anidados", async () => {
    const { db, organizationId } = ctx();
    const { data, error } = await db
      .from("budgets")
      .select(BUDGET_SELECT)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    expect(error).toBeNull();
    const budgets = (data ?? []).map((r) => budgetFromRow(r as unknown as Record<string, unknown>));
    expect(budgets).toHaveLength(4);
    expect(budgets.map((b) => b.budget_number)).toEqual(["PRES-0004", "PRES-0003", "PRES-0002", "PRES-0001"]);
    for (const b of budgets) {
      expect(b.clinic_id).toBe(DEMO_ORG_ID);
      expect(b.members.length).toBeGreaterThan(0);
      expect(b.members.every((m) => m.services.length > 0)).toBe(true);
      const subtotal = b.members.flatMap((m) => m.services).reduce((acc, s) => acc + s.sessions * s.unit_price, 0);
      expect(b.subtotal).toBeCloseTo(subtotal, 2);
    }
    expect(budgets.map((b) => b.status).sort()).toEqual(["accepted", "active", "draft", "expired"]);
    const manual = budgets.flatMap((b) => b.members.flatMap((m) => m.services)).find((s) => s.is_manual_price);
    expect(manual).toMatchObject({ name: "Poste de fibra de vidrio", service_id: "" });
  });

  it("pagina /budgets/[id]: BUDGET_SELECT con .eq(id).eq(organization_id).single()", async () => {
    const { db, organizationId } = ctx();
    const { data: list } = await db.from("budgets").select("id").eq("organization_id", organizationId).limit(1).single();
    const { data: budget, error } = await db.from("budgets").select(BUDGET_SELECT).eq("id", (list as Row).id as string).eq("organization_id", organizationId).single();
    expect(error).toBeNull();
    expect(budgetFromRow(budget as unknown as Record<string, unknown>).members.length).toBeGreaterThan(0);
  });

  it("POST /api/budgets: crea presupuesto, miembros y servicios (budget_number lo asigna la base) y compensa borrando", async () => {
    const { db, organizationId } = ctx();
    const { data: item } = await db.from("items").select("id").eq("organization_id", organizationId).in("id", ["00000000-0000-4000-8000-d00000000001"]);
    expect(item).toHaveLength(1);
    const { data: budget, error } = await db
      .from("budgets")
      .insert({
        organization_id: organizationId,
        responsible_id: "00000000-0000-4000-8000-c00000000001",
        responsible_name: "Mariana Vega Torres",
        responsible_phone: null,
        responsible_email: null,
        status: "active",
        subtotal: 500,
        discount_value: 0,
        discount_type: "percentage",
        total: 500,
        validity_days: 15,
        payment_method: null,
        doctor_notes: null,
        patient_notes: null,
        expires_at: new Date(Date.now() + 15 * 86_400_000).toISOString(),
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect((budget as Row).budget_number).toBe("PRES-0005");
    const { data: member, error: memberError } = await db
      .from("budget_members")
      .insert({ organization_id: organizationId, budget_id: (budget as Row).id, full_name: "Mariana", relationship: "responsible" })
      .select()
      .single();
    expect(memberError).toBeNull();
    const { error: servicesError } = await db.from("budget_services").insert([
      { organization_id: organizationId, budget_member_id: (member as Row).id, service_id: "00000000-0000-4000-8000-d00000000001", name: "Consulta", sessions: 1, unit_price: 500, is_manual_price: false },
    ]);
    expect(servicesError).toBeNull();
    // PATCH de estado y compensacion (delete en cascada).
    const patched = await db.from("budgets").update({ status: "accepted", updated_at: new Date().toISOString() }).eq("id", (budget as Row).id as string).eq("organization_id", organizationId).select().single();
    expect((patched.data as Row).status).toBe("accepted");
    const del = await db.from("budgets").delete().eq("id", (budget as Row).id as string).eq("organization_id", organizationId);
    expect(del.error).toBeNull();
    const members = await db.from("budget_members").select("id").eq("budget_id", (budget as Row).id as string);
    expect(members.data).toEqual([]);
  });

  it("GET /api/budgets/responsibles: contactos con busqueda or()", async () => {
    const { db, organizationId } = ctx();
    const { data, error } = await db
      .from("contacts")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .or("full_name.ilike.%gabriela%,phone.ilike.%gabriela%,email.ilike.%gabriela%")
      .limit(20);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});

describe("clinica, ajustes y personal", () => {
  it("GET/PATCH /api/clinic, layout y /appointments: organizations con columnas elegidas", async () => {
    const { db, organizationId } = ctx();
    const { data, error } = await db.from("organizations").select("id, name, phone, email, subdomain, plan, created_at").eq("id", organizationId).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ id: DEMO_ORG_ID, name: "Clinica Demo", plan: "standard", subdomain: "clinica-demo" });
    const { data: clinic } = await db.from("organizations").select("id, name").eq("id", organizationId).single();
    expect(clinic).toEqual({ id: DEMO_ORG_ID, name: "Clinica Demo" });
    const { data: org } = await db.from("organizations").select("name").eq("id", organizationId).single();
    expect(org).toEqual({ name: "Clinica Demo" });
    const patched = await db.from("organizations").update({ name: "Clinica Renombrada", phone: null }).eq("id", organizationId).select("id, name, phone, email, subdomain, plan, created_at").single();
    expect(patched.data).toMatchObject({ name: "Clinica Renombrada", phone: null });
  });

  it("pagina /settings y GET /api/clinic/staff: users de la organizacion con email desde auth.admin", async () => {
    const { db, organizationId } = ctx();
    const { data: profiles, error } = await db.from("users").select("*").eq("organization_id", organizationId).order("created_at", { ascending: true });
    expect(error).toBeNull();
    expect(profiles).toHaveLength(3);
    const staff = await Promise.all(
      (profiles ?? []).map(async (p) => {
        const { data: auth } = await db.auth.admin.getUserById(p.id);
        return { ...p, email: auth?.user?.email ?? "" };
      }),
    );
    expect(staff.map((s) => s.role)).toEqual(["admin", "staff", "staff"]);
    expect(staff.every((s) => s.email.includes("@"))).toBe(true);
    expect(staff[0]).toMatchObject({ id: DEMO_USER_ID, full_name: "Dra. Demo", email: "dra.demo@ejemplo.mx" });
  });

  it("POST/PATCH/DELETE /api/clinic/staff: alta, cambio de rol, edicion y baja", async () => {
    const { db, organizationId } = ctx();
    const { data: created, error: createError } = await db.auth.admin.createUser({
      email: "nueva.persona@ejemplo.mx",
      password: "secreto123",
      email_confirm: true,
      user_metadata: { full_name: "Nueva Persona", role: "staff", clinic_id: organizationId, organization_id: organizationId },
    });
    expect(createError).toBeNull();
    const id = created.user!.id;
    await db.from("users").update({ role: "admin" }).eq("id", id);
    const { data: profile } = await db.from("users").select("*").eq("id", id).single();
    expect(profile).toMatchObject({ role: "admin", organization_id: organizationId, full_name: "Nueva Persona" });
    const { data: edited } = await db.from("users").update({ full_name: "Nombre Editado" }).eq("id", id).eq("organization_id", organizationId).select().single();
    expect((edited as Row).full_name).toBe("Nombre Editado");
    const { data: target } = await db.from("users").select("id").eq("id", id).eq("organization_id", organizationId).single();
    expect(target).toEqual({ id });
    const { error } = await db.auth.admin.deleteUser(id);
    expect(error).toBeNull();
    const after = await db.from("users").select("id").eq("id", id).eq("organization_id", organizationId).single();
    expect(after.data).toBeNull();
  });
});

describe("reportes", () => {
  it("pagina /reports: todas las reservas y todos los contactos de la organizacion", async () => {
    const { db, organizationId } = ctx();
    const [{ data: bookings }, { data: contacts }] = await Promise.all([
      db.from("bookings").select("*").eq("organization_id", organizationId).order("scheduled_at", { ascending: false }),
      db.from("contacts").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    ]);
    const appointments = ((bookings ?? []) as Booking[]).map(bookingToAppointment);
    const patients = ((contacts ?? []) as Contact[]).map(contactToPatient);
    expect(appointments).toHaveLength(35);
    expect(patients).toHaveLength(14);
    const revenue = appointments.filter((a) => a.status === "completed").reduce((acc, a) => acc + (a.cost_at_booking ?? 0), 0);
    expect(revenue).toBeGreaterThan(0);
    // Sin cruzar datos de la otra organizacion.
    expect(appointments.every((a) => a.clinic_id === DEMO_ORG_ID)).toBe(true);
  });
});

describe("herramientas de agentes (lib/agents/tools) sobre la base demo", () => {
  const run = (agent: Parameters<typeof executeTool>[0], tool: string, input: unknown, org = DEMO_ORG_ID) =>
    executeTool(agent, tool, input, { organizationId: org, db: getDemoDb() });

  it("get_org_metrics usa select(count, head) y devuelve conteos reales", async () => {
    const res = await run("analyst", "get_org_metrics", { days: 30 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = res.data as {
      contacts: { total: number };
      opportunities: { by_stage: Record<string, number>; open_value: number };
      bookings: { upcoming: number; in_period_by_status: Record<string, number> };
      tasks: { pending: number };
    };
    expect(data.contacts.total).toBe(14);
    expect(Object.values(data.opportunities.by_stage).reduce((a, b) => a + b, 0)).toBe(10);
    expect(data.opportunities.open_value).toBeGreaterThan(0);
    expect(data.bookings.upcoming).toBeGreaterThan(0);
    expect(data.bookings.in_period_by_status.completed).toBeGreaterThan(0);
    expect(data.tasks.pending).toBe(5);
  });

  it("find_stale_opportunities encuentra las oportunidades estancadas", async () => {
    const res = await run("follow_up", "find_stale_opportunities", { days: 15 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = res.data as { count: number; opportunities: Array<{ title: string; days_since_activity: number }> };
    expect(data.count).toBe(3);
    expect(data.opportunities.every((o) => o.days_since_activity >= 15)).toBe(true);
    expect(data.opportunities.map((o) => o.title)).toContain("Ortodoncia invisible");
  });

  it("search_contact busca con or()/ilike y escapes, y no ve datos de la otra organizacion", async () => {
    const res = await run("receptionist", "search_contact", { query: "vega" });
    expect(res.ok && (res.data as { count: number }).count).toBe(1);
    const own = await run("receptionist", "search_contact", { query: "garza" });
    expect(own.ok && (own.data as { count: number }).count).toBe(0);
    const other = await run("receptionist", "search_contact", { query: "garza" }, DEMO_OTHER_ORG_ID);
    expect(other.ok && (other.data as { count: number }).count).toBe(1);
    const pct = await run("receptionist", "search_contact", { query: "100%" });
    expect(pct.ok && (pct.data as { count: number }).count).toBe(0);
  });

  it("check_availability + create_booking: agenda en un hueco libre y rechaza un solape", async () => {
    const from = new Date();
    const to = new Date(Date.now() + 10 * 86_400_000);
    const avail = await run("booking", "check_availability", {
      date_from: from.toISOString().slice(0, 10),
      date_to: to.toISOString().slice(0, 10),
      duration_minutes: 30,
    });
    expect(avail.ok).toBe(true);
    if (!avail.ok) return;
    const slots = (avail.data as { days: Array<{ slots: Array<{ start: string }> }> }).days.flatMap((d) => d.slots);
    expect(slots.length).toBeGreaterThan(0);
    const { data: contact } = await getDemoDb().from("contacts").select("id").eq("organization_id", DEMO_ORG_ID).limit(1).single();
    const created = await run("booking", "create_booking", { contact_id: (contact as Row).id, scheduled_at: slots[0].start, duration_minutes: 30 });
    expect(created.ok).toBe(true);
    const again = await run("booking", "create_booking", { contact_id: (contact as Row).id, scheduled_at: slots[0].start, duration_minutes: 30 });
    expect(again.ok).toBe(false);
    // Un contacto de la otra organizacion no se puede usar.
    const { data: foreign } = await getDemoDb().from("contacts").select("id").eq("organization_id", DEMO_OTHER_ORG_ID).limit(1).single();
    const cross = await run("booking", "create_booking", { contact_id: (foreign as Row).id, scheduled_at: slots[1].start, duration_minutes: 30 });
    expect(cross.ok).toBe(false);
  });

  it("create_contact, update_stage y calculate_quote", async () => {
    const created = await run("receptionist", "create_contact", { full_name: "Contacto de Prueba", phone: "+52 55 4444 3333" });
    expect(created.ok).toBe(true);
    const { data: opp } = await getDemoDb().from("opportunities").select("id").eq("organization_id", DEMO_ORG_ID).eq("stage", "lead").limit(1).single();
    const stage = await run("sales", "update_stage", { opportunity_id: (opp as Row).id, stage: "contacted" });
    expect(stage.ok).toBe(true);
    const { data: items } = await getDemoDb().from("items").select("id").eq("organization_id", DEMO_ORG_ID).eq("active", true).limit(2);
    const quote = await run("sales", "calculate_quote", { items: (items as Row[]).map((i) => ({ item_id: i.id, quantity: 2 })) });
    expect(quote.ok).toBe(true);
  });
});
