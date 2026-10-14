import { AgentsNav } from "@/components/crm/agents/AgentsNav";

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-[var(--text-primary)]">Centro de Agentes</h1>
        <p className="text-sm text-[var(--text-secondary)]">Tu equipo de agentes opera el CRM. Tu apruebas lo importante.</p>
      </div>
      <AgentsNav />
      {children}
    </div>
  );
}
