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
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-30">
      <h2 className="text-sm font-semibold text-foreground tracking-wide">{title}</h2>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        {showNewAppointmentBtn && (
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            className="bg-foreground text-background hover:bg-foreground/90 font-semibold text-xs h-8 px-3 gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva cita
          </Button>
        )}
      </div>
    </header>
  );
}
