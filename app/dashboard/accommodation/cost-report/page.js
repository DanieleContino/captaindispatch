'use client'

/**
 * /dashboard/accommodation/cost-report
 * S65 — 16 May 2026
 * Cost Report — aggregates crew_stays cost fields by hotel and subgroup.
 * Mirrors the COST REPORT sheet from the Master Rooming Excel.
 * Read-only — data comes from crew_stays cost fields.
 * Subgroup support: when a hotel has subgroups, rows are broken down by
 * subgroup name (matching the Excel "TOT. US Crew / TOT. IT Crew" pattern).
 */

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { Navbar } from '../../../../lib/navbar'
import { getProductionId } from '../../../../lib/production'
import { useIsMobile } from '../../../../lib/useIsMobile'

// ATL departments — Above The Line
const ATL_DEPTS = new Set(['CAST', 'PRODUCERS'])

function fmt(n) {
  if (n == null || n === 0) return '—'
  return '€' + Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtN(n) {
  if (n == null || n === 0) return '—'
  return String(n)
}

const COL_HEADERS = ['Hotel / Group', 'Tot. W/O VAT', 'Tot. VAT Incl.', 'City Tax', 'VAT', 'Tot. Nights']

function DataRow({ label, row, indent, isSubtotal, isHotelTotal }) {
  const bg = isHotelTotal ? '#f0fdf4' : isSubtotal ? '#eff6ff' : 'white'
  const fw = (isSubtotal || isHotelTotal) ? '800' : '500'
  const fs = (isSubtotal || isHotelTotal) ? '12px' : '12px'
  const bt = isSubtotal ? '1px solid #bfdbfe' : isHotelTotal ? '2px solid #15803d' : '1px solid #f1f5f9'
  return (
    <tr style={{ background: bg, borderTop: bt }}>
      <td style={{ padding: `7px 14px 7px ${indent ? '28px' : '14px'}`, fontSize: fs, fontWeight: fw, color: '#0f172a' }}>
        {label}
      </td>
      <td style={{ padding: '7px 14px', fontSize: fs, fontWeight: fw, fontFamily: 'monospace', color: '#374151', textAlign: 'right' }}>
        {fmt(row.tot_no_vat)}
      </td>
      <td style={{ padding: '7px 14px', fontSize: fs, fontWeight: fw, fontFamily: 'monospace', color: '#374151', textAlign: 'right' }}>
        {fmt(row.tot_vat)}
      </td>
      <td style={{ padding: '7px 14px', fontSize: fs, fontWeight: fw, fontFamily: 'monospace', color: '#374151', textAlign: 'right' }}>
        {fmt(row.city_tax)}
      </td>
      <td style={{ padding: '7px 14px', fontSize: fs, fontWeight: fw, fontFamily: 'monospace', color: '#374151', textAlign: 'right' }}>
        {fmt(row.vat)}
      </td>
      <td style={{ padding: '7px 14px', fontSize: fs, fontWeight: fw, fontFamily: 'monospace', color: '#374151', textAlign: 'right' }}>
        {fmtN(row.tot_nights)}
      </td>
    </tr>
  )
}

function GrandTotalRow({ label, row }) {
  return (
    <tr style={{ background: '#0f2340' }}>
      <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: '900', color: 'white' }}>{label}</td>
      {[row.tot_no_vat, row.tot_vat, row.city_tax, row.vat, row.tot_nights].map((v, i) => (
        <td key={i} style={{ padding: '10px 14px', fontSize: '13px', fontWeight: '900', fontFamily: 'monospace', color: 'white', textAlign: 'right' }}>
          {i < 4 ? fmt(v) : fmtN(v)}
        </td>
      ))}
    </tr>
  )
}

// ── SectionTable: renders one ATL or BTL section ─────────────────────────────
// rows: array of { label, row, indent?, isSubtotal?, isHotelTotal? }
function SectionTable({ title, tableRows, total, borderColor }) {
  if (tableRows.length === 0) return null
  return (
    <div style={{ marginBottom: '32px' }}>
      <div style={{
        padding: '8px 14px',
        background: borderColor === '#15803d' ? '#f0fdf4' : '#eff6ff',
        border: `1px solid ${borderColor}`,
        borderRadius: '8px 8px 0 0',
        borderBottom: 'none',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <span style={{ fontSize: '13px', fontWeight: '900', color: borderColor === '#15803d' ? '#14532d' : '#1e3a8a', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {title}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse',
          border: `1px solid ${borderColor}`, borderTop: 'none',
          borderRadius: '0 0 8px 8px', overflow: 'hidden', minWidth: '640px',
        }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {COL_HEADERS.map((h, i) => (
                <th key={h} style={{
                  padding: '7px 14px', fontSize: '10px', fontWeight: '800',
                  color: '#64748b', textAlign: i === 0 ? 'left' : 'right',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  borderBottom: '1px solid #e2e8f0',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((r, i) => (
              <DataRow key={i} label={r.label} row={r.row} indent={r.indent} isSubtotal={r.isSubtotal} isHotelTotal={r.isHotelTotal} />
            ))}
            {/* Section total */}
            <tr style={{ background: borderColor === '#15803d' ? '#dcfce7' : '#dbeafe', borderTop: `2px solid ${borderColor}` }}>
              <td style={{ padding: '8px 14px', fontSize: '12px', fontWeight: '900', color: '#0f172a' }}>
                TOT. {title.split('—')[0].trim()}
              </td>
              {[total.tot_no_vat, total.tot_vat, total.city_tax, total.vat, total.tot_nights].map((v, i) => (
                <td key={i} style={{ padding: '8px 14px', fontSize: '12px', fontWeight: '900', fontFamily: 'monospace', color: '#0f172a', textAlign: 'right' }}>
                  {i < 4 ? fmt(v) : fmtN(v)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Aggregation helpers ───────────────────────────────────────────────────────
function sumStays(stayList) {
  let tot_no_vat = 0, tot_vat = 0, city_tax = 0, vat = 0, tot_nights = 0
  for (const s of stayList) {
    tot_no_vat += s.total_cost_no_vat || 0
    tot_vat    += s.total_cost_vat    || 0
    city_tax   += s.city_tax_total    || 0
    vat        += (s.total_cost_vat || 0) - (s.total_cost_no_vat || 0)
    if (s.arrival_date && s.departure_date) {
      const a = new Date(s.arrival_date + 'T12:00:00Z')
      const b = new Date(s.departure_date + 'T12:00:00Z')
      const n = Math.round((b - a) / 86400000)
      if (n > 0) tot_nights += n
    }
  }
  return {
    tot_no_vat: tot_no_vat || null,
    tot_vat:    tot_vat    || null,
    city_tax:   city_tax   || null,
    vat:        vat        || null,
    tot_nights: tot_nights || null,
  }
}

/**
 * Build the flat list of rows for a section.
 *
 * Logic (mirrors Excel structure):
 *   1. Group stays by hotel.
 *   2. For each hotel:
 *      a. If ALL its stays have NO subgroup → one plain row "Hotel Name".
 *      b. If stays have subgroups → for each subgroup in that hotel:
 *           - One row "Hotel Name (Subgroup Name)" [indented]
 *         then optionally a hotel-total row if there are >1 subgroups.
 *   3. After all hotel rows, group by subgroup NAME across hotels and add
 *      "TOT. SubgroupName" subtotal rows for any named subgroup that appears
 *      in more than one hotel (or always, for clarity).
 *
 * Actually we mirror the Excel exactly:
 *   - Rows grouped by SUBGROUP NAME (across hotels), then by hotel within each subgroup.
 *   - Subgroup name = null → plain hotel rows (no subgroup section).
 *   - Named subgroups get a "TOT. [name]" row.
 */
function buildSectionRows(stays) {
  // key: subgroupName (string | '__none__')
  const bySubgroupName = {}

  for (const s of stays) {
    const sgName    = s.subgroup?.name || '__none__'
    const hotelName = s.hotel?.name   || 'Unknown Hotel'
    if (!bySubgroupName[sgName]) bySubgroupName[sgName] = {}
    if (!bySubgroupName[sgName][hotelName]) bySubgroupName[sgName][hotelName] = []
    bySubgroupName[sgName][hotelName].push(s)
  }

  const rows = []

  // ── Named subgroups first (sorted by name) ──────────────────────────────
  const namedGroups = Object.keys(bySubgroupName).filter(k => k !== '__none__').sort()
  for (const sgName of namedGroups) {
    const hotelMap = bySubgroupName[sgName]
    const hotelNames = Object.keys(hotelMap).sort()
    const allStaysInGroup = []
    for (const hn of hotelNames) {
      const stayList = hotelMap[hn]
      allStaysInGroup.push(...stayList)
      const label = hotelNames.length > 1
        ? `${hn} (${sgName})`
        : `${hn} (${sgName})`
      rows.push({ label, row: sumStays(stayList), indent: true })
    }
    // Subtotal for this subgroup
    rows.push({ label: `TOT. ${sgName}`, row: sumStays(allStaysInGroup), isSubtotal: true })
  }

  // ── Unsubgrouped stays: one row per hotel ────────────────────────────────
  if (bySubgroupName['__none__']) {
    const hotelMap = bySubgroupName['__none__']
    const hotelNames = Object.keys(hotelMap).sort()
    for (const hn of hotelNames) {
      rows.push({ label: hn, row: sumStays(hotelMap[hn]) })
    }
  }

  return rows
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function CostReportPage() {
  const PRODUCTION_ID = getProductionId()
  const router        = useRouter()
  const isMobile      = useIsMobile()

  const [user,    setUser]    = useState(null)
  const [stays,   setStays]   = useState([])
  const [loading, setLoading] = useState(true)

  // Auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
    })
  }, [])

  const loadData = useCallback(async () => {
    if (!PRODUCTION_ID) return
    setLoading(true)
    const { data } = await supabase
      .from('crew_stays')
      .select(`
        id, hotel_id, arrival_date, departure_date,
        city_tax_total, total_cost_no_vat, total_cost_vat,
        crew:crew_id(department),
        hotel:hotel_id(id, name),
        subgroup:subgroup_id(id, name)
      `)
      .eq('production_id', PRODUCTION_ID)
      .not('total_cost_no_vat', 'is', null)
    setStays(data || [])
    setLoading(false)
  }, [PRODUCTION_ID])

  useEffect(() => {
    if (user) loadData()
  }, [user, loadData])

  // ── Aggregation ────────────────────────────────────────────────────────────
  const atlStays = stays.filter(s => ATL_DEPTS.has((s.crew?.department || '').toUpperCase()))
  const btlStays = stays.filter(s => !ATL_DEPTS.has((s.crew?.department || '').toUpperCase()))

  const atlRows   = buildSectionRows(atlStays)
  const btlRows   = buildSectionRows(btlStays)

  const atlTotal  = sumStays(atlStays)
  const btlTotal  = sumStays(btlStays)
  const grandTotal = sumStays(stays)

  if (!user) return (
    <div style={{ minHeight: '100vh', background: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
      Loading...
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <Navbar currentPath="/dashboard/accommodation" />

      {/* Toolbar */}
      <div style={{
        background: 'white', borderBottom: '1px solid #e2e8f0',
        padding: '8px 16px', minHeight: '52px',
        display: 'flex', alignItems: 'center', gap: '8px',
        position: 'sticky', top: '52px', zIndex: 21,
      }}>
        <a href="/dashboard/accommodation"
          style={{ fontSize: '12px', color: '#64748b', textDecoration: 'none', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
          ← Accommodation
        </a>
        <span style={{ color: '#e2e8f0' }}>|</span>
        <span style={{ fontSize: '18px' }}>💰</span>
        <span style={{ fontWeight: '800', fontSize: isMobile ? '14px' : '16px', color: '#0f172a', whiteSpace: 'nowrap' }}>
          Cost Report
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={loadData}
          style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px 10px', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>
          ↺
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: isMobile ? '12px' : '16px 24px' }}>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>Loading cost data...</div>

        ) : stays.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>💰</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>No cost data yet</div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              Add cost fields (€/night, city tax, totals) to stays in the Accommodation page.
            </div>
            <a href="/dashboard/accommodation"
              style={{ display: 'inline-block', marginTop: '14px', padding: '8px 18px', borderRadius: '8px', background: '#15803d', color: 'white', fontSize: '13px', fontWeight: '800', textDecoration: 'none' }}>
              → Go to Accommodation
            </a>
          </div>

        ) : (
          <>
            {/* ATL Section */}
            <SectionTable
              title="ATL — Above The Line (Cast & Producers)"
              tableRows={atlRows}
              total={atlTotal}
              borderColor="#15803d"
            />

            {/* BTL Section */}
            <SectionTable
              title="BTL — Below The Line (Crew)"
              tableRows={btlRows}
              total={btlTotal}
              borderColor="#1d4ed8"
            />

            {/* Grand Total */}
            {stays.length > 0 && (
              <div style={{ overflowX: 'auto', marginTop: '4px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px', border: '2px solid #0f2340', borderRadius: '10px', overflow: 'hidden' }}>
                  <tbody>
                    <GrandTotalRow label="GRAND TOTAL" row={grandTotal} />
                  </tbody>
                </table>
              </div>
            )}

            {/* Note */}
            <div style={{ marginTop: '20px', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px', color: '#94a3b8' }}>
              ℹ️ Only stays with cost data (Tot. W/O VAT) are included. ATL = CAST + PRODUCERS departments. All other departments = BTL.
              Subgroups are managed per hotel in the Accommodation page (⚙ menu → Manage Subgroups).
            </div>
          </>
        )}
      </div>
    </div>
  )
}
