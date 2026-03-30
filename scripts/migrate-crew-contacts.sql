-- ============================================================
-- CaptainDispatch — S20: Crew Contact Info
-- Aggiunge email e phone alla tabella crew
-- Esegui nel Supabase SQL Editor:
-- Dashboard → SQL Editor → incolla tutto → Run
-- ============================================================

ALTER TABLE crew ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE crew ADD COLUMN IF NOT EXISTS phone TEXT;
