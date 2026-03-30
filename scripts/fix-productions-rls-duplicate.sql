-- ============================================================
-- Fix: Multiple Permissive Policies + Always-True INSERT Policy
-- su public.productions
--
-- PROBLEMA 1 — Warning "Multiple Permissive Policies":
--   - "productions_own"    (FOR ALL → include INSERT)
--   - "productions_insert" (FOR INSERT WITH CHECK true)
--   Entrambe si applicano all'INSERT → Supabase le esegue due volte.
--
-- PROBLEMA 2 — Warning "RLS Policy Always True":
--   - "productions_insert" ha WITH CHECK (true) → accesso illimitato
--     in INSERT per qualsiasi utente autenticato.
--
-- ANALISI: l'API POST /api/productions usa già createSupabaseServiceClient()
-- (service role) che bypassa RLS completamente → la policy
-- "productions_insert" è ridondante E insicura.
--
-- SOLUZIONE:
--   1. Droppare "productions_own" (FOR ALL) e "productions_insert"
--   2. Ricreare solo SELECT/UPDATE/DELETE (con USING user_production_ids())
--   3. Nessuna policy INSERT per authenticated: tutti gli INSERT
--      avvengono via service client lato server (API route verificata).
--
-- Esegui nel Supabase SQL Editor:
-- Dashboard → SQL Editor → incolla → Run
-- ============================================================

-- 1. Rimuovi le policy problematiche
DROP POLICY IF EXISTS "productions_own"    ON productions;
DROP POLICY IF EXISTS "productions_insert" ON productions;

-- 2. Ricrea policy per SELECT (solo produzioni dell'utente)
DROP POLICY IF EXISTS "productions_select" ON productions;
CREATE POLICY "productions_select" ON productions
  FOR SELECT
  TO authenticated
  USING (id IN (SELECT user_production_ids()));

-- 3. Ricrea policy per UPDATE (solo produzioni dell'utente)
DROP POLICY IF EXISTS "productions_update" ON productions;
CREATE POLICY "productions_update" ON productions
  FOR UPDATE
  TO authenticated
  USING (id IN (SELECT user_production_ids()));

-- 4. Ricrea policy per DELETE (solo produzioni dell'utente)
--    Nota: DELETE in prod usa service client, ma teniamo la policy
--    per coerenza e difesa in profondità.
DROP POLICY IF EXISTS "productions_delete" ON productions;
CREATE POLICY "productions_delete" ON productions
  FOR DELETE
  TO authenticated
  USING (id IN (SELECT user_production_ids()));

-- Nessuna policy INSERT per authenticated:
-- tutti gli INSERT passano dal service client (bypassa RLS).

-- Verifica le policy attive su productions:
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'productions'
-- ORDER BY cmd;
