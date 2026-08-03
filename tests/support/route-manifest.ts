/**
 * The API surface, classified. This is the table the security suite
 * iterates over — a new route that isn't listed here fails
 * tests/security/route-inventory.test.ts, so the classification can't
 * silently drift from the code.
 *
 * `scope`:
 *   'qsp'      — the live compliance product. Fully covered.
 *   'drone'    — drone/linear surface, deferred by scope decision
 *                (docs/FOLLOW_UP.md). Auth is still asserted; behavior
 *                is not.
 *   'machine'  — not user-facing; its own auth scheme, justified below.
 */

export type RouteScope = 'qsp' | 'drone' | 'machine';
export type Verb = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RouteSpec {
  /** Path relative to src/app, e.g. 'api/samples/route.ts'. */
  file: string;
  /** URL shape, for readable test names. */
  path: string;
  verbs: Verb[];
  scope: RouteScope;
  /**
   * Auth model. 'user' = requireAuth(). Anything else must carry a
   * `why` explaining the exception — this is the allowlist the audit
   * checks against.
   */
  auth: 'user' | 'token' | 'public';
  why?: string;
}

export const ROUTES: RouteSpec[] = [
  // ── QSP compliance core ─────────────────────────────────────────────
  { file: 'api/projects/route.ts', path: '/api/projects', verbs: ['GET', 'POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/projects/[projectId]/route.ts', path: '/api/projects/[projectId]', verbs: ['PATCH'], scope: 'qsp', auth: 'user' },
  { file: 'api/checkpoints/route.ts', path: '/api/checkpoints', verbs: ['GET', 'POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/checkpoints/[id]/route.ts', path: '/api/checkpoints/[id]', verbs: ['GET', 'PUT', 'DELETE'], scope: 'qsp', auth: 'user' },
  { file: 'api/checkpoints/[id]/analyze/route.ts', path: '/api/checkpoints/[id]/analyze', verbs: ['POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/checkpoints/[id]/photo/route.ts', path: '/api/checkpoints/[id]/photo', verbs: ['POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/checkpoints/bulk/route.ts', path: '/api/checkpoints/bulk', verbs: ['POST'], scope: 'qsp', auth: 'user' },
  // SWPPP ingestion (swppp-service). POST proxies to the Python pipeline with
  // the caller's JWT; the reads go straight to Postgres under RLS so document
  // status and draft review survive the service being down.
  { file: 'api/projects/[projectId]/swppp/route.ts', path: '/api/projects/[projectId]/swppp', verbs: ['GET', 'POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/projects/[projectId]/swppp/[documentId]/route.ts', path: '/api/projects/[projectId]/swppp/[documentId]', verbs: ['GET', 'DELETE'], scope: 'qsp', auth: 'user' },
  // The human-in-the-loop gate: drafts become checkpoints only here.
  { file: 'api/projects/[projectId]/swppp/[documentId]/promote/route.ts', path: '/api/projects/[projectId]/swppp/[documentId]/promote', verbs: ['POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/inspections/route.ts', path: '/api/inspections', verbs: ['GET', 'POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/inspections/[id]/route.ts', path: '/api/inspections/[id]', verbs: ['GET', 'PATCH'], scope: 'qsp', auth: 'user' },
  { file: 'api/inspections/[id]/submit/route.ts', path: '/api/inspections/[id]/submit', verbs: ['POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/inspections/[id]/pdf/route.ts', path: '/api/inspections/[id]/pdf', verbs: ['GET'], scope: 'qsp', auth: 'user' },
  { file: 'api/inspections/check-rain-events/route.ts', path: '/api/inspections/check-rain-events', verbs: ['POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/deficiencies/route.ts', path: '/api/deficiencies', verbs: ['GET', 'POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/deficiencies/[id]/route.ts', path: '/api/deficiencies/[id]', verbs: ['GET', 'PUT'], scope: 'qsp', auth: 'user' },
  { file: 'api/corrective-actions/route.ts', path: '/api/corrective-actions', verbs: ['GET', 'POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/corrective-actions/[id]/route.ts', path: '/api/corrective-actions/[id]', verbs: ['GET', 'PATCH'], scope: 'qsp', auth: 'user' },
  { file: 'api/reports/generate/route.ts', path: '/api/reports/generate', verbs: ['POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/reports/[id]/pdf/route.ts', path: '/api/reports/[id]/pdf', verbs: ['GET'], scope: 'qsp', auth: 'user' },
  { file: 'api/samples/route.ts', path: '/api/samples', verbs: ['GET', 'POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/samples/[id]/route.ts', path: '/api/samples/[id]', verbs: ['GET', 'PATCH', 'DELETE'], scope: 'qsp', auth: 'user' },
  { file: 'api/monitoring-locations/route.ts', path: '/api/monitoring-locations', verbs: ['GET', 'POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/monitoring-locations/[id]/route.ts', path: '/api/monitoring-locations/[id]', verbs: ['GET', 'PATCH', 'DELETE'], scope: 'qsp', auth: 'user' },
  { file: 'api/smarts-events/route.ts', path: '/api/smarts-events', verbs: ['GET', 'POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/smarts-events/[id]/route.ts', path: '/api/smarts-events/[id]', verbs: ['GET', 'PATCH', 'DELETE'], scope: 'qsp', auth: 'user' },
  { file: 'api/smarts-events/[id]/export/route.ts', path: '/api/smarts-events/[id]/export', verbs: ['GET'], scope: 'qsp', auth: 'user' },
  { file: 'api/smarts-events/simulate/route.ts', path: '/api/smarts-events/simulate', verbs: ['POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/smarts/credentials/route.ts', path: '/api/smarts/credentials', verbs: ['GET', 'PUT', 'DELETE'], scope: 'qsp', auth: 'user' },
  { file: 'api/smarts/runs/route.ts', path: '/api/smarts/runs', verbs: ['GET'], scope: 'qsp', auth: 'user' },
  { file: 'api/smarts/sync/route.ts', path: '/api/smarts/sync', verbs: ['POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/smarts/sync/preview/route.ts', path: '/api/smarts/sync/preview', verbs: ['GET'], scope: 'qsp', auth: 'user' },
  { file: 'api/smarts/sync/[jobId]/route.ts', path: '/api/smarts/sync/[jobId]', verbs: ['GET'], scope: 'qsp', auth: 'user' },
  { file: 'api/smarts/sync/[jobId]/screenshot/route.ts', path: '/api/smarts/sync/[jobId]/screenshot', verbs: ['GET'], scope: 'qsp', auth: 'user' },
  { file: 'api/qsp-profile/route.ts', path: '/api/qsp-profile', verbs: ['GET', 'PUT'], scope: 'qsp', auth: 'user' },
  { file: 'api/scan-swppp/route.ts', path: '/api/scan-swppp', verbs: ['POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/analyze/route.ts', path: '/api/analyze', verbs: ['POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/activity/route.ts', path: '/api/activity', verbs: ['GET', 'POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/notifications/route.ts', path: '/api/notifications', verbs: ['GET'], scope: 'qsp', auth: 'user' },
  { file: 'api/notifications/[id]/read/route.ts', path: '/api/notifications/[id]/read', verbs: ['POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/dashboard/metrics/route.ts', path: '/api/dashboard/metrics', verbs: ['GET'], scope: 'qsp', auth: 'user' },
  { file: 'api/weather/current/route.ts', path: '/api/weather/current', verbs: ['GET'], scope: 'qsp', auth: 'user' },
  { file: 'api/weather/forecast/route.ts', path: '/api/weather/forecast', verbs: ['GET'], scope: 'qsp', auth: 'user' },
  { file: 'api/weather/qpe-events/route.ts', path: '/api/weather/qpe-events', verbs: ['GET', 'POST'], scope: 'qsp', auth: 'user' },
  { file: 'api/permits/route.ts', path: '/api/permits', verbs: ['GET', 'POST', 'PATCH'], scope: 'qsp', auth: 'user' },

  // ── Drone / linear — deferred by scope decision ─────────────────────
  { file: 'api/missions/route.ts', path: '/api/missions', verbs: ['GET', 'POST'], scope: 'drone', auth: 'user' },
  { file: 'api/missions/[id]/route.ts', path: '/api/missions/[id]', verbs: ['GET', 'PUT'], scope: 'drone', auth: 'user' },
  { file: 'api/missions/[id]/complete/route.ts', path: '/api/missions/[id]/complete', verbs: ['POST'], scope: 'drone', auth: 'user' },
  { file: 'api/missions/[id]/reviews/route.ts', path: '/api/missions/[id]/reviews', verbs: ['GET', 'POST'], scope: 'drone', auth: 'user' },
  { file: 'api/missions/[id]/ai-analyses/route.ts', path: '/api/missions/[id]/ai-analyses', verbs: ['GET'], scope: 'drone', auth: 'user' },
  { file: 'api/missions/[id]/telemetry/sample/route.ts', path: '/api/missions/[id]/telemetry/sample', verbs: ['POST'], scope: 'drone', auth: 'user' },
  { file: 'api/missions/[id]/waypoints/[number]/route.ts', path: '/api/missions/[id]/waypoints/[number]', verbs: ['PUT'], scope: 'drone', auth: 'user' },
  { file: 'api/missions/[id]/waypoints/[number]/analyze/route.ts', path: '/api/missions/[id]/waypoints/[number]/analyze', verbs: ['POST'], scope: 'drone', auth: 'user' },
  { file: 'api/missions/[id]/waypoints/[number]/photos/route.ts', path: '/api/missions/[id]/waypoints/[number]/photos', verbs: ['POST'], scope: 'drone', auth: 'user' },
  { file: 'api/inspections/[id]/missions/route.ts', path: '/api/inspections/[id]/missions', verbs: ['POST'], scope: 'drone', auth: 'user' },
  { file: 'api/inspections/[id]/missions/[missionId]/route.ts', path: '/api/inspections/[id]/missions/[missionId]', verbs: ['DELETE'], scope: 'drone', auth: 'user' },
  { file: 'api/generate-mission/route.ts', path: '/api/generate-mission', verbs: ['POST'], scope: 'drone', auth: 'user' },
  { file: 'api/geofences/route.ts', path: '/api/geofences', verbs: ['GET', 'POST'], scope: 'drone', auth: 'user' },
  { file: 'api/geofences/[id]/route.ts', path: '/api/geofences/[id]', verbs: ['PATCH', 'DELETE'], scope: 'drone', auth: 'user' },
  { file: 'api/nofly-zones/route.ts', path: '/api/nofly-zones', verbs: ['GET', 'POST'], scope: 'drone', auth: 'user' },
  { file: 'api/nofly-zones/[id]/route.ts', path: '/api/nofly-zones/[id]', verbs: ['PATCH', 'DELETE'], scope: 'drone', auth: 'user' },
  { file: 'api/crossings/route.ts', path: '/api/crossings', verbs: ['GET', 'POST'], scope: 'drone', auth: 'user' },
  { file: 'api/crossings/[id]/route.ts', path: '/api/crossings/[id]', verbs: ['GET', 'PATCH', 'DELETE'], scope: 'drone', auth: 'user' },

  // ── Machine endpoints — non-user auth, each justified ────────────────
  {
    file: 'api/admin/apply-migrations/route.ts',
    path: '/api/admin/apply-migrations',
    verbs: ['POST', 'GET'],
    scope: 'machine',
    auth: 'token',
    why: 'Operator-only DB migration runner. Shared x-admin-token (constant-time compare) AND hard-disabled in production builds unless ALLOW_REMOTE_MIGRATIONS=1 (SEC-02).',
  },
  {
    file: 'api/cron/pre-storm-detector/route.ts',
    path: '/api/cron/pre-storm-detector',
    verbs: ['GET'],
    scope: 'machine',
    auth: 'token',
    why: 'Vercel cron. Requires Authorization: Bearer $CRON_SECRET; there is no user session in a cron invocation.',
  },
  {
    file: 'api/health/route.ts',
    path: '/api/health',
    verbs: ['GET'],
    scope: 'machine',
    auth: 'public',
    why: 'Container liveness/readiness probe. Load balancers cannot authenticate, so it is deliberately open — and therefore returns only status, uptime and build metadata: no configuration, no connection details, no upstream error text.',
  },
  {
    file: 'api/weather/noaa/route.ts',
    path: '/api/weather/noaa',
    verbs: ['GET'],
    scope: 'machine',
    auth: 'public',
    why: 'Stateless proxy to the public NOAA API. Takes lat/lon, touches no database and no user data. Whitelisted in middleware so the unauthenticated demo dashboard can render.',
  },
];

export const QSP_ROUTES = ROUTES.filter((r) => r.scope === 'qsp');
export const USER_AUTH_ROUTES = ROUTES.filter((r) => r.auth === 'user');
