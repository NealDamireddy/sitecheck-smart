# SiteCheck

CGP 2022 stormwater compliance app for California construction sites.
Built with Next.js (App Router), Supabase, and Zustand.

## Getting started

```bash
npm install
npm run dev
```

The app expects a `.env.local` file with Supabase credentials. See the
team's onboarding doc for the current values.

## Scripts

| Script              | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Next.js dev server.                                  |
| `npm run build`     | Production build.                                    |
| `npm start`         | Start the production build locally.                  |
| `npm run lint`      | ESLint.                                              |
| `npm run test:e2e`  | Playwright e2e tests (offline foundations test).     |

Type-check anywhere with `npx tsc --noEmit`.

## Offline Mode

QSPs run inspections at remote sites that frequently lose cell coverage.
SiteCheck is being made offline-capable in incremental slices. This
section tracks **what works today** and **what does not yet**, so the
field staff and the next contributor both know exactly what to expect.

### What works today (foundations slice)

- A Workbox service worker (`public/sw.js`) is registered on first
  visit and caches:
  - The app shell + Next.js static assets (`/_next/static/*`,
    fonts, images) with a long-lived `CacheFirst` strategy.
  - Navigations to `/inspections/*`, `/sites/*`, and `/account*`
    using `StaleWhileRevalidate` — already-visited screens still
    render in a dead zone.
  - GET responses from `/api/*` (excluding auth + healthcheck) with
    `NetworkFirst` and a 4-second timeout.
- An "you're offline" banner appears within ~2 s of the network
  dropping, driven by a 1 s heartbeat against `/api/healthcheck`
  (`navigator.onLine` alone is not reliable).
- The banner clears automatically once connectivity returns.

### What does **not** work yet (planned follow-ups)

- **Offline writes.** Capturing samples, photos, BMP observations,
  and corrective actions still requires connectivity. Any mutating
  request that fires offline fails the same way it does today.
- **Sync queue / replay.** No queued-mutations replay on reconnect.
- **Conflict resolution.** The per-field policy map in
  `src/lib/offline/field-policies.ts` is a stub for the sync-queue
  PR; nothing reads it at runtime today.
- **IndexedDB persistence.** No client-side store of inspections,
  samples, parameter results, photos, checkpoints, or deficiencies.
- **Photo compression.** Out of scope until the IndexedDB slice
  lands.

### Caveats and gotchas

- **First load must be online.** The service worker bootstraps from
  the Workbox CDN on first install. After install it's cached
  locally and works offline. This matches the field flow ("arrive
  on-site with full connectivity, drive into a dead zone").
- **Service worker only registers in production by default.** Set
  `NEXT_PUBLIC_OFFLINE_SW_DEV=1` to register against `next dev`
  (the e2e test sets this automatically).
- **Auth and `/api/healthcheck` are never cached.** Stale auth
  state would be worse than an outage; the heartbeat would be
  meaningless if it returned a cached "ok".
- **Only same-origin requests are intercepted.** Calls to Supabase,
  Mapbox, and other third parties bypass the service worker.

### Roadmap

| Slice              | What it adds                                                             |
| ------------------ | ------------------------------------------------------------------------ |
| Foundations (this) | Workbox SW, offline banner, Playwright e2e harness.                      |
| Read-through cache | IndexedDB schema + read-through wrapping of the existing Zustand stores. |
| Sample write path  | Sync queue + photo compression + conflict-resolution scoped to samples.  |
| Full coverage      | Inspections, BMPs, deficiencies, corrective actions on the same queue.   |

### Running the offline e2e test

```bash
npx playwright install --with-deps chromium  # one-time
npm run test:e2e
```

The test launches `next dev` with the SW enabled, waits for activation,
toggles `context.setOffline(true)`, and asserts the banner appears
within the 2-second budget.
