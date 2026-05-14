-- ============================================================
-- CaptainDispatch — S58-A: crew_notes table
-- Sistema di comunicazione tra Captain, Travel e Accommodation
--
-- Esegui nel Supabase SQL Editor
-- ============================================================

-- Tabella principale
CREATE TABLE IF NOT EXISTS crew_notes (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  production_id  TEXT NOT NULL,
  crew_id        TEXT NOT NULL REFERENCES crew(id) ON DELETE CASCADE,
  author_id      UUID NOT NULL,           -- auth.users.id
  author_name    TEXT NOT NULL,           -- "Mario Bianchi"
  author_role    TEXT NOT NULL DEFAULT 'CAPTAIN',  -- ruolo display dell'autore
  content        TEXT NOT NULL,
  is_private     BOOLEAN NOT NULL DEFAULT false,   -- true = solo autore può leggere
  context        TEXT NOT NULL DEFAULT 'general',  -- 'travel' | 'accommodation' | 'general'
  read_by        UUID[] NOT NULL DEFAULT '{}',     -- user_id che l'hanno marcata come letta
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indici
CREATE INDEX IF NOT EXISTS idx_crew_notes_crew       ON crew_notes(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_notes_production ON crew_notes(production_id);
CREATE INDEX IF NOT EXISTS idx_crew_notes_author     ON crew_notes(author_id);

-- RLS
ALTER TABLE crew_notes ENABLE ROW LEVEL SECURITY;

-- Policy: i membri della produzione vedono le note pubbliche + le proprie private
CREATE POLICY "crew_notes_select" ON crew_notes
  FOR SELECT USING (
    production_id IN (SELECT production_id::TEXT FROM user_roles WHERE user_id = auth.uid())
    AND (
      is_private = false
      OR author_id = auth.uid()
    )
  );

-- Policy: inserimento — solo utenti autenticati con ruolo nella produzione
CREATE POLICY "crew_notes_insert" ON crew_notes
  FOR INSERT WITH CHECK (
    production_id IN (SELECT production_id::TEXT FROM user_roles WHERE user_id = auth.uid())
    AND author_id = auth.uid()
  );

-- Policy: aggiornamento — solo l'autore può modificare il contenuto;
--         chiunque nella produzione può aggiornare read_by (mark as read)
CREATE POLICY "crew_notes_update" ON crew_notes
  FOR UPDATE USING (
    production_id IN (SELECT production_id::TEXT FROM user_roles WHERE user_id = auth.uid())
  );

-- Policy: delete — solo l'autore
CREATE POLICY "crew_notes_delete" ON crew_notes
  FOR DELETE USING (
    author_id = auth.uid()
  );
