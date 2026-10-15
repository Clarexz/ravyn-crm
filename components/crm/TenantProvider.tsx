"use client";

import { createContext, useContext } from "react";
import { resolveTenantConfig, type TenantConfig } from "@/lib/industry/packs";

// Configuracion de industria de la organizacion para los componentes cliente (etiquetas, modulos, zona horaria).
const TenantContext = createContext<TenantConfig>(resolveTenantConfig({ industry: "health" }));

export function TenantProvider({ config, children }: { config: TenantConfig; children: React.ReactNode }) {
  return <TenantContext.Provider value={config}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantConfig {
  return useContext(TenantContext);
}

const lower = (s: string): string => s.toLowerCase();

// Atajos de vocabulario: t.contact.plural, t.booking.singular, etc.
export function useLabels() {
  const { labels } = useTenant();
  return {
    contact: labels.contact,
    booking: labels.booking,
    item: labels.item,
    budget: labels.budget,
    pipeline: labels.pipeline,
    lower,
  };
}
