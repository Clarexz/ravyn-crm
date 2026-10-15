import { PipelineClient } from "@/components/crm/PipelineClient";
import { loadBoardCards } from "@/lib/pipeline/board";
import { STALE_DAYS } from "@/lib/pipeline/stages";
import { getClinicContext } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const ctx = await getClinicContext();
  if (!ctx) return <PipelineClient initialCards={[]} isAdmin={false} staleDays={STALE_DAYS} />;
  const cards = await loadBoardCards(ctx.db, ctx.organizationId);
  return <PipelineClient initialCards={cards ?? []} loadFailed={cards === null} isAdmin={ctx.profile.role === "admin"} staleDays={STALE_DAYS} />;
}
