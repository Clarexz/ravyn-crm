"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Loader2, Clock } from "lucide-react";

const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;
const SLOT_MINUTES = 30;
const WORK_START = WORK_START_HOUR * 60;
const WORK_END = WORK_END_HOUR * 60;
const TOTAL_DAY_MINUTES = WORK_END - WORK_START;
const BUSY_THRESHOLD = 0.5;

type AppointmentLite = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  patients: { full_name: string } | null;
};

function formatTime(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function minutesFromIso(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function parseTimeStr(t?: string) {
  if (!t) return 0;
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  return h * 60 + (m || 0);
}

interface Props {
  date: string;
  value: string;
  onChange: (time: string) => void;
  onBlur?: () => void;
  minTime?: string;
  disabled?: boolean;
  excludeId?: string;
}

export function TimeSlotPicker({ date, value, onChange, onBlur, minTime, disabled, excludeId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [appointments, setAppointments] = useState<AppointmentLite[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !date) return;
    setLoading(true);
    fetch(`/api/appointments?date=${date}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AppointmentLite[]) => setAppointments(Array.isArray(data) ? data : []))
      .catch(() => setAppointments([]))
      .finally(() => setLoading(false));
  }, [open, date]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        onBlur?.();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onBlur]);

  const minMinutes = parseTimeStr(minTime);

  const { occupiedRanges, freeBlocks, availableSlots, occupiedMinutes } = useMemo(() => {
    const effectiveStart = Math.max(WORK_START, Math.ceil(minMinutes / SLOT_MINUTES) * SLOT_MINUTES);

    const ranges = appointments
      .filter((apt) => apt.status !== "cancelled" && apt.id !== excludeId)
      .map((apt) => {
        const start = minutesFromIso(apt.scheduled_at);
        const end = start + apt.duration_minutes;
        return { start, end, patient: apt.patients?.full_name };
      })
      .filter((r) => r.end > effectiveStart)
      .sort((a, b) => a.start - b.start);

    const occupiedSet = new Set<number>();
    for (const r of ranges) {
      for (let m = effectiveStart; m < WORK_END; m += SLOT_MINUTES) {
        if (m < r.end && m + SLOT_MINUTES > r.start) occupiedSet.add(m);
      }
    }

    const allSlots: number[] = [];
    for (let m = effectiveStart; m < WORK_END; m += SLOT_MINUTES) allSlots.push(m);

    const free = allSlots.filter((m) => !occupiedSet.has(m));
    const occupiedMin = occupiedSet.size * SLOT_MINUTES;

    const blocks: { start: number; end: number; slots: number[] }[] = [];
    for (const m of free) {
      const last = blocks[blocks.length - 1];
      if (last && last.end === m) {
        last.end = m + SLOT_MINUTES;
        last.slots.push(m);
      } else {
        blocks.push({ start: m, end: m + SLOT_MINUTES, slots: [m] });
      }
    }

    return {
      occupiedRanges: ranges,
      freeBlocks: blocks,
      availableSlots: free,
      occupiedMinutes: occupiedMin,
    };
  }, [appointments, minMinutes, excludeId]);

  const showAvailableMode = occupiedMinutes >= TOTAL_DAY_MINUTES * BUSY_THRESHOLD;

  const handleSelect = (m: number) => {
    if (m < minMinutes) return;
    onChange(formatTime(m));
    setOpen(false);
    onBlur?.();
  };

  const formatRangeDuration = (start: number, end: number) => {
    const total = end - start;
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}min`;
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled || !date}
        onClick={() => setOpen((o) => !o)}
        className="w-full h-10 md:h-9 rounded-md bg-background border border-border text-foreground text-sm px-3 flex items-center justify-between focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>
          {value || (date ? "Seleccionar..." : "Elige fecha primero")}
        </span>
        <Clock className="w-4 h-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 z-[60] mt-1.5 bg-muted/95 dark:bg-zinc-900 border border-border rounded-lg shadow-xl overflow-hidden max-h-80 overflow-y-auto backdrop-blur-sm">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando horarios...
            </div>
          ) : showAvailableMode ? (
            <>
              <div className="px-4 py-2.5 text-[10px] uppercase font-bold text-muted-foreground border-b border-border bg-background/40 tracking-wider">
                Horarios disponibles
              </div>
              {freeBlocks.length === 0 ? (
                <div className="px-3 py-6 text-xs text-muted-foreground text-center">
                  No hay horarios libres este día
                </div>
              ) : (
                freeBlocks.map((b, i) => (
                  <div key={i}>
                    <div className="px-4 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/5 flex justify-between">
                      <span>{formatTime(b.start)} – {formatTime(b.end)}</span>
                      <span className="text-muted-foreground">{formatRangeDuration(b.start, b.end)}</span>
                    </div>
                    {b.slots.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => handleSelect(m)}
                        className="w-full text-left px-6 py-2.5 text-sm hover:bg-accent active:bg-accent/80 border-b border-border/40 last:border-0 transition-colors"
                      >
                        {formatTime(m)}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </>
          ) : (
            <>
              {occupiedRanges.length > 0 ? (
                <>
                  <div className="px-4 py-2.5 text-[10px] uppercase font-bold text-muted-foreground border-b border-border bg-background/40 tracking-wider">
                    Horas ocupadas ({occupiedRanges.length})
                  </div>
                  <div className="bg-amber-500/5 border-b border-border">
                    {occupiedRanges.map((r, i) => (
                      <div key={i} className="px-4 py-2 text-xs flex justify-between items-center border-b border-border/30 last:border-0">
                        <span className="font-semibold text-amber-700 dark:text-amber-400">
                          {formatTime(r.start)} – {formatTime(r.end)}
                        </span>
                        {r.patient && (
                          <span className="text-muted-foreground text-[11px] truncate ml-2 max-w-[55%]">
                            {r.patient}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="px-4 py-2.5 text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 border-b border-border bg-emerald-500/5 tracking-wider">
                  Día completamente libre
                </div>
              )}
              <div className="px-4 py-2 text-[10px] uppercase font-semibold text-muted-foreground border-b border-border bg-background/30 tracking-wider">
                Selecciona una hora
              </div>
              {availableSlots.length === 0 ? (
                <div className="px-3 py-6 text-xs text-muted-foreground text-center">Sin horarios libres</div>
              ) : (
                availableSlots.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleSelect(m)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent active:bg-accent/80 border-b border-border/40 last:border-0 transition-colors"
                  >
                    {formatTime(m)}
                  </button>
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
