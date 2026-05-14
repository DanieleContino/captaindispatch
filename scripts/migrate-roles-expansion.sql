-- ============================================================
-- S60 — Expand role CHECK constraints
-- Adds TRAVEL and ACCOMMODATION roles to user_roles and production_invites
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/lvxtvgxyancpegvfcnsk/sql/new
-- ============================================================

-- 1. Expand user_roles.role CHECK
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('CAPTAIN','ADMIN','MANAGER','PRODUCTION','TRAVEL','ACCOMMODATION'));

-- 2. Expand production_invites.role CHECK
ALTER TABLE production_invites DROP CONSTRAINT IF EXISTS production_invites_role_check;
ALTER TABLE production_invites ADD CONSTRAINT production_invites_role_check
  CHECK (role IN ('CAPTAIN','MANAGER','PRODUCTION','TRAVEL','ACCOMMODATION'));
