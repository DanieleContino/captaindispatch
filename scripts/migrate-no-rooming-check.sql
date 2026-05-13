-- Migration: add no_rooming_check to crew
-- Session S57 — 13 May 2026
--
-- Purpose: allows marking a crew member (e.g. Travel & Accommodation Coordinator)
-- so that their travel movements are NOT cross-checked against the production
-- rooming list during import. This prevents false hotel_conflict /
-- travel_date_conflict discrepancies for coordinators who manage trips that
-- are unrelated to the production's own accommodation.
--
-- The flag only suppresses the rooming-list cross-check.
-- The movements are still imported, still visible in the Travel Calendar,
-- and the needs_transport / pickup fields still work normally.

ALTER TABLE crew
  ADD COLUMN IF NOT EXISTS no_rooming_check BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN crew.no_rooming_check IS
  'When true, import/parse skips hotel_conflict and travel_date_conflict detection for this person. Use for travel coordinators or crew who manage trips outside the production rooming list scope.';
