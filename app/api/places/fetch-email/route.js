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

// Regex to find phone numbers in HTML (international + Italian formats)
const PHONE_REGEX = /(?:\+\d{1,3}[\s.\-]?)?(?:\(?\d{2,4}\)?[\s.\-]?)(?:\d{2,4}[\s.\-]?){2,4}\d{2,4}/g

// Phone prefixes/strings to skip (false positives)
const SKIP_PHONE_PATTERNS = [
  /^0+$/, /^1+$/, /^9+$/, // all same digit
]

function isValidPhone(phone) {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return false
  if (SKIP_PHONE_PATTERNS.some(p => p.test(digits))) return false
  return true
}

function normalizePhone(phone) {
  return phone.trim().replace(/\s+/g, ' ')
}

// Emails to skip (common false positives found in websites)
const SKIP_DOMAINS = [
  'sentry.io', 'example.com', 'yourdomain', 'domain.com',
  'email.com', 'yoursite', 'test.', 'noreply', 'no-reply',
  'wordpress.org', 'schema.org', 'w3.org', 'jquery', 'google',
  'facebook', 'twitter', 'instagram', 'amazon', 'microsoft',
]

// [FIX 4] Image/font file extensions — often caught by regex as false positives
const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|webp|ico|bmp|tiff|woff|woff2|ttf|eot)$/i

function isValidEmail(email) {
  if (email.length > 80) return false
  // [FIX 4] Exclude strings that end in image/font extensions
  if (IMAGE_EXTENSIONS.test(email)) return false
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

// [FIX 1 + FIX 5] Real desktop browser User-Agent + timeout reduced to 4s
async function fetchPage(urlStr, timeout = 4000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(urlStr, {
      signal: controller.signal,
      headers: {
        // [FIX 1] Simulate a real Chrome 124 desktop browser to bypass bot-blocking
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        // [FIX 1] Italian-first Accept-Language header
        'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
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

// ── Phone extraction ──────────────────────────────────────────

// Strategy P1: extract phones from tel: href attributes
function extractTelLinks(html) {
  if (!html) return []
  const regex = /href=["']tel:([^"'?\s]+)/gi
  const found = []
  let match
  while ((match = regex.exec(html)) !== null) {
    found.push(normalizePhone(decodeURIComponent(match[1])))
  }
  return found.filter(isValidPhone)
}

// Strategy P2: extract phones from JSON-LD structured data
function collectPhones(obj, acc) {
  if (!obj || typeof obj !== 'object') return
  if (typeof obj.telephone === 'string') acc.push(normalizePhone(obj.telephone))
  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) val.forEach(v => collectPhones(v, acc))
    else if (typeof val === 'object') collectPhones(val, acc)
  }
}

function extractJsonLdPhones(html) {
  if (!html) return []
  const phones = []
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1])
      collectPhones(data, phones)
    } catch { /* malformed JSON, skip */ }
  }
  return phones.filter(isValidPhone)
}

// Strategy P3: generic phone regex fallback
function extractPhonesFallback(html) {
  if (!html) return []
  const found = html.match(PHONE_REGEX) || []
  return found.map(normalizePhone).filter(isValidPhone)
}

function extractPhones(html) {
  if (!html) return []

  // Strategy P1: tel: href (most reliable)
  const telPhones = extractTelLinks(html)
  if (telPhones.length > 0) return [...new Set(telPhones)].slice(0, 5)

  // Strategy P2: JSON-LD telephone field
  const jsonLdPhones = extractJsonLdPhones(html)
  if (jsonLdPhones.length > 0) return [...new Set(jsonLdPhones)].slice(0, 5)

  // Strategy P3: generic regex (fallback, noisier)
  const fallback = extractPhonesFallback(html)
  return [...new Set(fallback)].slice(0, 5)
}

// ── Email extraction ──────────────────────────────────────────

// [FIX 3] Cloudflare Email Obfuscation decoder (XOR algorithm)
// Cloudflare encodes emails as: first byte = XOR key, remaining bytes = key ^ charCode
function decodeCloudflareEmail(encodedHex) {
  if (!encodedHex || encodedHex.length < 4) return ''
  const key = parseInt(encodedHex.substring(0, 2), 16)
  let decoded = ''
  for (let i = 2; i < encodedHex.length; i += 2) {
    decoded += String.fromCharCode(parseInt(encodedHex.substring(i, i + 2), 16) ^ key)
  }
  return decoded
}

// [FIX 3] Extract emails protected by Cloudflare's __cf_email__ obfuscation
function extractCfEmails(html) {
  if (!html) return []
  const regex = /data-cfemail=["']([0-9a-fA-F]+)["']/g
  const found = []
  let match
  while ((match = regex.exec(html)) !== null) {
    try {
      const email = decodeCloudflareEmail(match[1])
      if (email.includes('@') && isValidEmail(email)) found.push(email.toLowerCase())
    } catch { /* skip malformed */ }
  }
  return found
}

// Strategy E1: extract emails from mailto: href attributes
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

// Strategy E2: extract emails from JSON-LD structured data (<script type="application/ld+json">)
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

  // [FIX 3] Strategy 0: Cloudflare obfuscated emails (data-cfemail attribute) — most reliable
  const cfEmails = extractCfEmails(html)
  if (cfEmails.length > 0) return cfEmails

  // Strategy E1: mailto: href links (most reliable when present)
  const mailtoEmails = extractMailtoLinks(html)
  if (mailtoEmails.length > 0) return mailtoEmails

  // Strategy E2: JSON-LD structured data (always in static HTML for SEO)
  const jsonLdEmails = extractJsonLd(html)
  if (jsonLdEmails.length > 0) return jsonLdEmails

  // Strategy E3: generic regex with HTML entity decoding (fallback)
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
  // [FIX 4] isValidEmail already filters image extensions
  return found.filter(isValidEmail)
}

// [FIX 2] Find contact-page links within HTML by scanning anchor text/href for keywords
// Returns absolute URLs belonging to the same origin (max 3 candidates)
function findContactLinks(html, baseOrigin) {
  if (!html) return []
  const KEYWORDS = ['contatti', 'contact', 'info', 'about', 'dove-siamo', 'chi-siamo', 'where']
  // Match <a href="..."> tags (handles single/double quotes and relative/absolute URLs)
  const linkRegex = /<a\s[^>]*href=["']([^"'#][^"']*?)["'][^>]*>([\s\S]*?)<\/a>/gi
  const found = new Set()
  let match
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1].trim()
    const text = match[2].replace(/<[^>]+>/g, '').toLowerCase().trim()
    const hrefLower = href.toLowerCase()
    if (KEYWORDS.some(k => hrefLower.includes(k) || text.includes(k))) {
      try {
        const abs = href.startsWith('http') ? href : new URL(href, baseOrigin).href
        // Only follow links within the same domain
        if (abs.startsWith(baseOrigin)) found.add(abs)
      } catch { /* invalid URL, skip */ }
    }
  }
  return [...found].slice(0, 3) // limit to 3 fallback pages
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
  const allPhones = new Set()

  // Keep a reference to the homepage HTML for the fallback link-crawl (FIX 2)
  let homepageHtml = null

  // Scan pages in order, stop once we have at least one email
  for (const path of CONTACT_PATHS) {
    const pageUrl = base + path
    const html = await fetchPage(pageUrl)

    // Save homepage HTML for later fallback crawl
    if (path === '/' && html) homepageHtml = html

    const emails = extractEmails(html)
    emails.forEach(e => allEmails.add(e.toLowerCase()))
    const phones = extractPhones(html)
    phones.forEach(p => allPhones.add(p))
    // If we found emails on a contact-specific page, stop
    if (allEmails.size > 0 && path !== '/') break
  }

  // [FIX 2] Fallback: if still no emails, crawl contact links found in homepage HTML
  if (allEmails.size === 0 && homepageHtml) {
    const candidateUrls = findContactLinks(homepageHtml, base)
    // Exclude paths we already tried
    const alreadyTried = new Set(CONTACT_PATHS.map(p => base + p))
    for (const candidateUrl of candidateUrls) {
      if (alreadyTried.has(candidateUrl)) continue
      const html = await fetchPage(candidateUrl)
      const emails = extractEmails(html)
      emails.forEach(e => allEmails.add(e.toLowerCase()))
      const phones = extractPhones(html)
      phones.forEach(p => allPhones.add(p))
      // Stop as soon as we find something
      if (allEmails.size > 0) break
    }
  }

  // Sort emails by score descending, deduplicate
  const sortedEmails = Array.from(allEmails)
    .sort((a, b) => scoreEmail(b) - scoreEmail(a))
    .slice(0, 5)  // max 5 suggestions

  const sortedPhones = Array.from(allPhones).slice(0, 5)

  return NextResponse.json({ emails: sortedEmails, phones: sortedPhones, source: base })
}
