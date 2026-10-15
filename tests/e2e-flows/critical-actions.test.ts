// Fase 6: el 100% de las acciones criticas exige una persona. Se recorre CADA regla critica del catalogo
// (CRITICAL_RULES) x cada caso x los 3 niveles de autonomia: la llamada queda pendiente sin tocar la base,
// staff recibe 403 (tambien intentando bajar el valor al aprobar) y solo el administrador la ejecuta.
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decideApproval, executeToolGoverned, AUTONOMY_LEVELS } from "@/lib/agents/governance";
import { AGENT_TOOL_PERMISSIONS, TOOL_NAMES, type ToolName } from "@/lib/agents/permissions";
import { CRITICAL_RULES, TOOL_REGISTRY, isCriticalCall } from "@/lib/agents/tools";
import type { AgentName } from "@/types/database";
import { ROOT, rel, walk } from "../helpers";
import { CASES, findUncoveredCriticalRules, type Fixture } from "./criticalMatrix";
import { DEMO_ORG_ID, World, setAutonomy } from "./world";

vi.mock("@/lib/supabase/auth", async () => (await import("./world")).authMock);

let w: World;
beforeEach(() => {
  w = new World();
});
afterEach(() => w.dispose());

function fixture(): Fixture {
  const opportunity = w.rows("opportunities").find((o) => o.stage === "qualified" || o.stage === "contacted")!;
  const booking = w.rows("bookings").find((b) => ["pending", "confirmed"].includes(b.status as string) && Date.parse(String(b.scheduled_at)) > w.clock.getTime())!;
  return {
    contactId: w.rows("contacts")[0].id as string,
    opportunityId: opportunity.id as string,
    bookingId: booking.id as string,
    itemId: w.rows("items").find((i) => i.active === true)!.id as string,
    // martes 3-nov-2026 10:00 hora de Ciudad de Mexico, fuera de cualquier cita de la demo
    slot: "2026-11-03T16:00:00.000Z",
  };
}
const agentFor = (tool: ToolName): AgentName =>
  (Object.entries(AGENT_TOOL_PERMISSIONS).find(([, tools]) => (tools as readonly string[]).includes(tool))![0]) as AgentName;
// Todo salvo la bandeja: lo que una accion pendiente jamas debe tocar.
const dataState = (): string =>
  JSON.stringify(Object.fromEntries(Object.entries(w.db.tables).filter(([t]) => t !== "agent_actions").map(([t, rows]) => [t, rows])));

describe("Matriz de acciones criticas: reglas x casos x niveles de autonomia", () => {
  it("el catalogo declara las reglas esperadas", () => {
    expect(CRITICAL_RULES.map((r) => r.id).sort()).toEqual([
      "calculate_quote.discount",
      "cancel_booking.always",
      "create_booking.large_party",
      "create_opportunity.discount",
      "update_stage.close",
    ]);
  });

  for (const rule of CRITICAL_RULES) {
    for (const level of AUTONOMY_LEVELS) {
      it(`${rule.id} [${level}]: pendiente, staff 403, admin ejecuta`, async () => {
        const total = CASES[rule.id].positive(fixture()).length;
        expect(total).toBeGreaterThan(0);
        setAutonomy(w, level);
        const agent = agentFor(rule.tool);

        for (let i = 0; i < total; i += 1) {
          const c = CASES[rule.id].positive(fixture())[i];
          expect(isCriticalCall(rule.tool, c.input), `${rule.id}/${c.label} debe ser critica`).toBe(true);
          const parsed = TOOL_REGISTRY[rule.tool].input.safeParse(c.input);
          expect(parsed.success, `${rule.id}/${c.label}: la entrada del caso debe ser valida`).toBe(true);

          // 1. La llamada del agente NO se ejecuta: queda pendiente y la base de datos no cambia.
          const before = dataState();
          const res = await executeToolGoverned(agent, rule.tool, c.input, { organizationId: DEMO_ORG_ID, db: w.db.asClient(), now: w.clock });
          expect(res.ok).toBe(true);
          const data = (res as { ok: true; data: { status: string; action_id: string } }).data;
          expect(data.status).toBe("pending_approval");
          expect(dataState(), `${rule.id}/${c.label}: la base cambio sin aprobacion`).toBe(before);
          const action = w.action(data.action_id);
          expect(action).toMatchObject({ status: "pending", requires_approval: true, organization_id: DEMO_ORG_ID, agent_name: agent, action_type: rule.tool });
          expect(action.payload).toMatchObject({ critical: true, risk: "high" });

          // 2. Staff no puede aprobarla, ni siquiera modificando el valor para dejarla de ser critica.
          w.login("staff");
          expect((await w.approve(data.action_id)).status).toBe(403);
          const softer = softened(rule.id, c.input);
          if (softer) expect((await w.approve(data.action_id, { input: softer })).status).toBe(403);
          expect(w.action(data.action_id).status).toBe("pending");
          expect(dataState()).toBe(before);
          const staffInbox = await w.inbox();
          expect(staffInbox.body.is_admin).toBe(false);

          // 3. El administrador si: queda ejecutada y registra quien la reviso.
          w.login("admin");
          const ok = await w.approve(data.action_id, { notes: `Matriz ${rule.id}` });
          expect(ok.status).toBe(200);
          const final = w.action(data.action_id);
          expect(final.status, `${rule.id}/${c.label}`).toBe("executed");
          expect(final.reviewed_by).toBeTruthy();
          if (rule.tool !== "calculate_quote") {
            // calculate_quote solo calcula (no escribe): su efecto es el registro de la accion, no un cambio de datos.
            expect(dataState(), `${rule.id}/${c.label}: la aprobacion debe aplicar el cambio`).not.toBe(before);
          }
          // Aprobar de nuevo = 409.
          expect((await w.approve(data.action_id)).status).toBe(409);
          // Para el siguiente caso la cita cancelada/oportunidad cerrada ya cambio: restauramos un estado nuevo.
          w = resetWorld();
          setAutonomy(w, level);
        }
      });
    }
  }

  it("los casos negativos (justo en el limite) no son criticos y respetan el nivel de autonomia", () => {
    const fx = fixture();
    let negatives = 0;
    for (const rule of CRITICAL_RULES) {
      for (const c of CASES[rule.id].negative(fx)) {
        negatives += 1;
        expect(isCriticalCall(rule.tool, c.input), `${rule.id}/${c.label}`).toBe(false);
        expect(decideApproval("autonomous", rule.tool, c.input).critical).toBe(false);
        expect(decideApproval("conservative", rule.tool, c.input).critical).toBe(false);
      }
    }
    expect(negatives).toBeGreaterThan(0);
  });

  it("decideApproval marca como critica y obligatoria cada llamada critica en los 3 niveles", () => {
    const fx = fixture();
    for (const rule of CRITICAL_RULES) {
      for (const c of CASES[rule.id].positive(fx)) {
        for (const level of AUTONOMY_LEVELS) {
          expect(decideApproval(level, rule.tool, c.input), `${rule.id}/${c.label}/${level}`).toMatchObject({ required: true, critical: true });
        }
      }
    }
  });
});

function resetWorld(): World {
  w.dispose();
  return new World();
}

// Variante "menos critica" de la entrada que un revisor sin permiso podria intentar al aprobar.
function softened(ruleId: string, input: Record<string, unknown>): Record<string, unknown> | null {
  switch (ruleId) {
    case "update_stage.close":
      return { ...input, stage: "proposal" };
    case "calculate_quote.discount":
    case "create_opportunity.discount":
      return { ...input, discount_percent: 5 };
    case "create_booking.large_party":
      return { ...input, party_size: 4 };
    default:
      return null;
  }
}

describe("Cobertura obligatoria: nada critico sin matriz", () => {
  const fxStub: Fixture = { contactId: "c", opportunityId: "o", bookingId: "b", itemId: "i", slot: "s" };

  it("toda regla critica del catalogo tiene casos positivos (y negativos si es condicional) y no hay casos huerfanos", () => {
    expect(findUncoveredCriticalRules(CRITICAL_RULES, CASES, fxStub)).toEqual([]);
  });

  it("el detector falla cuando se agrega una herramienta/regla critica sin cobertura (control negativo)", () => {
    const nueva = { id: "nueva_herramienta.peligrosa", tool: "create_task" as ToolName, description: "x", applies: (i: Record<string, unknown>) => i.peligroso === true };
    const problems = findUncoveredCriticalRules([...CRITICAL_RULES, nueva], CASES, fxStub);
    expect(problems).toEqual(["nueva_herramienta.peligrosa: sin casos en la matriz"]);
    const huerfano = findUncoveredCriticalRules(CRITICAL_RULES, { ...CASES, "regla.borrada": CASES["cancel_booking.always"] }, fxStub);
    expect(huerfano).toEqual(["regla.borrada: caso huerfano (la regla ya no existe)"]);
    const sinNegativos = findUncoveredCriticalRules(
      [nueva],
      { [nueva.id]: { positive: () => [{ label: "a", input: { peligroso: true } }], negative: () => [] } },
      fxStub,
    );
    expect(sinNegativos).toEqual(["nueva_herramienta.peligrosa: regla condicional sin casos negativos"]);
  });

  it("toda herramienta marcada critical:true en su definicion tiene al menos una regla", () => {
    for (const name of TOOL_NAMES) {
      if (TOOL_REGISTRY[name].critical) {
        expect(CRITICAL_RULES.some((r) => r.tool === name), `${name} esta marcada critica pero no tiene regla en CRITICAL_RULES`).toBe(true);
      }
    }
  });

  it("toda regla apunta a una herramienta del catalogo que algun agente puede usar", () => {
    for (const r of CRITICAL_RULES) {
      expect(TOOL_NAMES as readonly string[]).toContain(r.tool);
      expect(Object.values(AGENT_TOOL_PERMISSIONS).some((tools) => (tools as readonly string[]).includes(r.tool)), r.id).toBe(true);
    }
  });

  it("las herramientas con regla estan marcadas critical:true (y viceversa) para que la revision no pase desapercibida", () => {
    const withRule = new Set(CRITICAL_RULES.map((r) => r.tool));
    for (const name of TOOL_NAMES) {
      expect(TOOL_REGISTRY[name].critical, `${name}: critical debe coincidir con tener regla`).toBe(withRule.has(name));
    }
  });
});

describe("Sin atajos: ninguna ruta ejecuta herramientas saltandose la gobernanza", () => {
  it("solo executor.ts, governance.ts y el runtime gobernado llaman a executeTool/runPrepared", () => {
    const allowed = new Set(["lib/agents/executor.ts", "lib/agents/governance.ts"]);
    const offenders: string[] = [];
    for (const file of [...walk(path.join(ROOT, "lib")), ...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "components"))]) {
      const r = rel(file);
      if (allowed.has(r)) continue;
      const text = fs.readFileSync(file, "utf8");
      if (/\b(?:executeTool|runPrepared)\s*\(/.test(text) || /\.run\(\s*(?:ctx|\{)/.test(text) && /TOOL_REGISTRY/.test(text)) offenders.push(r);
    }
    expect(offenders).toEqual([]);
  });

  it("el runtime de los especialistas solo usa executeToolGoverned", () => {
    const text = fs.readFileSync(path.join(ROOT, "lib/agents/runtime.ts"), "utf8");
    expect(text).toContain("executeToolGoverned");
    expect(text).not.toMatch(/\bexecuteTool\s*\(/);
  });
});
