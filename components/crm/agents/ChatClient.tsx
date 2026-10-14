"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Clock, Send, Wrench } from "lucide-react";
import { notifyAgentsChanged, agentMeta } from "@/lib/agents/ui";
import { cn } from "@/lib/utils";

type ToolTrace = { name: string; ok: boolean; errorCode?: string; pending?: { actionId: string; summary: string } };
type Message =
  | { id: number; from: "user"; text: string }
  | { id: number; from: "agent"; agent: string; text: string; tools: ToolTrace[]; disabled?: boolean; error?: boolean };

const SUGGESTIONS = [
  "Cotiza un blanqueamiento con 20% de descuento para Mariana Vega",
  "Agenda una limpieza para Carlos Mendoza manana",
  "Dame el resumen de la semana",
  "Dale seguimiento a los prospectos sin respuesta",
  "Hola, soy un paciente nuevo",
];

export function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      from: "agent",
      agent: "orchestrator",
      text: "Hola, soy el orquestador. Dime que necesitas y lo paso al agente indicado. Las acciones sensibles quedan en la bandeja para tu aprobacion.",
      tools: [],
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const idRef = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const send = async (text: string) => {
    const clean = text.trim();
    if (!clean || busy) return;
    setMessages((m) => [...m, { id: idRef.current++, from: "user", text: clean }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        agent?: string;
        reply?: string;
        tools?: ToolTrace[];
        disabled?: boolean;
        error?: string;
      };
      if (!res.ok || !body.reply) {
        setMessages((m) => [
          ...m,
          { id: idRef.current++, from: "agent", agent: "orchestrator", text: body.error ?? "No pude procesar la peticion. Intenta de nuevo.", tools: [], error: true },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          { id: idRef.current++, from: "agent", agent: body.agent ?? "orchestrator", text: body.reply!, tools: body.tools ?? [], disabled: body.disabled },
        ]);
        if ((body.tools ?? []).some((t) => t.pending)) notifyAgentsChanged();
      }
    } catch {
      setMessages((m) => [
        ...m,
        { id: idRef.current++, from: "agent", agent: "orchestrator", text: "Sin conexion con el servidor. Intenta de nuevo.", tools: [], error: true },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-[calc(100dvh-20rem)] min-h-[28rem] flex-col rounded-3xl border border-[var(--border-default)] bg-[var(--bg-card)]">
      <div className="flex items-center gap-2 border-b border-[var(--border-default)] px-5 py-3">
        <Bot className="h-4 w-4 text-[var(--brand-accent)]" aria-hidden />
        <p className="text-sm font-bold text-[var(--text-primary)]">Chat con el equipo de agentes</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5" aria-live="polite" data-testid="chat-log">
        {messages.map((m) =>
          m.from === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div data-testid="chat-user" className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--brand-accent)] px-4 py-2.5 text-sm text-white">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} data-testid="chat-agent" data-agent={m.agent} className="max-w-[92%] sm:max-w-[80%]">
              <div className="mb-1 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: agentMeta(m.agent).color }} />
                <span className="text-xs font-bold text-[var(--text-primary)]">{agentMeta(m.agent).label}</span>
              </div>
              <div
                className={cn(
                  "whitespace-pre-line rounded-2xl rounded-tl-md bg-[var(--bg-card-hover)] px-4 py-2.5 text-sm text-[var(--text-primary)]",
                  (m.error || m.disabled) && "border border-[var(--border-default)]",
                )}
              >
                {m.text}
              </div>
              {m.tools.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.tools.map((t, i) => (
                    <span
                      key={`${t.name}-${i}`}
                      data-testid="tool-chip"
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--border-default)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]"
                    >
                      <Wrench className="h-3 w-3" aria-hidden />
                      <b className="font-mono">{t.name}</b>
                      {t.pending ? "en espera" : t.ok ? "ok" : (t.errorCode ?? "error")}
                    </span>
                  ))}
                </div>
              )}
              {m.tools
                .filter((t) => t.pending)
                .map((t) => (
                  <div
                    key={t.pending!.actionId}
                    data-testid="pending-card"
                    className="mt-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3"
                  >
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      <Clock className="h-3.5 w-3.5" aria-hidden /> Accion en espera de aprobacion
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-primary)]">{t.pending!.summary}</p>
                    <Link href="/agents/inbox" className="mt-2 inline-block text-xs font-bold text-[var(--brand-accent)] hover:underline">
                      Revisar en la bandeja
                    </Link>
                  </div>
                ))}
            </div>
          ),
        )}
        {busy && (
          <div data-testid="chat-typing" className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--brand-accent)]" />
            Los agentes estan trabajando...
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-[var(--border-default)] p-3 sm:p-4">
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              disabled={busy}
              className="shrink-0 rounded-full border border-[var(--border-default)] px-3 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex gap-2"
        >
          <input
            data-testid="chat-input"
            value={input}
            maxLength={2000}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe una peticion para tus agentes..."
            aria-label="Mensaje para los agentes"
            className="min-w-0 flex-1 rounded-2xl border border-[var(--border-default)] bg-transparent px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-accent)]"
          />
          <button
            type="submit"
            data-testid="chat-send"
            disabled={!input.trim() || busy}
            aria-label="Enviar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-accent)] text-white disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
