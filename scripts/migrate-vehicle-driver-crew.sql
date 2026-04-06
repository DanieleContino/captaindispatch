-- S36: Vehicle Driver Crew Link
-- Aggiunge la colonna driver_crew_id alla tabella vehicles
-- per collegare un membro del crew come autista del veicolo.
-- Quando un crew viene assegnato come driver, verrà impostato
-- automaticamente come NTN (no_transport_needed = true) dalla UI.
-- Eseguire in Supabase SQL Editor.

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS driver_crew_id TEXT;

COMMENT ON COLUMN vehicles.driver_crew_id IS
  'ID del membro crew (crew.id) assegnato come autista di questo veicolo. Se impostato, il crew viene marcato automaticamente come NTN (no_transport_needed).';
