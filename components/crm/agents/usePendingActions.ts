"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AGENTS_CHANGED_EVENT, notifyAgentsChanged, type ActionView } from "@/lib/agents/ui";

const POLL_MS = 10_000;

// Acciones pendientes de la organizacion. En modo demo no hay realtime: sondeo + aviso entre componentes.
export function usePendingActions() {
  const [actions, setActions] = useState<ActionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/actions?status=pending&limit=100", { cache: "no-store" });
      if (!res.ok) throw new Error("http");
      const body = (await res.json()) as { actions: ActionView[]; is_admin?: boolean };
      if (alive.current) {
        setActions(body.actions);
        setIsAdmin(body.is_admin === true);
        setError(false);
      }
    } catch {
      if (alive.current) setError(true);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    const onChange = () => void refresh();
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    window.addEventListener(AGENTS_CHANGED_EVENT, onChange);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener(AGENTS_CHANGED_EVENT, onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { actions, count: actions.length, loading, error, isAdmin, refresh };
}

export type ReviewResult = { ok: true; executed: boolean } | { ok: false; status: number; message: string };

// Aprueba o rechaza una accion. Avisa a la campana y a la bandeja al terminar.
export async function reviewAction(
  id: string,
  kind: "approve" | "reject",
  body: { notes?: string; input?: Record<string, unknown> } = {},
): Promise<ReviewResult> {
  try {
    const res = await fetch(`/api/agents/actions/${id}/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; executed?: boolean };
    notifyAgentsChanged(); // tambien en 409: el estado cambio y hay que refrescar
    if (!res.ok) return { ok: false, status: res.status, message: json.error ?? "No se pudo completar la accion" };
    return { ok: true, executed: json.executed !== false };
  } catch {
    return { ok: false, status: 0, message: "Sin conexion con el servidor" };
  }
}
