# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                  # Next dev server (port 3000)
npm run build                # production build; needs network for Google Fonts
npm run lint                 # eslint
npx tsc --noEmit             # typecheck — not wired to an npm script

npm test                     # full vitest suite
npm run test:watch
npm run test:security        # the security subset only
npx vitest run tests/qpe/ladder.test.ts        # a single file
npx vitest run -t 'precedence'                 # a single test by name

npm run test:e2e             # playwright; needs a seeded throwaway project
npm run db:migrate:dry       # ALWAYS run before db:migrate
npm run db:migrate
```

The bot and the Python service are separate runtimes with their own deps:
`cd smarts-automation && npm test`, and `swppp-service/` (FastAPI).
`npm run start` at the repo root intercepts commands meant for the bot — run
those from inside `smarts-automation/`.

## Read these first

- `docs/ARCHITECTURE.md` — the system as it actually is. Point-in-time: it says
  15 migrations / 346 tests; current is 29 / 685. Structure is still accurate.
- `docs/FOLLOW_UP.md` — the register of found-and-not-fixed, with the reason and
  the risk. **Add to it rather than rediscovering things.**
- `docs/TEST_COVERAGE.md` — states what is verified vs merely passing.
- `docs/smarts-recon/SUPABASE-ADVISOR-POSTURE.md` — which advisor findings are
  fixed, accepted, or blocked, and why.

## This is a legal-record system

A QPE determination decides whether a legally required inspection happened.
A wrong compliance status or one inspector seeing another's site is a real
liability event. Two habits follow:

- **Never fabricate a value to fill a gap.** An empty state is information. The
  worst bugs in this repo's history were all invented data: a hardcoded Fresno
  coordinate that gave every site another county's weather; demo projects
  returned to accounts that owned none; a dead rain gauge's `0.00"` trusted as
  "no event".
- **Never edit evidence in place.** Corrections are new rows linked by
  `superseded_by`. This is why the evidence tables have no UPDATE/DELETE policy.

## Two Supabase projects — check before you write

| Ref | Role |
|---|---|
| `jdnyzppdhecncxwgzdur` | **target** — all current work |
| `atbpfdmzwajxxfzfqozq` | original/rollback — do not mutate |

Never mix credentials between them. `.env.development.local` (target) is loaded
**before** `.env.local`, so local dev hits the target while `.env.local` governs
local production builds. Verify the effective ref before any browser test or
data mutation; a "storage is not available" error is almost always the wrong
project, not a missing table.

## Migrations

`_migrations` stores a SHA-256 of each file. **Editing an applied migration —
even a comment — produces a permanent checksum-drift warning.** Corrections go
in a new migration; if a migration's prose is wrong, correct it in a doc.

Always `db:migrate:dry` first. Follow migration `017`'s pattern for anything
evidential: append-only, raw payload + hash + parser version, SELECT/INSERT
policies only.

## RLS: do not revoke the auth helpers

`auth_user_org_ids()` and `auth_user_project_ids()` are flagged by the Supabase
advisor as SECURITY DEFINER functions callable by `anon`/`authenticated`.
**126 of 148 policies call them.** Revoking breaks RLS database-wide; revoking
from `anon` turns empty results into 500s on 33 tables. Both are scoped to
`auth.uid()`, so an anon caller already gets nothing. The real fix is relocating
them out of the exposed schema and repointing every policy — its own migration.

## The field-record layer

`site_records` is a common layer over type-specific records (weekly, monthly,
SMARTS ad hoc), linked via `site_record_inspections` / `site_record_sources`.
Two RPCs do the work atomically; call them rather than writing the tables:

- `create_site_record_with_detail` — validates the hierarchy and creates the
  common + type-specific rows together
- `submit_inspection_checklist` — submits all 22 CGP items, syncs the common
  record `draft → verified`, and snapshots QSP identity

**Identity is resolved server-side.** The RPC ignores a client-supplied
inspector name and reads `qsp_profiles.name`, then `projects.qsp_name`. The
legal QSP identity here is **Nilai Damireddy**; "Neal" is a display name.

Record creation is gated on an active `inspector_profiles` row **and** an active
`project_inspector_assignments` row. Nothing in the product creates either
(`PROV-01` in FOLLOW_UP) — so a new account can create a site and still record
nothing. Fix the provisioning, never the gate.

## Weather has two separate jobs

- **Display** — `src/lib/weather/`, chain is Tomorrow.io (only if
  `TOMORROW_API_KEY` is set) → Open-Meteo → NOAA. Each returns null rather than
  throwing.
- **QPE determination** — `src/lib/qpe/`. NOAA *station observations* only, via
  `api.weather.gov`. Open-Meteo serves NOAA *model* output, which is an estimate,
  not a gauge reading.

The ladder in `src/lib/qpe/ladder.ts` ranks evidence: site gauge → good NOAA
gauge → Open-Meteo → sparse NOAA gauge. A forecast is never a determination.
A source reporting `quality: 'none'` can never decide anything. `determineQpe`
returns `null` when nothing usable answered — "no answer" is not "no rain".

## Conventions worth knowing

- **Static/demo data must be gated behind `isDemoSession()`.** An authenticated
  API route must never fall back to bundled fixtures — return `[]` for empty and
  a 5xx for failure.
- **New API routes must be registered in `tests/support/route-manifest.ts`.**
  `tests/security/route-inventory.test.ts` fails on any unregistered route file,
  and `unauthenticated-access.test.ts` asserts each one 401s.
- **Zod errors**: return `formatZodIssues(err.issues)` from `src/lib/api-error.ts`,
  not the raw issues array — clients interpolate it and render `[object Object]`.
  Most routes still return the raw array; fix as you touch them.
- **Layout**: a component whose container is narrower than the viewport must use
  container queries (`@container` + `@sm:`), not viewport breakpoints. Tailwind
  v4, so it's built in.
- Client stores live in module scope and survive navigation — clearing
  `localStorage` alone does not reset them.

## Other agent config

A `~/.codex` config exists on this machine. To bring over MCP servers, commands,
or instructions, reply `/import` to see what's importable, then
`/import --yes=<digest>`. If `/import` isn't available here, run `claude import`
from a terminal.
