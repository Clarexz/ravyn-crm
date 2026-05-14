"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
  className?: string;
}

const trendConfig = {
  up:      { icon: TrendingUp,   color: "text-emerald-500" },
  down:    { icon: TrendingDown, color: "text-red-500" },
  neutral: { icon: Minus,        color: "text-muted-foreground" },
};

export function KpiCard({ title, value, subtitle, icon: Icon, trend = "neutral", className }: KpiCardProps) {
  const { icon: TrendIcon, color: trendColor } = trendConfig[trend];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn("bg-card border border-border rounded-lg p-5 flex flex-col gap-3", className)}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
        <div className="w-8 h-8 bg-muted rounded-md flex items-center justify-center">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>

      <div className="flex items-end justify-between">
        <p className="text-3xl font-black text-foreground tabular-nums">{value}</p>
        <div className="flex items-center gap-1 pb-0.5">
          <TrendIcon className={cn("w-3.5 h-3.5", trendColor)} />
        </div>
      </div>

      {subtitle && (
        <p className="text-xs text-muted-foreground leading-relaxed">{subtitle}</p>
      )}
    </motion.div>
  );
}
