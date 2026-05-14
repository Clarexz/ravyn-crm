import { SettingsClient } from "@/components/crm/SettingsClient";
import { MOCK_CLINIC, MOCK_STAFF } from "@/lib/mock-data";

export default function SettingsPage() {
  return <SettingsClient clinic={MOCK_CLINIC} staff={MOCK_STAFF} />;
}
