-- Phase 16A: Drone Mission Planning & Flight Control Schema Extensions
-- Run this in Supabase SQL Editor after 001_initial_schema.sql

-- ============================================
-- 1. EXTEND drone_missions TABLE
-- ============================================

-- Widen status constraint to include new states
ALTER TABLE drone_missions
  DROP CONSTRAINT drone_missions_status_check,
  ADD CONSTRAINT drone_missions_status_check
    CHECK (status IN ('planned', 'in-progress', 'paused', 'completed', 'aborted', 'returning-home'));

-- Mission scope — determines which checkpoints are included
ALTER TABLE drone_missions
  ADD COLUMN scope TEXT NOT NULL DEFAULT 'full'
    CHECK (scope IN ('full', 'selected-bmps', 'priority', 'deficient', 'reinspection', 'ad-hoc'));

-- What happens when all waypoints are complete
ALTER TABLE drone_missions
  ADD COLUMN end_of_mission_action TEXT NOT NULL DEFAULT 'return-home'
    CHECK (end_of_mission_action IN ('return-home', 'hover-final', 'land-safe-point', 'wait-for-input'));

-- User-modified flight path (original stays in flight_path)
ALTER TABLE drone_missions
  ADD COLUMN edited_flight_path JSONB;

-- Breakpoint resume: track last completed waypoint
ALTER TABLE drone_missions
  ADD COLUMN last_completed_waypoint INTEGER;

-- Whether the mission can be safely resumed from breakpoint
ALTER TABLE drone_missions
  ADD COLUMN resume_valid BOOLEAN DEFAULT false;

-- Which SWPPP document pages were used to generate this mission
ALTER TABLE drone_missions
  ADD COLUMN source_document_pages JSONB;

-- Manual override flag
ALTER TABLE drone_missions
  ADD COLUMN manual_override_active BOOLEAN DEFAULT false;

-- Free-form operator notes
ALTER TABLE drone_missions
  ADD COLUMN notes TEXT;


-- ============================================
-- 2. EXTEND waypoints TABLE
-- ============================================

-- Widen capture_status to include outcome tagging statuses
ALTER TABLE waypoints
  DROP CONSTRAINT waypoints_capture_status_check,
  ADD CONSTRAINT waypoints_capture_status_check
    CHECK (capture_status IN (
      'pending', 'captured', 'missed', 'skipped',
      'compliant', 'deficient', 'needs-maintenance',
      'not-visible', 'blocked', 'unsafe', 'ground-follow-up'
    ));

-- Whether this waypoint is included in the flight
ALTER TABLE waypoints
  ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT true;

-- Per-waypoint altitude override (null = use mission default)
ALTER TABLE waypoints
  ADD COLUMN altitude_override INTEGER;

-- How long to hover at this waypoint (seconds)
ALTER TABLE waypoints
  ADD COLUMN hover_time_seconds INTEGER DEFAULT 10;

-- Capture mode for this waypoint
ALTER TABLE waypoints
  ADD COLUMN capture_mode TEXT DEFAULT 'auto'
    CHECK (capture_mode IN ('auto', 'photo-only', 'video-pass', 'manual-review', 'hover-inspect'));

-- Operator notes for this specific waypoint
ALTER TABLE waypoints
  ADD COLUMN operator_notes TEXT;

-- Explicit sort order for reordered waypoints
ALTER TABLE waypoints
  ADD COLUMN sort_order INTEGER;


-- ============================================
-- 3. EXTEND activity_events TABLE
-- ============================================

-- Structured metadata for audit trail (JSONB)
ALTER TABLE activity_events
  ADD COLUMN IF NOT EXISTS metadata JSONB;
