import { Sidebar } from "@/components/crm/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import { Header } from "@/components/crm/Header";
import { NewAppointmentProvider } from "@/components/crm/NewAppointmentContext";
import { NewAppointmentModal } from "@/components/crm/NewAppointmentModal";
import { getClinicContext } from "@/lib/supabase/auth";
import { TenantProvider } from "@/components/crm/TenantProvider";
import { ModuleGate } from "@/components/crm/ModuleGate";
import { loadTenantConfig } from "@/lib/industry/server";
import { resolveTenantConfig } from "@/lib/industry/packs";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getClinicContext();

  let clinicName = "Clínica";
  let userName = "Usuario";
  let clinicId = "";

  let tenant = resolveTenantConfig({ industry: "general" });

  if (ctx) {
    tenant = await loadTenantConfig(ctx.db, ctx.organizationId);
    userName = ctx.profile.full_name;
    clinicId = ctx.organizationId;

    const { data: clinic } = await ctx.db
      .from("organizations")
      .select("id, name")
      .eq("id", ctx.organizationId)
      .single();

    if (clinic) {
      clinicName = clinic.name;
    }
  }

  return (
    <TenantProvider config={tenant}>
    <NewAppointmentProvider>
      {/* Outer Background (Unified with Sidebar for Frame effect) */}
      <div className="min-h-screen h-[100dvh] w-full bg-[var(--sidebar-bg)] flex overflow-hidden font-sans transition-colors duration-300">

        {/* Sidebar as a distinct dark block (same color as outer bg) */}
        <Sidebar
          clinicName={clinicName}
          userName={userName}
        />
        {/* The Main Canvas (The "Screen" / Surface) */}
        <div className="flex-1 bg-[var(--bg-surface)] my-4 mr-4 ml-0 rounded-[32px] flex flex-col min-w-0 overflow-hidden relative shadow-xl border border-[var(--border-default)] transition-colors duration-300">
          <Header />
          <main className="flex-1 overflow-y-auto p-6 md:p-8 no-scrollbar scroll-smooth">
            <ModuleGate>{children}</ModuleGate>
          </main>
        </div>

      </div>
      <Toaster position="top-right" richColors />
      <NewAppointmentModal clinicId={clinicId} clinicName={clinicName} />
    </NewAppointmentProvider>
    </TenantProvider>
  );
}
