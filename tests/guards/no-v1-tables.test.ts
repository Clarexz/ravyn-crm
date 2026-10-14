import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, lineOf, rel, walk } from "../helpers";

// Tablas v1 que ya no deben consultarse (D-03). lib/agents-demo queda excluido.
const V1_TABLES = ["clinics", "patients", "services", "appointments", "appointment_logs"];
const PATTERN = new RegExp(`\\.from\\(\\s*(["'\`])(${V1_TABLES.join("|")})\\1`, "g");

describe("guardia: sin tablas v1", () => {
  it("app/ y lib/ no usan .from() con tablas v1", () => {
    const files = [
      ...walk(path.join(ROOT, "app")),
      ...walk(path.join(ROOT, "lib"), ["lib/agents-demo"]),
    ];
    const hits: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      for (const m of Array.from(text.matchAll(PATTERN))) {
        hits.push(`${rel(file)}:${lineOf(text, m.index ?? 0)} -> .from("${m[2]}")`);
      }
    }
    expect(hits, `Referencias a tablas v1 encontradas:\n${hits.join("\n")}`).toEqual([]);
  });
});
