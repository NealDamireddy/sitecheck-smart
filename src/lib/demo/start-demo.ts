/**
 * Demo session helpers.
 *
 * The demo lets VCs (or any unauthenticated visitor) bypass Supabase auth and
 * the standard 14-step onboarding overlay, dropped straight into the app with
 * a non-blocking guided tour.
 *
 * Mechanism:
 *   - A `sitecheck_demo=1` cookie is read by `src/middleware.ts` to allow
 *     access to page routes without a Supabase user. Cookie is NOT HttpOnly
 *     so it can be cleared by `exitDemoSession()` from the client.
 *   - The standard onboarding store key is pre-marked complete so the 14-step
 *     overlay does not show.
 *   - The demo-tour store key (`sitecheck-demo-tour`) is seeded so the new
 *     `DemoTourOverlay` opens on the dashboard.
 *   - View mode is forced to `website` so VCs see the desktop layout.
 *
 * API routes still 401 in demo mode — every Zustand store has a static-data
 * fallback (`src/data/*.ts`) which renders the full demo content without a
 * backend.
 */

import { ONBOARDING_VERSION } from '@/components/onboarding/onboarding-steps';
import { useDemoTourStore } from '@/stores/demo-tour-store';

const DEMO_COOKIE = 'sitecheck_demo';
const DEMO_COOKIE_TTL_SECONDS = 60 * 60 * 4; // 4 hours

const ONBOARDING_KEY = 'sitecheck-onboarding';
const DEMO_TOUR_KEY = 'sitecheck-demo-tour';
const VIEW_MODE_KEY = 'sitecheck-view-mode';

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${name}=${value}; path=/; max-age=${maxAgeSeconds}; samesite=lax${secure}`;
}

function clearCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

/**
 * Begin a demo session and hard-navigate to the dashboard.
 *
 * Uses `window.location.assign('/dashboard')` instead of Next's router.push
 * because:
 *   - The middleware needs to see the new sitecheck_demo cookie on the
 *     /dashboard request. A hard navigation guarantees a fresh request
 *     with the cookie attached.
 *   - SPA navigation via router.push can stall on cold edge functions or
 *     when the browser starts prefetching /dashboard before our cookie
 *     was visible to middleware.
 *   - On the new page load, the demo-tour Zustand store re-initializes
 *     from localStorage (which we just seeded with active=true) so the
 *     tour panel opens automatically.
 */
export function startDemoSession(): void {
  if (typeof window === 'undefined') return;

  setCookie(DEMO_COOKIE, '1', DEMO_COOKIE_TTL_SECONDS);

  try {
    // Mark the standard 14-step overlay as already finished so it doesn't pop.
    localStorage.setItem(
      ONBOARDING_KEY,
      JSON.stringify({
        hasCompleted: true,
        completedVersion: ONBOARDING_VERSION,
      })
    );

    // Seed the demo-tour store: active + on step 0. The store will read
    // this on the next page load and the DemoTourOverlay will open.
    localStorage.setItem(
      DEMO_TOUR_KEY,
      JSON.stringify({ active: true, currentStep: 0 })
    );

    // Force website view — most impressive layout for the tour.
    localStorage.setItem(VIEW_MODE_KEY, JSON.stringify('website'));
  } catch {
    // Safari private mode etc. — cookie alone is enough for middleware to
    // let them through; tour overlay simply won't appear.
  }

  // Hard-navigate so the new cookie is sent with the request and middleware
  // recognises the demo session. router.push can be slow on cold edges.
  window.location.assign('/dashboard');
}

/**
 * Tear down the demo session entirely: cookie + localStorage flags.
 * Caller is responsible for redirecting to /login.
 */
export function exitDemoSession(): void {
  if (typeof window === 'undefined') return;
  clearCookie(DEMO_COOKIE);
  try {
    localStorage.removeItem(DEMO_TOUR_KEY);
    // Remove the onboarding completion shim so a real signup post-demo gets
    // the standard 14-step overlay.
    localStorage.removeItem(ONBOARDING_KEY);
  } catch {
    // ignore
  }
  try {
    useDemoTourStore.getState().exit();
  } catch {
    // ignore
  }
}

/**
 * Client-side check for whether the demo cookie is present. NOT a security
 * boundary — middleware re-reads the same cookie server-side.
 */
export function isDemoSession(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie
    .split(';')
    .some((c) => c.trim().startsWith(`${DEMO_COOKIE}=1`));
}
