-- ─────────────────────────────────────────────────────────────
-- MIGRATE: travel_columns
-- Session S55 · 12 May 2026
-- Purpose: store per-production configurable column layout for
--          /dashboard/travel (similar to transport_list_columns)
-- Run in: Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS travel_columns (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  production_id  TEXT NOT NULL,
  source_field   TEXT NOT NULL,
  header_label   TEXT NOT NULL,
  width          TEXT NOT NULL DEFAULT '110px',
  display_order  INTEGER NOT NULL DEFAULT 10,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- Index for fast per-production queries
CREATE INDEX IF NOT EXISTS idx_travel_columns_production
  ON travel_columns(production_id, display_order);

-- RLS
ALTER TABLE travel_columns ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to manage travel columns
-- (scope to production_id is enforced at application level)
CREATE POLICY "authenticated users can manage travel columns"
  ON travel_columns
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
