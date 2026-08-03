-- 016 — SWPPP ingestion pipeline (swppp-service/)
--
-- NOT APPLIED. Migrations are review-gated; this is written for Aryav's
-- review and applied deliberately, not by an agent.
--
-- Two tables, both scoped to an existing `projects` row. Deliberately NOT a
-- new `sites` table: `projects` already carries org_id and is what all 103
-- policies resolve through. A parallel tenant root would be a second source
-- of truth for the same compliance data — the DRF-01/CMP-01 defect class.
--
-- RLS is the load-bearing part. The Python service authenticates as the
-- calling user and holds only the anon key, so these policies are the entire
-- authorization story for everything it reads or writes.

-- ============================================================
-- swppp_documents — one row per uploaded PDF
-- ============================================================
CREATE TABLE swppp_documents (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  file_url      TEXT,

  -- The layout-aware Markdown. Kept so a re-extraction (better prompt, newer
  -- model) never requires re-uploading or re-converting the PDF.
  raw_markdown  TEXT,
  page_count    INTEGER,
  pdf_backend   TEXT CHECK (pdf_backend IN ('pymupdf', 'marker', 'unstructured')),

  status        TEXT NOT NULL DEFAULT 'processing'
                CHECK (status IN ('processing', 'completed', 'failed')),
  -- Populated on every failure path. A document sitting at 'processing' with
  -- no error is indistinguishable from one still running, and for a legal
  -- record that silence is the dangerous state.
  error_message TEXT,

  -- Document-level extraction results, kept separate from the project's own
  -- fields: these are what the model READ, not what the QSP has CONFIRMED.
  extracted_wdid        TEXT,
  extracted_risk_level  TEXT CHECK (extracted_risk_level IN ('Level 1','Level 2','Level 3','LUP')),
  extracted_qsp_name    TEXT,
  bmp_count             INTEGER DEFAULT 0,
  indexed_chunks        INTEGER DEFAULT 0,

  uploaded_by   UUID REFERENCES auth.users(id),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_swppp_documents_project ON swppp_documents(project_id);
CREATE INDEX idx_swppp_documents_status  ON swppp_documents(status);

-- ============================================================
-- bmp_checkpoint_drafts — extracted BMPs awaiting QSP review
-- ============================================================
-- Named "drafts" on purpose. Product invariant: AI output is a draft, never
-- authority. These rows are NOT `checkpoints`; a QSP promotes them after
-- review, which is where lat/lng and compliance status get set by a human.
CREATE TABLE bmp_checkpoint_drafts (
  id            BIGSERIAL PRIMARY KEY,
  document_id   TEXT NOT NULL REFERENCES swppp_documents(id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Same six values as checkpoints.bmp_type. Duplicating the CHECK rather
  -- than referencing it is a knowing trade: swppp-service/tests asserts this
  -- list against migration 001, so drift fails the build (DRF-01).
  bmp_category  TEXT NOT NULL CHECK (bmp_category IN (
                  'erosion-control', 'sediment-control', 'tracking-control',
                  'wind-erosion', 'materials-management', 'non-storm-water'
                )),
  bmp_code      TEXT NOT NULL,
  title         TEXT NOT NULL,

  -- CGP data the current checkpoints table has no home for.
  required_locations    JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- A JSONB array, not a single value: SWPPP tables routinely list several
  -- triggers for one BMP ("Weekly, Pre-Storm, Post-Storm"). Storing one would
  -- silently drop required inspections from the compliance schedule.
  inspection_frequency  JSONB NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT inspection_frequency_is_array
    CHECK (jsonb_typeof(inspection_frequency) = 'array'),
  maintenance_threshold TEXT NOT NULL,

  -- Review workflow. promoted_checkpoint_id links a draft to the real
  -- checkpoint a QSP created from it, so the audit trail survives.
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  reviewed_by             UUID REFERENCES auth.users(id),
  reviewed_at             TIMESTAMPTZ,
  promoted_checkpoint_id  TEXT REFERENCES checkpoints(id) ON DELETE SET NULL,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bmp_drafts_document ON bmp_checkpoint_drafts(document_id);
CREATE INDEX idx_bmp_drafts_project  ON bmp_checkpoint_drafts(project_id);

-- ============================================================
-- RLS — identical idiom to migration 008
-- ============================================================
ALTER TABLE swppp_documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bmp_checkpoint_drafts  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swppp_documents_select" ON swppp_documents FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "swppp_documents_insert" ON swppp_documents FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "swppp_documents_update" ON swppp_documents FOR UPDATE
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "swppp_documents_delete" ON swppp_documents FOR DELETE
  USING (project_id IN (SELECT auth_user_project_ids()));

CREATE POLICY "bmp_drafts_select" ON bmp_checkpoint_drafts FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "bmp_drafts_insert" ON bmp_checkpoint_drafts FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "bmp_drafts_update" ON bmp_checkpoint_drafts FOR UPDATE
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "bmp_drafts_delete" ON bmp_checkpoint_drafts FOR DELETE
  USING (project_id IN (SELECT auth_user_project_ids()));

-- Note for review: Qdrant has no RLS. The vector store is authorized by
-- querying `projects` under these policies FIRST (Caller.assert_project_access
-- in swppp-service/app/core/auth.py) and only then filtering by project_id.
-- Postgres stays the single authority for tenant boundaries.
