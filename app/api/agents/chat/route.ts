import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleMessage } from "@/lib/agents/orchestrator";
import { LlmConfigError, createLlmClient, type LlmClient } from "@/lib/agents/llm";
import { getClinicContext } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  text: z.string().trim().min(1, "El texto es obligatorio").max(2000, "El texto excede 2000 caracteres"),
});

export async function POST(request: NextRequest) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }
  const body = bodySchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Cuerpo invalido" }, { status: 400 });
  }

  let llm: LlmClient;
  try {
    llm = createLlmClient();
  } catch (error) {
    if (error instanceof LlmConfigError) {
      return NextResponse.json(
        { error: "El servicio de IA no esta configurado: falta la clave ANTHROPIC_API_KEY en el servidor." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  try {
    // organizationId proviene siempre de la sesion autenticada, nunca del body.
    const result = await handleMessage(body.data.text, { llm, organizationId: ctx.organizationId, db: ctx.db });
    return NextResponse.json({ agent: result.agent, reply: result.reply, tools: result.tools, disabled: result.disabled === true });
  } catch (error) {
    console.error("[POST /api/agents/chat]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
