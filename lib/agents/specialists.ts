// Definicion de los 5 especialistas. La lista de herramientas SIEMPRE se deriva de
// listToolsForAgent (la matriz de permisos vive solo en permissions.ts).
import { listToolsForAgent } from "@/lib/agents/executor";
import { SPECIALIST_NAMES, SPECIALIST_ROLES, buildSpecialistPrompt, type PromptOptions, type SpecialistName } from "@/lib/agents/prompts";
import type { ToolSummary } from "@/lib/agents/types";

export { SPECIALIST_NAMES };
export type { SpecialistName };

export type SpecialistDefinition = {
  name: SpecialistName;
  label: string;
  systemPrompt: (options?: PromptOptions) => string;
  tools: () => ToolSummary[];
};

export const SPECIALISTS: Record<SpecialistName, SpecialistDefinition> = Object.fromEntries(
  SPECIALIST_NAMES.map((name) => [
    name,
    {
      name,
      label: SPECIALIST_ROLES[name].label,
      systemPrompt: (options?: PromptOptions) => buildSpecialistPrompt(name, options),
      tools: () => listToolsForAgent(name),
    } satisfies SpecialistDefinition,
  ]),
) as Record<SpecialistName, SpecialistDefinition>;

export function isSpecialistName(value: unknown): value is SpecialistName {
  return typeof value === "string" && (SPECIALIST_NAMES as readonly string[]).includes(value);
}
