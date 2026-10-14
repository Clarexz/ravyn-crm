"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Check, Send, Wrench, X, Inbox, Sparkles, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEMO_AGENTS,
  SUGGESTIONS,
  findReply,
  type DemoAgentId,
  type Proposal,
  type ToolCall,
} from "@/lib/agents-demo/script";

// DEMO: todo el comportamiento es simulado en el navegador (ver lib/agents-demo/script.ts).

type ChatMessage =
  | { id: number; from: "user"; text: string }
  | { id: number; from: "agent"; agent: DemoAgentId; text: string; tools: ToolCall[]; routedFrom?: boolean };

type PendingAction = {
  id: number;
  agent: DemoAgentId;
  proposal: Proposal;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

const agentById = (id: DemoAgentId) => DEMO_AGENTS.find((a) => a.id === id)!;
const nowLabel = () => new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

export function AgentsDemoClient() {
  const [selected, setSelected] = useState<DemoAgentId>("orchestrator");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      from: "agent",
      agent: "orchestrator",
      text: "Hola, soy el orquestador. Dime que necesitas y lo paso al agente indicado. Las acciones sensibles quedan en la bandeja para tu aprobacion.",
      tools: [],
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState<DemoAgentId | null>(null);
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [enabled, setEnabled] = useState<Record<DemoAgentId, boolean>>({
    orchestrator: true,
    receptionist: true,
    sales: true,
    booking: true,
    follow_up: true,
    analyst: true,
  });
  const idRef = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typing]);

  const pending = actions.filter((a) => a.status === "pending");
  const history = actions.filter((a) => a.status !== "pending");

  const send = (text: string) => {
    const clean = text.trim();
    if (!clean || typing) return;
    const userId = idRef.current++;
    setMessages((m) => [...m, { id: userId, from: "user", text: clean }]);
    setInput("");

    const reply = findReply(clean, selected);
    setTyping("orchestrator");

    setTimeout(() => setTyping(reply.agent), 600);
    setTimeout(() => {
      const msgId = idRef.current++;
      if (!enabled[reply.agent]) {
        setMessages((m) => [
          ...m,
          {
            id: msgId,
            from: "agent",
            agent: "orchestrator",
            text: `El agente ${agentById(reply.agent).name} esta desactivado en el Centro de Control. Activalo para que pueda atender esta peticion.`,
            tools: [],
          },
        ]);
        setTyping(null);
        return;
      }
      setMessages((m) => [
        ...m,
        {
          id: msgId,
          from: "agent",
          agent: reply.agent,
          text: reply.text,
          tools: reply.tools,
          routedFrom: selected === "orchestrator" && reply.agent !== "orchestrator",
        },
      ]);
      if (reply.proposal) {
        setActions((a) => [
          { id: idRef.current++, agent: reply.agent, proposal: reply.proposal!, status: "pending", createdAt: nowLabel() },
          ...a,
        ]);
      }
      setTyping(null);
    }, 1900);
  };

  const resolve = (id: number, status: "approved" | "rejected") => {
    const action = actions.find((a) => a.id === id);
    if (!action) return;
    setActions((list) => list.map((a) => (a.id === id ? { ...a, status } : a)));
    setMessages((m) => [
      ...m,
      {
        id: idRef.current++,
        from: "agent",
        agent: action.agent,
        text:
          status === "approved"
            ? `Aprobado. Ejecute: ${action.proposal.title}. Quedo registrado en el historial con tu usuario como revisor.`
            : `Entendido, la propuesta "${action.proposal.title}" fue rechazada. No modifique ningun dato.`,
        tools: status === "approved" ? [{ name: action.proposal.actionType, result: "ejecutada" }] : [],
      },
    ]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">Centro de Agentes</h1>
          <p className="text-sm text-[var(--text-secondary)]">Tu equipo de agentes opera el CRM. Tu apruebas lo importante.</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-500">
          <Sparkles className="h-3.5 w-3.5" /> Modo demo
        </span>
      </div>

      <div className="rounded-3xl border border-[var(--border-default)] bg-[var(--bg-card)] p-5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Briefing diario</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            ["3 prospectos", "sin respuesta hace mas de 48 h"],
            ["2 oportunidades", "estancadas mas de 15 dias"],
            [`${pending.length} acciones`, "esperan tu aprobacion"],
          ].map(([a, b]) => (
            <div key={a} className="rounded-2xl bg-[var(--bg-card-hover)] px-4 py-3">
              <p className="text-lg font-black text-[var(--text-primary)]">{a}</p>
              <p className="text-xs text-[var(--text-secondary)]">{b}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr_340px]">
        {/* Agentes */}
        <div className="space-y-2">
          <p className="px-1 text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Agentes</p>
          {DEMO_AGENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelected(a.id)}
              className={cn(
                "w-full rounded-2xl border px-3 py-3 text-left transition-all",
                selected === a.id
                  ? "border-[var(--brand-accent)] bg-[var(--bg-card-hover)]"
                  : "border-[var(--border-default)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: enabled[a.id] ? a.color : "#64748b" }} />
                <span className="text-sm font-bold text-[var(--text-primary)]">{a.name}</span>
                <span
                  role="switch"
                  aria-checked={enabled[a.id]}
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEnabled((s) => ({ ...s, [a.id]: !s[a.id] }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      setEnabled((s) => ({ ...s, [a.id]: !s[a.id] }));
                    }
                  }}
                  className={cn(
                    "ml-auto h-4 w-7 rounded-full p-0.5 transition-colors",
                    enabled[a.id] ? "bg-[var(--brand-accent)]" : "bg-slate-500/40"
                  )}
                >
                  <span className={cn("block h-3 w-3 rounded-full bg-white transition-transform", enabled[a.id] && "translate-x-3")} />
                </span>
              </div>
              <p className="mt-1 pl-4 text-xs text-[var(--text-secondary)]">{a.role}</p>
            </button>
          ))}
        </div>

        {/* Chat */}
        <div className="flex h-[620px] flex-col rounded-3xl border border-[var(--border-default)] bg-[var(--bg-card)]">
          <div className="flex items-center gap-2 border-b border-[var(--border-default)] px-5 py-3">
            <Bot className="h-4 w-4 text-[var(--brand-accent)]" />
            <p className="text-sm font-bold text-[var(--text-primary)]">
              Hablando con: {agentById(selected).name}
            </p>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {messages.map((m) =>
              m.from === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-md bg-[var(--brand-accent)] px-4 py-2.5 text-sm text-white">
                    {m.text}
                  </div>
                </div>
              ) : (
                <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="max-w-[88%]">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: agentById(m.agent).color }} />
                    <span className="text-xs font-bold text-[var(--text-primary)]">{agentById(m.agent).name}</span>
                    {m.routedFrom && <span className="text-[11px] text-[var(--text-muted)]">delegado por el Orquestador</span>}
                  </div>
                  <div className="whitespace-pre-line rounded-2xl rounded-tl-md bg-[var(--bg-card-hover)] px-4 py-2.5 text-sm text-[var(--text-primary)]">
                    {m.text}
                  </div>
                  {m.tools.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.tools.map((t) => (
                        <span
                          key={t.name + t.result}
                          className="inline-flex items-center gap-1 rounded-full border border-[var(--border-default)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]"
                        >
                          <Wrench className="h-3 w-3" />
                          <b className="font-mono">{t.name}</b> {t.result}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              )
            )}
            {typing && (
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: agentById(typing).color }} />
                {agentById(typing).name} esta trabajando...
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-[var(--border-default)] p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={!!typing}
                  className="rounded-full border border-[var(--border-default)] px-3 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribe una peticion para tus agentes..."
                className="flex-1 rounded-2xl border border-[var(--border-default)] bg-transparent px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-accent)]"
              />
              <button
                type="submit"
                disabled={!input.trim() || !!typing}
                aria-label="Enviar"
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--brand-accent)] text-white disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Bandeja */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Inbox className="h-4 w-4 text-[var(--text-secondary)]" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Bandeja de aprobaciones</p>
            {pending.length > 0 && (
              <span className="ml-auto rounded-full bg-[var(--destructive)] px-2 py-0.5 text-[11px] font-bold text-white">{pending.length}</span>
            )}
          </div>

          {pending.length === 0 && history.length === 0 && (
            <div className="rounded-3xl border border-dashed border-[var(--border-default)] p-6 text-center text-sm text-[var(--text-secondary)]">
              Sin acciones pendientes. Pide una cotizacion con descuento o agenda una cita para ver una propuesta.
            </div>
          )}

          <AnimatePresence>
            {pending.map((a) => (
              <motion.div
                key={a.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="rounded-3xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4"
              >
                <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                  <span className="h-2 w-2 rounded-full" style={{ background: agentById(a.agent).color }} />
                  {agentById(a.agent).name}
                  <Clock className="ml-auto h-3 w-3" /> {a.createdAt}
                </div>
                <p className="mt-1 text-sm font-bold text-[var(--text-primary)]">{a.proposal.title}</p>
                <p className="text-xs text-[var(--text-secondary)]">{a.proposal.detail}</p>
                <p className="mt-2 rounded-xl bg-[var(--bg-card-hover)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                  <b>Motivo del agente:</b> {a.proposal.reason}
                </p>
                <div className="mt-2 space-y-1">
                  {a.proposal.diff.map((d) => (
                    <div key={d.label} className="flex items-center gap-2 text-xs">
                      <span className="w-20 text-[var(--text-muted)]">{d.label}</span>
                      <span className="text-[var(--text-secondary)] line-through">{d.before}</span>
                      <span className="font-bold text-[var(--brand-accent)]">{d.after}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => resolve(a.id, "approved")}
                    className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-[var(--brand-accent)] py-2 text-xs font-bold text-white"
                  >
                    <Check className="h-3.5 w-3.5" /> Aprobar
                  </button>
                  <button
                    onClick={() => resolve(a.id, "rejected")}
                    className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-[var(--border-default)] py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
                  >
                    <X className="h-3.5 w-3.5" /> Rechazar
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {history.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="px-1 text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Historial</p>
              {history.map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-2xl border border-[var(--border-default)] px-3 py-2 text-xs">
                  {a.status === "approved" ? (
                    <Check className="h-3.5 w-3.5 text-[var(--brand-accent)]" />
                  ) : (
                    <X className="h-3.5 w-3.5 text-[var(--destructive)]" />
                  )}
                  <span className="flex-1 text-[var(--text-primary)]">{a.proposal.title}</span>
                  <span className="text-[var(--text-muted)]">{a.status === "approved" ? "Aprobada" : "Rechazada"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
