"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePendingActions } from "@/components/crm/agents/usePendingActions";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/agents", label: "Chat", exact: true },
  { href: "/agents/inbox", label: "Bandeja", exact: false },
  { href: "/agents/settings", label: "Configuracion", exact: false },
];

export function AgentsNav() {
  const pathname = usePathname();
  const { count } = usePendingActions();
  return (
    <nav aria-label="Secciones de agentes" className="flex flex-wrap gap-2">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold transition-colors",
              active
                ? "border-[var(--brand-accent)] bg-[var(--brand-accent)] text-white"
                : "border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]",
            )}
          >
            {t.label}
            {t.href === "/agents/inbox" && count > 0 && (
              <span className={cn("rounded-full px-1.5 text-[10px] font-black", active ? "bg-white/25 text-white" : "bg-[var(--destructive)] text-white")}>{count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
