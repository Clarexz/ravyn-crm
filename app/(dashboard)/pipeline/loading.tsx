export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-9 w-64 animate-pulse rounded-xl bg-[var(--bg-surface)]" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-72 w-72 shrink-0 animate-pulse rounded-3xl bg-[var(--bg-surface)]" />
        ))}
      </div>
    </div>
  );
}
