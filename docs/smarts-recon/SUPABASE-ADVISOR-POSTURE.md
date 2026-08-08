# Supabase advisor posture — target project `jdnyzppdhecncxwgzdur`

Updated 2026-08-08, after migration `028_advisor_hardening.sql`.

This records which advisor findings are **resolved**, which are **accepted**,
and which are **blocked**, so future sessions do not re-litigate them or "fix"
something deliberately left alone.

## Current counts

| Advisor | Before 028 | After 028 |
|---|---|---|
| Security WARN | 14 | 5 |
| Security INFO | 1 | 1 |
| Performance WARN | 8 | 0 |
| Performance INFO | 74 | 74 |

## Resolved by `028`

- 7 × `function_search_path_mutable` — `search_path = ''` pinned on the
  `set_updated_at` trigger functions. Safe because each body only calls
  `NOW()`, which lives in `pg_catalog`.
- 2 × `handle_new_user` RPC exposure — EXECUTE revoked from `PUBLIC`, `anon`,
  `authenticated`. Safe because PostgreSQL does not consult EXECUTE when
  firing a trigger.
- 8 × `auth_rls_initplan` — `auth.uid()` rewritten to `(SELECT auth.uid())`
  so it evaluates once per statement rather than once per row.

## Accepted — do not "fix" without a dedicated migration

### `auth_user_org_ids` / `auth_user_project_ids` EXECUTE (4 WARN)

Measured 2026-08-08: **126 of 148** RLS policies call these helpers (12 and
114 respectively). Additionally, 115 policies are `TO public` (which includes
`anon`), and 33 anon-readable tables have policies calling them.

- Revoking from `authenticated` breaks RLS **database-wide**.
- Revoking from `anon` converts "returns 0 rows" into
  `permission denied for function` (HTTP 500) on 33 tables.
- Security value is near zero: both functions are scoped to `auth.uid()`, so
  an anon caller already receives an empty set.

The correct fix is relocating both helpers into a schema outside the
PostgREST-exposed set and repointing all 126 policies. That is a large change
needing its own migration and full regression test.

### `_migrations` RLS enabled, no policy (1 INFO)

RLS enabled with zero policies is deny-all for non-superusers, which is the
desired state for an operator-only table. Adding a policy would weaken it.

### 54 × `unused_index` (INFO)

Not dropped. The database holds single-digit row counts (7 `site_records`,
5 `inspections`), so "unused" reflects an almost-empty database rather than
production access patterns. Several were added deliberately by
`025_phase4_foreign_key_indexes.sql`.

### 20 × `unindexed_foreign_keys` (INFO)

Deferred. No measurable gain at current row counts, and each index adds write
cost. Revisit once production data volume is real.

## Blocked — cannot be resolved on the current plan

### `auth_leaked_password_protection` (1 WARN)

HaveIBeenPwned checking is a **Pro-plan feature**. The organization is on the
free plan, so this finding cannot be cleared. It is not a database object and
has no SQL representation.

Note that `028_advisor_hardening.sql` contains a comment pointing at
Authentication → Policies to enable it. That instruction is not actionable on
the free plan. The migration file is intentionally **not** edited to correct
it, because it is already applied and recorded in `_migrations` with checksum
`75a55de29e900984557bcccbb92301761509b8c17548e0a416782d51fc306ee7`; changing
the file would trigger a permanent checksum-drift warning in the migration
runner. This document is the correction.

Revisit if the project is upgraded to Pro.
