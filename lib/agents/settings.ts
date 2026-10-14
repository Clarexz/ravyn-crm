// Configuracion de agentes por organizacion (Fase 3). Dueno: agente maestro.
// Forma en organizations.settings:
//   agent_autonomy: nivel global (compatibilidad con la Fase 2; sirve de valor por defecto)
//   agents: { [agente]: { enabled?: boolean, autonomy?: AgentAutonomy } }
// Un agente sin entrada hereda: habilitado y el nivel global.
import type { SupabaseClient } from "@supabase/supabase-js";
import { SPECIALIST_NAMES, type SpecialistName } from "@/lib/agents/prompts";
import type { AgentAutonomy, AgentName } from "@/lib/agents/types";

export const DEFAULT_AUTONOMY: AgentAutonomy = "balanced";
export const AUTONOMY_LEVELS: readonly AgentAutonomy[] = ["conservative", "balanced", "autonomous"];

export type AgentConfig = { enabled: boolean; autonomy: AgentAutonomy };
export type OrgAgentConfig = {
  // Nivel global de la organizacion (valor por defecto de los agentes sin ajuste propio).
  autonomy: AgentAutonomy;
  agents: Record<SpecialistName, AgentConfig>;
};
export type AgentConfigUpdate = Partial<Record<SpecialistName, Partial<AgentConfig>>>;

export function isAutonomy(value: unknown): value is AgentAutonomy {
  return typeof value === "string" && (AUTONOMY_LEVELS as readonly string[]).includes(value);
}

export function isSpecialist(agent: AgentName): agent is SpecialistName {
  return (SPECIALIST_NAMES as readonly string[]).includes(agent);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

// Interpreta organizations.settings. Valores invalidos se ignoran (hereda el global).
export function resolveAgentConfig(settings: unknown): OrgAgentConfig {
  const raw = asRecord(settings);
  const autonomy = isAutonomy(raw.agent_autonomy) ? raw.agent_autonomy : DEFAULT_AUTONOMY;
  const perAgent = asRecord(raw.agents);
  const agents = Object.fromEntries(
    SPECIALIST_NAMES.map((name) => {
      const entry = asRecord(perAgent[name]);
      return [
        name,
        {
          enabled: entry.enabled === false ? false : true,
          autonomy: isAutonomy(entry.autonomy) ? entry.autonomy : autonomy,
        } satisfies AgentConfig,
      ];
    }),
  ) as Record<SpecialistName, AgentConfig>;
  return { autonomy, agents };
}

// Configuracion efectiva de un agente. El orquestador no es configurable: siempre activo.
export function configFor(config: OrgAgentConfig, agent: AgentName): AgentConfig {
  return isSpecialist(agent) ? config.agents[agent] : { enabled: true, autonomy: config.autonomy };
}

// Ante un fallo de lectura: agentes activos pero con el nivel mas estricto.
const STRICT_CONFIG: OrgAgentConfig = {
  autonomy: "conservative",
  agents: Object.fromEntries(
    SPECIALIST_NAMES.map((name) => [name, { enabled: true, autonomy: "conservative" } satisfies AgentConfig]),
  ) as Record<SpecialistName, AgentConfig>,
};

async function loadSettings(db: SupabaseClient, organizationId: string): Promise<Record<string, unknown> | null> {
  const res = await db.from("organizations").select("settings").eq("id", organizationId).maybeSingle();
  if (res.error || !res.data) return null;
  return asRecord((res.data as { settings?: unknown }).settings);
}

export async function loadOrgAgentConfig(db: SupabaseClient, organizationId: string): Promise<OrgAgentConfig> {
  try {
    const settings = await loadSettings(db, organizationId);
    return settings ? resolveAgentConfig(settings) : STRICT_CONFIG;
  } catch {
    return STRICT_CONFIG;
  }
}

// Mezcla los cambios en settings conservando el resto de las claves. Pura.
export function applyAgentConfigUpdate(settings: unknown, update: AgentConfigUpdate): Record<string, unknown> {
  const raw = asRecord(settings);
  const agents = { ...asRecord(raw.agents) };
  for (const name of SPECIALIST_NAMES) {
    const change = update[name];
    if (!change) continue;
    const entry = { ...asRecord(agents[name]) };
    if (typeof change.enabled === "boolean") entry.enabled = change.enabled;
    if (isAutonomy(change.autonomy)) entry.autonomy = change.autonomy;
    agents[name] = entry;
  }
  return { ...raw, agents };
}

export async function saveOrgAgentConfig(
  db: SupabaseClient,
  organizationId: string,
  update: AgentConfigUpdate,
): Promise<OrgAgentConfig | null> {
  try {
    const current = await loadSettings(db, organizationId);
    if (!current) return null;
    const next = applyAgentConfigUpdate(current, update);
    const res = await db.from("organizations").update({ settings: next }).eq("id", organizationId).select("settings");
    if (res.error || !Array.isArray(res.data) || res.data.length !== 1) return null;
    return resolveAgentConfig(next);
  } catch {
    return null;
  }
}
