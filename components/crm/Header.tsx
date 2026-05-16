"use client";

import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNewAppointment } from "@/components/crm/NewAppointmentContext";
import { ThemeToggle } from "@/components/crm/ThemeToggle";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/appointments": "Citas",
  "/patients": "Pacientes",
  "/settings": "Configuración",
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const segment = "/" + pathname.split("/")[1];
  return pageTitles[segment] ?? "Ravyn CRM";
}

export function Header() {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const { setOpen } = useNewAppointment();
  const showNewAppointmentBtn =
    pathname === "/dashboard" || pathname.startsWith("/appointments");

  return (
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm flex items-center px-4 md:px-6 sticky top-0 z-30">
      {/* Left space for mobile burger (reserved) */}
      <div className="w-10 md:hidden shrink-0" />

      {/* Centered Title */}
      <div className="flex-1 flex justify-center">
        <h2 className="text-sm font-bold text-foreground tracking-wide uppercase">{title}</h2>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
        <ThemeToggle />
        {showNewAppointmentBtn && (
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            className="bg-foreground text-background hover:bg-foreground/90 font-semibold text-xs h-8 px-2 md:px-3 gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Nueva cita</span>
          </Button>
        )}
      </div>
    </header>
  );
}
