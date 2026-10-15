// Menu lateral segun los modulos activos (Fase 4). Puro: lo usan el Sidebar y las pruebas.
import { MODULES, type ModuleId, type TenantModule } from "@/lib/industry/packs";

export type NavEntry = { href: string; label: string; icon: string };

const fixed = (href: string, label: string, icon: string): NavEntry => ({ href, label, icon });

// Dashboard, Agentes y Configuracion son fijos; el resto depende de los modulos activos y con pantalla disponible.
export function buildNav(modules: TenantModule[]): NavEntry[] {
  const of = (id: ModuleId): NavEntry[] =>
    modules
      .filter((m) => m.id === id && m.active && m.available && m.route)
      .map((m) => ({ href: m.route as string, label: m.label, icon: MODULES[m.id].icon }));
  return [
    fixed("/dashboard", "Dashboard", "dashboard"),
    ...of("bookings"),
    ...of("contacts"),
    ...of("items"),
    ...of("budgets"),
    fixed("/agents", "Agentes", "bot"),
    ...of("reports"),
    fixed("/settings", "Configuración", "settings"),
  ];
}
