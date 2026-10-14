import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, rel, walk } from "../helpers";

// Heuristica: un archivo que consulta una tabla v2 con tenant debe mencionar
// organization_id u organizationId (filtro explicito o payload con tenant).
// Excepcion documentada: lib/agents-demo (datos simulados); no se escanea porque
// solo se revisan app/api y app/(dashboard).
const V2_TABLES = [
  "contacts", "items", "bookings", "opportunities", "activities",
  "agent_actions", "budgets", "budget_members", "budget_services", "organizations",
];
const PATTERN = new RegExp(`\\.from\\(\\s*(["'\`])(${V2_TABLES.join("|")})\\1`);

describe("guardia: filtro por tenant", () => {
  it("archivos que usan tablas v2 mencionan organization_id/organizationId", () => {
    const files = [
      ...walk(path.join(ROOT, "app", "api")),
      ...walk(path.join(ROOT, "app", "(dashboard)")),
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      if (!PATTERN.test(text)) continue;
      if (!/organization_id|organizationId/.test(text)) offenders.push(rel(file));
    }
    expect(
      offenders,
      `Archivos con tablas v2 sin organization_id/organizationId:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
