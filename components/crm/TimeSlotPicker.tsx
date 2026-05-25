"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Loader2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

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
        className="w-full h-12 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-default)] text-[var(--text-primary)] text-sm px-5 flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)] transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed font-bold"
      >
        <span className={value ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}>
          {value || (date ? "Seleccionar hora..." : "Elige fecha primero")}
        </span>
        <Clock className="w-4 h-4 text-[var(--text-muted)]" />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 z-[60] mt-2 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl shadow-2xl overflow-hidden max-h-80 overflow-y-auto no-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-3 py-10 text-xs text-[var(--text-secondary)] font-bold uppercase tracking-widest">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--brand-accent)]" />
              Cargando...
            </div>
          ) : showAvailableMode ? (
            <>
              <div className="px-5 py-3 text-[10px] uppercase font-black text-[var(--text-secondary)] border-b border-[var(--border-default)] bg-[var(--bg-page)]/50 tracking-[0.2em]">
                Horarios Disponibles
              </div>
              {freeBlocks.length === 0 ? (
                <div className="px-3 py-10 text-xs text-[var(--text-secondary)] font-bold uppercase text-center">
                  Sin disponibilidad
                </div>
              ) : (
                freeBlocks.map((b, i) => (
                  <div key={i}>
                    <div className="px-5 py-2.5 text-[11px] font-black text-[var(--brand-accent)] bg-[var(--brand-accent)]/5 flex justify-between uppercase">
                      <span>{formatTime(b.start)} – {formatTime(b.end)}</span>
                      <span className="text-[var(--text-muted)]/50">{formatRangeDuration(b.start, b.end)}</span>
                    </div>
                    {b.slots.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => handleSelect(m)}
                        className="w-full text-left px-8 py-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] border-b border-[var(--border-default)] last:border-0 transition-colors"
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
                  <div className="px-5 py-3 text-[10px] uppercase font-black text-[var(--text-secondary)] border-b border-[var(--border-default)] bg-[var(--bg-page)]/50 tracking-[0.2em]">
                    Ocupación ({occupiedRanges.length})
                  </div>
                  <div className="bg-[var(--destructive)]/5 border-b border-[var(--border-default)]">
                    {occupiedRanges.map((r, i) => (
                      <div key={i} className="px-5 py-2.5 text-[11px] flex justify-between items-center border-b border-[var(--border-default)] last:border-0">
                        <span className="font-black text-[var(--destructive)]">
                          {formatTime(r.start)} – {formatTime(r.end)}
                        </span>
                        {r.patient && (
                          <span className="text-[var(--text-secondary)] font-bold truncate ml-2 max-w-[55%]">
                            {r.patient}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="px-5 py-3 text-[10px] uppercase font-black text-[var(--brand-accent)] border-b border-[var(--border-default)] bg-[var(--brand-accent)]/5 tracking-[0.2em]">
                  Día Disponible
                </div>
              )}
              <div className="px-5 py-2.5 text-[10px] uppercase font-black text-[var(--text-secondary)] border-b border-[var(--border-default)] bg-[var(--bg-page)]/50 tracking-[0.2em]">
                Elegir Hora
              </div>
              {availableSlots.length === 0 ? (
                <div className="px-3 py-10 text-xs text-[var(--text-secondary)] font-bold uppercase text-center">Sin horarios</div>
              ) : (
                availableSlots.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleSelect(m)}
                    className="w-full text-left px-5 py-3.5 text-sm font-black text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] border-b border-[var(--border-default)] last:border-0 transition-colors"
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
