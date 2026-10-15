"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

type Schema = { industry: string; industries: Array<{ id: string; label: string }>; is_admin: boolean; demo: boolean };

// Selector de vertical (demo, solo administradores): cambia modulos, etiquetas y datos de ejemplo del giro.
export function IndustrySwitcher() {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/organization/schema", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Schema | null) => alive && setSchema(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!schema || !schema.demo || !schema.is_admin) return null;

  const change = async (industry: string) => {
    if (industry === schema.industry) return;
    setBusy(true);
    try {
      const res = await fetch("/api/organization/schema", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry }),
      });
      if (!res.ok) throw new Error("http");
      // Recarga completa: el menu, las etiquetas y los datos de cada pagina cambian con el giro.
      window.location.assign("/dashboard");
    } catch {
      toast.error("No se pudo cambiar la vertical");
      setBusy(false);
    }
  };

  return (
    <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
      <Building2 className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
      <span className="sr-only">Vertical de la demo</span>
      <select
        data-testid="industry-switcher"
        aria-label="Vertical de la demo"
        value={schema.industry}
        disabled={busy}
        onChange={(e) => void change(e.target.value)}
        className="h-10 max-w-[6.75rem] sm:max-w-[10.5rem] rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] px-2 text-xs font-bold text-[var(--text-primary)] disabled:opacity-50"
      >
        {schema.industries.map((i) => (
          <option key={i.id} value={i.id}>
            {i.label}
          </option>
        ))}
      </select>
    </label>
  );
}
