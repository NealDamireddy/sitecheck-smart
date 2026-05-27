'use client';

/**
 * Registers the Workbox service worker on the client.
 *
 * Production-only by default — service workers + Next.js dev-mode HMR
 * make for a confusing experience (stale JS chunks, slow refreshes).
 * Set NEXT_PUBLIC_OFFLINE_SW_DEV=1 to opt in during local development
 * (the Playwright e2e job sets this so the offline test can run
 * against `next dev`).
 */

import { useEffect } from 'react';
import { Workbox } from 'workbox-window';

const SW_URL = '/sw.js';

function shouldRegister(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  if (process.env.NODE_ENV === 'production') return true;
  return process.env.NEXT_PUBLIC_OFFLINE_SW_DEV === '1';
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!shouldRegister()) return;

    const wb = new Workbox(SW_URL);

    wb.addEventListener('waiting', () => {
      void wb.messageSW({ type: 'SKIP_WAITING' });
    });

    wb.register().catch((err) => {
      console.warn('[SiteCheck SW] registration failed', err);
    });
  }, []);

  return null;
}
