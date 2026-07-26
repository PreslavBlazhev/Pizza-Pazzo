/**
 * Skeleton for the report while its queries run. Plain pulsing blocks in the
 * existing cream palette — no skeleton library, matching the rest of the admin.
 */
export default function AdminReportsLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Зареждане…</span>

      {/* Title + description */}
      <div className="h-8 w-40 animate-pulse rounded-lg bg-pizza-cream-dark/60" />
      <div className="mt-3 h-4 w-72 animate-pulse rounded bg-pizza-cream-dark/40" />

      {/* Period buttons + custom range form */}
      <div className="mt-6 flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-10 w-24 animate-pulse rounded-full bg-pizza-cream-dark/50"
          />
        ))}
      </div>
      <div className="mt-4 h-20 animate-pulse rounded-2xl bg-pizza-cream-dark/40" />

      {/* KPI cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl bg-pizza-cream-dark/50"
          />
        ))}
      </div>

      {/* Order rows */}
      <div className="mt-8 h-6 w-48 animate-pulse rounded bg-pizza-cream-dark/50" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-2xl bg-pizza-cream-dark/40"
          />
        ))}
      </div>
    </div>
  );
}
