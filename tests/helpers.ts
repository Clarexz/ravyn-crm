import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(__dirname, "..");

const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

/** Recorre un directorio y devuelve rutas absolutas de archivos .ts/.tsx. */
export function walk(dir: string, excluded: string[] = []): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (excluded.some((e) => full === path.join(ROOT, e))) continue;
      out.push(...walk(full, excluded));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

export function rel(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

/** Linea (1-based) de un indice dentro del texto. */
export function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}
