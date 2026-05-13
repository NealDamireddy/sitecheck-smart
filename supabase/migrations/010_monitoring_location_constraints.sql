-- ============================================
-- Migration 010: monitoring_locations constraints
-- ============================================
-- Tightens monitoring_locations to match the SMARTS submission contract:
--
--   * discharge_point_type — must be one of SMARTS' five fixed dropdown
--                            values. Enforced via CHECK constraint.
--   * drainage_area        — required (QSP must label every location).
--   * discharge_point_type — required (also non-null at the column level).
--
-- Safe to apply because migration 009 created the table without seed
-- data — there are no existing rows to violate the new constraints.
-- ============================================

-- Make both columns NOT NULL (idempotent — SET NOT NULL is a no-op if
-- the column is already non-nullable).
ALTER TABLE monitoring_locations
  ALTER COLUMN drainage_area SET NOT NULL;

ALTER TABLE monitoring_locations
  ALTER COLUMN discharge_point_type SET NOT NULL;

-- Add CHECK constraint pinning discharge_point_type to SMARTS' values.
-- DROP-then-ADD makes the migration safe to re-run.
ALTER TABLE monitoring_locations
  DROP CONSTRAINT IF EXISTS monitoring_locations_discharge_point_type_check;

ALTER TABLE monitoring_locations
  ADD CONSTRAINT monitoring_locations_discharge_point_type_check
  CHECK (discharge_point_type IN (
    'Effluent',
    'Infiltration-Groundwater',
    'Influent',
    'Internal',
    'Receiving Water'
  ));
