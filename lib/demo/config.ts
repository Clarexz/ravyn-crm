// Modo demo: todos los datos son simulados y preprogramados, sin Supabase ni LLM reales.
// Dueno: agente maestro. Por defecto el modo demo esta ACTIVO; para datos reales
// definir RAVYN_DATA_MODE=live (ver docs/v2/decisiones.md, D-08).
export function isDemoMode(): boolean {
  return process.env.RAVYN_DATA_MODE !== "live";
}

// Identidades fijas de la organizacion y el usuario de demo.
export const DEMO_ORG_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_OTHER_ORG_ID = "00000000-0000-4000-8000-000000000002";
export const DEMO_USER_ID = "00000000-0000-4000-8000-0000000000a1";
