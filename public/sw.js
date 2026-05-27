/**
 * SiteCheck offline foundations service worker.
 *
 * ⚠️  FOUNDATIONS SLICE — read this before extending.
 *
 *   This SW only handles read-side caching of the app shell and the
 *   inspection / sites / account view routes so a QSP who's already
 *   loaded the app stays able to OPEN screens in a dead zone. It does
 *   NOT yet implement:
 *     • IndexedDB persistence of writes
 *     • A sync queue that replays POST/PUT/PATCH on reconnect
 *     • Conflict resolution
 *     • Photo compression and Blob caching
 *   Those ship in follow-up PRs (see src/lib/offline/field-policies.ts
 *   and the README "Offline Mode" section for the roadmap).
 *
 *   Anything that mutates server state still goes straight to the
 *   network and will fail offline. Future work installs a
 *   workbox-background-sync queue here for those routes.
 *
 * Workbox is loaded via importScripts from the Google CDN. First-time
 * SW install therefore requires connectivity — that's expected and
 * matches the user flow ("loads the app on-site with full
 * connectivity, drives into a dead zone"). After install the SW is
 * cached locally by the browser SW runtime.
 */

importScripts(
  'https://storage.googleapis.com/workbox-cdn/releases/7.1.0/workbox-sw.js'
);

/* eslint-disable no-undef */

if (!workbox) {
  console.error('[SiteCheck SW] Workbox failed to load from CDN');
} else {
  workbox.setConfig({ debug: false });

  const { core, precaching, routing, strategies, expiration } = workbox;

  core.setCacheNameDetails({
    prefix: 'sitecheck',
    suffix: 'v1',
    precache: 'precache',
    runtime: 'runtime',
  });

  // App-shell precache. Keep this list small and stable — large pages
  // belong in the runtime caches below, where eviction is bounded.
  precaching.precacheAndRoute([
    { url: '/', revision: 'v1' },
    { url: '/dashboard', revision: 'v1' },
  ]);

  // Static assets shipped under /_next/static and /public — content-
  // hashed by Next, so CacheFirst with a long TTL is safe.
  routing.registerRoute(
    ({ url, request }) =>
      url.pathname.startsWith('/_next/static/') ||
      request.destination === 'style' ||
      request.destination === 'script' ||
      request.destination === 'font',
    new strategies.CacheFirst({
      cacheName: 'sitecheck-static-v1',
      plugins: [
        new expiration.ExpirationPlugin({
          maxEntries: 200,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        }),
      ],
    })
  );

  // Images (logos, /public assets, demo photos).
  routing.registerRoute(
    ({ request }) => request.destination === 'image',
    new strategies.CacheFirst({
      cacheName: 'sitecheck-images-v1',
      plugins: [
        new expiration.ExpirationPlugin({
          maxEntries: 200,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        }),
      ],
    })
  );

  // Inspection / Sites / Account navigation requests. StaleWhileRevalidate
  // gives an instant render from cache while updating in the background
  // when online; falls back to the cached HTML when offline.
  routing.registerRoute(
    ({ request, url }) =>
      request.mode === 'navigate' &&
      (url.pathname === '/account' ||
        url.pathname.startsWith('/account/') ||
        url.pathname.startsWith('/inspections') ||
        url.pathname.startsWith('/sites')),
    new strategies.StaleWhileRevalidate({
      cacheName: 'sitecheck-pages-v1',
      plugins: [
        new expiration.ExpirationPlugin({
          maxEntries: 60,
          maxAgeSeconds: 7 * 24 * 60 * 60,
        }),
      ],
    })
  );

  // Other GET API reads — opportunistic NetworkFirst with short cache.
  // Auth/health endpoints are explicitly excluded so we never hand back
  // a stale auth state.
  routing.registerRoute(
    ({ request, url }) =>
      request.method === 'GET' &&
      url.pathname.startsWith('/api/') &&
      !url.pathname.startsWith('/api/healthcheck') &&
      !url.pathname.startsWith('/api/auth'),
    new strategies.NetworkFirst({
      cacheName: 'sitecheck-api-get-v1',
      networkTimeoutSeconds: 4,
      plugins: [
        new expiration.ExpirationPlugin({
          maxEntries: 100,
          maxAgeSeconds: 24 * 60 * 60,
        }),
      ],
    })
  );

  // Health-check endpoint — never cache. Used by the offline banner to
  // confirm real connectivity beyond navigator.onLine.
  routing.registerRoute(
    ({ url }) => url.pathname.startsWith('/api/healthcheck'),
    new strategies.NetworkOnly()
  );

  // Mutations always hit the network. Foundations slice does NOT queue
  // them — failed writes surface to the caller as today.
  routing.setDefaultHandler(new strategies.NetworkOnly());
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
