-- ─────────────────────────────────────────────────────────────
-- MIGRATE: travel_movements — add accommodation column
-- Session S57 · 13 May 2026
-- Purpose: add optional accommodation text field to travel_movements
-- Run in: Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────

ALTER TABLE travel_movements
  ADD COLUMN IF NOT EXISTS accommodation TEXT DEFAULT NULL;
