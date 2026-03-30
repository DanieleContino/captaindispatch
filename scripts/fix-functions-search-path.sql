-- ============================================================
-- Fix: Function Search Path Mutable
--
-- PROBLEMA: 3 funzioni senza search_path esplicito → Supabase
-- security warning. Un attaccante con accesso DB potrebbe fare
-- schema injection tramite search_path manipulation.
--
-- FIX: aggiungere SET search_path = public a ogni funzione.
-- CREATE OR REPLACE aggiorna in-place senza toccare i trigger.
--
-- Funzioni interessate:
--   - public.update_trip_passenger_list
--   - public.update_pax_conflict_flags
--   - public.user_production_ids
--
-- Esegui nel Supabase SQL Editor:
-- Dashboard → SQL Editor → incolla → Run
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. update_trip_passenger_list
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_trip_passenger_list()
RETURNS TRIGGER
LANGUAGE plpgsql
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
      JOIN crew c ON tp.crew_id = c.id
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
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_pax_conflict_flags()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  affected_crew_id text := COALESCE(NEW.crew_id, OLD.crew_id);
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
    JOIN crew c    ON tp1.crew_id = c.id
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
-- 3. user_production_ids
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION user_production_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT production_id FROM user_roles WHERE user_id = auth.uid()
$$;

-- Verifica:
-- SELECT proname, proconfig
-- FROM pg_proc
-- WHERE proname IN (
--   'update_trip_passenger_list',
--   'update_pax_conflict_flags',
--   'user_production_ids'
-- );
-- → proconfig deve contenere {search_path=public}
