import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Returns auth context + an admin (service-role) DB client.
// RLS is bypassed by `db`, so every query MUST filter by ctx.clinicId explicitly.
// Tenant isolation is enforced in application code, not by the database.
export async function getClinicContext() {
  const supabase = await createClient();
  const db = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error: profileError } = await db
    .from("users")
    .select("id, clinic_id, full_name, role")
    .eq("id", user.id)
    .single();

  if (!profile?.clinic_id) {
    console.error("[getClinicContext] No profile/clinic_id for auth user", user.id, profileError?.message);
    return null;
  }

  return {
    supabase,
    db,
    user,
    profile,
    clinicId: profile.clinic_id as string,
  };
}
