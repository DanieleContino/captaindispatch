-- S15 — NTN / Self Drive
-- Aggiunge colonna no_transport_needed alla tabella crew
-- Eseguire su Supabase Dashboard > SQL Editor

ALTER TABLE crew
  ADD COLUMN IF NOT EXISTS no_transport_needed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN crew.no_transport_needed IS
  'Se TRUE il crew non ha bisogno di trasporto (Self Drive / NTN). Escluso da Rocket e dal calcolo Pax Coverage.';
