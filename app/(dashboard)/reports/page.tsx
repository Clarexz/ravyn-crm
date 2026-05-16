import ReportsClient from "@/components/crm/ReportsClient";
import { MOCK_APPOINTMENTS, MOCK_PATIENTS } from "@/lib/mock-data";

export default function ReportsPage() {
  return (
    <ReportsClient 
      appointments={MOCK_APPOINTMENTS} 
      patients={MOCK_PATIENTS} 
    />
  );
}
