-- migrate-locations-hotel.sql
-- S31: aggiunge is_hotel alla tabella locations
-- Eseguire in: Supabase Dashboard → SQL Editor

ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_hotel BOOLEAN DEFAULT FALSE;

-- Aggiorna le location esistenti che iniziano con "H" (convenzione ID hotel)
-- UPDATE locations SET is_hotel = TRUE WHERE id LIKE 'H%';
-- (opzionale — decommentare solo se si vogliono marcare i record esistenti)
