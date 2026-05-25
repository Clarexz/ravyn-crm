"use client";

import { motion } from "framer-motion";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
  className?: string;
  iconColor?: string;
  iconBg?: string; // This will now be used as the base class for the 15% opacity logic
}

export function KpiCard({ title, value, subtitle, icon: Icon, trend = "neutral", className, iconColor, iconBg }: KpiCardProps) {
  // Logic for icon background opacity (15%)
  // If iconBg is provided, we assume it's a tailwind color like 'bg-blue-500'
  // and we apply /15 opacity.
  const defaultIconBg = trend === 'up' ? 'bg-[var(--brand-accent)]' : trend === 'down' ? 'bg-[var(--destructive)]' : 'bg-[var(--text-muted)]';
  const finalIconBg = iconBg ? iconBg : defaultIconBg;
  
  // Logic for value color
  const valueColor = trend === 'up' ? 'text-[var(--brand-accent)]' : trend === 'down' ? 'text-[var(--destructive)]' : 'text-[var(--text-primary)]';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn("bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl p-6 flex flex-col justify-between relative overflow-hidden h-40 shadow-sm transition-all hover:bg-[var(--bg-card-hover)]", className)}
    >
      <div className="flex items-start justify-between relative z-10">
        <p className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">{title}</p>
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center transition-all hover:scale-110 shadow-sm", 
          // Applying 15% opacity to the background
          finalIconBg.replace('bg-', 'bg-').concat('/15'),
          "dark:shadow-none dark:ring-1 dark:ring-white/5"
        )}>
          <Icon className={cn("w-6 h-6", iconColor || (trend === 'up' ? 'text-[var(--brand-accent)]' : trend === 'down' ? 'text-[var(--destructive)]' : 'text-[var(--text-muted)]'))} />
        </div>
      </div>

      <div className="flex items-end justify-between relative z-10 mt-4">
        <div>
          <p className={cn("text-[40px] font-bold tabular-nums tracking-tighter leading-none transition-colors", valueColor)}>{value}</p>
          {subtitle && (
            <div className="mt-3">
              <p className="text-[12px] font-medium transition-colors text-[var(--text-muted)] lowercase first-letter:uppercase">
                {subtitle}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Subtle background decoration */}
      <div className="absolute bottom-0 right-0 w-24 h-24 bg-[var(--brand-accent)] opacity-[0.02] rounded-full -mr-8 -mb-8 pointer-events-none transition-colors" />
    </motion.div>
  );
}
