-- ============================================================
-- Migration: Rocket Trip Generator
-- Aggiunge pax_suggested e pax_max alla tabella vehicles
-- Esegui in Supabase → SQL Editor
-- ============================================================

-- 1. Aggiungi le colonne (safe — IF NOT EXISTS)
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS pax_suggested integer,
  ADD COLUMN IF NOT EXISTS pax_max       integer;

-- 2. Popola i valori di default per i veicoli esistenti
--    pax_suggested = capacità preferita (≈ 75% della capacity)
--    pax_max       = capacità reale (= capacity esistente)
UPDATE vehicles
SET
  pax_max = COALESCE(pax_max, capacity,
    CASE vehicle_type
      WHEN 'VAN' THEN 8
      WHEN 'CAR' THEN 4
      WHEN 'BUS' THEN 50
      ELSE 8
    END
  ),
  pax_suggested = COALESCE(pax_suggested,
    CASE vehicle_type
      WHEN 'VAN' THEN LEAST(COALESCE(capacity, 8), 6)
      WHEN 'CAR' THEN LEAST(COALESCE(capacity, 4), 3)
      WHEN 'BUS' THEN LEAST(COALESCE(capacity, 50), 40)
      ELSE LEAST(COALESCE(capacity, 8), 6)
    END
  )
WHERE pax_suggested IS NULL OR pax_max IS NULL;

-- Verifica:
-- SELECT id, vehicle_type, capacity, pax_suggested, pax_max FROM vehicles ORDER BY vehicle_type, id;
