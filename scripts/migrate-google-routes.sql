-- ============================================================
-- Migration: Google Routes API support
-- Data: 25 marzo 2026
--
-- Esegui nel Supabase SQL Editor:
-- Dashboard → SQL Editor → incolla tutto → Run
--
-- Cosa fa:
--  1. Aggiunge colonna distance_km alla tabella routes
--  2. Aggiorna il CHECK constraint source per includere 'google'
--  3. Aggiorna create-schema.sql non è necessario eseguirlo di nuovo
--     (questo migration è idempotente — sicuro da rieseguire)
-- ============================================================

-- 1. Aggiungi colonna distance_km (se non esiste già)
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS distance_km numeric(8,1);

-- 2. Rimuovi il vecchio CHECK constraint su source e ricrealo con 'google'
--    Postgres non permette ALTER CHECK direttamente → drop + add
ALTER TABLE routes
  DROP CONSTRAINT IF EXISTS routes_source_check;

ALTER TABLE routes
  ADD CONSTRAINT routes_source_check
  CHECK (source IN ('ORS', 'AUTO', 'MANUAL', 'google'));

-- Verifica risultato:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'routes' AND table_schema = 'public';
