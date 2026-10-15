"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { Clock, GripVertical, Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/components/crm/TenantProvider";
import { STAGES, STAGE_LABELS, isStage, stageMoveNeedsAdmin, type PipelineBoard, type PipelineCard, type Stage } from "@/lib/pipeline/stages";
import { cn } from "@/lib/utils";

// Teclado: flecha izquierda/derecha salta a la columna vecina (el paso por defecto de dnd-kit es de 25 px).
const columnKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context: { active, droppableRects, droppableContainers, collisionRect } }) => {
  if ((event.code !== "ArrowRight" && event.code !== "ArrowLeft") || !active || !collisionRect) return undefined;
  event.preventDefault();
  const columns = droppableContainers
    .getEnabled()
    .map((c) => ({ rect: droppableRects.get(c.id) }))
    .filter((c): c is { rect: NonNullable<typeof c.rect> } => !!c.rect)
    .sort((a, b) => a.rect.left - b.rect.left);
  const cx = collisionRect.left + collisionRect.width / 2;
  let current = columns.findIndex((c) => cx >= c.rect.left && cx <= c.rect.left + c.rect.width);
  if (current < 0) current = columns.reduce((best, c, i) => (Math.abs(c.rect.left - cx) < Math.abs(columns[best].rect.left - cx) ? i : best), 0);
  const next = columns[current + (event.code === "ArrowRight" ? 1 : -1)];
  return next ? { x: next.rect.left + 8, y: collisionRect.top } : undefined;
};

const ADMIN_ONLY_HINT = "Solo un administrador puede cerrar o reabrir oportunidades.";

const money = (value: number, currency: string): string =>
  `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(value)} ${currency}`;

function CardBody({ card, stale }: { card: PipelineCard; stale: boolean }) {
  return (
    <>
      <p className="break-words text-sm font-bold text-[var(--text-primary)]">{card.title}</p>
      {card.contact_name && (
        <p className="mt-1 truncate text-xs font-semibold text-[var(--text-secondary)]">
          {card.contact_id ? (
            <Link href={`/patients/${card.contact_id}`} className="hover:underline">{card.contact_name}</Link>
          ) : (
            card.contact_name
          )}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-black text-[var(--text-primary)]">{money(card.value, card.currency)}</span>
        <span
          data-testid="card-days"
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold",
            stale ? "bg-[var(--destructive)]/10 text-[var(--destructive)]" : "bg-[var(--bg-surface)] text-[var(--text-secondary)]",
          )}
        >
          <Clock className="h-3 w-3" />
          {card.days_since_activity === 0 ? "hoy" : `${card.days_since_activity} d sin actividad`}
        </span>
      </div>
    </>
  );
}

function Card({
  card,
  canMoveTo,
  onMove,
  onBlocked,
}: {
  card: PipelineCard;
  canMoveTo: (to: Stage) => boolean;
  onMove: (card: PipelineCard, to: Stage) => void;
  onBlocked: (card: PipelineCard, to: Stage) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, data: { stage: card.stage } });
  return (
    <li
      ref={setNodeRef}
      data-testid="pipeline-card"
      data-card-id={card.id}
      data-stage={card.stage}
      className={cn(
        "rounded-2xl border bg-[var(--bg-card)] p-3 shadow-sm",
        card.stale ? "border-[var(--destructive)]/40" : "border-[var(--border-default)]",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          data-testid="card-handle"
          aria-label={`Arrastrar: ${card.title}`}
          className="mt-0.5 flex h-8 w-8 shrink-0 touch-none items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-accent)]"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <CardBody card={card} stale={card.stale} />
          <label className="mt-2 block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <span className="sr-only">Mover «{card.title}» a</span>
            <select
              data-testid="card-move"
              aria-label={`Mover «${card.title}» a otra etapa`}
              value={card.stage}
              onChange={(e) => {
                const to = e.target.value;
                if (!isStage(to) || to === card.stage) return;
                if (canMoveTo(to)) onMove(card, to);
                else onBlocked(card, to);
                e.currentTarget.value = card.stage;
              }}
              className="mt-1 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs font-semibold text-[var(--text-primary)]"
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </li>
  );
}

function Column({
  stage,
  cards,
  locked,
  children,
}: {
  stage: Stage;
  cards: PipelineCard[];
  locked: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = cards.reduce((a, c) => a + c.value, 0);
  return (
    <section
      ref={setNodeRef}
      data-testid={`column-${stage}`}
      aria-label={`${STAGE_LABELS[stage]}: ${cards.length}`}
      className={cn(
        "flex w-[84vw] max-w-[320px] shrink-0 snap-start flex-col rounded-3xl border bg-[var(--bg-surface)] p-3 sm:w-72",
        isOver ? "border-[var(--brand-accent)]" : "border-[var(--border-default)]",
      )}
    >
      <header className="mb-3 px-1">
        <h2 className="flex items-center justify-between text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5">
            {STAGE_LABELS[stage]}
            {locked && <Lock className="h-3 w-3" aria-label="Solo administradores" />}
          </span>
          <span data-testid={`count-${stage}`} className="rounded-full bg-[var(--bg-card)] px-2 py-0.5 text-[11px]">{cards.length}</span>
        </h2>
        <p className="mt-1 text-xs font-semibold text-[var(--text-muted)]">{new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(total)} en la columna</p>
      </header>
      <ul className="flex min-h-24 flex-1 flex-col gap-2">{children}</ul>
      {cards.length === 0 && <p className="px-1 pb-2 text-xs text-[var(--text-muted)]">Sin tarjetas</p>}
    </section>
  );
}

type Props = { initialCards: PipelineCard[]; isAdmin: boolean; staleDays: number; loadFailed?: boolean };

export function PipelineClient({ initialCards, isAdmin: initialAdmin, staleDays, loadFailed }: Props) {
  const { labels } = useTenant();
  const [cards, setCards] = useState(initialCards);
  const [isAdmin, setIsAdmin] = useState(initialAdmin);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lastMoveMs, setLastMoveMs] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates }),
  );

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/pipeline", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const board = (await res.json()) as PipelineBoard;
      setCards(board.cards);
      setIsAdmin(board.is_admin);
    } catch {
      toast.error("No se pudo actualizar el tablero");
    }
  }, []);

  const canMoveTo = useCallback((card: PipelineCard, to: Stage) => isAdmin || !stageMoveNeedsAdmin(card.stage, to), [isAdmin]);

  const blocked = useCallback((card: PipelineCard, to: Stage) => {
    toast.error(`No se movió «${card.title}» a ${STAGE_LABELS[to]}`, { description: ADMIN_ONLY_HINT });
    setAnnounce(`Movimiento bloqueado. ${ADMIN_ONLY_HINT}`);
  }, []);

  const move = useCallback(
    async (card: PipelineCard, to: Stage) => {
      const t0 = performance.now();
      const from = card.stage;
      // Actualizacion optimista: la tarjeta cambia de columna de inmediato.
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, stage: to, days_since_activity: 0, stale: false } : c)));
      setAnnounce(`«${card.title}» movida a ${STAGE_LABELS[to]}`);
      requestAnimationFrame(() => requestAnimationFrame(() => setLastMoveMs(Math.round(performance.now() - t0))));

      const revert = () =>
        setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, stage: from, days_since_activity: card.days_since_activity, stale: card.stale } : c)));
      try {
        const res = await fetch(`/api/pipeline/${card.id}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: to, from }),
        });
        if (res.ok) return;
        revert();
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 409) {
          toast.error("El tablero estaba desactualizado", { description: "Se recargó con la etapa actual." });
          void reload();
        } else if (res.status === 403) {
          toast.error(`No se movió «${card.title}»`, { description: body.error ?? ADMIN_ONLY_HINT });
        } else {
          toast.error(`No se pudo mover «${card.title}»`, { description: "Se restauró su etapa anterior." });
        }
      } catch {
        revert();
        toast.error(`No se pudo mover «${card.title}»`, { description: "Sin conexión. Se restauró su etapa anterior." });
      }
    },
    [reload],
  );

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const card = cardsRef.current.find((c) => c.id === e.active.id);
    const to = e.over?.id;
    if (!card || typeof to !== "string" || !isStage(to) || to === card.stage) return;
    if (canMoveTo(card, to)) void move(card, to);
    else blocked(card, to);
  };

  const byStage = useMemo(() => {
    const map = Object.fromEntries(STAGES.map((s) => [s, [] as PipelineCard[]])) as Record<Stage, PipelineCard[]>;
    for (const c of cards) map[c.stage]?.push(c);
    return map;
  }, [cards]);

  const active = cards.find((c) => c.id === activeId) ?? null;
  const staleCount = cards.filter((c) => c.stale).length;

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">Pipeline de {labels.pipeline.plural}</h1>
          <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
            Arrastra las tarjetas entre etapas, o usa el selector de cada una.
            {staleCount > 0 && <> <span data-testid="stale-total" className="text-[var(--destructive)]">{staleCount} sin actividad desde hace {staleDays}+ días.</span></>}
          </p>
        </div>
        <button type="button" onClick={() => void reload()} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-default)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]">
          <RefreshCw className="h-3.5 w-3.5" /> Actualizar
        </button>
      </div>

      {!isAdmin && (
        <p data-testid="staff-notice" className="rounded-2xl border border-dashed border-[var(--border-default)] p-3 text-xs font-semibold text-[var(--text-secondary)]">
          <Lock className="mr-1 inline h-3 w-3" /> {ADMIN_ONLY_HINT}
        </p>
      )}
      {loadFailed && (
        <p role="alert" className="rounded-2xl border border-[var(--destructive)]/40 p-3 text-sm text-[var(--destructive)]">
          No se pudo cargar el tablero. <button type="button" onClick={() => void reload()} className="font-bold underline">Reintentar</button>
        </p>
      )}

      <p role="status" aria-live="polite" data-testid="pipeline-live" className="sr-only">{announce}</p>
      {lastMoveMs !== null && <span data-testid="last-move-ms" data-ms={lastMoveMs} className="sr-only">Último movimiento: {lastMoveMs} ms</span>}

      <DndContext
        id="pipeline-dnd"
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: {
            draggable: "Pulsa espacio para tomar la tarjeta, las flechas para elegir la etapa y espacio de nuevo para soltarla. Escape cancela.",
          },
          announcements: {
            onDragStart: ({ active }) => `Tarjeta ${String(active.id).slice(0, 8)} tomada.`,
            onDragOver: ({ over }) => (over ? `Sobre la etapa ${isStage(String(over.id)) ? STAGE_LABELS[over.id as Stage] : ""}.` : "Fuera de las etapas."),
            onDragEnd: ({ over }) => (over ? "Tarjeta soltada." : "Tarjeta soltada fuera de las etapas."),
            onDragCancel: () => "Movimiento cancelado.",
          },
        }}
      >
        <div data-testid="pipeline-board" className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
          {STAGES.map((stage) => (
            <Column key={stage} stage={stage} cards={byStage[stage]} locked={!isAdmin && (stage === "won" || stage === "lost")}>
              {byStage[stage].map((card) => (
                <Card key={card.id} card={card} canMoveTo={(to) => canMoveTo(card, to)} onMove={move} onBlocked={blocked} />
              ))}
            </Column>
          ))}
        </div>
        <DragOverlay>
          {active ? (
            <div className="w-72 rounded-2xl border border-[var(--brand-accent)] bg-[var(--bg-card)] p-3 shadow-xl">
              <CardBody card={active} stale={active.stale} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
