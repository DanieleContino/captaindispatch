-- ============================================================
-- Captain Bridge: Invite Codes System
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/lvxtvgxyancpegvfcnsk/sql/new
-- ============================================================

CREATE TABLE IF NOT EXISTS production_invites (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id uuid        NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  code          text        NOT NULL,
  label         text,
  role          text        NOT NULL DEFAULT 'MANAGER'
                            CHECK (role IN ('CAPTAIN','MANAGER','PRODUCTION')),
  max_uses      integer,                        -- NULL = unlimited
  uses_count    integer     NOT NULL DEFAULT 0,
  expires_at    timestamptz,                    -- NULL = never expires
  active        boolean     NOT NULL DEFAULT true,
  created_by    uuid        REFERENCES auth.users(id),
  created_at    timestamptz DEFAULT now()
);

-- Unique index on UPPER(code) — codes are stored & matched case-insensitively
CREATE UNIQUE INDEX IF NOT EXISTS idx_invites_code_upper
  ON production_invites (UPPER(code));

CREATE INDEX IF NOT EXISTS idx_invites_production
  ON production_invites (production_id);

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE production_invites ENABLE ROW LEVEL SECURITY;

-- CAPTAINs and ADMINs can read/write invites for their productions
CREATE POLICY "CAPTAIN can manage invites"
  ON production_invites FOR ALL
  USING (
    production_id IN (
      SELECT production_id FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('CAPTAIN', 'ADMIN')
    )
  );
