"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTenant } from "@/components/crm/TenantProvider";

// Si la ruta pertenece a un modulo que la industria de la organizacion no activa, muestra un aviso.
export function ModuleGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { modules, industryLabel } = useTenant();
  const blocked = modules.find((m) => m.route && !m.active && (pathname === m.route || pathname.startsWith(`${m.route}/`)));
  if (!blocked) return <>{children}</>;
  return (
    <div data-testid="module-disabled" className="mx-auto max-w-md rounded-3xl border border-[var(--border-default)] bg-[var(--bg-card)] p-8 text-center">
      <h1 className="text-xl font-bold text-[var(--text-primary)]">Modulo no activo</h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        {blocked.label} no forma parte de los modulos activos de esta organizacion ({industryLabel}).
      </p>
      <Link href="/dashboard" className="mt-4 inline-block rounded-xl bg-[var(--brand-accent)] px-4 py-2 text-sm font-bold text-white">
        Ir al panel
      </Link>
    </div>
  );
}
