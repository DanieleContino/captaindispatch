import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../../lib/supabaseServer'

export const dynamic = 'force-dynamic'

async function callClaude(systemPrompt, userContent) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Claude API error ${response.status}: ${errBody}`)
  }

  const data = await response.json()
  const rawText = (data.content?.[0]?.text || '').trim()

  const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (codeBlockMatch) {
    try { return JSON.parse(codeBlockMatch[1].trim()) } catch (_) {}
  }
  const objStart = rawText.indexOf('{')
  const objEnd   = rawText.lastIndexOf('}')
  if (objStart !== -1 && objEnd > objStart) {
    try { return JSON.parse(rawText.slice(objStart, objEnd + 1)) } catch (_) {}
  }
  return JSON.parse(rawText)
}

export async function POST(req) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { text, systemPrompt } = await req.json()
    if (!text || !systemPrompt) {
      return NextResponse.json({ error: 'Missing text or systemPrompt' }, { status: 400 })
    }

    const result = await callClaude(systemPrompt, text)
    return NextResponse.json({ result })

  } catch (e) {
    console.error('[ai/trip-builder]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
