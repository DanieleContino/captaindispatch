-- S32-T1: Google Drive Sync — tabella drive_synced_files
-- Eseguire in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS drive_synced_files (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  production_id   uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  file_id         text NOT NULL,           -- Google Drive file ID
  file_name       text NOT NULL,           -- nome file per display
  import_mode     text NOT NULL,           -- 'crew' | 'accommodation' | 'fleet' | 'hal'
  last_modified   text,                    -- modifiedTime da Drive API (per rilevare cambiamenti)
  last_synced_at  timestamptz,             -- ultima sincronizzazione riuscita
  created_at      timestamptz DEFAULT now(),
  UNIQUE(production_id, file_id)
);

-- RLS
ALTER TABLE drive_synced_files ENABLE ROW LEVEL SECURITY;

-- SELECT: solo file delle produzioni dell'utente
CREATE POLICY "drive_files_select" ON drive_synced_files
  FOR SELECT TO authenticated
  USING (production_id IN (SELECT user_production_ids()));

-- INSERT: solo per produzioni dell'utente (il service client bypassa RLS)
CREATE POLICY "drive_files_insert" ON drive_synced_files
  FOR INSERT TO authenticated
  WITH CHECK (production_id IN (SELECT user_production_ids()));

-- UPDATE: solo per produzioni dell'utente
CREATE POLICY "drive_files_update" ON drive_synced_files
  FOR UPDATE TO authenticated
  USING (production_id IN (SELECT user_production_ids()));

-- DELETE: solo per produzioni dell'utente
CREATE POLICY "drive_files_delete" ON drive_synced_files
  FOR DELETE TO authenticated
  USING (production_id IN (SELECT user_production_ids()));
