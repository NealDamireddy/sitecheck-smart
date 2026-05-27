'use client';

/**
 * Offline banner — shows a fixed-position notice while the heartbeat
 * reports we're offline. Foundations slice: read-only message; the
 * "Syncing N changes" indicator ships with the sync-queue PR.
 */

import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/lib/offline/use-online-status';

export function OfflineBanner() {
  const status = useOnlineStatus();
  if (status !== 'offline') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-banner"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-amber-600/95 px-3 py-1.5 text-xs font-medium text-amber-50 shadow-md backdrop-blur"
    >
      <WifiOff className="h-3.5 w-3.5" />
      <span>You&apos;re offline — cached screens still work; new entries will save when you&apos;re back online.</span>
    </div>
  );
}
