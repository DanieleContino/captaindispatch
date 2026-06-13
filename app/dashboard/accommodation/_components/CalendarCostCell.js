'use client'

/**
 * CalendarCostCell.js
 * Renders a single cost cell or total cell in the Calendar view
 * based on a source_field key from accommodation_columns (view_type: calendar_cost).
 */

const cellSt = {
  padding: '5px 6px',
  fontSize: '10px',
  textAlign: 'right',
  fontFamily: 'monospace',
  color: '#374151',
  borderLeft: '1px solid #dbeafe',
  borderBottom: '1px solid #f1f5f9',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
}

const dash = <span style={{ color: '#e2e8f0' }}>—</span>

function fmtE(v) {
  return v > 0
    ? `€${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null
}

/**
 * Renders a <td> for a data row in renderStayRow.
 * computed = { rateNV, rateV, nv, tv, ct, nv_t, tv_t, vata, eciF, lcoF }
 */
export function renderCostCell(key, stay, computed, onExtrasClick, onEditRow) {
  const { rateNV, rateV, nv, tv, ct, nv_t, tv_t, vata, eciF, lcoF } = computed
  const extrasTotal = eciF + lcoF

  switch (key) {
    case 'cal_po':
      return (
        <td key={key} onClick={() => onEditRow && onEditRow(stay, 'po_number')}
          style={{ ...cellSt, color: '#0f2340', fontFamily: 'inherit', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.06)' }}
          onMouseLeave={e => { e.currentTarget.style.background = '' }}>
          {stay.po_number || dash}
        </td>
      )
    case 'cal_inv':
      return (
        <td key={key} onClick={() => onEditRow && onEditRow(stay, 'invoice_number')}
          style={{ ...cellSt, color: '#0f2340', fontFamily: 'inherit', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.06)' }}
          onMouseLeave={e => { e.currentTarget.style.background = '' }}>
          {stay.invoice_number || dash}
        </td>
      )
    case 'cal_rate_novat':
      return <td key={key} style={cellSt}>{fmtE(rateNV) || dash}</td>
    case 'cal_rate_vat':
      return <td key={key} style={{ ...cellSt, color: '#475569' }}>{fmtE(rateV) || dash}</td>
    case 'cal_tot_novat':
      return <td key={key} style={cellSt}>{fmtE(nv) || dash}</td>
    case 'cal_extras':
      return (
        <td
          key={key}
          onClick={() => { if (extrasTotal > 0) onExtrasClick(stay) }}
          style={{ ...cellSt, color: '#15803d', fontWeight: '800', cursor: extrasTotal > 0 ? 'pointer' : 'default' }}
          onMouseEnter={e => { if (extrasTotal > 0) e.currentTarget.style.background = 'rgba(21,128,61,0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.background = '' }}
        >
          {fmtE(extrasTotal) || dash}
        </td>
      )
    case 'cal_vat_amt':
      return <td key={key} style={{ ...cellSt, color: '#7c3aed' }}>{fmtE(vata) || dash}</td>
    case 'cal_tot_vat':
      return <td key={key} style={cellSt}>{fmtE(tv) || dash}</td>
    case 'cal_city_tax':
      return <td key={key} style={cellSt}>{fmtE(ct) || dash}</td>
    case 'cal_tot_novat_tax':
      return <td key={key} style={cellSt}>{fmtE(nv_t) || dash}</td>
    case 'cal_tot_vat_tax':
      return <td key={key} style={cellSt}>{fmtE(tv_t) || dash}</td>
    default:
      return <td key={key} style={cellSt}>{dash}</td>
  }
}

/**
 * Renders a <td> for a total row (subgroup, GRAN TOTAL hotel, GRAND TOTAL).
 * totals = { nv, tv, ct, extras }
 */
export function renderCostTotalCell(key, totals, style) {
  const { nv, tv, ct, extras } = totals
  const f = (v) => v > 0
    ? `€${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : ''

  switch (key) {
    case 'cal_po':
    case 'cal_inv':
    case 'cal_rate_novat':
    case 'cal_rate_vat':
      return <td key={key} style={style} />
    case 'cal_tot_novat':
      return <td key={key} style={style}>{f(nv)}</td>
    case 'cal_extras':
      return <td key={key} style={{ ...style, color: key === 'cal_extras' ? '#6ee7b7' : style.color }}>{f(extras)}</td>
    case 'cal_vat_amt':
      return <td key={key} style={{ ...style, color: '#a78bfa' }}>{f(tv - nv)}</td>
    case 'cal_tot_vat':
      return <td key={key} style={style}>{f(tv)}</td>
    case 'cal_city_tax':
      return <td key={key} style={style}>{f(ct)}</td>
    case 'cal_tot_novat_tax':
      return <td key={key} style={style}>{f(nv + ct)}</td>
    case 'cal_tot_vat_tax':
      return <td key={key} style={style}>{f(tv + ct)}</td>
    default:
      return <td key={key} style={style} />
  }
}
