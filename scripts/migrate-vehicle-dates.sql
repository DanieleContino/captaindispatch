-- ============================================================
-- Migration: Vehicle Availability Dates
-- Adds available_from and available_to date columns to vehicles
--
-- Run in Supabase SQL Editor:
-- Dashboard → SQL Editor → paste → Run
-- ============================================================

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS available_from date;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS available_to   date;

-- Verify
SELECT id, available_from, available_to FROM vehicles LIMIT 5;
