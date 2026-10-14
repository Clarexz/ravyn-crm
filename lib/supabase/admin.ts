import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDemoMode } from "@/lib/demo/config";
import { getDemoDb } from "@/lib/demo";

export function createAdminClient(): SupabaseClient {
  // Modo demo: base en memoria con datos simulados, sin Supabase (docs/v2/decisiones.md, D-08).
  if (isDemoMode()) return getDemoDb();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey
  );
}
