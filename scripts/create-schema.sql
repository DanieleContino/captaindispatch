-- ============================================================
-- CaptainDispatch — Database Schema
-- Esegui nel Supabase SQL Editor:
-- Dashboard → SQL Editor → incolla tutto → Run
--
-- ⚠️  ATTENZIONE: questo script ELIMINA e ricrea le tabelle.
-- Eseguilo solo su un database vuoto o di test.
-- NON tocca le tabelle di autenticazione Supabase (auth.*).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 0. DROP tabelle esistenti (ordine inverso alle FK)
-- ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS trip_passengers CASCADE;
DROP TABLE IF EXISTS trips            CASCADE;
DROP TABLE IF EXISTS routes           CASCADE;
DROP TABLE IF EXISTS service_types    CASCADE;
DROP TABLE IF EXISTS crew             CASCADE;
DROP TABLE IF EXISTS vehicles         CASCADE;
DROP TABLE IF EXISTS locations        CASCADE;
DROP TABLE IF EXISTS user_roles       CASCADE;
DROP TABLE IF EXISTS productions      CASCADE;

DROP FUNCTION IF EXISTS update_trip_passenger_list() CASCADE;
DROP FUNCTION IF EXISTS update_pax_conflict_flags()  CASCADE;
DROP FUNCTION IF EXISTS user_production_ids()        CASCADE;

-- ─────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- 1. PRODUCTIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS productions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 2. USER ROLES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  production_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('CAPTAIN','MANAGER','PRODUCTION','ADMIN')),
  created_at    timestamptz DEFAULT now(),
  UNIQUE (user_id, production_id)
);

-- ─────────────────────────────────────────────────────────────
-- 3. LOCATIONS  (Hotels + Hubs unificati)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locations (
  id                   text PRIMARY KEY,          -- es. "H001", "APT_PMO"
  production_id        uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  is_hub               boolean NOT NULL DEFAULT false,
  lat                  numeric(10,6),
  lng                  numeric(10,6),
  default_pickup_point text,
  created_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locations_production ON locations(production_id);
CREATE INDEX IF NOT EXISTS idx_locations_is_hub     ON locations(is_hub);

-- ─────────────────────────────────────────────────────────────
-- 4. ROUTES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS routes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  from_id       text NOT NULL REFERENCES locations(id),
  to_id         text NOT NULL REFERENCES locations(id),
  duration_min  integer NOT NULL,
  source        text NOT NULL DEFAULT 'AUTO' CHECK (source IN ('ORS','AUTO','MANUAL')),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (production_id, from_id, to_id)
);

CREATE INDEX IF NOT EXISTS idx_routes_lookup ON routes(from_id, to_id);

-- ─────────────────────────────────────────────────────────────
-- 5. SERVICE TYPES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  name          text NOT NULL,
  sort_order    integer DEFAULT 0,
  UNIQUE (production_id, name)
);

-- ─────────────────────────────────────────────────────────────
-- 6. VEHICLES  (Fleet)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
  id              text PRIMARY KEY,               -- es. "VAN-01"
  production_id   uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  vehicle_type    text,
  vehicle_class   text,                           -- es. "CLASSIC", "LUX", "ECONOMY"
  license_plate   text,                           -- targa
  capacity        integer,
  driver_name     text,
  sign_code       text,
  unit_default    text,
  active          boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 7. CREW
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crew (
  id             text PRIMARY KEY,                -- es. "CR0001"
  production_id  uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  full_name      text NOT NULL,
  department     text,
  hotel_id       text REFERENCES locations(id),
  hotel_status   text NOT NULL DEFAULT 'PENDING'
                 CHECK (hotel_status IN ('CONFIRMED','PENDING','CHECKED_OUT')),
  travel_status  text NOT NULL DEFAULT 'PRESENT'
                 CHECK (travel_status IN ('IN','OUT','PRESENT')),
  arrival_date   date,
  departure_date date,
  notes          text,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_hotel_travel ON crew(hotel_id, travel_status);
CREATE INDEX IF NOT EXISTS idx_crew_hotel_status ON crew(hotel_status);

-- ─────────────────────────────────────────────────────────────
-- 8. TRIPS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trips (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id     uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  trip_id           text NOT NULL,
  date              date NOT NULL,
  vehicle_id        text REFERENCES vehicles(id),
  driver_name       text,
  sign_code         text,
  capacity          integer,
  pickup_id         text NOT NULL REFERENCES locations(id),
  dropoff_id        text NOT NULL REFERENCES locations(id),
  transfer_class    text GENERATED ALWAYS AS (
    CASE
      WHEN pickup_id  ~ '^(APT_|STN_|PRT_)' AND
           dropoff_id !~ '^(APT_|STN_|PRT_)' THEN 'ARRIVAL'
      WHEN pickup_id  !~ '^(APT_|STN_|PRT_)' AND
           dropoff_id  ~ '^(APT_|STN_|PRT_)' THEN 'DEPARTURE'
      ELSE 'STANDARD'
    END
  ) STORED,
  arr_time          time,
  call_min          integer,
  pickup_min        integer,
  duration_min      integer,
  start_dt          timestamptz,
  end_dt            timestamptz,
  meeting_point     text,
  service_type_id   uuid REFERENCES service_types(id),
  passenger_list    text,
  pax_count         integer DEFAULT 0,
  pax_conflict_flag text,
  flight_no         text,
  notes             text,
  status            text DEFAULT 'PLANNED'
                    CHECK (status IN ('PLANNED','BUSY','DONE','CANCELLED')),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE (production_id, trip_id, pickup_id, dropoff_id, date)
);

CREATE INDEX IF NOT EXISTS idx_trips_date         ON trips(date, production_id);
CREATE INDEX IF NOT EXISTS idx_trips_vehicle_date ON trips(vehicle_id, date);
CREATE INDEX IF NOT EXISTS idx_trips_start_end    ON trips(start_dt, end_dt);
CREATE INDEX IF NOT EXISTS idx_trips_trip_id      ON trips(trip_id);

-- ─────────────────────────────────────────────────────────────
-- 9. TRIP_PASSENGERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trip_passengers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  trip_row_id   uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  crew_id       text NOT NULL REFERENCES crew(id),
  assigned_at   timestamptz DEFAULT now(),
  UNIQUE (trip_row_id, crew_id)
);

CREATE INDEX IF NOT EXISTS idx_tp_trip_row ON trip_passengers(trip_row_id);
CREATE INDEX IF NOT EXISTS idx_tp_crew     ON trip_passengers(crew_id);

-- ─────────────────────────────────────────────────────────────
-- 10. TRIGGER — aggiorna passenger_list e pax_count
-- ─────────────────────────────────────────────────────────────
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_passenger_list ON trip_passengers;
CREATE TRIGGER trg_update_passenger_list
AFTER INSERT OR DELETE ON trip_passengers
FOR EACH ROW EXECUTE FUNCTION update_trip_passenger_list();

-- ─────────────────────────────────────────────────────────────
-- 11. TRIGGER — conflict detection passeggeri
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_pax_conflict_flags()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pax_conflict ON trip_passengers;
CREATE TRIGGER trg_pax_conflict
AFTER INSERT OR DELETE ON trip_passengers
FOR EACH ROW EXECUTE FUNCTION update_pax_conflict_flags();

-- ─────────────────────────────────────────────────────────────
-- 12. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────
-- Abilita RLS su tutte le tabelle
ALTER TABLE productions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_types   ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew            ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips           ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_passengers ENABLE ROW LEVEL SECURITY;

-- Helper: ritorna gli UUID delle produzioni a cui l'utente ha accesso
CREATE OR REPLACE FUNCTION user_production_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT production_id FROM user_roles WHERE user_id = auth.uid()
$$;

-- Policy generica: accesso solo alla propria produzione
-- (Productions: visibili se l'utente ha un ruolo in essa)
DROP POLICY IF EXISTS "productions_own" ON productions;
CREATE POLICY "productions_own" ON productions
  FOR ALL USING (id IN (SELECT user_production_ids()));

-- Service role bypassa RLS automaticamente (per lo script di import)
-- Le policy seguenti si applicano agli utenti normali

DO $$ DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'locations','routes','service_types','vehicles','crew','trips','trip_passengers'
  ] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "own_production" ON %I;
       CREATE POLICY "own_production" ON %I
         FOR ALL USING (production_id IN (SELECT user_production_ids()));',
      tbl, tbl
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "user_roles_own" ON user_roles;
CREATE POLICY "user_roles_own" ON user_roles
  FOR ALL USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- FINE SCHEMA
-- ─────────────────────────────────────────────────────────────
-- Verifica:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' ORDER BY table_name;
