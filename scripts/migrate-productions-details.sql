-- ============================================================
-- Migration: Add logo_url, producer, production_director to productions
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE productions
  ADD COLUMN IF NOT EXISTS logo_url           text,
  ADD COLUMN IF NOT EXISTS producer           text,
  ADD COLUMN IF NOT EXISTS production_director text;

-- Create storage bucket for production logos (if not exists)
-- Run this separately in Supabase Storage or via the dashboard:
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('production-logos', 'production-logos', true)
-- ON CONFLICT (id) DO NOTHING;

-- Storage policy: allow authenticated users to upload to their own production folder
-- (Set up in Supabase Dashboard → Storage → production-logos → Policies)
