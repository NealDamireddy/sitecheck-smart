-- ============================================
-- Migration 012: auto-provision org + membership on signup
-- ============================================
-- Before this migration, supabase.auth.signUp() created an auth.users
-- row but nothing created an organizations row or an org_memberships
-- row. A new user therefore had zero org memberships, which meant:
--   * RLS hid every project from them (correct — no leakage), but
--   * they also couldn't CREATE a project — POST /api/projects 403s
--     with "No organization membership found for this user".
-- New accounts were half-broken rather than a clean blank slate.
--
-- This migration adds a trigger on auth.users INSERT that:
--   1. Creates an organizations row, named from the `org_name` the user
--      typed on the signup form (stored in raw_user_meta_data), falling
--      back to an email-derived name when that's blank.
--   2. Creates an org_memberships row linking the new user to that org
--      with role 'owner'.
--
-- The function is SECURITY DEFINER so it bypasses RLS on both tables
-- (the trigger runs before the user has any session/JWT context).
--
-- This fires at signUp() time even when email confirmation is enabled —
-- the auth.users row exists immediately, only email_confirmed_at is null
-- until the user clicks the link. That's fine: the org is ready the
-- moment they first sign in.
--
-- NOTE: this trigger only affects FUTURE signups. Accounts created
-- before this migration still have no org. Backfill them separately
-- with (run once, idempotent — only touches users with no membership):
--
--   INSERT INTO organizations (name, slug, plan)
--   SELECT COALESCE(NULLIF(TRIM(u.raw_user_meta_data->>'org_name'), ''),
--                   split_part(u.email, '@', 1) || '''s Organization'),
--          'org-' || u.id::text, 'free'
--   FROM auth.users u
--   WHERE NOT EXISTS (
--     SELECT 1 FROM org_memberships m WHERE m.user_id = u.id
--   );
--   INSERT INTO org_memberships (user_id, org_id, role)
--   SELECT u.id, o.id, 'owner'
--   FROM auth.users u
--   JOIN organizations o ON o.slug = 'org-' || u.id::text
--   WHERE NOT EXISTS (
--     SELECT 1 FROM org_memberships m WHERE m.user_id = u.id
--   );
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_org_name TEXT;
BEGIN
  -- Org name from the signup form metadata; fall back to an
  -- email-derived label when the field was left blank.
  v_org_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'org_name'), ''),
    split_part(NEW.email, '@', 1) || '''s Organization'
  );

  -- Slug must be unique. The user id is already unique, so derive
  -- directly from it — no collision-retry logic needed.
  INSERT INTO organizations (name, slug, plan)
  VALUES (v_org_name, 'org-' || NEW.id::text, 'free')
  RETURNING id INTO v_org_id;

  INSERT INTO org_memberships (user_id, org_id, role)
  VALUES (NEW.id, v_org_id, 'owner');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
