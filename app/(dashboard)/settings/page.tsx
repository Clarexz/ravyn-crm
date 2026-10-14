import { SettingsClient } from "@/components/crm/SettingsClient";
import { getClinicContext } from "@/lib/supabase/auth";
import type { Clinic, StaffMember } from "@/types/database";

export default async function SettingsPage() {
  const ctx = await getClinicContext();
  if (!ctx) {
    return <SettingsClient clinic={null} staff={[]} currentUserId="" isAdmin={false} />;
  }

  const { data: clinic } = await ctx.db
    .from("organizations")
    .select("id, name, phone, email, subdomain, plan, created_at")
    .eq("id", ctx.organizationId)
    .single();

  const { data: profiles } = await ctx.db
    .from("users")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: true });

  const staff: StaffMember[] = await Promise.all(
    (profiles ?? []).map(async (p) => {
      const { data: auth } = await ctx.db.auth.admin.getUserById(p.id);
      return { ...p, email: auth?.user?.email ?? "" } as StaffMember;
    }),
  );

  return (
    <SettingsClient
      clinic={clinic ? ({ ...clinic, phone: clinic.phone ?? undefined, email: clinic.email ?? undefined, subdomain: clinic.subdomain ?? undefined } as Clinic) : null}
      staff={staff}
      currentUserId={ctx.user.id}
      isAdmin={ctx.profile.role === "admin"}
    />
  );
}
