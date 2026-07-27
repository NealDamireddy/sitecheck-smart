'use client';

import { MapPinOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Rendered in place of any Mapbox map when NEXT_PUBLIC_MAPBOX_TOKEN is
 * missing or still the placeholder value. Keeps the layout intact and
 * tells the operator exactly how to turn maps on, instead of a black
 * tile and a wall of 401s in the console.
 */
export function MapUnavailable({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex h-full min-h-[200px] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface p-6 text-center',
        className
      )}
    >
      <MapPinOff className="h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm font-medium text-muted-foreground">Map unavailable</p>
      <p className="max-w-xs text-xs text-muted-foreground/70">
        Set <code className="rounded bg-white/5 px-1 py-0.5">NEXT_PUBLIC_MAPBOX_TOKEN</code>{' '}
        in <code className="rounded bg-white/5 px-1 py-0.5">.env.local</code> to enable site maps.
      </p>
    </div>
  );
}
