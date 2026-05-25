"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="w-20 h-10 rounded-full bg-[var(--bg-page)] border border-[var(--border-default)] p-1 opacity-50" />
    );
  }

  const isDark = theme === "dark";

  return (
    <div 
      className={cn(
        "flex p-1 rounded-full w-20 h-10 border cursor-pointer relative overflow-hidden transition-all duration-300",
        isDark 
          ? "bg-[#1E2D3D] border-white/10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]" 
          : "bg-[#EEF2F7] border-black/5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]"
      )}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={`Cambiar a modo ${isDark ? "claro" : "oscuro"}`}
    >
      {/* Background Icons (Guides) */}
      <div className="absolute inset-0 flex items-center justify-between px-3 pointer-events-none">
        <Sun className={cn("w-4 h-4 transition-opacity duration-300", isDark ? "opacity-20 text-[var(--text-secondary)]" : "opacity-0")} />
        <Moon className={cn("w-4 h-4 transition-opacity duration-300", !isDark ? "opacity-20 text-[var(--text-secondary)]" : "opacity-0")} />
      </div>

      {/* Animated Sliding Ball */}
      <motion.div 
        layout
        initial={false}
        animate={{ 
          x: isDark ? 40 : 0,
        }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 30
        }}
        className={cn(
          "w-8 h-8 rounded-full shadow-lg flex items-center justify-center z-10",
          isDark ? "bg-[var(--brand-accent)]" : "bg-white"
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isDark ? (
            <motion.div
              key="moon"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Moon className="w-4 h-4 text-white fill-white" />
            </motion.div>
          ) : (
            <motion.div
              key="sun"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Sun className="w-4 h-4 text-amber-500 fill-amber-500" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
