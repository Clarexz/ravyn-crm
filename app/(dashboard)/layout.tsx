import { Sidebar } from "@/components/crm/Sidebar";
import { Header } from "@/components/crm/Header";
import { NewAppointmentProvider } from "@/components/crm/NewAppointmentContext";
import { NewAppointmentModal } from "@/components/crm/NewAppointmentModal";
import { MOCK_CLINIC, MOCK_USER } from "@/lib/mock-data";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <NewAppointmentProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar
          clinicName={MOCK_CLINIC.name}
          userName={MOCK_USER.full_name}
          userEmail={MOCK_CLINIC.email ?? "admin@clinica.com"}
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
      <NewAppointmentModal clinicId={MOCK_CLINIC.id} />
    </NewAppointmentProvider>
  );
}
