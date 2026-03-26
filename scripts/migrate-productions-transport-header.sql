-- ============================================================
-- Migration: Add all Transport List header fields to productions
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE productions
  -- Key creatives
  ADD COLUMN IF NOT EXISTS director                         text,

  -- Production team
  ADD COLUMN IF NOT EXISTS production_manager               text,
  ADD COLUMN IF NOT EXISTS production_manager_phone         text,
  ADD COLUMN IF NOT EXISTS production_coordinator           text,
  ADD COLUMN IF NOT EXISTS production_coordinator_phone     text,

  -- Transportation team
  ADD COLUMN IF NOT EXISTS transportation_coordinator       text,
  ADD COLUMN IF NOT EXISTS transportation_coordinator_phone text,
  ADD COLUMN IF NOT EXISTS transportation_captain           text,
  ADD COLUMN IF NOT EXISTS transportation_captain_phone     text,
  ADD COLUMN IF NOT EXISTS production_office_phone          text,

  -- Set & Basecamp
  ADD COLUMN IF NOT EXISTS set_location                     text,
  ADD COLUMN IF NOT EXISTS set_address                      text,
  ADD COLUMN IF NOT EXISTS basecamp                         text,

  -- Schedule
  ADD COLUMN IF NOT EXISTS general_call_time                time,
  ADD COLUMN IF NOT EXISTS shoot_day                        integer,
  ADD COLUMN IF NOT EXISTS revision                         integer DEFAULT 1;

-- ============================================================
-- Verify columns were added
-- ============================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'productions'
ORDER BY ordinal_position;
