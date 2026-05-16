-- migrate-accommodation-subgroups.sql
-- S66 — 16 May 2026
-- Adds hotel_subgroups table and subgroup_id foreign key on crew_stays.
-- Allows the coordinator to define free-form subgroups per hotel
-- (e.g. "IT Crew", "US Crew") and assign stays to them for cost reporting.

-- ── 1. hotel_subgroups table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotel_subgroups (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id uuid        NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  hotel_id      text        NOT NULL REFERENCES locations(id)   ON DELETE CASCADE,
  name          text        NOT NULL,
  display_order int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookup by production + hotel
CREATE INDEX IF NOT EXISTS idx_hotel_subgroups_prod_hotel
  ON hotel_subgroups(production_id, hotel_id);

-- ── 2. Add subgroup_id column to crew_stays ───────────────────────
ALTER TABLE crew_stays
  ADD COLUMN IF NOT EXISTS subgroup_id uuid
    REFERENCES hotel_subgroups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crew_stays_subgroup
  ON crew_stays(subgroup_id);

-- ── 3. RLS for hotel_subgroups ────────────────────────────────────
ALTER TABLE hotel_subgroups ENABLE ROW LEVEL SECURITY;

-- Members of the production can read/write subgroups
CREATE POLICY "hotel_subgroups_select" ON hotel_subgroups
  FOR SELECT USING (
    production_id IN (
      SELECT production_id FROM user_roles
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "hotel_subgroups_insert" ON hotel_subgroups
  FOR INSERT WITH CHECK (
    production_id IN (
      SELECT production_id FROM user_roles
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "hotel_subgroups_update" ON hotel_subgroups
  FOR UPDATE USING (
    production_id IN (
      SELECT production_id FROM user_roles
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "hotel_subgroups_delete" ON hotel_subgroups
  FOR DELETE USING (
    production_id IN (
      SELECT production_id FROM user_roles
      WHERE user_id = auth.uid()
    )
  );
