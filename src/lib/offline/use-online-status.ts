'use client';

/**
 * Online-status hook for the offline foundations slice.
 *
 * navigator.onLine is unreliable in practice — laptops on a wifi AP
 * with no upstream still report online: true. We layer a 1-second
 * heartbeat against /api/healthcheck on top of the browser's online/
 * offline events. The first failed (or timed-out) heartbeat flips the
 * state to offline, which lets us hit the spec's "banner appears
 * within 2s of network loss" target without spamming the network.
 *
 * Heartbeats stop when the tab is hidden (visibilitychange) so a
 * background tab on a flaky network doesn't keep retrying. They also
 * skip on first mount during SSR — the hook is intentionally a
 * client-only hook ('use client' above).
 */

import { useEffect, useState } from 'react';

export type OnlineStatus = 'online' | 'offline' | 'unknown';

const HEARTBEAT_INTERVAL_MS = 1000;
const HEARTBEAT_TIMEOUT_MS = 1500;
const HEARTBEAT_URL = '/api/healthcheck';

async function probe(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HEARTBEAT_TIMEOUT_MS);
    const res = await fetch(HEARTBEAT_URL, {
      method: 'GET',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export function useOnlineStatus(): OnlineStatus {
  const [status, setStatus] = useState<OnlineStatus>('unknown');

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      const ok = await probe();
      if (!cancelled) setStatus(ok ? 'online' : 'offline');
    }

    function start() {
      if (timer != null) return;
      void tick();
      timer = setInterval(() => {
        void tick();
      }, HEARTBEAT_INTERVAL_MS);
    }

    function stop() {
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') start();
      else stop();
    }

    function onOnline() {
      void tick();
      start();
    }

    function onOffline() {
      setStatus('offline');
    }

    start();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      stop();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return status;
}
