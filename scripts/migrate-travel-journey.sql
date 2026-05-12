-- Migration: add journey_id to travel_movements
-- Session S56 — 12 May 2026
--
-- Adds a nullable journey_id UUID column so that multiple legs of the same
-- journey (e.g. flight + connecting train) can be visually grouped.
-- Existing rows are unaffected (journey_id = NULL → standalone movement).

ALTER TABLE travel_movements
  ADD COLUMN IF NOT EXISTS journey_id UUID DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_travel_movements_journey
  ON travel_movements(journey_id)
  WHERE journey_id IS NOT NULL;
