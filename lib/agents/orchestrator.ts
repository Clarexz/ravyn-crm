// Orquestador: clasifica la intencion y delega en el especialista. Nunca lanza.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { buildIndustryContext } from "@/lib/industry/packs";
import { loadTenantConfig } from "@/lib/industry/server";
import type { LlmClient } from "@/lib/agents/llm";
import { CLASSIFIER_PROMPT } from "@/lib/agents/prompts";
import { runSpecialist, type ToolTrace } from "@/lib/agents/runtime";
import { loadOrgAgentConfig } from "@/lib/agents/settings";
import { SPECIALIST_NAMES, SPECIALISTS, type SpecialistName } from "@/lib/agents/specialists";

export const DEFAULT_AGENT: SpecialistName = "receptionist";

const classificationSchema = z.object({
  agent: z.enum(SPECIALIST_NAMES),
  reason: z.string().trim().min(1).max(300),
});

export type Classification = {
  agent: SpecialistName;
  reason: string;
  source: "llm" | "fallback";
};

// Palabras clave (sin acentos, en minuscula) por especialista. Cada una se busca al inicio de palabra.
const KEYWORDS: Record<SpecialistName, string[]> = {
  sales: ["cotiz", "presupuesto", "precio", "descuento", "costo", "tarifa", "propuesta", "comprar", "venta", "oportunidad"],
  booking: ["agend", "cita", "reserv", "disponib", "horario", "reprogram", "turno", "cancelar"],
  follow_up: ["seguimiento", "sin respuesta", "no ha respondido", "no contesta", "no contesto", "recordatorio", "recordar", "prospecto", "pendiente"],
  analyst: ["reporte", "metrica", "estadistica", "indicador", "kpi", "ingresos", "conversion", "desempeno", "resumen del mes"],
  receptionist: ["hola", "buenos dias", "buenas tardes", "buenas noches", "alta", "registrar", "nuevo cliente", "dar de alta", "datos de contacto"],
};

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Respaldo determinista: gana el especialista con mas coincidencias; empate o cero -> recepcionista.
export function classifyByKeywords(text: string): Classification {
  const normalized = normalize(text);
  let best: SpecialistName = DEFAULT_AGENT;
  let bestScore = 0;
  let tie = false;
  for (const agent of SPECIALIST_NAMES) {
    const score = KEYWORDS[agent].filter((kw) => new RegExp(`\\b${kw}`).test(normalized)).length;
    if (score > bestScore) {
      best = agent;
      bestScore = score;
      tie = false;
    } else if (score > 0 && score === bestScore) {
      tie = true;
    }
  }
  if (bestScore === 0 || tie) {
    return { agent: DEFAULT_AGENT, reason: "Mensaje ambiguo: se atiende en recepcion", source: "fallback" };
  }
  return { agent: best, reason: "Clasificacion por palabras clave", source: "fallback" };
}

function parseClassification(raw: string): z.infer<typeof classificationSchema> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = classificationSchema.safeParse(JSON.parse(raw.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function classifyIntent(text: string, llm: LlmClient): Promise<Classification> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { agent: DEFAULT_AGENT, reason: "Mensaje vacio", source: "fallback" };
  }
  try {
    const response = await llm.complete({
      tier: "classifier",
      system: CLASSIFIER_PROMPT,
      messages: [{ role: "user", content: trimmed }],
    });
    const parsed = parseClassification(response.text);
    if (parsed) return { ...parsed, source: "llm" };
  } catch {
    // Se cae al respaldo determinista.
  }
  return classifyByKeywords(trimmed);
}

export type HandleMessageContext = {
  llm: LlmClient;
  organizationId: string;
  db: SupabaseClient;
  industryContext?: string;
  now?: Date;
};

export type HandleMessageResult = {
  agent: SpecialistName;
  reason: string;
  reply: string;
  tools: ToolTrace[];
  // true si el especialista elegido esta deshabilitado en el Centro de Control.
  disabled?: boolean;
};

export async function handleMessage(text: string, ctx: HandleMessageContext): Promise<HandleMessageResult> {
  const classification = await classifyIntent(text, ctx.llm);
  const config = await loadOrgAgentConfig(ctx.db, ctx.organizationId);
  if (!config.agents[classification.agent].enabled) {
    return {
      agent: classification.agent,
      reason: classification.reason,
      reply: `El agente ${SPECIALISTS[classification.agent].label} esta deshabilitado en el Centro de Control. Activalo en Agentes > Configuracion para que pueda atender esta solicitud.`,
      tools: [],
      disabled: true,
    };
  }
  // Fase 4: el contexto de industria sale de la configuracion de la organizacion (siempre por organization_id).
  const industryContext =
    ctx.industryContext ?? buildIndustryContext(await loadTenantConfig(ctx.db, ctx.organizationId), ctx.now ?? new Date());
  const run = await runSpecialist(classification.agent, text.trim(), { ...ctx, industryContext });
  return { agent: classification.agent, reason: classification.reason, reply: run.reply, tools: run.tools };
}
