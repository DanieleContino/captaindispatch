-- ============================================================
-- Rocket: Shared Templates (TASK 4)
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/lvxtvgxyancpegvfcnsk/sql/new
-- ============================================================

-- Table: rocket_templates
-- Stores named Rocket Step-1 configurations shareable across all
-- Transportation Captains of the same production.
CREATE TABLE IF NOT EXISTS rocket_templates (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id uuid        NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  config_json   jsonb       NOT NULL DEFAULT '{}',
  created_by    uuid        REFERENCES auth.users(id),
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rocket_templates_production
  ON rocket_templates (production_id);

CREATE INDEX IF NOT EXISTS idx_rocket_templates_created_at
  ON rocket_templates (created_at DESC);

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE rocket_templates ENABLE ROW LEVEL SECURITY;

-- All authenticated members of the production can read, create, and delete
-- shared templates (collaborative model — no ownership lock).
CREATE POLICY "production members can manage rocket templates"
  ON rocket_templates FOR ALL
  USING (
    production_id IN (
      SELECT production_id FROM user_roles
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    production_id IN (
      SELECT production_id FROM user_roles
      WHERE user_id = auth.uid()
    )
  );
