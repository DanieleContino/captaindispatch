-- S28: Vehicle Enhancement — DB Migration v2
-- Eseguire in Supabase SQL Editor

-- 1. Converte vehicle_class da TEXT a TEXT[] (mantiene i valori esistenti come array mono-elemento)
ALTER TABLE vehicles
  ALTER COLUMN vehicle_class TYPE TEXT[]
  USING CASE
    WHEN vehicle_class IS NULL THEN NULL
    ELSE ARRAY[vehicle_class]
  END;

-- 2. Aggiunge colonna preferred_dept (reparto preferito del veicolo)
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS preferred_dept TEXT;

-- 3. Aggiunge colonna preferred_crew_ids (array di crew.id preferiti)
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS preferred_crew_ids TEXT[];

-- 4. Aggiunge colonna in_transport:
--    TRUE  = veicolo incluso in trips / fleet / liste (default)
--    FALSE = veicolo "Self Drive", escluso da tutti i flussi automatici
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS in_transport BOOLEAN DEFAULT TRUE;

-- Normalizza i record esistenti: NULL → TRUE
UPDATE vehicles SET in_transport = TRUE WHERE in_transport IS NULL;
