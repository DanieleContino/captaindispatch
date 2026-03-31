/**
 * /api/import/sheets
 *
 * POST (multipart/form-data)
 *
 * Input fields:
 *   file — file Excel (.xlsx, .xls)
 *
 * Ritorna:
 *   { sheetNames: string[] }
 *
 * Usato dal flusso multi-sheet (S31-T3) per ottenere i nomi dei fogli
 * prima di avviare il parsing singolo per foglio.
 */
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

export async function POST(req) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file')
    if (!file) {
      return NextResponse.json({ error: 'file è obbligatorio' }, { status: 400 })
    }

    const ext = (file.name || '').split('.').pop().toLowerCase()

    // Per file non-Excel (csv, pdf, docx) restituiamo un foglio fittizio
    if (!['xlsx', 'xls'].includes(ext)) {
      return NextResponse.json({ sheetNames: [file.name || 'Sheet1'] })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const XLSX = require('xlsx')
    const workbook = XLSX.read(buffer, { type: 'buffer' })

    console.log(`[import/sheets] File: "${file.name}" — fogli: ${workbook.SheetNames.join(', ')}`)

    return NextResponse.json({ sheetNames: workbook.SheetNames })

  } catch (e) {
    console.error('[import/sheets]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
