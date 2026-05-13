-- ============================================
-- Migration 011: QSP-uploaded checkpoint photos
-- ============================================
-- Adds two columns to `checkpoints` so the field QSP can upload their own
-- photo of a BMP from the phone, alongside the existing drone-view photo
-- stored in `last_inspection_photo`. The UI offers a toggle between the
-- two views; we never overwrite the drone field.
--
--   * qsp_photo_url           — public URL of the most recent QSP upload.
--   * qsp_photo_uploaded_at   — timestamp of that upload, for showing
--                                "Uploaded N minutes ago" without doing
--                                file metadata lookups.
--
-- Both columns are nullable — checkpoints with no field photo simply
-- render the drone-view (or the placeholder if neither exists).
--
-- Storage bucket prerequisite:
-- ────────────────────────────
-- The companion Supabase Storage bucket `checkpoint-photos` MUST be
-- created manually in the Supabase dashboard before the upload route
-- will succeed (mirrors the pattern documented in
-- src/lib/supabase/storage.ts for `mission-photos`).
--
-- Bucket settings:
--   * Public:        yes (read access; writes always go through the
--                    service role on the server)
--   * File size:     5 MiB
--   * MIME allowlist: image/jpeg, image/png, image/webp, image/heic
--
-- If you create it via SQL instead, the equivalent is:
--   INSERT INTO storage.buckets (id, name, public, file_size_limit,
--                                allowed_mime_types)
--   VALUES ('checkpoint-photos', 'checkpoint-photos', TRUE, 5242880,
--           ARRAY['image/jpeg','image/png','image/webp','image/heic'])
--   ON CONFLICT (id) DO NOTHING;
-- ============================================

ALTER TABLE checkpoints
  ADD COLUMN IF NOT EXISTS qsp_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS qsp_photo_uploaded_at TIMESTAMPTZ;

-- No index — these columns are read alongside the row, never filtered on.
