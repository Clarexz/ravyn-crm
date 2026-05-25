import { Sidebar } from "@/components/crm/Sidebar";
import { Header } from "@/components/crm/Header";
import { NewAppointmentProvider } from "@/components/crm/NewAppointmentContext";
import { NewAppointmentModal } from "@/components/crm/NewAppointmentModal";
import { getClinicContext } from "@/lib/supabase/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getClinicContext();

  let clinicName = "Clínica";
  let userName = "Usuario";
  let clinicId = "";

  if (ctx) {
    userName = ctx.profile.full_name;
    clinicId = ctx.clinicId;

    const { data: clinic } = await ctx.db
      .from("clinics")
      .select("id, name, email")
      .eq("id", ctx.clinicId)
      .single();

    if (clinic) {
      clinicName = clinic.name;
    }
  }

  return (
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
            {children}
          </main>
        </div>

      </div>
      <NewAppointmentModal clinicId={clinicId} />
    </NewAppointmentProvider>
  );
}
