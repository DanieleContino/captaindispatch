-- S43: Vehicle Preferences for Rocket Algorithm
-- Adds preferred_dept (text) and preferred_crew_ids (uuid[]) to vehicles table.
-- These optional fields are used by pickBestVehicle() to score which vehicle
-- best matches the majority department or specific crew members in a group.
--
-- preferred_dept:      department name (e.g. 'CAMERA') — boosts vehicle score +100
-- preferred_crew_ids:  array of crew.id UUIDs — boosts score +20 per match

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS preferred_dept      text,
  ADD COLUMN IF NOT EXISTS preferred_crew_ids  uuid[] DEFAULT '{}';

-- Optional: index for fast filtering by preferred_dept
CREATE INDEX IF NOT EXISTS vehicles_preferred_dept_idx
  ON vehicles (production_id, preferred_dept)
  WHERE preferred_dept IS NOT NULL;

COMMENT ON COLUMN vehicles.preferred_dept IS
  'S43: Preferred department for Rocket vehicle scoring. Boosts vehicle selection score +100 when group majority matches.';

COMMENT ON COLUMN vehicles.preferred_crew_ids IS
  'S43: Array of crew member UUIDs this vehicle prefers. Boosts score +20 per matching crew member in the assigned group.';
