// Contrato del motor de agentes (Fase 1). Dueno: agente maestro.
// Las herramientas son la unica via por la que un agente toca la base de datos.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ZodType } from "zod";
import type { AgentName } from "@/types/database";

export type { AgentName };

// Contexto que recibe cada herramienta. organizationId SIEMPRE viene de la sesion
// autenticada, nunca del modelo ni del cliente. El db es service role: toda
// consulta debe filtrar por organizationId.
export type ToolContext = {
  organizationId: string;
  db: SupabaseClient;
  agent: AgentName;
  now?: Date;
};

export type ToolRisk = "low" | "medium" | "high";

export type ToolDefinition<I = unknown, O = unknown> = {
  name: string;
  description: string;
  input: ZodType<I>;
  // low: lectura o registro de comunicacion; medium: agendamiento; high: transaccion o cancelacion.
  risk: ToolRisk;
  // true si en la Fase 2 la herramienta debe pasar por aprobacion humana.
  critical: boolean;
  run: (ctx: ToolContext, input: I) => Promise<O>;
};

export type ToolErrorCode =
  | "PERMISSION_DENIED"
  | "UNKNOWN_TOOL"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "EXECUTION_FAILED";

export type ToolResult<O = unknown> =
  | { ok: true; data: O }
  | { ok: false; error: { code: ToolErrorCode; message: string } };

// Resumen que se entrega al modelo (nombre, descripcion y JSON Schema de entrada).
export type ToolSummary = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};
