# SiteCheck — Deliberately Deferred

Findings from the hardening review that were **found and not fixed**, with the reason and the risk of leaving them. Companion to `docs/CODE_REVIEW.md` (which tracks what was fixed).

## Deferred by scope decision

**Drone & linear-infrastructure surface** — ~30 API routes (`missions/*`, `waypoints`, `telemetry`, `geofences`, `nofly-zones`, `crossings`, `permits`) and migrations 002–006. Neal's call, July 2026: secondary, does not need to be live.

- *Risk of leaving it:* these tables share FKs with the compliance product (`inspections.mission_id`, `waypoints.checkpoint_id`), so they stay inside the RLS blast radius even while unused. Their RLS policies were reviewed and are org-scoped like everything else — the deferral is about hardening effort and test coverage, not about a known hole.
- *Recommendation:* excise or quarantine in Stage 7. Excluding it from the Stage 5 isolation matrix roughly halves that stage's cost.

**`mission-photos` bucket (SEC-01, drone half)** — left public-read with guessable paths. `checkpoint-photos` (the QSP-facing bucket) was converted to signed-URL serving.

- *Risk:* drone imagery of customer sites is world-readable to anyone who learns a path. Only acceptable because the drone product isn't live.
- *Fix when needed:* mirror `resolveCheckpointPhotoUrl` for the mission bucket, then flip it private.

## Deferred pending a real second-seat customer

**ACC-03 — no invite/join flow; roles are decorative.** `organizations` and `org_memberships` exist with roles (`owner/admin/qsp/inspector/viewer`) and RLS scopes correctly by org, but nothing writes memberships except the signup trigger, and **no code path checks `role`**.

- *Consequence today:* a second QSP who signs up gets their own isolated org with no path into the first — a two-person firm cannot share a site. Within an org, a `viewer` can delete projects.
- *Why deferred:* building invites before a paying two-seat customer is speculative, and the shape (email invite vs. domain join vs. admin-adds-seat) depends on how the first firm actually buys.
- *Fix shape when needed:* invite-by-email writing `org_memberships`, plus a role gate in `requireAuth` or per-route. Roughly a day's work; no schema change required — the columns are already there.

## Deferred pending a compliance decision

**ACC-04 — no account deletion or data export.** California users, California data, no CCPA path.

- *Risk:* a deletion request today has no answer, and enterprise procurement will ask. Not currently a violation of anything you've promised — there is no privacy policy claiming otherwise — but that is itself worth fixing.
- *Fix shape:* export = zip of the user's rows plus their storage objects; deletion = org cascade (`ON DELETE CASCADE` is already in place from `auth.users` down) behind a grace period and an explicit confirmation. Document the guarantee in `docs/SECURITY.md` when built.

## Deferred as low value

**ACC-05 — no resend-confirmation on signup**, and no distinct feedback when an email is already registered (the latter is deliberate — it would be an account-enumeration oracle). Minor dead end; a "resend" button on the success screen is the whole fix.

**ACC-06 — SMARTS monitoring locations block first project creation.** A conversion leak for inspectors onboarding outside storm season. Make the wizard step skippable with a "set up before your first storm" nudge.

## Deferred because it needs a gated migration

Migrations are reviewed by Aryav before they land, so these are proposals rather than commits:

- **RLS-01** — ~9 tables lack DELETE (and some UPDATE) policies: `weather_snapshots`, `weather_forecasts`, `qp_events`, `activity_events`, `notifications`, `reports`, `ai_analyses`, `mission_ai_analyses`, `segment_permits`. Default-deny, so this is a *silent failure* class (an RLS-client delete affects 0 rows and reports success), not a leak.
- **AI-02 durable marker** — `ai_analyses` has no `model` column, so the `mock-deterministic` marker is returned in the API response but not persisted. Add `ai_analyses.model TEXT` and write it.
- **DRF-01** — `checkpoints.bmp_type` CHECK allows 6 values; the TS union has 11. Either widen the constraint or narrow the type; do not leave them disagreeing.

## Known architectural debt (Stage 7 candidates)

- **In-memory rate limiter** (`src/lib/rate-limit.ts`) is per server process. Correct for the current single-box deployment; swap the store for Redis behind the same interface if the app goes multi-instance.
- **Hand-maintained TS types parallel to Zod schemas** — `src/types/*` and `src/lib/validations/*` describe the same shapes twice, which is how DRF-01/02/03 happened. Infer from Zod where practical.
- **Model pin** — everything is on `claude-sonnet-4-20250514`. Pinned (good), but worth a deliberate upgrade decision rather than drift.
- **`smarts-automation/smarts-automation/`** — an accidental nested directory holding the live-session SMARTS recon HTML (SEC-12). Untracked. Needs a decision from Neal: scrub, encrypt, or keep sanitized copies for the Stage 5.6 replay tests.
