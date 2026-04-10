export function DashboardSkeleton() {
  return (
    <div
      className="animate-pulse space-y-8"
      aria-busy="true"
      aria-label="Carregando dashboard"
    >
      <div className="space-y-2">
        <div className="h-9 max-w-md rounded-lg bg-slate-200" />
        <div className="h-4 max-w-xl rounded bg-slate-200" />
      </div>
      <div className="h-16 rounded-xl bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-slate-200" />
        ))}
      </div>
      <div className="h-36 rounded-xl bg-slate-200" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-72 rounded-xl bg-slate-200" />
        <div className="h-72 rounded-xl bg-slate-200" />
      </div>
      <div className="h-96 rounded-xl bg-slate-200" />
    </div>
  );
}
