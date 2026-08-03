# SiteCheck — Security

What we defend against, what we guarantee, and **the specific test that proves each guarantee**. A claim without a test behind it is labeled as such.

Verified during the hardening review against a live Supabase project. Findings and their fixes: `docs/CODE_REVIEW.md`. Accepted risks: `docs/FOLLOW_UP.md`.

---

## 1. What's at stake

SiteCheck holds customer construction-site data that functions as legal evidence, and — for the SMARTS bot — **customer credentials for a government portal**. The realistic consequences of a breach are not abstract: a permit violation carries five-figure-per-day penalties, and the QSP's personal license is on the line.

## 2. Threat model

| Adversary | Capability | Primary defense |
|---|---|---|
| **Another tenant** (a real, authenticated inspector) | Valid session; can craft any request, guess ids, read their own bundle | Postgres RLS on all 32 tables (§3) |
| **Unauthenticated internet** | Any request to any route | `requireAuth()` on every user-facing route (§4) |
| **A malicious uploaded document** | Controls SWPPP text and photo content reaching a model prompt | Schema validation of model output (§5) |
| **Anyone reading the client bundle** | Full access to shipped JS | Server/client secret split, verified byte-wise (§6) |
| **Anyone with database access alone** | Can read every row | SMARTS passwords encrypted with a key held only by the app (§7) |
| **A compromised or hallucinating model** | Can emit arbitrary actions to the browser automation | Three independent certification hard-stops (§8) |
| **An operator mistake** | Can point tools at the wrong database | Target confirmation and contents-based guards (§9) |

Explicitly **out of scope**: a compromised app server (it holds the service-role key and the credential-encryption key by necessity); a malicious Supabase; physical access to an unlocked developer laptop.

## 3. Tenant isolation — the guarantee that matters

**Claim: an inspector cannot read, list, modify, or infer the existence of another organization's data.**

Enforced in Postgres, not in application code. Every table has RLS enabled; 103 policies all resolve through two `SECURITY DEFINER` helpers:

```
auth.uid() → auth_user_org_ids() → auth_user_project_ids() → project_id IN (…)
```

Child tables scope via their parent. This ordering matters: a route that forgets a filter returns **nothing**, rather than everyone's data.

**Proof — executed, not inferred:**

| Test | What it proves |
|---|---|
| `e2e/isolation.spec.ts` (live Postgres) | User B cannot open User A's project by URL, cannot read it via `/api/projects`, cannot list its checkpoints, cannot PATCH it. Unauthenticated and cookie-cleared sessions both redirect. Passes on Chromium and WebKit. |
| Direct schema inspection | 32 tables, RLS enabled on **every** one, 103 policies, **zero** permissive `USING (true)` policies, all three helper functions present as `SECURITY DEFINER`. |
| `tests/security/tenant-isolation.test.ts` | The route layer's half: when the DB returns nothing (what RLS does for a foreign row), routes answer 404/403, leak no body, and never report a successful write. |
| `tests/security/route-inventory.test.ts` | No user-facing route imports the RLS-bypassing admin client. The deprecated `createServerClient()` alias stays deleted. |

**Honest limits.** Within a single organization there is **no role enforcement** — `org_memberships.role` is stored and never checked, so a `viewer` can delete projects. There is also no invite flow, so a two-person firm currently cannot share a site (ACC-03). Both are in FOLLOW_UP.

## 4. Authentication

Supabase Auth with SSR cookie sessions. Pages are gated by `src/middleware.ts`; **API routes authenticate individually** via `requireAuth()` because the middleware matcher excludes `/api` (routing handlers through session refresh drops POST bodies).

**Proof:** `tests/security/unauthenticated-access.test.ts` generates one case per (route × verb) — 97 cases — asserting each returns 401 **and never touches the database**. It is table-driven from `tests/support/route-manifest.ts`, and `route-inventory.test.ts` fails the build if a new route isn't classified or silently drops `requireAuth`.

Three documented exceptions, pinned by test so a fourth cannot be added quietly:

- `/api/admin/apply-migrations` — shared token, constant-time compare, **404 in production** unless `ALLOW_REMOTE_MIGRATIONS=1`
- `/api/cron/pre-storm-detector` — `Authorization: Bearer $CRON_SECRET`; a cron has no user session
- `/api/health` — load balancers cannot authenticate; returns only status, uptime and build metadata, no configuration
- `/api/weather/noaa` — stateless proxy to a public API, touches no data

## 5. AI as an attack surface

A SWPPP PDF or a site photo is attacker-controlled content entering a model prompt. Two rules:

**Model output is untrusted data.** Every response is Zod-validated after it returns (`src/lib/validations/ai-output.ts`) with hard length and range caps that bound what an injected document can smuggle into the database or the UI. Failure produces a 502 and persists nothing — it never coerces to defaults.

**Model output never reaches a dangerous sink.** No SQL interpolation (parameterized supabase-js), no `dangerouslySetInnerHTML` anywhere, no file paths, no shell.

**Proof:** `tests/integration/ai-routes.test.ts` — prose preambles, truncated JSON, markdown fences, out-of-range confidence, and oversized injected strings all yield 502 with nothing stored. `tests/checkpoint-analyze-no-mock.test.ts` proves a vision failure persists nothing (it previously wrote a *fabricated* mock analysis indistinguishable from a real one). `tests/ai-output-validation.test.ts` covers the schemas directly. Anthropic is mocked at the module boundary — no test can spend money or reach the network.

Two prompt-level decisions worth knowing: the extractor is forbidden from inventing GPS coordinates (it returns `null`, and the app rings unlocated checkpoints around the real project center), and the model is pinned to `claude-opus-5` rather than floating, in one place (`src/lib/ai-model.ts`) rather than the six it used to be copied across.

## 6. Secret handling

`NEXT_PUBLIC_*` is compiled into the browser bundle and is world-readable — currently the Supabase URL, the anon key, and the Mapbox token, which is the correct set. Everything else is server-only.

**Proof:** `tests/security/bundle-secrets.test.ts` scans the built client output for the **actual values** of ten server-only variables. It matches on JWT *signature segments*, because Supabase anon and service-role keys share a byte-identical header and prefix — a naive comparison reports the public key as a leak (it did, during this review). A negative control asserts the anon key **is** found, so a scan pointed at the wrong files cannot pass silently.

Also verified: no secrets committed to the repo or present in git history; `.env.local`, `.env`, and `.env.test` are gitignored, as are Playwright's saved auth sessions.

Server logs go through `src/lib/logger.ts`, which redacts any context key matching a secret-shaped name and unwraps `Error` objects rather than spreading them — HTTP client errors hang a `config` object containing auth headers off the error, and spreading one into a log is a quiet credential leak. `tests/security/logger-redaction.test.ts` covers 14 key patterns plus that error case, and fails the build if an API route reintroduces bare `console.*`.

## 7. SMARTS credential storage

Each inspector's government-portal password is encrypted with **AES-256-GCM** before it reaches the database. The key (`SMARTS_CREDENTIALS_KEY`, 32 bytes hex) lives only in the app server's environment, so **database access alone cannot recover a password**.

- The API is write-only for the secret: `GET` returns the username and timestamps, never the password in any form, encrypted or not.
- Decryption happens in exactly one place, at sync-launch time.
- The plaintext reaches the bot only through child-process environment variables — never written to the job files, never logged, never screenshotted.
- RLS restricts `smarts_credentials` to `user_id = auth.uid()`.
- Rotating the key invalidates every stored password by design; there is no recovery path.

**Proof:** `tests/smarts-credentials.test.ts` — encrypt/decrypt roundtrip, ciphertext never contains the plaintext, malformed key refused. The shared server-wide fallback account is **opt-in** (`SMARTS_ALLOW_ENV_FALLBACK=1`): without it a user with no saved credentials simply cannot sync, rather than silently filing under someone else's identity.

Sync jobs additionally enforce ownership in application code, because the job store is file-backed and RLS doesn't apply: `tests/sync-job-ownership.test.ts` proves a foreign job id returns 404 (not 403 — the response must not confirm it exists).

## 8. The certification hard-stop

**Claim: no code path can certify or submit to SMARTS on the QSP's behalf.** This is the product's core legal invariant.

Three independent guards, because one is not enough for something this consequential:

1. **Structural** — the orchestrator never navigates past the certification screenshot (`run-fill.ts`).
2. **Assertion-level** — before any model-generated click, type, or select, the vision executor inspects the element under the target coordinates and hard-halts on anything matching certify / attest / penalty-of-law (`execute-action.ts`). This closed the real gap: the vision loop acts on raw coordinates, so a hallucinated click had nothing stopping it.
3. **Post-hoc** — the log parser rejects any run whose output *claims* a certified state, treating it as tamper evidence regardless of an otherwise successful fill (`sync-job.ts`).

**Proof:** `smarts-automation/tests/certification-guard.test.ts` asserts the halt fires **before a single mouse event is dispatched**, for clicks, typing, and selects, on both certify buttons and attestation checkboxes — and that benign controls still work.

## 9. Operator safety

Tooling that can destroy data requires explicit confirmation of its target:

- `scripts/apply-migrations.ts` prints the target host and requires it typed back before writing schema. `--env=<file>` exists so pointing at a test project never means editing `.env.local` — a temporarily-edited env file nobody reverts is how production gets migrated by accident.
- `scripts/seed-test-db.ts` refuses to seed a database containing any user or project it didn't create. It checks **contents, not names** — an earlier version compared URLs and fired on a correct setup while protecting nothing.
- `e2e/fixtures.ts` aborts if the target host looks deployed.

## 10. Known gaps

Stated plainly rather than omitted:

| Gap | Status |
|---|---|
| **Storage buckets are public-read** with guessable paths. `checkpoint-photos` serving is signed-URL based and ready — **the bucket still needs flipping to private in the Supabase dashboard**. `mission-photos` (drone, not live) is untouched. | SEC-01, open |
| **No role enforcement** within an organization; `viewer` can delete projects. | ACC-03, deferred |
| **No account deletion or data export.** California users, California data. | ACC-04, deferred |
| **Rate limiter is in-process**, so N replicas means N× the intended limit. | CLD-02, documented |
| **No fail-fast env validation** — a missing secret surfaces at first use, not at boot. | CLD-04, open |
| **Live-session SMARTS captures on disk** (`smarts-automation/smarts-automation/recon/`) with real WDIDs, untracked but unencrypted. | SEC-12, awaiting a decision |
| **Drone/linear surface** has auth asserted but behavior untested, by scope decision. | deferred |
| Dependency advisories in the `exceljs → archiver` chain; the only offered fix is a breaking downgrade. | accepted, see FOLLOW_UP |

## 11. Reporting a vulnerability

Contact the maintainers directly; do not open a public issue. Include the affected route or table, the session context needed to reproduce, and what data was reachable.
