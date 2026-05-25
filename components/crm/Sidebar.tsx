"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Users,
  Settings,
  Menu,
  X,
  LogOut,
  BarChart3,
  Tag,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/appointments", label: "Citas", icon: Calendar },
  { href: "/patients", label: "Pacientes", icon: Users },
  { href: "/services", label: "Servicios", icon: Tag },
  { href: "/budgets", label: "Presupuestos", icon: Receipt },
  { href: "/reports", label: "Reportes", icon: BarChart3 },
  { href: "/settings", label: "Configuración", icon: Settings },
];

interface SidebarProps {
  clinicName?: string;
  userName?: string;
  userEmail?: string;
}

export function Sidebar({
  clinicName = "Clínica Demo",
  userName = "Usuario Admin",
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const NavContent = () => (
    <div className="flex flex-col h-full bg-[var(--sidebar-bg)] transition-colors">
      {/* Clinic name */}
      <div className="px-6 py-12">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[var(--accent)] rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20 rotate-3">
            <span className="text-white font-black text-sm -rotate-3">R</span>
          </div>
          <span className="font-black text-white text-lg tracking-tight truncate">
            {clinicName}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all duration-300",
                isActive
                  ? "bg-[var(--sidebar-item-active-bg)] text-[var(--sidebar-text-active)] shadow-xl translate-x-2"
                  : "text-[var(--sidebar-text)] hover:text-white hover:bg-white/5"
              )}
            >
              <Icon className={cn("w-5 h-5 shrink-0 transition-colors", isActive ? "text-[var(--accent)]" : "text-[var(--sidebar-text)]")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User avatar + logout */}
      <div className="px-6 py-8 mt-auto border-t border-white/5">
        <div className="flex items-center gap-3 mb-6">
          <Avatar className="w-10 h-10 shrink-0 border-2 border-white/10 ring-2 ring-emerald-500/20">
            <AvatarFallback className="bg-white/10 text-white font-black text-xs">
              {userName.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-black text-white truncate leading-none">
              {userName}
            </span>
            <span className="text-[10px] text-white/30 truncate font-bold uppercase tracking-widest mt-1">
              Premium Staff
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-white/30 hover:text-red-400 hover:bg-red-500/10 text-[10px] font-black uppercase tracking-[0.2em] h-10 rounded-xl"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Finalizar
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-[12px] left-4 z-50 md:hidden text-white hover:bg-white/10"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle sidebar"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-72 bg-[var(--sidebar-bg)] z-50 transition-transform duration-300 ease-in-out md:hidden shadow-2xl",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <NavContent />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-72 shrink-0 h-full bg-[var(--sidebar-bg)] flex-col relative z-20">
        <NavContent />
      </aside>
    </>
  );
}
