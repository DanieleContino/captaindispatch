import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Pages to scan for email addresses (in priority order)
const CONTACT_PATHS = [
  '/contatti',
  '/contact',
  '/contact-us',
  '/contacts',
  '/chi-siamo',
  '/about',
  '/about-us',
  '/info',
  '/',
]

// Regex to find email addresses in HTML
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g

// Emails to skip (common false positives found in websites)
const SKIP_DOMAINS = [
  'sentry.io', 'example.com', 'yourdomain', 'domain.com',
  'email.com', 'yoursite', 'test.', 'noreply', 'no-reply',
  'wordpress.org', 'schema.org', 'w3.org', 'jquery', 'google',
  'facebook', 'twitter', 'instagram', 'amazon', 'microsoft',
]

function isValidEmail(email) {
  if (email.length > 80) return false
  const lower = email.toLowerCase()
  return !SKIP_DOMAINS.some(skip => lower.includes(skip))
}

// Score emails by prefix priority (info/booking/reservation first)
function scoreEmail(email) {
  const lower = email.toLowerCase()
  if (lower.startsWith('info@'))         return 10
  if (lower.startsWith('booking@'))      return 9
  if (lower.startsWith('reservation'))   return 8
  if (lower.startsWith('prenotazioni'))  return 8
  if (lower.startsWith('reception'))     return 7
  if (lower.startsWith('contact'))       return 6
  if (lower.startsWith('hello@'))        return 5
  return 1
}

async function fetchPage(urlStr, timeout = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(urlStr, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CaptainDispatch/1.0)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'it,en;q=0.9',
      },
      redirect: 'follow',
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('html') && !ct.includes('text')) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Strategy 1: extract emails from mailto: href attributes
function extractMailtoLinks(html) {
  if (!html) return []
  const regex = /href=["']mailto:([^"'?\s]+)/gi
  const found = []
  let match
  while ((match = regex.exec(html)) !== null) {
    found.push(match[1].toLowerCase())
  }
  return found.filter(isValidEmail)
}

// Strategy 2: extract emails from JSON-LD structured data (<script type="application/ld+json">)
function collectEmails(obj, acc) {
  if (!obj || typeof obj !== 'object') return
  if (typeof obj.email === 'string' && obj.email.includes('@')) acc.push(obj.email.toLowerCase())
  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) val.forEach(v => collectEmails(v, acc))
    else if (typeof val === 'object') collectEmails(val, acc)
  }
}

function extractJsonLd(html) {
  if (!html) return []
  const emails = []
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1])
      collectEmails(data, emails)
    } catch { /* malformed JSON, skip */ }
  }
  return emails.filter(isValidEmail)
}

function extractEmails(html) {
  if (!html) return []

  // Strategy 1: mailto: href links (most reliable when present)
  const mailtoEmails = extractMailtoLinks(html)
  if (mailtoEmails.length > 0) return mailtoEmails

  // Strategy 2: JSON-LD structured data (always in static HTML for SEO)
  const jsonLdEmails = extractJsonLd(html)
  if (jsonLdEmails.length > 0) return jsonLdEmails

  // Strategy 3: generic regex with HTML entity decoding (fallback)
  const decoded = html
    .replace(/&#64;/g, '@')
    .replace(/&#x40;/gi, '@')
    .replace(/\[at\]/gi, '@')
    .replace(/\(at\)/gi, '@')
    .replace(/ at /gi, '@')
    .replace(/&#46;/g, '.')
    .replace(/\[dot\]/gi, '.')
    .replace(/\(dot\)/gi, '.')
  const found = decoded.match(EMAIL_REGEX) || []
  return found.filter(isValidEmail)
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const websiteParam = searchParams.get('url')?.trim()
  if (!websiteParam) {
    return NextResponse.json({ error: 'url parameter required' }, { status: 400 })
  }

  // Normalize URL
  let baseUrl
  try {
    const raw = websiteParam.startsWith('http') ? websiteParam : `https://${websiteParam}`
    baseUrl = new URL(raw)
    // Strip path — we'll add our own contact paths
    baseUrl.pathname = '/'
    baseUrl.search = ''
    baseUrl.hash = ''
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  const base = baseUrl.origin  // e.g. https://grandhotel.it

  const allEmails = new Set()

  // Scan pages in order, stop once we have at least one email
  for (const path of CONTACT_PATHS) {
    const pageUrl = base + path
    const html = await fetchPage(pageUrl)
    const emails = extractEmails(html)
    emails.forEach(e => allEmails.add(e.toLowerCase()))
    // If we found emails on a contact-specific page, stop
    if (allEmails.size > 0 && path !== '/') break
  }

  // Sort by score descending, deduplicate
  const sorted = Array.from(allEmails)
    .sort((a, b) => scoreEmail(b) - scoreEmail(a))
    .slice(0, 5)  // max 5 suggestions

  return NextResponse.json({ emails: sorted, source: base })
}
