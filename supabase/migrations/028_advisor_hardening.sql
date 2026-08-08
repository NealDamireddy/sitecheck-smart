-- 028_advisor_hardening.sql
--
-- Addresses Supabase advisor findings on target project jdnyzppdhecncxwgzdur.
-- Scope is deliberately limited to changes that are provably behavior-preserving
-- for authenticated users. See "DELIBERATELY NOT INCLUDED" at the bottom for the
-- findings that were reviewed and consciously left alone, and why.
--
-- Verified before writing (2026-08-08):
--   * 148 RLS policies exist in `public`.
--   * 126 of them call auth_user_org_ids() / auth_user_project_ids()
--     (12 and 114 respectively). Revoking EXECUTE on those two from
--     `authenticated` would break RLS evaluation across nearly the whole
--     database. This migration therefore does NOT touch their authenticated
--     grant.
--   * 0 policies name `anon` explicitly, but 115 are `TO public` (which
--     includes anon) and 33 anon-readable tables have policies that call the
--     helpers. Revoking anon's EXECUTE would convert "returns 0 rows" into
--     "permission denied for function" on those 33 tables. Also excluded.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. function_search_path_mutable (7 WARN findings)
-- ---------------------------------------------------------------------------
-- All seven are the identical trivial trigger body:
--     BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
-- The only function referenced is NOW(), which lives in pg_catalog and is always
-- resolvable regardless of search_path. Pinning search_path to '' is therefore
-- safe and closes the mutable-search_path injection vector.

ALTER FUNCTION public.corrective_actions_set_updated_at()   SET search_path = '';
ALTER FUNCTION public.inspections_set_updated_at()          SET search_path = '';
ALTER FUNCTION public.smarts_events_set_updated_at()        SET search_path = '';
ALTER FUNCTION public.monitoring_locations_set_updated_at() SET search_path = '';
ALTER FUNCTION public.samples_set_updated_at()              SET search_path = '';
ALTER FUNCTION public.parameter_results_set_updated_at()    SET search_path = '';
ALTER FUNCTION public.touch_qsp_profiles_updated_at()       SET search_path = '';

-- ---------------------------------------------------------------------------
-- 2. handle_new_user exposed as an RPC (2 WARN findings: anon + authenticated)
-- ---------------------------------------------------------------------------
-- handle_new_user() is a SECURITY DEFINER *trigger* function on auth.users that
-- provisions an organization and owner membership at signup. PostgreSQL does not
-- check EXECUTE against the invoking role when firing a trigger, so removing all
-- client-role grants cannot break signup. It does remove the function from the
-- PostgREST RPC surface (/rest/v1/rpc/handle_new_user), which is the finding.
--
-- Note the empty-grantee ACL entry ("=X/postgres") means EXECUTE is held by
-- PUBLIC; revoking from anon/authenticated alone would leave it reachable.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3. auth_rls_initplan (8 WARN findings)
-- ---------------------------------------------------------------------------
-- Each of these policies calls auth.uid() bare, so PostgreSQL re-evaluates it
-- once per row. Wrapping it as (SELECT auth.uid()) turns it into an InitPlan
-- evaluated once per statement. The predicate is logically identical, so this is
-- behavior-preserving; it only changes the plan.

ALTER POLICY qsp_profiles_select_own ON public.qsp_profiles
  USING (user_id = (SELECT auth.uid()));

ALTER POLICY qsp_profiles_insert_own ON public.qsp_profiles
  WITH CHECK (user_id = (SELECT auth.uid()));

ALTER POLICY qsp_profiles_update_own ON public.qsp_profiles
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

ALTER POLICY smarts_credentials_select_own ON public.smarts_credentials
  USING (user_id = (SELECT auth.uid()));

ALTER POLICY smarts_credentials_insert_own ON public.smarts_credentials
  WITH CHECK (user_id = (SELECT auth.uid()));

ALTER POLICY smarts_credentials_update_own ON public.smarts_credentials
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

ALTER POLICY smarts_credentials_delete_own ON public.smarts_credentials
  USING (user_id = (SELECT auth.uid()));

ALTER POLICY smarts_runs_select_own ON public.smarts_runs
  USING (user_id = (SELECT auth.uid()));

COMMIT;

-- ===========================================================================
-- DELIBERATELY NOT INCLUDED — reviewed and rejected for this migration
-- ===========================================================================
--
-- (a) Revoking EXECUTE on auth_user_org_ids() / auth_user_project_ids() from
--     anon or authenticated.
--     - authenticated: 126 of 148 policies call these. Revoking breaks RLS
--       database-wide. Never do this without first relocating the helpers to a
--       schema outside the PostgREST-exposed set and rewriting every policy.
--     - anon: 33 anon-readable tables have `TO public` policies that call them.
--       Revoking turns empty results into 500-level function-permission errors.
--     - Security value is low regardless: both functions are scoped to
--       auth.uid(), so an anon caller receives an empty set today.
--     The correct long-term fix is to move both helpers into a private schema
--     (e.g. `app_private`) and repoint all 126 policies. That is a large,
--     separately-tested change.
--
-- (b) `_migrations` RLS-enabled-no-policy (INFO).
--     RLS enabled with zero policies is deny-all for non-superusers, which is
--     already the desired state for an operator-only table. Adding a policy
--     would weaken it. Left as-is intentionally.
--
-- (c) 54 unused_index (INFO).
--     NOT dropped. This database currently holds 7 site_records and 5
--     inspections; "unused" reflects an almost-empty database, not production
--     access patterns. Several of these indexes were added deliberately by
--     025_phase4_foreign_key_indexes.sql. Dropping them would undo reviewed
--     work on the basis of meaningless statistics.
--
-- (d) 20 unindexed_foreign_keys (INFO).
--     Deferred. At current row counts there is no measurable gain, and each
--     index adds write cost. Revisit once production data volume is real.
--
-- (e) Leaked-password protection (WARN).
--     Not a database object — it is an Auth dashboard setting and cannot be set
--     from SQL. Enable at:
--     Authentication → Policies → "Leaked password protection".
--
-- ===========================================================================
-- ROLLBACK (if needed)
-- ===========================================================================
-- BEGIN;
--   ALTER FUNCTION public.corrective_actions_set_updated_at()   RESET search_path;
--   ALTER FUNCTION public.inspections_set_updated_at()          RESET search_path;
--   ALTER FUNCTION public.smarts_events_set_updated_at()        RESET search_path;
--   ALTER FUNCTION public.monitoring_locations_set_updated_at() RESET search_path;
--   ALTER FUNCTION public.samples_set_updated_at()              RESET search_path;
--   ALTER FUNCTION public.parameter_results_set_updated_at()    RESET search_path;
--   ALTER FUNCTION public.touch_qsp_profiles_updated_at()       RESET search_path;
--   GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon, authenticated;
--   ALTER POLICY qsp_profiles_select_own ON public.qsp_profiles
--     USING (user_id = auth.uid());
--   -- ...and the remaining 7 policies restored to bare auth.uid().
-- COMMIT;
