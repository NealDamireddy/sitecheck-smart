-- ============================================================
-- 024 - Harden Phase 4 site-record RPC privileges
-- ============================================================
-- Supabase can explicitly grant newly-created public functions to `anon`
-- when automatic Data API exposure is enabled. Migration 022 revoked the
-- default PUBLIC privilege, but an explicit role grant still wins. Remove
-- both sources of anonymous execution and retain only the roles that are
-- allowed to enter the authenticated site-record creation boundary.
-- ============================================================

REVOKE ALL ON FUNCTION public.create_site_record_with_detail(
  TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, JSONB
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_site_record_with_detail(
  TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, JSONB
) TO authenticated, service_role;
