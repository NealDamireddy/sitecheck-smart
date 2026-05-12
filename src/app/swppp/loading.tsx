'use client';

export default function SwpppLoading() {
  return (
    <div className="flex h-full flex-col gap-4 p-4 animate-in fade-in duration-300">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-52 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded-md bg-muted" />
      </div>
      {/* Confidence / processing indicator skeleton */}
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      {/* Three-panel layout skeleton */}
      <div className="grid flex-1 grid-cols-1 gap-px overflow-hidden rounded-lg border border-white/5 bg-white/5 lg:grid-cols-[1fr_300px_280px]">
        {/* Left: PDF Viewer panel */}
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            <div className="flex gap-2">
              <div className="h-8 w-8 animate-pulse rounded bg-muted" />
              <div className="h-8 w-8 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="flex-1 min-h-[400px] animate-pulse rounded bg-muted" />
        </div>
        {/* Middle: Checkpoint list panel */}
        <div className="flex flex-col gap-3 border-l border-white/5 p-4">
          <div className="h-5 w-28 animate-pulse rounded bg-muted" />
          <div className="h-9 animate-pulse rounded bg-muted" />
          <div className="space-y-2 flex-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg p-2">
                <div className="h-8 w-8 animate-pulse rounded bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Right: Map panel */}
        <div className="flex flex-col gap-3 border-l border-white/5 p-4">
          <div className="h-5 w-24 animate-pulse rounded bg-muted" />
          <div className="flex-1 min-h-[400px] animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
