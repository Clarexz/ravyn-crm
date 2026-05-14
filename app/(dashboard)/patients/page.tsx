import PatientsClient from "@/components/crm/PatientsClient";
import { MOCK_PATIENTS } from "@/lib/mock-data";

export default function PatientsPage() {
  return <PatientsClient patients={MOCK_PATIENTS} />;
}
