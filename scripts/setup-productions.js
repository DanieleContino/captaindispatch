/**
 * Setup script: adds columns to productions table + creates storage bucket
 * Run: node scripts/setup-productions.js
 */
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://lvxtvgxyancpegvfcnsk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2eHR2Z3h5YW5jcGVndmZjbnNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM1NDIyMCwiZXhwIjoyMDg5OTMwMjIwfQ.VVwRNrpXBdo832lsRDnILexTCQr0aMrS6p1AwYBgmMw'
)

async function run() {
  console.log('=== CaptainDispatch: Productions Setup ===\n')

  // 1. Check if columns already exist by doing a select
  console.log('1. Checking productions table columns...')
  const { data: check, error: checkErr } = await supabase
    .from('productions')
    .select('id, name, logo_url, producer, production_director')
    .limit(1)

  if (checkErr) {
    if (checkErr.message.includes('logo_url') || checkErr.message.includes('producer') || checkErr.message.includes('production_director')) {
      console.log('   Columns missing — need to run SQL migration manually.')
      console.log('\n   ⚠️  Please run this SQL in Supabase SQL Editor:')
      console.log('   https://supabase.com/dashboard/project/lvxtvgxyancpegvfcnsk/sql/new\n')
      console.log('   ALTER TABLE productions')
      console.log('     ADD COLUMN IF NOT EXISTS logo_url text,')
      console.log('     ADD COLUMN IF NOT EXISTS producer text,')
      console.log('     ADD COLUMN IF NOT EXISTS production_director text;\n')
    } else {
      console.log('   Error:', checkErr.message)
    }
  } else {
    console.log('   ✅ Columns logo_url, producer, production_director already exist!')
    console.log('   Sample data:', JSON.stringify(check))
  }

  // 2. Check storage buckets
  console.log('\n2. Checking storage buckets...')
  const { data: buckets, error: bucketsErr } = await supabase.storage.listBuckets()
  if (bucketsErr) {
    console.log('   Error listing buckets:', bucketsErr.message)
  } else {
    const existing = buckets.map(b => b.name)
    console.log('   Existing buckets:', existing.join(', ') || '(none)')

    if (!existing.includes('production-logos')) {
      console.log('   Creating bucket "production-logos"...')
      const { data: newBucket, error: createErr } = await supabase.storage.createBucket('production-logos', {
        public: true,
        fileSizeLimit: 2097152, // 2 MB
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp', 'image/gif']
      })
      if (createErr) {
        console.log('   ❌ Bucket creation error:', createErr.message)
      } else {
        console.log('   ✅ Bucket "production-logos" created successfully!')
      }
    } else {
      console.log('   ✅ Bucket "production-logos" already exists!')
    }
  }

  console.log('\n=== Done ===')
}

run().catch(console.error)
