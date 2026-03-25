-- ============================================================
-- Migration: add service_type text column to trips
--            make dropoff_id nullable
-- Run in Supabase SQL Editor → New query → Paste → Run
-- ============================================================

-- 1. Add service_type text column (if it doesn't exist yet)
ALTER TABLE trips ADD COLUMN IF NOT EXISTS service_type text;

-- 2. Make dropoff_id nullable
--    (wrap-trip creates trips that may not have a fixed dropoff)
ALTER TABLE trips ALTER COLUMN dropoff_id DROP NOT NULL;

-- 3. Verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'trips'
  AND column_name IN ('service_type', 'service_type_id', 'dropoff_id')
ORDER BY column_name;
