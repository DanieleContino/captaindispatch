-- ============================================================
-- Fix RLS policy per INSERT su productions
--
-- PROBLEMA: la policy "productions_own" usa FOR ALL con USING
-- basato su user_production_ids(). Al momento dell'INSERT di una
-- nuova produzione, l'utente NON ha ancora un ruolo (user_roles)
-- su di essa → la check fallisce → RLS blocca l'INSERT.
--
-- FIX: policy separata FOR INSERT che permette agli utenti
-- autenticati di creare nuove produzioni.
-- La sicurezza è garantita dall'API (/api/productions) che
-- verifica auth.getUser() prima di inserire.
--
-- Esegui nel Supabase SQL Editor:
-- Dashboard → SQL Editor → incolla → Run
-- ============================================================

DROP POLICY IF EXISTS "productions_insert" ON productions;

CREATE POLICY "productions_insert" ON productions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
