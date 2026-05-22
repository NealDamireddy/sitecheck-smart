-- ============================================
-- Migration 013: per-user QSP profile
-- ============================================
-- Workflow step 2 ("Manage his account") needs a single place for the
-- QSP's name, license number, company, and contact info. Before this,
-- those fields lived only on the `projects` table — copy-pasted into
-- every new site through the onboarding wizard. License numbers in
-- particular don't change per site; they belong on the user.
--
-- This migration adds a `qsp_profiles` table keyed by `user_id` (1:1
-- with auth.users) and RLS policies so a user can only read/write
-- their own row. The project onboarding wizard still writes per-project
-- QSP copies for backwards compatibility — it just pre-fills from the
-- profile so the user doesn't retype.
-- ============================================

CREATE TABLE qsp_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  license_number TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE qsp_profiles ENABLE ROW LEVEL SECURITY;

-- Each user sees only their own row.
CREATE POLICY qsp_profiles_select_own ON qsp_profiles
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY qsp_profiles_insert_own ON qsp_profiles
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY qsp_profiles_update_own ON qsp_profiles
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Keep updated_at fresh on every row update.
CREATE OR REPLACE FUNCTION touch_qsp_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER qsp_profiles_set_updated_at
  BEFORE UPDATE ON qsp_profiles
  FOR EACH ROW
  EXECUTE FUNCTION touch_qsp_profiles_updated_at();
