import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Returns auth context + an admin (service-role) DB client.
// RLS is bypassed by `db`, so every query MUST filter by ctx.organizationId explicitly.
// Tenant isolation is enforced in application code, not by the database.
export async function getClinicContext() {
  const supabase = await createClient();
  const db = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error: profileError } = await db
    .from("users")
    .select("id, clinic_id, organization_id, full_name, role")
    .eq("id", user.id)
    .single();

  // organization_id is populated for every user (migration 003). During the v1 -> v2
  // transition organizations.id equals clinics.id, so clinic_id is a safe fallback.
  const organizationId = (profile?.organization_id ?? profile?.clinic_id) as string | undefined;

  if (!profile || !organizationId) {
    console.error("[getClinicContext] No profile/organization_id for auth user", user.id, profileError?.message);
    return null;
  }

  return {
    supabase,
    db,
    user,
    profile,
    organizationId,
    // Deprecated alias kept only until the last v1 consumer is migrated (Fase 0b).
    clinicId: organizationId,
  };
}
