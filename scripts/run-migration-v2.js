/**
 * Runs the v2 migration directly via Supabase REST API (pg_query)
 * Run: node scripts/run-migration-v2.js
 */
const https = require('https')

const SUPABASE_URL = 'https://lvxtvgxyancpegvfcnsk.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2eHR2Z3h5YW5jcGVndmZjbnNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM1NDIyMCwiZXhwIjoyMDg5OTMwMjIwfQ.VVwRNrpXBdo832lsRDnILexTCQr0aMrS6p1AwYBgmMw'

const SQL = `
ALTER TABLE productions
  ADD COLUMN IF NOT EXISTS director                        text,
  ADD COLUMN IF NOT EXISTS production_manager              text,
  ADD COLUMN IF NOT EXISTS production_manager_phone        text,
  ADD COLUMN IF NOT EXISTS production_coordinator          text,
  ADD COLUMN IF NOT EXISTS production_coordinator_phone    text,
  ADD COLUMN IF NOT EXISTS transportation_coordinator      text,
  ADD COLUMN IF NOT EXISTS transportation_coordinator_phone text,
  ADD COLUMN IF NOT EXISTS transportation_captain          text,
  ADD COLUMN IF NOT EXISTS transportation_captain_phone    text,
  ADD COLUMN IF NOT EXISTS production_office_phone         text,
  ADD COLUMN IF NOT EXISTS set_location                    text,
  ADD COLUMN IF NOT EXISTS set_address                     text,
  ADD COLUMN IF NOT EXISTS basecamp                        text,
  ADD COLUMN IF NOT EXISTS general_call_time               text,
  ADD COLUMN IF NOT EXISTS shoot_day                       integer,
  ADD COLUMN IF NOT EXISTS revision                        integer DEFAULT 1;
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
        'Content-Type':  'application/json',
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

async function run() {
  console.log('Running migration via Supabase REST...')
  const res = await post('/rest/v1/rpc/exec_sql', { sql: SQL }).catch(() => null)
  if (res) {
    console.log('RPC response:', res.status, res.body)
  }

  // Fallback: try pg endpoint
  const res2 = await post('/pg/query', { query: SQL }).catch(() => null)
  if (res2) {
    console.log('PG response:', res2.status, res2.body)
  }

  console.log('\nIf both failed, please run this SQL manually in Supabase SQL Editor:')
  console.log('https://supabase.com/dashboard/project/lvxtvgxyancpegvfcnsk/sql/new')
  console.log('\n' + SQL)
}

run().catch(console.error)
