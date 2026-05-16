import { SettingsClient } from "@/components/crm/SettingsClient";
import { getClinicContext } from "@/lib/supabase/auth";
import type { Clinic, StaffMember } from "@/types/database";

export default async function SettingsPage() {
  const ctx = await getClinicContext();
  if (!ctx) {
    return <SettingsClient clinic={null} staff={[]} currentUserId="" isAdmin={false} />;
  }

  const { data: clinic } = await ctx.db
    .from("clinics")
    .select("*")
    .eq("id", ctx.clinicId)
    .single();

  const { data: profiles } = await ctx.db
    .from("users")
    .select("*")
    .eq("clinic_id", ctx.clinicId)
    .order("created_at", { ascending: true });

  const staff: StaffMember[] = await Promise.all(
    (profiles ?? []).map(async (p) => {
      const { data: auth } = await ctx.db.auth.admin.getUserById(p.id);
      return { ...p, email: auth?.user?.email ?? "" } as StaffMember;
    }),
  );

  return (
    <SettingsClient
      clinic={(clinic as Clinic) ?? null}
      staff={staff}
      currentUserId={ctx.user.id}
      isAdmin={ctx.profile.role === "admin"}
    />
  );
}
