/**
 * Task 1 — TL Header/Footer: Schema DB + Storage bucket
 * Run: node scripts/migrate-tl-header-footer.js
 */
const https = require('https')

const SUPABASE_URL = 'https://lvxtvgxyancpegvfcnsk.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2eHR2Z3h5YW5jcGVndmZjbnNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM1NDIyMCwiZXhwIjoyMDg5OTMwMjIwfQ.VVwRNrpXBdo832lsRDnILexTCQr0aMrS6p1AwYBgmMw'

// =====================================================
// Step 1 — 4 tabelle
// =====================================================
const SQL_SCHEMA = `
-- =====================================================
-- TL Header/Footer Template — Schema
-- =====================================================

-- 1) Template library (per-user)
CREATE TABLE IF NOT EXISTS public.tl_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tl_templates_owner
  ON public.tl_templates(owner_user_id);

CREATE OR REPLACE FUNCTION public.tl_templates_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tl_templates_updated_at ON public.tl_templates;
CREATE TRIGGER trg_tl_templates_updated_at
  BEFORE UPDATE ON public.tl_templates
  FOR EACH ROW EXECUTE FUNCTION public.tl_templates_set_updated_at();

ALTER TABLE public.tl_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tl_templates_all ON public.tl_templates;
CREATE POLICY tl_templates_all
  ON public.tl_templates FOR ALL
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- 2) Blocchi di un template (header + footer in un'unica tabella)
CREATE TABLE IF NOT EXISTS public.tl_template_blocks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES public.tl_templates(id) ON DELETE CASCADE,
  zone          TEXT NOT NULL CHECK (zone IN ('header','footer')),
  display_order INTEGER NOT NULL DEFAULT 0,
  block_type    TEXT NOT NULL,
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  width         TEXT NOT NULL DEFAULT '1fr',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tl_template_blocks_tpl
  ON public.tl_template_blocks(template_id, zone, display_order);

DROP TRIGGER IF EXISTS trg_tl_template_blocks_updated_at ON public.tl_template_blocks;
CREATE TRIGGER trg_tl_template_blocks_updated_at
  BEFORE UPDATE ON public.tl_template_blocks
  FOR EACH ROW EXECUTE FUNCTION public.tl_templates_set_updated_at();

ALTER TABLE public.tl_template_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tl_template_blocks_all ON public.tl_template_blocks;
CREATE POLICY tl_template_blocks_all
  ON public.tl_template_blocks FOR ALL
  USING (
    template_id IN (
      SELECT id FROM public.tl_templates WHERE owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    template_id IN (
      SELECT id FROM public.tl_templates WHERE owner_user_id = auth.uid()
    )
  );

-- 3) Template applicato a una produzione + override
CREATE TABLE IF NOT EXISTS public.tl_production_template (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id     UUID NOT NULL UNIQUE REFERENCES public.productions(id) ON DELETE CASCADE,
  template_id       UUID REFERENCES public.tl_templates(id) ON DELETE SET NULL,
  overrides         JSONB NOT NULL DEFAULT '{}'::jsonb,
  logo_storage_path TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tl_production_template_prod
  ON public.tl_production_template(production_id);

DROP TRIGGER IF EXISTS trg_tl_production_template_updated_at ON public.tl_production_template;
CREATE TRIGGER trg_tl_production_template_updated_at
  BEFORE UPDATE ON public.tl_production_template
  FOR EACH ROW EXECUTE FUNCTION public.tl_templates_set_updated_at();

ALTER TABLE public.tl_production_template ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tl_production_template_all ON public.tl_production_template;
CREATE POLICY tl_production_template_all
  ON public.tl_production_template FOR ALL
  USING (production_id IN (SELECT user_production_ids()))
  WITH CHECK (production_id IN (SELECT user_production_ids()));

-- 4) Override per-produzione dei contatti team
CREATE TABLE IF NOT EXISTS public.tl_team_contacts_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id   UUID NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  crew_id         TEXT REFERENCES public.crew(id) ON DELETE SET NULL,
  display_order   INTEGER NOT NULL DEFAULT 0,
  name_override   TEXT,
  role_override   TEXT,
  phone_override  TEXT,
  email_override  TEXT,
  hidden          BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tl_team_overrides_prod
  ON public.tl_team_contacts_overrides(production_id, display_order);

ALTER TABLE public.tl_team_contacts_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tl_team_contacts_overrides_all ON public.tl_team_contacts_overrides;
CREATE POLICY tl_team_contacts_overrides_all
  ON public.tl_team_contacts_overrides FOR ALL
  USING (production_id IN (SELECT user_production_ids()))
  WITH CHECK (production_id IN (SELECT user_production_ids()));
`

// =====================================================
// Step 2b — Storage RLS policy su bucket tl-logos
// =====================================================
const SQL_STORAGE_RLS = `
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
`

// =====================================================
// Step 3 — Verifica
// =====================================================
const SQL_VERIFY = `
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'tl_%'
ORDER BY table_name;
`

const SQL_VERIFY_POLICIES = `
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'tl_%'
ORDER BY tablename, policyname;
`

const SQL_VERIFY_BUCKET = `
SELECT id, name, public FROM storage.buckets WHERE id = 'tl-logos';
`

const SQL_VERIFY_STORAGE_POLICIES = `
SELECT policyname FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'tl_logos_%';
`

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const url  = new URL(SUPABASE_URL + path)
    const req  = https.request({
      hostname: url.hostname,
      path:     url.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data),
        'apikey':         SERVICE_KEY,
        'Authorization':  'Bearer ' + SERVICE_KEY,
        'Prefer':         'return=representation',
      }
    }, res => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function postStorage(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const url  = new URL(SUPABASE_URL + path)
    const req  = https.request({
      hostname: url.hostname,
      path:     url.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data),
        'apikey':         SERVICE_KEY,
        'Authorization':  'Bearer ' + SERVICE_KEY,
      }
    }, res => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function runSQL(label, sql) {
  console.log(`\n--- ${label} ---`)

  // Try rpc/exec_sql first
  let res = await post('/rest/v1/rpc/exec_sql', { sql }).catch(() => null)
  if (res && res.status < 300) {
    console.log(`✅ rpc/exec_sql OK [${res.status}]:`, res.body.slice(0, 200))
    return { ok: true, body: res.body }
  }
  if (res) console.log(`⚠️  rpc/exec_sql [${res.status}]:`, res.body.slice(0, 300))

  // Fallback: /pg/query
  res = await post('/pg/query', { query: sql }).catch(() => null)
  if (res && res.status < 300) {
    console.log(`✅ /pg/query OK [${res.status}]:`, res.body.slice(0, 200))
    return { ok: true, body: res.body }
  }
  if (res) console.log(`⚠️  /pg/query [${res.status}]:`, res.body.slice(0, 300))

  return { ok: false }
}

async function run() {
  console.log('=== Task 1 — TL Header/Footer: Schema DB + Storage bucket ===\n')

  // ── Step 1: Schema 4 tabelle ──────────────────────────────────
  console.log('\n[STEP 1] Creazione 4 tabelle...')
  const step1 = await runSQL('Schema tl_* tables', SQL_SCHEMA)

  // ── Step 2a: Crea bucket tl-logos ────────────────────────────
  console.log('\n[STEP 2a] Creazione bucket tl-logos...')
  const bucketRes = await postStorage('/storage/v1/bucket', {
    id: 'tl-logos',
    name: 'tl-logos',
    public: false,
    file_size_limit: 2097152, // 2 MB in bytes
    allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
  })
  console.log(`Bucket response [${bucketRes.status}]:`, bucketRes.body.slice(0, 300))

  // ── Step 2b: Storage RLS ──────────────────────────────────────
  console.log('\n[STEP 2b] Creazione Storage RLS policy su tl-logos...')
  const step2b = await runSQL('Storage RLS tl-logos', SQL_STORAGE_RLS)

  // ── Step 3: Verifica ──────────────────────────────────────────
  console.log('\n[STEP 3] Verifica...')

  const v1 = await runSQL('Tabelle tl_*', SQL_VERIFY)
  const v2 = await runSQL('Policy tl_*', SQL_VERIFY_POLICIES)
  const v3 = await runSQL('Bucket tl-logos', SQL_VERIFY_BUCKET)
  const v4 = await runSQL('Storage policy tl_logos_*', SQL_VERIFY_STORAGE_POLICIES)

  const anyFailed = [step1, step2b, v1, v2, v3, v4].some(r => !r.ok)

  if (anyFailed) {
    console.log('\n\n⚠️  Alcune query non hanno risposto via API automatica.')
    console.log('Esegui manualmente nel SQL Editor di Supabase:')
    console.log('https://supabase.com/dashboard/project/lvxtvgxyancpegvfcnsk/sql/new\n')
    console.log('--- SQL SCHEMA ---')
    console.log(SQL_SCHEMA)
    console.log('--- SQL STORAGE RLS ---')
    console.log(SQL_STORAGE_RLS)
  }
}

run().catch(console.error)
