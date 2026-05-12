'use client';

export default function WeatherLoading() {
  return (
    <div className="flex flex-col gap-4 p-4 animate-in fade-in duration-300">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-72 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded-md bg-muted" />
      </div>
      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left column: Current + Forecast + Timeline */}
        <div className="space-y-4 lg:col-span-2">
          {/* Current conditions card */}
          <div className="animate-pulse rounded-lg border border-white/5 bg-muted p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-5 w-40 rounded bg-white/5" />
                <div className="h-10 w-24 rounded bg-white/5" />
                <div className="h-3 w-32 rounded bg-white/5" />
              </div>
              <div className="h-20 w-20 rounded-full bg-white/5" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg bg-white/5 p-3">
                  <div className="h-3 w-16 rounded bg-white/10" />
                  <div className="mt-2 h-5 w-12 rounded bg-white/10" />
                </div>
              ))}
            </div>
          </div>
          {/* Forecast chart skeleton */}
          <div className="animate-pulse rounded-lg border border-white/5 bg-muted p-6">
            <div className="h-5 w-36 rounded bg-white/5" />
            <div className="mt-4 h-48 rounded bg-white/5" />
          </div>
          {/* Inspection timeline skeleton */}
          <div className="animate-pulse rounded-lg border border-white/5 bg-muted p-6">
            <div className="h-5 w-44 rounded bg-white/5" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-white/5" />
                  <div className="h-4 flex-1 rounded bg-white/5" />
                  <div className="h-4 w-20 rounded bg-white/5" />
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Right column: Alerts + Precipitation events */}
        <div className="space-y-4">
          {/* Alert panel skeleton */}
          <div className="animate-pulse rounded-lg border border-white/5 bg-muted p-6">
            <div className="h-5 w-28 rounded bg-white/5" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="rounded-lg bg-white/5 p-3 space-y-2">
                  <div className="h-4 w-32 rounded bg-white/10" />
                  <div className="h-3 w-full rounded bg-white/10" />
                  <div className="h-3 w-3/4 rounded bg-white/10" />
                </div>
              ))}
            </div>
          </div>
          {/* Precipitation events skeleton */}
          <div className="animate-pulse rounded-lg border border-white/5 bg-muted p-6">
            <div className="h-5 w-44 rounded bg-white/5" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded bg-white/5" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-3/4 rounded bg-white/5" />
                    <div className="h-2.5 w-1/2 rounded bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
