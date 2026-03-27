/**
 * Migration: add all new production detail columns
 * Run: node scripts/migrate-productions-v2.js
 */
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://lvxtvgxyancpegvfcnsk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2eHR2Z3h5YW5jcGVndmZjbnNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM1NDIyMCwiZXhwIjoyMDg5OTMwMjIwfQ.VVwRNrpXBdo832lsRDnILexTCQr0aMrS6p1AwYBgmMw'
)

async function run() {
  console.log('=== Productions v2 Migration ===\n')

  // Test by selecting all new columns
  const { data, error } = await supabase
    .from('productions')
    .select('id, name, logo_url, producer, production_director, director, production_manager, production_manager_phone, production_coordinator, production_coordinator_phone, transportation_coordinator, transportation_coordinator_phone, transportation_captain, transportation_captain_phone, production_office_phone, set_location, set_address, basecamp, general_call_time, shoot_day, revision')
    .limit(1)

  if (error) {
    console.log('Missing columns detected:', error.message)
    console.log('\n⚠️  Please run this SQL in Supabase SQL Editor:')
    console.log('https://supabase.com/dashboard/project/lvxtvgxyancpegvfcnsk/sql/new\n')
    console.log(`ALTER TABLE productions
  ADD COLUMN IF NOT EXISTS director                      text,
  ADD COLUMN IF NOT EXISTS production_manager            text,
  ADD COLUMN IF NOT EXISTS production_manager_phone      text,
  ADD COLUMN IF NOT EXISTS production_coordinator        text,
  ADD COLUMN IF NOT EXISTS production_coordinator_phone  text,
  ADD COLUMN IF NOT EXISTS transportation_coordinator    text,
  ADD COLUMN IF NOT EXISTS transportation_coordinator_phone text,
  ADD COLUMN IF NOT EXISTS transportation_captain        text,
  ADD COLUMN IF NOT EXISTS transportation_captain_phone  text,
  ADD COLUMN IF NOT EXISTS production_office_phone       text,
  ADD COLUMN IF NOT EXISTS set_location                  text,
  ADD COLUMN IF NOT EXISTS set_address                   text,
  ADD COLUMN IF NOT EXISTS basecamp                      text,
  ADD COLUMN IF NOT EXISTS general_call_time             text,
  ADD COLUMN IF NOT EXISTS shoot_day                     integer,
  ADD COLUMN IF NOT EXISTS revision                      integer DEFAULT 1;`)
  } else {
    console.log('✅ All columns already exist!')
    console.log('Sample:', JSON.stringify(data, null, 2))
  }
}

run().catch(console.error)
