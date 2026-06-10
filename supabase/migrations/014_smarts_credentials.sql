-- ============================================
-- Migration 014: per-user SMARTS credentials
-- ============================================
-- The Sync-to-SMARTS bot needs each inspector's own SMARTS login, not a
-- single server-wide env var. This table stores one credential set per
-- user (1:1 with auth.users).
--
-- Security model:
--   * The password is NEVER stored in plaintext. The API layer encrypts
--     it with AES-256-GCM before insert; `password_ciphertext` holds
--     iv:tag:ciphertext (base64). The encryption key lives only in the
--     app server's env (SMARTS_CREDENTIALS_KEY) — someone with DB access
--     alone cannot recover passwords.
--   * RLS: a user can only touch their own row.
--   * The API is write-only for the secret: GET returns the username and
--     timestamps, never the password (even encrypted). Decryption happens
--     server-side only, at sync-launch time.
-- ============================================

CREATE TABLE smarts_credentials (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  password_ciphertext TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE smarts_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY smarts_credentials_select_own ON smarts_credentials
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY smarts_credentials_insert_own ON smarts_credentials
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY smarts_credentials_update_own ON smarts_credentials
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY smarts_credentials_delete_own ON smarts_credentials
  FOR DELETE
  USING (user_id = auth.uid());
