"use client";

import { Bot, User } from "lucide-react";
import { agentMeta } from "@/lib/agents/ui";
import { cn } from "@/lib/utils";

type Props = {
  type: "human" | "agent";
  // Para agentes: nombre del agente. Para personas: id (no se muestra).
  id: string;
  name?: string | null;
  className?: string;
};

// Insignia de autor: persona o agente concreto (con color propio).
export function AuthorBadge({ type, id, name, className }: Props) {
  if (type === "agent") {
    const meta = agentMeta(id);
    return (
      <span
        data-testid="author-badge"
        data-author-type="agent"
        data-author-id={id}
        title={`Realizado por el agente ${meta.label}`}
        className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold", className)}
        style={{ color: meta.color, borderColor: `${meta.color}66`, background: `${meta.color}1a` }}
      >
        <Bot className="h-3 w-3" aria-hidden />
        Agente {meta.label}
      </span>
    );
  }
  return (
    <span
      data-testid="author-badge"
      data-author-type="human"
      title="Realizado por una persona"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--bg-card-hover)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-secondary)]",
        className,
      )}
    >
      <User className="h-3 w-3" aria-hidden />
      {name?.trim() || "Persona"}
    </span>
  );
}
