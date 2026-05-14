import AppointmentsClient from "@/components/crm/AppointmentsClient";
import { MOCK_APPOINTMENTS, MOCK_CLINIC, MOCK_USER } from "@/lib/mock-data";

export default function AppointmentsPage() {
  return (
    <AppointmentsClient
      appointments={MOCK_APPOINTMENTS}
      clinicId={MOCK_CLINIC.id}
      userId={MOCK_USER.id}
    />
  );
}
