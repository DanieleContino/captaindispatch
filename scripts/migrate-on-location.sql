-- S29: Remote Crew "Non in Set"
-- Aggiunge on_location BOOLEAN DEFAULT TRUE alla tabella crew
-- false = persona non in set oggi (lavora da casa/albergo). Persiste fino a cambio manuale.

ALTER TABLE crew ADD COLUMN IF NOT EXISTS on_location BOOLEAN DEFAULT TRUE;
UPDATE crew SET on_location = TRUE WHERE on_location IS NULL;
