-- ============================================================
-- Fix: BUG-2 — Sibling trip not deleted on last-pax removal
--
-- PROBLEMA:
--   La tabella `trips` ha la policy "own_production" FOR ALL
--   (creata in create-schema.sql tramite il loop DO$$).
--   In Supabase/PostgREST, le policy FOR ALL non propagano
--   correttamente l'operazione DELETE lato client:
--   il DELETE ritorna success (error = null) ma cancella 0 righe.
--
--   Questo causa il BUG-2: quando si rimuove l'ultimo pax di un
--   sibling trip (multi-stop), il codice in removePax() chiama:
--     supabase.from('trips').delete().eq('id', siblingTripId)
--   → RLS filtra silenziosamente la riga → trip row rimane nel DB
--   → sibling rimane visibile nella UI, non eliminato.
--
-- PERCHÉ SUCCEDE:
--   supabase.from('trips').delete() non lancia errore se RLS
--   blocca la riga (PostgreSQL: DELETE su riga invisibile = 0 rows, no error).
--   Il codice controlla solo `if (delTripErr)` che è sempre null.
--
-- SOLUZIONE (stesso pattern di fix-productions-rls-duplicate.sql):
--   Droppare "own_production" FOR ALL su trips e ricreare come
--   policy esplicite per operazione: SELECT / INSERT / UPDATE / DELETE.
--   La policy FOR DELETE esplicita assicura che Supabase applichi
--   correttamente il filtro RLS per le DELETE client-side.
--
-- QUANDO ESEGUIRE:
--   Una volta sola nel Supabase SQL Editor.
--   Non tocca dati, solo metadati di policy.
--
-- Esegui nel Supabase SQL Editor:
-- Dashboard → SQL Editor → incolla tutto → Run
-- ============================================================

-- 1. Rimuovi la policy FOR ALL (generata dal loop DO$$ in create-schema.sql)
DROP POLICY IF EXISTS "own_production" ON trips;

-- 2. Ricrea come policy esplicite per operazione

-- SELECT: lettura trip della propria produzione
DROP POLICY IF EXISTS "trips_select" ON trips;
CREATE POLICY "trips_select" ON trips
  FOR SELECT
  TO authenticated
  USING (production_id IN (SELECT user_production_ids()));

-- INSERT: creazione trip nella propria produzione
--   (usato da TripSidebar, Rocket, import/confirm)
DROP POLICY IF EXISTS "trips_insert" ON trips;
CREATE POLICY "trips_insert" ON trips
  FOR INSERT
  TO authenticated
  WITH CHECK (production_id IN (SELECT user_production_ids()));

-- UPDATE: modifica trip della propria produzione
--   (usato da EditTripSidebar, refresh-location, wrap-trip, ecc.)
DROP POLICY IF EXISTS "trips_update" ON trips;
CREATE POLICY "trips_update" ON trips
  FOR UPDATE
  TO authenticated
  USING    (production_id IN (SELECT user_production_ids()))
  WITH CHECK (production_id IN (SELECT user_production_ids()));

-- DELETE: eliminazione trip della propria produzione
--   FIX BUG-2: questa policy esplicita risolve il delete silenzioso
--   che impediva l'eliminazione del sibling trip multi-stop.
DROP POLICY IF EXISTS "trips_delete" ON trips;
CREATE POLICY "trips_delete" ON trips
  FOR DELETE
  TO authenticated
  USING (production_id IN (SELECT user_production_ids()));

-- ============================================================
-- VERIFICA (eseguire separatamente dopo la migration):
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'trips'
-- ORDER BY cmd;
--
-- Risultato atteso:
--   trips_delete  | DELETE | production_id IN ...  | null
--   trips_insert  | INSERT | null                  | production_id IN ...
--   trips_select  | SELECT | production_id IN ...  | null
--   trips_update  | UPDATE | production_id IN ...  | production_id IN ...
-- ============================================================
