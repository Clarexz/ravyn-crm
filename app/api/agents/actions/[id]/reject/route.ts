import { NextRequest } from "next/server";
import { handleReview } from "@/lib/agents/reviewRoute";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  return handleReview(request, params.id, "reject");
}
