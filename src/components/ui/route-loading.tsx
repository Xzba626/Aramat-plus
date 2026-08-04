/**
 * Instant route skeleton for App Router `loading.tsx`.
 * No i18n / session — must paint immediately on soft navigation.
 */
export function RouteLoading() {
  return (
    <div className="space-y-4 p-4 sm:p-6" aria-busy="true" aria-hidden>
      <div className="h-8 w-48 animate-pulse rounded-lg bg-border/70" />
      <div className="h-4 w-72 max-w-full animate-pulse rounded bg-border/50" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-[16px] bg-border/45"
            style={{ opacity: 1 - i * 0.08 }}
          />
        ))}
      </div>
    </div>
  );
}
