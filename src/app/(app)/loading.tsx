export default function Loading() {
  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8 max-w-6xl">
      <div className="mb-8 space-y-3">
        <div className="h-3 w-28 animate-pulse rounded bg-ink-card" />
        <div className="h-8 w-56 animate-pulse rounded bg-ink-card" />
        <div className="h-3 w-72 animate-pulse rounded bg-ink-card" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card-tile h-24 animate-pulse" />
        ))}
      </div>
      <div className="card h-72 animate-pulse" />
    </div>
  );
}
