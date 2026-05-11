-- =====================================================
-- Task 1 — Storage RLS per bucket tl-logos
-- Project: lvxtvgxyancpegvfcnsk (West EU Ireland)
-- Run in: https://supabase.com/dashboard/project/lvxtvgxyancpegvfcnsk/sql/new
-- NOTA: Il bucket tl-logos è già stato creato via API (public=false, 2MB, png/jpg/webp/svg)
-- Path pattern atteso: {production_id}/logo.{ext}
-- =====================================================

DROP POLICY IF EXISTS tl_logos_select ON storage.objects;
CREATE POLICY tl_logos_select
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'tl-logos'
    AND (storage.foldername(name))[1]::uuid IN (SELECT user_production_ids())
  );

DROP POLICY IF EXISTS tl_logos_insert ON storage.objects;
CREATE POLICY tl_logos_insert
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'tl-logos'
    AND (storage.foldername(name))[1]::uuid IN (SELECT user_production_ids())
  );

DROP POLICY IF EXISTS tl_logos_update ON storage.objects;
CREATE POLICY tl_logos_update
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'tl-logos'
    AND (storage.foldername(name))[1]::uuid IN (SELECT user_production_ids())
  );

DROP POLICY IF EXISTS tl_logos_delete ON storage.objects;
CREATE POLICY tl_logos_delete
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'tl-logos'
    AND (storage.foldername(name))[1]::uuid IN (SELECT user_production_ids())
  );
