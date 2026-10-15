// Carga y cambio de la configuracion de tenant (Fase 4). Toda consulta filtra por organization_id.
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantConfig, packFor, type TenantConfig } from "@/lib/industry/packs";
import { isValidTimeZone } from "@/lib/industry/time";
import type { IndustryType } from "@/types/database";

// Nunca lanza: ante un fallo devuelve la configuracion generica (el menu y los agentes siguen funcionando).
export async function loadTenantConfig(db: SupabaseClient, organizationId: string): Promise<TenantConfig> {
  try {
    const res = await db.from("organizations").select("name, industry, settings").eq("id", organizationId).maybeSingle();
    return resolveTenantConfig(res.error ? null : (res.data as Record<string, unknown> | null));
  } catch {
    return resolveTenantConfig(null);
  }
}

export type TenantChange = { industry?: IndustryType; timezone?: string };

// Aplica un cambio de industria y/o zona horaria. Al cambiar de industria, los modulos activos, el
// horario laboral y las etiquetas vuelven a los del paquete; la zona horaria se conserva salvo que se indique.
export async function applyTenantChange(
  db: SupabaseClient,
  organizationId: string,
  change: TenantChange,
): Promise<{ ok: true; config: TenantConfig } | { ok: false; error: string }> {
  if (change.timezone !== undefined && !isValidTimeZone(change.timezone)) return { ok: false, error: "Zona horaria invalida" };
  const cur = await db.from("organizations").select("settings, industry").eq("id", organizationId).maybeSingle();
  if (cur.error || !cur.data) return { ok: false, error: "Organizacion no encontrada" };
  const settings = { ...((cur.data as { settings?: Record<string, unknown> }).settings ?? {}) };
  const patch: Record<string, unknown> = {};

  if (change.industry !== undefined && change.industry !== (cur.data as { industry: string }).industry) {
    const pack = packFor(change.industry);
    settings.active_modules = [...pack.modules];
    settings.business_hours = structuredClone(pack.businessHours);
    delete settings.labels;
    patch.industry = change.industry;
  }
  if (change.timezone !== undefined) settings.timezone = change.timezone;
  patch.settings = settings;

  const up = await db.from("organizations").update(patch).eq("id", organizationId).select("name, industry, settings").single();
  if (up.error || !up.data) return { ok: false, error: "No se pudo guardar" };
  return { ok: true, config: resolveTenantConfig(up.data as Record<string, unknown>) };
}
