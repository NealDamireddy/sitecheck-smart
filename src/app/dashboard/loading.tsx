'use client';

export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-6 animate-in fade-in duration-300">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded-md bg-muted" />
      </div>
      {/* Status bar skeleton */}
      <div className="h-16 animate-pulse rounded-lg bg-muted" />
      {/* Metric cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
      {/* Map + feed skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 h-80 animate-pulse rounded-lg bg-muted" />
        <div className="h-80 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  );
}
