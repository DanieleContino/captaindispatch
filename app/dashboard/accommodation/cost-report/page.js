'use client'

/**
 * /dashboard/accommodation/cost-report
 * S65 — 15 May 2026
 * Cost Report — aggregates crew_stays cost fields by hotel and ATL/BTL category.
 * Mirrors the COST REPORT sheet from the Master Rooming Excel.
 * Read-only — data comes from crew_stays cost fields.
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

function TotRow({ label, row, bold, bg, borderTop }) {
  return (
    <tr style={{
      background: bg || (bold ? '#f0fdf4' : 'white'),
      borderTop: borderTop ? '2px solid #15803d' : '1px solid #e2e8f0',
    }}>
      <td style={{ padding: '8px 14px', fontSize: bold ? '12px' : '11px', fontWeight: bold ? '800' : '600', color: '#0f172a' }}>
        {label}
      </td>
      <td style={{ padding: '8px 14px', fontSize: '12px', fontWeight: bold ? '800' : '600', fontFamily: 'monospace', color: '#374151', textAlign: 'right' }}>
        {fmt(row.tot_no_vat)}
      </td>
      <td style={{ padding: '8px 14px', fontSize: '12px', fontWeight: bold ? '800' : '600', fontFamily: 'monospace', color: '#374151', textAlign: 'right' }}>
        {fmt(row.tot_vat)}
      </td>
      <td style={{ padding: '8px 14px', fontSize: '12px', fontWeight: bold ? '800' : '600', fontFamily: 'monospace', color: '#374151', textAlign: 'right' }}>
        {fmt(row.city_tax)}
      </td>
      <td style={{ padding: '8px 14px', fontSize: '12px', fontWeight: bold ? '800' : '600', fontFamily: 'monospace', color: '#374151', textAlign: 'right' }}>
        {fmt(row.vat)}
      </td>
      <td style={{ padding: '8px 14px', fontSize: '12px', fontWeight: bold ? '800' : '600', fontFamily: 'monospace', color: '#374151', textAlign: 'right' }}>
        {fmtN(row.tot_nights)}
      </td>
    </tr>
  )
}

function SectionTable({ title, rows, total, borderColor }) {
  if (rows.length === 0) return null
  return (
    <div style={{ marginBottom: '32px' }}>
      {/* Section header */}
      <div style={{
        padding: '8px 14px', background: borderColor === '#15803d' ? '#f0fdf4' : '#eff6ff',
        border: `1px solid ${borderColor}`, borderRadius: '8px 8px 0 0', borderBottom: 'none',
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
              {['Hotel / Category', 'Tot. W/O VAT', 'Tot. VAT Incl.', 'City Tax', 'VAT', 'Tot. Nights'].map((h, i) => (
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
            {rows.map((row, i) => (
              <tr key={i} style={{ background: 'white', borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 14px', fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                  {row.label}
                </td>
                <td style={{ padding: '8px 14px', fontSize: '12px', fontFamily: 'monospace', color: '#374151', textAlign: 'right' }}>
                  {fmt(row.tot_no_vat)}
                </td>
                <td style={{ padding: '8px 14px', fontSize: '12px', fontFamily: 'monospace', color: '#374151', textAlign: 'right' }}>
                  {fmt(row.tot_vat)}
                </td>
                <td style={{ padding: '8px 14px', fontSize: '12px', fontFamily: 'monospace', color: '#374151', textAlign: 'right' }}>
                  {fmt(row.city_tax)}
                </td>
                <td style={{ padding: '8px 14px', fontSize: '12px', fontFamily: 'monospace', color: '#374151', textAlign: 'right' }}>
                  {fmt(row.vat)}
                </td>
                <td style={{ padding: '8px 14px', fontSize: '12px', fontFamily: 'monospace', color: '#374151', textAlign: 'right' }}>
                  {fmtN(row.tot_nights)}
                </td>
              </tr>
            ))}
            {/* Section total */}
            <TotRow label={`TOT. ${title}`} row={total} bold bg={borderColor === '#15803d' ? '#f0fdf4' : '#eff6ff'} borderTop />
          </tbody>
        </table>
      </div>
    </div>
  )
}

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
        cost_per_night, city_tax_total, total_cost_no_vat, total_cost_vat,
        crew:crew_id(department),
        hotel:hotel_id(id, name)
      `)
      .eq('production_id', PRODUCTION_ID)
      .not('total_cost_no_vat', 'is', null)
    setStays(data || [])
    setLoading(false)
  }, [PRODUCTION_ID])

  useEffect(() => {
    if (user) loadData()
  }, [user, loadData])

  // ── Aggregation ───────────────────────────────────────────
  // Build rows grouped by hotel + ATL/BTL
  // { hotelName, category: 'ATL'|'BTL', tot_no_vat, tot_vat, city_tax, vat, tot_nights }

  function sumStays(stayList) {
    let tot_no_vat = 0, tot_vat = 0, city_tax = 0, vat = 0, tot_nights = 0
    for (const s of stayList) {
      tot_no_vat += s.total_cost_no_vat || 0
      tot_vat    += s.total_cost_vat    || 0
      city_tax   += s.city_tax_total    || 0
      // VAT = tot_vat - tot_no_vat
      vat        += (s.total_cost_vat || 0) - (s.total_cost_no_vat || 0)
      // nights
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

  // Group by hotel + category
  const grouped = {}
  for (const s of stays) {
    const hotelName = s.hotel?.name || 'Unknown Hotel'
    const dept      = (s.crew?.department || '').toUpperCase()
    const category  = ATL_DEPTS.has(dept) ? 'ATL' : 'BTL'
    const key       = `${hotelName}|||${category}`
    if (!grouped[key]) grouped[key] = { hotelName, category, stays: [] }
    grouped[key].stays.push(s)
  }

  // Build ATL rows
  const atlRows = Object.values(grouped)
    .filter(g => g.category === 'ATL')
    .sort((a, b) => a.hotelName.localeCompare(b.hotelName))
    .map(g => ({
      label: g.hotelName,
      ...sumStays(g.stays),
    }))

  // Build BTL rows — split by US Crew (no department or PRODUCTION/CAMERA etc) vs IT Crew (CATERING etc)
  // For simplicity mirror the Excel: BTL split into two sub-groups
  // US Crew = non-IT departments (CAST already in ATL, so BTL = everyone else)
  // We keep it simple: one BTL section, rows by hotel
  const btlRows = Object.values(grouped)
    .filter(g => g.category === 'BTL')
    .sort((a, b) => a.hotelName.localeCompare(b.hotelName))
    .map(g => ({
      label: g.hotelName,
      ...sumStays(g.stays),
    }))

  const atlTotal = sumStays(stays.filter(s => ATL_DEPTS.has((s.crew?.department || '').toUpperCase())))
  const btlTotal = sumStays(stays.filter(s => !ATL_DEPTS.has((s.crew?.department || '').toUpperCase())))
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
              rows={atlRows}
              total={atlTotal}
              borderColor="#15803d"
            />

            {/* BTL Section */}
            <SectionTable
              title="BTL — Below The Line (Crew)"
              rows={btlRows}
              total={btlTotal}
              borderColor="#1d4ed8"
            />

            {/* Grand Total */}
            {stays.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px', border: '2px solid #0f2340', borderRadius: '10px', overflow: 'hidden' }}>
                  <tbody>
                    <TotRow
                      label="GRAND TOTAL"
                      row={grandTotal}
                      bold
                      bg="#0f2340"
                    />
                  </tbody>
                </table>
              </div>
            )}

            {/* Note */}
            <div style={{ marginTop: '20px', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px', color: '#94a3b8' }}>
              ℹ️ Only stays with cost data (Tot. W/O VAT) are included. ATL = CAST + PRODUCERS departments. All other departments = BTL.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
