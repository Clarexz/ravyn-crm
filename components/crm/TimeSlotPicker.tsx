"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  date: string;
  value: string;
  onChange: (time: string) => void;
  onBlur?: () => void;
  minTime?: string;
  disabled?: boolean;
  branchName?: string;
}

export function TimeSlotPicker({ date, value, onChange, onBlur, minTime, disabled, branchName = "Sucursal Centro" }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !date) return;
    
    const fetchAvailability = async () => {
      setLoading(true);
      try {
        const url = `https://n8n.srv1574981.hstgr.cloud/webhook/consultar-disponibilidad?fecha=${date}&sucursal=${encodeURIComponent(branchName)}`;
        const res = await fetch(url);
        
        if (!res.ok) throw new Error("Error en la consulta");
        
        const data = await res.json();
        console.log("n8n raw data:", data);

        // DEEP EXTRACTION LOGIC
        const extractTimeStrings = (input: any): string[] => {
          if (!input) return [];

          // If it's a string, check if it's a time value or a list
          if (typeof input === 'string') {
            if (input.includes(':') && !input.includes('{')) {
              return input.split(/[,\s]+/).filter(s => s.includes(':'));
            }
            return [];
          }

          // If it's an array
          if (Array.isArray(input)) {
            if (input.length === 0) return [];
            
            // If it's an array of strings
            if (typeof input[0] === 'string') {
              return input.filter(s => typeof s === 'string' && s.includes(':'));
            }
            
            // If it's an array of objects (like [{availableSlots: [...]}]), check the first element
            if (typeof input[0] === 'object') {
              const fromFirst = extractTimeStrings(input[0]);
              if (fromFirst.length > 0) return fromFirst;

              // Or maybe it's a list where each object is a slot
              return input.map(item => {
                const res = extractTimeStrings(item);
                return res.length > 0 ? res[0] : null;
              }).filter(Boolean) as string[];
            }
          }

          // If it's an object
          if (typeof input === 'object') {
            const possibleKeys = ['availableSlots', 'aviabeskits', 'horarios', 'available_slots', 'slots', 'data'];
            for (const key of possibleKeys) {
              if (input[key]) {
                const res = extractTimeStrings(input[key]);
                if (res.length > 0) return res;
              }
            }

            // Fallback: search all object values
            for (const val of Object.values(input)) {
              if (val && (Array.isArray(val) || typeof val === 'object' || typeof val === 'string')) {
                const res = extractTimeStrings(val);
                if (res.length > 0) return res;
              }
            }
          }

          return [];
        };

        const slots = extractTimeStrings(data);
        console.log("Normalized slots:", slots);
        setAvailableSlots(slots);
      } catch (error) {
        console.error("n8n availability error:", error);
        setAvailableSlots([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAvailability();
  }, [open, date, branchName]);

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

  const handleSelect = (time: string) => {
    onChange(time);
    setOpen(false);
    onBlur?.();
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
              Consultando n8n...
            </div>
          ) : (
            <>
              <div className="px-5 py-3 text-[10px] uppercase font-black text-[var(--text-secondary)] border-b border-[var(--border-default)] bg-[var(--bg-page)]/50 tracking-[0.2em]">
                Horarios Disponibles
              </div>
              {availableSlots.length === 0 ? (
                <div className="px-3 py-10 text-xs text-[var(--text-secondary)] font-bold uppercase text-center">
                  Sin disponibilidad para esta fecha
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-px bg-[var(--border-default)]">
                  {availableSlots.map((time, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleSelect(time)}
                      className="bg-[var(--bg-card)] px-5 py-4 text-sm font-black text-[var(--text-primary)] hover:bg-[var(--brand-accent)] hover:text-white transition-all text-center"
                    >
                      {time}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
