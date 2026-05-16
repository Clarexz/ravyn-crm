import { Sidebar } from "@/components/crm/Sidebar";
import { Header } from "@/components/crm/Header";
import { NewAppointmentProvider } from "@/components/crm/NewAppointmentContext";
import { NewAppointmentModal } from "@/components/crm/NewAppointmentModal";
import { getClinicContext } from "@/lib/supabase/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getClinicContext();

  let clinicName = "Clínica";
  let userName = "Usuario";
  let userEmail = ctx?.user.email ?? "";
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
      userEmail = clinic.email ?? userEmail;
    }
  }

  return (
    <NewAppointmentProvider>
      <div className="flex h-screen h-[100dvh] bg-background overflow-hidden">
        <Sidebar
          clinicName={clinicName}
          userName={userName}
          userEmail={userEmail}
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
      <NewAppointmentModal clinicId={clinicId} />
    </NewAppointmentProvider>
  );
}
