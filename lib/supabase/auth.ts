import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { isDemoMode, DEMO_USER_ID } from "@/lib/demo/config";
import { DEMO_STAFF_IDS } from "@/lib/demo/seed";

type ClinicProfile = {
  id: string;
  clinic_id: string | null;
  organization_id: string | null;
  full_name: string;
  role: "admin" | "staff";
};

export type ClinicContext = {
  // null in demo mode: there is no auth session.
  supabase: SupabaseClient | null;
  db: SupabaseClient;
  user: { id: string; email?: string };
  profile: ClinicProfile;
  organizationId: string;
  // Deprecated alias kept only until the last v1 consumer is migrated (Fase 0b).
  clinicId: string;
};

// Returns auth context + an admin (service-role) DB client.
// RLS is bypassed by `db`, so every query MUST filter by ctx.organizationId explicitly.
// Tenant isolation is enforced in application code, not by the database.
export async function getClinicContext(): Promise<ClinicContext | null> {
  const db = createAdminClient();

  let supabase: SupabaseClient | null = null;
  let userId: string;
  let email: string | undefined;

  if (isDemoMode()) {
    // Demo mode: fixed admin user of the demo organization, no session needed.
    // La cookie ravyn_demo_role=staff (solo en demo) simula a un usuario staff para probar permisos (D-12).
    userId = DEMO_USER_ID;
    try {
      if (cookies().get("ravyn_demo_role")?.value === "staff") userId = DEMO_STAFF_IDS.reception;
    } catch {
      // fuera de un contexto de peticion (pruebas): se queda el administrador
    }
  } else {
    supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    userId = user.id;
    email = user.email;
  }

  const { data: profile, error: profileError } = await db
    .from("users")
    .select("id, clinic_id, organization_id, full_name, role")
    .eq("id", userId)
    .single();

  // organization_id is populated for every user (migration 003). During the v1 -> v2
  // transition organizations.id equals clinics.id, so clinic_id is a safe fallback.
  const organizationId = (profile?.organization_id ?? profile?.clinic_id) as string | undefined;

  if (!profile || !organizationId) {
    console.error("[getClinicContext] No profile/organization_id for auth user", userId, profileError?.message);
    return null;
  }

  return {
    supabase,
    db,
    user: { id: userId, email },
    profile: profile as ClinicProfile,
    organizationId,
    clinicId: organizationId,
  };
}
