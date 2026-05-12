'use client';

export default function CheckpointsLoading() {
  return (
    <div className="flex flex-col gap-6 p-6 animate-in fade-in duration-300">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded-md bg-muted" />
      </div>
      {/* Filter bar skeleton */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-10 w-32 animate-pulse rounded-md bg-muted" />
        <div className="h-10 w-32 animate-pulse rounded-md bg-muted" />
      </div>
      {/* Summary bar skeleton */}
      <div className="h-5 w-72 animate-pulse rounded-md bg-muted" />
      {/* Grid of 8 card skeletons */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-lg bg-muted">
            {/* Image area */}
            <div className="h-36 rounded-t-lg bg-muted" />
            {/* Content area */}
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="h-4 w-28 rounded bg-white/5" />
                <div className="h-5 w-16 rounded-full bg-white/5" />
              </div>
              <div className="h-3 w-full rounded bg-white/5" />
              <div className="h-3 w-3/4 rounded bg-white/5" />
              <div className="flex items-center gap-2 pt-1">
                <div className="h-3 w-3 rounded-full bg-white/5" />
                <div className="h-3 w-24 rounded bg-white/5" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
