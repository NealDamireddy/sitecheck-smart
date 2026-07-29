# SiteCheck — What the Tests Actually Prove

No percentages. A coverage number would say the lines executed, not that the product is right. This says which critical paths are proven, which are partly proven, and which are not proven at all.

**Suites:** `npm test` (268 tests, 20 files) · `npm run test:security` (131 of those) · `cd smarts-automation && npm test` (126 tests) · `npm run test:e2e` (18 specs, gated — see below).

---

## Proven — a regression here fails the build

**Tenant isolation, route layer.** Every one of the 65 API routes is classified in `tests/support/route-manifest.ts`, and 97 generated cases (route × verb) assert that an unauthenticated request gets 401 *and never touches the database*. A new route that skips `requireAuth`, or that nobody classifies, fails `tests/security/route-inventory.test.ts`. The auth-exception list (3 machine endpoints) is pinned — adding a fourth is a deliberate, visible change.

**Routes refuse invisible resources.** When the database returns nothing for a row — exactly what RLS does for another tenant's data — the read routes answer 404/403 and leak no body, and the mutating routes do not report success. Sync-job ownership (the one check that lives in application code, because jobs are file-backed) is asserted directly.

**No server secret reaches the browser.** The built client bundle is scanned for the real *values* of ten server-only variables, matching on JWT signature segments because Supabase anon and service-role keys share a byte-identical header — a prefix match reports the public key as a leak. A negative control asserts the anon key *is* found, so a scan that searched the wrong files could not pass silently.

**Regulatory boundaries.** pH at 5.9/6.0/6.1/8.9/9.0/9.1 and turbidity at 249/250/251, asserting the permit's rule that the exact threshold values are compliant. QPE at 0.49″/0.50″/0.51″ and event separation at 47/48/49 hours. The 72-hour repair clock across both DST transitions, with fixed instants — no `Date.now()` in any assertion.

**ND/DNQ.** Every valid and invalid combination, at the shared rule and through the real Zod schemas the routes use.

**Model output is never trusted.** Prose preambles, truncated JSON, markdown fences, out-of-range confidence and oversized injected strings all produce a 502 with nothing persisted and nothing fabricated. Anthropic is mocked at the module boundary; no test can spend money.

**The certify hard-stop.** `smarts-automation/tests/certification-guard.test.ts` proves a model-generated action aimed at a Certify button or attestation checkbox throws before a single mouse event is dispatched — the product's core legal invariant, asserted at the layer that was previously unguarded.

**Data-loss guards.** The `parameter_results` replace plan never schedules a delete for a parameter still present (property-swept over all subsets).

## Partly proven — the logic is covered, the integration is not

**RLS itself — NOW PROVEN.** `e2e/isolation.spec.ts` has been executed against a live Supabase project with all 15 migrations applied and two seeded tenants: User B cannot open, read, list or mutate User A's project, and both unauthenticated and cookie-cleared sessions redirect to login. Passing on Chromium and WebKit. A direct schema inspection additionally confirms 32 tables with RLS enabled on every one, 103 policies, zero permissive `USING (true)` policies, and the three `auth.uid()` helper functions present as SECURITY DEFINER. "Your data is isolated" is now backed by an executed test, not inference.

**Password reset.** The rules and the recovery-redirect construction are unit-tested. That the email arrives and its link works depends on Supabase email templates and Site URL configuration — QA checklist §1.

**Report structure.** Generation is exercised in `e2e/golden-path.spec.ts` (gated). There is no golden-file snapshot yet, because the Part I–VII structure is blocked on the DRF-02 inspection-type decision; snapshotting the current output would freeze a structure we already know is incomplete.

**Weather.** Pure helpers are tested (unit conversion, local-day bucketing, the UTC-split case that caused the original bug). Live NOAA responses are not — the station-walk and coverage logic meet reality only in QA checklist §5.

## Not proven — stated plainly

- **Storage privacy.** No test asserts an unsigned photo path is unfetchable, because the buckets are still public (SEC-01, awaiting your dashboard flip). Add the assertion when you flip them.
- **The drone/linear surface.** Auth is asserted; behavior is not, by scope decision (`docs/FOLLOW_UP.md`).
- **Field usability.** Touch targets, sunlight legibility, gloved operation, offline behavior — QA checklist §4. The interruption spec exists but has never run.
- **The SMARTS portal itself.** No test touches the live government site, by design. The replay tests the mandate suggests (§5.6) were **not** built: they would depend on `smarts-automation/smarts-automation/recon/*.html`, which are captures of a real logged-in session (SEC-12, unresolved). Building tests on that data would entrench it in the repo. Sanitize those fixtures first.
- **Load and concurrency.** Nothing tests two inspectors writing the same inspection, or the rate limiter under real parallelism.

## Running the E2E suite

The specs create and destroy real rows, so they refuse to run unless pointed at a disposable environment:

```bash
npx playwright install          # one-time, ~500 MB
npm run db:seed:test            # needs E2E_SUPABASE_* in .env.test
npm run test:e2e
```

`e2e/fixtures.ts` aborts if `E2E_BASE_URL` looks like a deployed host, or if `E2E_SUPABASE_URL` is unset while the app's own Supabase URL is present. Unconfigured, all 18 specs skip with instructions — never a red suite on a fresh clone.

## Findings the suite produced

Writing these tests surfaced four defects that the Stage 1–3 reviews had missed:

| ID | What | Where |
|---|---|---|
| SEC-13 | `PATCH /api/permits` validated the request before authenticating, so an unauthenticated caller got 400 instead of 401 | `api/permits/route.ts` |
| SEC-14 | `DELETE` on samples, monitoring-locations and smarts-events answered `{success:true}` for deletes that affected zero rows — a QSP could be told a deletion happened that never did | three `[id]` routes |
| SEC-15 | `/api/analyze` accepted an empty body, interpolating `undefined` into a paid Claude prompt; `status` was any string despite being echoed back as the compliance status | `validations/analyze.ts` |
| — | The naive bundle scan produced a false positive on the service-role key (shared JWT header), which is why the signature-segment comparison exists | `tests/security/bundle-secrets.test.ts` |
