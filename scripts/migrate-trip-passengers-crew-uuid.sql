-- ============================================================
-- Migration: trip_passengers.crew_id  text → uuid
-- Allinea la FK a crew.uuid (invece di crew.id)
-- in modo che il codice JS possa passare c.uuid direttamente.
--
-- Esegui nel Supabase SQL Editor.
-- ============================================================

-- Disabilita solo i nostri trigger (non i system trigger di FK)
ALTER TABLE trip_passengers DISABLE TRIGGER trg_update_passenger_list;
ALTER TABLE trip_passengers DISABLE TRIGGER trg_pax_conflict;

-- 1. Aggiungi colonna temporanea uuid
ALTER TABLE trip_passengers
  ADD COLUMN IF NOT EXISTS crew_uuid uuid;

-- 2. Copia direttamente (crew_id contiene già valori uuid come stringa)
UPDATE trip_passengers
SET crew_uuid = crew_id::uuid;

-- 3. Rimuovi FK e colonna vecchia, rinomina la nuova
ALTER TABLE trip_passengers
  DROP CONSTRAINT IF EXISTS trip_passengers_crew_id_fkey;

ALTER TABLE trip_passengers
  DROP COLUMN crew_id;

ALTER TABLE trip_passengers
  RENAME COLUMN crew_uuid TO crew_id;

ALTER TABLE trip_passengers
  ALTER COLUMN crew_id SET NOT NULL;

-- 4. Ricrea FK verso crew.uuid
ALTER TABLE trip_passengers
  ADD CONSTRAINT trip_passengers_crew_id_fkey
  FOREIGN KEY (crew_id) REFERENCES crew(uuid) ON DELETE CASCADE;

-- 5. Ricrea indice
DROP INDEX IF EXISTS idx_tp_crew;
CREATE INDEX IF NOT EXISTS idx_tp_crew ON trip_passengers(crew_id);

-- 6. Ricrea UNIQUE constraint (trip_row_id, crew_id)
ALTER TABLE trip_passengers
  DROP CONSTRAINT IF EXISTS trip_passengers_trip_row_id_crew_id_key;

ALTER TABLE trip_passengers
  ADD CONSTRAINT trip_passengers_trip_row_id_crew_id_key
  UNIQUE (trip_row_id, crew_id);

-- 7. Aggiorna funzione trigger update_trip_passenger_list
--    (JOIN crew c ON tp.crew_id = c.uuid invece di c.id)
CREATE OR REPLACE FUNCTION update_trip_passenger_list()
RETURNS TRIGGER AS $$
DECLARE
  target_trip_id uuid;
BEGIN
  target_trip_id := COALESCE(NEW.trip_row_id, OLD.trip_row_id);

  UPDATE trips SET
    passenger_list = (
      SELECT string_agg(c.full_name, ', ' ORDER BY c.department, c.full_name)
      FROM trip_passengers tp
      JOIN crew c ON tp.crew_id = c.uuid
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8. Aggiorna funzione trigger update_pax_conflict_flags
--    (affected_crew_id uuid, JOIN crew c ON c.uuid)
CREATE OR REPLACE FUNCTION update_pax_conflict_flags()
RETURNS TRIGGER AS $$
DECLARE
  affected_crew_id uuid := COALESCE(NEW.crew_id, OLD.crew_id);
BEGIN
  UPDATE trips SET pax_conflict_flag = NULL
  WHERE id IN (
    SELECT tp.trip_row_id FROM trip_passengers tp
    WHERE tp.crew_id = affected_crew_id
  );

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
    JOIN crew c ON tp1.crew_id = c.uuid
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 9. Ricrea i trigger
DROP TRIGGER IF EXISTS trg_update_passenger_list ON trip_passengers;
CREATE TRIGGER trg_update_passenger_list
AFTER INSERT OR DELETE ON trip_passengers
FOR EACH ROW EXECUTE FUNCTION update_trip_passenger_list();

DROP TRIGGER IF EXISTS trg_pax_conflict ON trip_passengers;
CREATE TRIGGER trg_pax_conflict
AFTER INSERT OR DELETE ON trip_passengers
FOR EACH ROW EXECUTE FUNCTION update_pax_conflict_flags();

-- I trigger vengono ricreati dal DROP+CREATE sopra, già abilitati
-- (non serve ENABLE TRIGGER perché DROP+CREATE li ricrea attivi)

-- ============================================================
-- Verifica finale:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'trip_passengers' AND column_name = 'crew_id';
-- Risultato atteso: crew_id | uuid
-- ============================================================
