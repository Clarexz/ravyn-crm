"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import {
  AGENT_META,
  AUTONOMY_LABELS,
  CONFIGURABLE_AGENTS,
  type ConfigurableAgent,
} from "@/lib/agents/ui";
import { cn } from "@/lib/utils";

type Autonomy = keyof typeof AUTONOMY_LABELS;
type AgentConfig = { enabled: boolean; autonomy: Autonomy };
type Config = { autonomy: Autonomy; agents: Record<ConfigurableAgent, AgentConfig> };

export function SettingsClient() {
  const [config, setConfig] = useState<Config | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/settings", { cache: "no-store" });
      if (!res.ok) throw new Error("http");
      const body = (await res.json()) as { config: Config; is_admin: boolean };
      setConfig(body.config);
      setIsAdmin(body.is_admin);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = async (agent: ConfigurableAgent, change: Partial<AgentConfig>) => {
    if (!config || !isAdmin) return;
    const previous = config;
    setConfig({ ...config, agents: { ...config.agents, [agent]: { ...config.agents[agent], ...change } } });
    setSaving(agent);
    try {
      const res = await fetch("/api/agents/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agents: { [agent]: change } }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "No se pudo guardar");
      }
      const body = (await res.json()) as { config: Config };
      setConfig(body.config);
      toast.success("Configuracion guardada");
    } catch (e) {
      setConfig(previous);
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(null);
    }
  };

  if (failed) {
    return (
      <p role="alert" className="rounded-2xl border border-[var(--border-default)] px-4 py-3 text-sm text-[var(--text-secondary)]">
        No se pudo cargar la configuracion.{" "}
        <button className="font-bold text-[var(--brand-accent)]" onClick={() => void load()}>
          Reintentar
        </button>
      </p>
    );
  }
  if (!config) {
    return (
      <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-3xl bg-[var(--bg-card-hover)]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!isAdmin && (
        <p data-testid="readonly-notice" className="flex items-center gap-2 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          <Lock className="h-4 w-4" aria-hidden /> Solo un administrador puede cambiar esta configuracion.
        </p>
      )}
      <p className="text-xs text-[var(--text-secondary)]">
        Las acciones criticas (cerrar una oportunidad como ganada o perdida, descuentos mayores al 10%) siempre requieren aprobacion de una persona, sin importar el nivel.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {CONFIGURABLE_AGENTS.map((agent) => {
          const meta = AGENT_META[agent];
          const cfg = config.agents[agent];
          return (
            <section
              key={agent}
              data-testid={`agent-card-${agent}`}
              className={cn("rounded-3xl border border-[var(--border-default)] bg-[var(--bg-card)] p-5 transition-opacity", !cfg.enabled && "opacity-70")}
            >
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ background: cfg.enabled ? meta.color : "#64748b" }} />
                <div className="min-w-0">
                  <h2 className="text-sm font-black text-[var(--text-primary)]">{meta.label}</h2>
                  <p className="text-xs text-[var(--text-secondary)]">{meta.role}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  data-testid={`toggle-${agent}`}
                  aria-checked={cfg.enabled}
                  aria-label={`${cfg.enabled ? "Deshabilitar" : "Habilitar"} agente ${meta.label}`}
                  disabled={!isAdmin || saving === agent}
                  onClick={() => update(agent, { enabled: !cfg.enabled })}
                  className={cn(
                    "ml-auto h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    cfg.enabled ? "bg-[var(--brand-accent)]" : "bg-slate-500/40",
                  )}
                >
                  <span className={cn("block h-5 w-5 rounded-full bg-white transition-transform", cfg.enabled && "translate-x-5")} />
                </button>
              </div>

              <fieldset className="mt-4" disabled={!isAdmin || saving === agent}>
                <legend className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Nivel de autonomia</legend>
                <div className="mt-2 space-y-1.5">
                  {(Object.keys(AUTONOMY_LABELS) as Autonomy[]).map((level) => (
                    <label
                      key={level}
                      className={cn(
                        "flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-xs",
                        cfg.autonomy === level ? "border-[var(--brand-accent)] bg-[var(--bg-card-hover)]" : "border-[var(--border-default)]",
                        !isAdmin && "cursor-not-allowed",
                      )}
                    >
                      <input
                        type="radio"
                        name={`autonomy-${agent}`}
                        data-testid={`autonomy-${agent}-${level}`}
                        checked={cfg.autonomy === level}
                        onChange={() => update(agent, { autonomy: level })}
                        className="mt-0.5"
                      />
                      <span>
                        <b className="text-[var(--text-primary)]">{AUTONOMY_LABELS[level].label}</b>
                        <span className="block text-[var(--text-secondary)]">{AUTONOMY_LABELS[level].help}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </section>
          );
        })}
      </div>
    </div>
  );
}
