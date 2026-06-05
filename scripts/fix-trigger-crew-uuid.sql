-- ============================================================
-- Fix: Trigger functions after trip_passengers.crew_id text→uuid migration
--
-- PROBLEMA: fix-functions-search-path.sql è stato eseguito DOPO
-- migrate-trip-passengers-crew-uuid.sql, sovrascrivendo i trigger
-- corretti con versioni vecchie che usano ancora:
--   - affected_crew_id text  (invece di uuid)
--   - JOIN crew c ON tp.crew_id = c.id  (invece di c.uuid)
--
-- Questo causa l'errore:
--   "operator does not exist: uuid = text"
-- quando si tenta di eliminare un trip (il trigger su trip_passengers
-- si attiva e confronta crew_id uuid con c.id text).
--
-- FIX: aggiornare entrambe le funzioni trigger per usare uuid.
--
-- Esegui nel Supabase SQL Editor:
-- Dashboard → SQL Editor → incolla tutto → Run
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. update_trip_passenger_list
--    crew_id è ora uuid → JOIN su c.uuid (non c.id)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_trip_passenger_list()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_trip_id uuid;
BEGIN
  target_trip_id := COALESCE(NEW.trip_row_id, OLD.trip_row_id);

  UPDATE trips SET
    passenger_list = (
      SELECT string_agg(c.full_name, ', ' ORDER BY c.department, c.full_name)
      FROM trip_passengers tp
      JOIN crew c ON tp.crew_id = c.uuid   -- ← uuid, non c.id
      WHERE tp.trip_row_id = target_trip_id
    ),
    pax_count = (
      SELECT COUNT(*)
      FROM trip_passengers
      WHERE trip_row_id = target_trip_id
    ),
    updated_at = now()
  WHERE id = target_trip_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. update_pax_conflict_flags
--    affected_crew_id è ora uuid (non text)
--    JOIN su c.uuid (non c.id)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_pax_conflict_flags()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_crew_id uuid := COALESCE(NEW.crew_id, OLD.crew_id);  -- ← uuid, non text
BEGIN
  -- Azzera flag per i trip coinvolti da questo crew
  UPDATE trips SET pax_conflict_flag = NULL
  WHERE id IN (
    SELECT tp.trip_row_id FROM trip_passengers tp
    WHERE tp.crew_id = affected_crew_id
  );

  -- Ricalcola conflitti reali
  UPDATE trips t1 SET pax_conflict_flag = conflict_names
  FROM (
    SELECT tp1.trip_row_id AS t1_id,
           string_agg(DISTINCT c.full_name, ', ') AS conflict_names
    FROM trip_passengers tp1
    JOIN trip_passengers tp2
      ON tp1.crew_id = tp2.crew_id
     AND tp1.trip_row_id != tp2.trip_row_id
    JOIN trips tt1 ON tp1.trip_row_id = tt1.id
    JOIN trips tt2 ON tp2.trip_row_id = tt2.id
    JOIN crew c ON tp1.crew_id = c.uuid   -- ← uuid, non c.id
    WHERE tp1.crew_id = affected_crew_id
      AND tt1.date = tt2.date
      AND tt1.start_dt IS NOT NULL AND tt2.start_dt IS NOT NULL
      AND tt1.end_dt   IS NOT NULL AND tt2.end_dt   IS NOT NULL
      AND tt1.start_dt < tt2.end_dt
      AND tt2.start_dt < tt1.end_dt
    GROUP BY tp1.trip_row_id
  ) sub
  WHERE t1.id = sub.t1_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Ricrea i trigger (DROP + CREATE per sicurezza)
-- ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_update_passenger_list ON trip_passengers;
CREATE TRIGGER trg_update_passenger_list
AFTER INSERT OR DELETE ON trip_passengers
FOR EACH ROW EXECUTE FUNCTION update_trip_passenger_list();

DROP TRIGGER IF EXISTS trg_pax_conflict ON trip_passengers;
CREATE TRIGGER trg_pax_conflict
AFTER INSERT OR DELETE ON trip_passengers
FOR EACH ROW EXECUTE FUNCTION update_pax_conflict_flags();

-- ─────────────────────────────────────────────────────────────
-- Verifica finale:
-- SELECT proname,
--        pg_get_functiondef(oid)
-- FROM pg_proc
-- WHERE proname IN ('update_trip_passenger_list', 'update_pax_conflict_flags');
-- → Deve mostrare "c.uuid" e "affected_crew_id uuid"
-- ─────────────────────────────────────────────────────────────
