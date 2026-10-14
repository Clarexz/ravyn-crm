import { describe, expect, it } from "vitest";
import { AGENT_TOOL_PERMISSIONS, TOOL_NAMES, canUseTool } from "@/lib/agents/permissions";
import { executeTool, listToolsForAgent } from "@/lib/agents/executor";
import type { AgentName } from "@/lib/agents/types";
import { IDS, NOW, ORG_A, createFakeDb } from "./fakeDb";

const AGENTS = Object.keys(AGENT_TOOL_PERMISSIONS) as AgentName[];

describe("matriz de permisos", () => {
  it("AGT-02: el recepcionista no puede ejecutar update_stage y la base no se toca", async () => {
    const db = createFakeDb();
    const before = db.snapshot();
    const res = await executeTool(
      "receptionist",
      "update_stage",
      { opportunity_id: IDS.oppA1, stage: "won" },
      { organizationId: ORG_A, db: db.asClient(), now: NOW },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("PERMISSION_DENIED");
    expect(db.calls).toEqual([]);
    expect(db.snapshot()).toEqual(before);
  });

  it("el permiso se evalua antes que la validacion de entrada", async () => {
    const db = createFakeDb();
    const res = await executeTool("analyst", "create_contact", { basura: true }, { organizationId: ORG_A, db: db.asClient() });
    expect(res).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(db.calls).toEqual([]);
  });

  it("herramienta inexistente devuelve UNKNOWN_TOOL (incluidos nombres de prototipo)", async () => {
    const db = createFakeDb();
    for (const name of ["no_existe", "constructor", "__proto__", "toString"]) {
      const res = await executeTool("sales", name, {}, { organizationId: ORG_A, db: db.asClient() });
      expect(res).toMatchObject({ ok: false, error: { code: "UNKNOWN_TOOL" } });
    }
    expect(db.calls).toEqual([]);
  });

  it("el orquestador no tiene herramientas", async () => {
    expect(listToolsForAgent("orchestrator")).toEqual([]);
    for (const tool of TOOL_NAMES) {
      const res = await executeTool("orchestrator", tool, {}, { organizationId: ORG_A, db: createFakeDb().asClient() });
      expect(res).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    }
  });

  it.each(AGENTS)("%s solo ve en listToolsForAgent lo que permite la matriz", (agent) => {
    const names = listToolsForAgent(agent).map((t) => t.name);
    expect(names).toEqual([...AGENT_TOOL_PERMISSIONS[agent]]);
    for (const tool of TOOL_NAMES) expect(names.includes(tool)).toBe(canUseTool(agent, tool));
  });

  it("cada resumen trae descripcion y JSON Schema de objeto", () => {
    for (const agent of AGENTS) {
      for (const t of listToolsForAgent(agent)) {
        expect(t.description.length).toBeGreaterThan(10);
        expect(t.inputSchema.type).toBe("object");
        expect(t.inputSchema.properties).toBeTypeOf("object");
      }
    }
  });

  it("todo agente-herramienta no permitido da PERMISSION_DENIED sin tocar la base", async () => {
    const db = createFakeDb();
    for (const agent of AGENTS) {
      for (const tool of TOOL_NAMES) {
        if (canUseTool(agent, tool)) continue;
        const res = await executeTool(agent, tool, {}, { organizationId: ORG_A, db: db.asClient() });
        expect(res).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      }
    }
    expect(db.calls).toEqual([]);
  });
});
