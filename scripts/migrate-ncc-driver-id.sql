-- S-NCC: Aggiunge ncc_driver_id alla tabella vehicles
-- Collega un driver NCC (ncc_drivers.id) al veicolo NCC assegnato.
-- Usato dal picker "Driver di oggi (Captain Go)" in NccVehicleSidebar.
-- Eseguire in Supabase SQL Editor.

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS ncc_driver_id UUID REFERENCES ncc_drivers(id) ON DELETE SET NULL;

COMMENT ON COLUMN vehicles.ncc_driver_id IS
  'ID del driver NCC (ncc_drivers.id) attualmente assegnato a questo veicolo. Usato in Captain Go per il tracking real-time.';
