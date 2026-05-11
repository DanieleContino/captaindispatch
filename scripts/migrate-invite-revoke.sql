-- ============================================================
-- Invite Revoke: link user_roles to invite codes
-- When an invite is deleted → user_roles linked to it are
-- automatically deleted via ON DELETE CASCADE.
--
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/lvxtvgxyancpegvfcnsk/sql/new
-- ============================================================

ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS invite_code_id uuid
  REFERENCES production_invites(id) ON DELETE CASCADE;

-- Index for fast lookups (e.g. "which users came from this invite?")
CREATE INDEX IF NOT EXISTS idx_user_roles_invite_code
  ON user_roles (invite_code_id)
  WHERE invite_code_id IS NOT NULL;
