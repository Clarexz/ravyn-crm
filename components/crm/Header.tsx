"use client";

import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNewAppointment } from "@/components/crm/NewAppointmentContext";
import { PendingBell } from "@/components/crm/PendingBell";
import { ThemeToggle } from "@/components/crm/ThemeToggle";
import { IndustrySwitcher } from "@/components/crm/IndustrySwitcher";
import { useTenant } from "@/components/crm/TenantProvider";

export function Header() {
  const pathname = usePathname();
  const { setOpen } = useNewAppointment();
  const tenant = useTenant();
  const showNewAppointmentBtn =
    pathname === "/dashboard" || pathname.startsWith("/appointments");
  const bookingsActive = tenant.activeModules.includes("bookings");

  return (
    <header className="h-20 flex items-center px-8 md:px-10 shrink-0">
      {/* Left space for mobile burger (reserved) */}
      <div className="w-10 md:hidden shrink-0" />

      {/* Centered Space (Title removed) */}
      <div className="flex-1" />

      {/* Right Actions */}
      <div className="flex items-center gap-4 shrink-0">
        <IndustrySwitcher />
        <PendingBell />
        <ThemeToggle />
        {showNewAppointmentBtn && bookingsActive && (
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            className="bg-[var(--brand-accent)] text-white hover:opacity-90 font-black text-[10px] uppercase tracking-widest h-10 px-6 rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-95 border border-white/5"
          >
            <Plus className="w-4 h-4 mr-2 text-white" />
            <span className="hidden md:inline">{tenant.newBookingLabel}</span>
          </Button>
        )}
      </div>
    </header>
  );
}
