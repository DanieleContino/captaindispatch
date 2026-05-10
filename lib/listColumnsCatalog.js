'use client'

// ─── Helpers ─────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0')

function minToHHMM(min) {
  if (min === null || min === undefined) return '–'
  const m = ((min % 1440) + 1440) % 1440
  return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60)
}

function formatLastnameInitial(fullName) {
  if (!fullName) return ''
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  const last = parts[parts.length - 1]
  const initial = parts[0][0].toUpperCase()
  return last + ' ' + initial + '.'
}

function buildMapsUrl(loc) {
  if (!loc) return null
  if (loc.lat != null && loc.lng != null) {
    return 'https://www.google.com/maps?q=' + loc.lat + ',' + loc.lng
  }
  const text = loc.name || loc.default_pickup_point
  if (!text) return null
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(text)
}

// ─── Render context ───────────────────────────────────────────
// Each renderer receives:
//   group      — the trip group { trip_id, vehicle_id, driver_name, rows[], ... }
//   ctx        — { locsMap, paxByTripRow }
//
// Returns a JSX element (or null/string).

// ─── CATALOG ──────────────────────────────────────────────────
// Each entry:
//   key           — machine identifier stored in DB column transport_list_columns.source_field
//   label         — human-readable name for the editor sidebar
//   category      — grouping in the editor's field picker
//   defaultWidth  — sensible default width when added
//   render(group, ctx) — returns JSX
export const COLUMNS_CATALOG = {

  // ── Vehicle ──
  vehicle_id: {
    label: 'Vehicle ID',
    category: 'Vehicle',
    defaultWidth: '100px',
    render: (group) => (
      <span style={{ fontWeight: 700 }}>{group.vehicle_id || '—'}</span>
    ),
  },
  vehicle_capacity: {
    label: 'Vehicle capacity',
    category: 'Vehicle',
    defaultWidth: '60px',
    render: (group) => (
      <span>{group.capacity ?? '—'}</span>
    ),
  },
  sign_code: {
    label: 'Sign code',
    category: 'Vehicle',
    defaultWidth: '90px',
    render: (group) => (
      <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{group.sign_code || '—'}</span>
    ),
  },

  // ── Driver ──
  driver_name: {
    label: 'Driver name',
    category: 'Driver',
    defaultWidth: '120px',
    render: (group) => (
      <span style={{ fontWeight: 600 }}>{group.driver_name || '—'}</span>
    ),
  },
  driver_phone: {
    label: 'Driver phone',
    category: 'Driver',
    defaultWidth: '120px',
    render: (group, ctx) => {
      const phone = ctx?.driverPhonesByName?.[group.driver_name] || null
      return <span style={{ fontSize: '11px' }}>{phone || '—'}</span>
    },
  },
  driver_name_phone_2lines: {
    label: 'Driver: name + phone (2 lines)',
    category: 'Driver',
    defaultWidth: '130px',
    render: (group, ctx) => {
      const phone = ctx?.driverPhonesByName?.[group.driver_name] || null
      return (
        <div>
          <div style={{ fontWeight: 600, color: '#0f172a' }}>{group.driver_name || '—'}</div>
          {phone && <div style={{ fontSize: '10px', color: '#64748b', marginTop: 2 }}>{phone}</div>}
        </div>
      )
    },
  },

  // ── Time ──
  pickup_min_hhmm: {
    label: 'Pickup time (HH:MM)',
    category: 'Time',
    defaultWidth: '70px',
    render: (group) => (
      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {minToHHMM(group.pickup_min ?? group.call_min)}
      </span>
    ),
  },
  call_min_hhmm: {
    label: 'Call time (HH:MM)',
    category: 'Time',
    defaultWidth: '70px',
    render: (group) => (
      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {minToHHMM(group.call_min)}
      </span>
    ),
  },
  pickup_call_2lines: {
    label: 'Pickup + call (2 lines)',
    category: 'Time',
    defaultWidth: '70px',
    render: (group) => {
      const pickup = minToHHMM(group.pickup_min ?? group.call_min)
      const call   = minToHHMM(group.call_min)
      const showCall = call !== pickup && call !== '–'
      return (
        <div style={{ fontVariantNumeric: 'tabular-nums' }}>
          <div style={{ fontWeight: 700, fontSize: '13px' }}>{pickup}</div>
          {showCall && <div style={{ fontSize: '10px', color: '#64748b', marginTop: 2 }}>call {call}</div>}
        </div>
      )
    },
  },

  // ── Trip core ──
  trip_id: {
    label: 'Trip ID',
    category: 'Trip',
    defaultWidth: '70px',
    render: (group) => (
      <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700 }}>
        {group.trip_id || '—'}
      </span>
    ),
  },
  status: {
    label: 'Status',
    category: 'Trip',
    defaultWidth: '90px',
    render: (group) => {
      const s = group.rows?.[0]?.status || group.status || 'PLANNED'
      const colors = {
        PLANNED:   { bg: '#f1f5f9', color: '#475569' },
        BUSY:      { bg: '#fefce8', color: '#a16207' },
        DONE:      { bg: '#f0fdf4', color: '#15803d' },
        CANCELLED: { bg: '#fef2f2', color: '#dc2626' },
      }
      const c = colors[s] || colors.PLANNED
      return (
        <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: c.bg, color: c.color }}>
          {s}
        </span>
      )
    },
  },
  service_type: {
    label: 'Service type',
    category: 'Trip',
    defaultWidth: '110px',
    render: (group) => (
      <span style={{ fontSize: '11px' }}>{group.rows?.[0]?.service_type || '—'}</span>
    ),
  },
  notes: {
    label: 'Notes',
    category: 'Trip',
    defaultWidth: '160px',
    render: (group) => {
      const notes = group.rows?.[0]?.notes
      return notes
        ? <span style={{ fontSize: '10.5px', color: '#475569' }}>{notes}</span>
        : <span style={{ color: '#cbd5e1' }}>—</span>
    },
  },
  flight_no: {
    label: 'Flight / Train number',
    category: 'Trip',
    defaultWidth: '90px',
    render: (group) => {
      const f = group.flight_no || group.rows?.[0]?.flight_no
      return f
        ? <span style={{ fontWeight: 600, color: '#1d4ed8', fontSize: '11px' }}>{f}</span>
        : <span style={{ color: '#cbd5e1' }}>—</span>
    },
  },

  // ── Counts ──
  pax_count: {
    label: 'Pax count',
    category: 'Counts',
    defaultWidth: '50px',
    render: (group) => (
      <span style={{ fontWeight: 700 }}>{group.rows?.reduce((s, r) => s + (r.pax_count || 0), 0) || 0}</span>
    ),
  },
  pax_capacity_combined: {
    label: 'Pax / Capacity (e.g. 5/8)',
    category: 'Counts',
    defaultWidth: '60px',
    render: (group) => {
      const pax = group.rows?.reduce((s, r) => s + (r.pax_count || 0), 0) || 0
      return (
        <span style={{ fontWeight: 700 }}>
          {pax}{group.capacity ? '/' + group.capacity : ''}
        </span>
      )
    },
  },

  // ── Passengers ──
  passengers_lastname_role: {
    label: 'Passengers: Cognome I. + role',
    category: 'Passengers',
    defaultWidth: '1fr',
    render: (group, ctx) => {
      const enriched = group.rows.flatMap(r => {
        const crewList = (ctx?.paxByTripRow && ctx.paxByTripRow[r.id]) || []
        if (crewList.length > 0) {
          return crewList.map(c => ({ name: c.full_name, role: c.role || c.department || null }))
        }
        if (r.passenger_list) {
          return r.passenger_list.split(',').map(s => s.trim()).filter(Boolean).map(n => ({ name: n, role: null }))
        }
        return []
      })
      if (enriched.length === 0) {
        return <span style={{ color: '#cbd5e1', fontStyle: 'italic', fontSize: 11 }}>no pax</span>
      }
      return (
        <div>
          {enriched.map((p, i) => (
            <div key={i} style={{ fontSize: '11.5px', lineHeight: 1.45 }}>
              <span style={{ color: '#0f172a', fontWeight: 500 }}>{formatLastnameInitial(p.name)}</span>
              {p.role && <span style={{ color: '#64748b' }}> · {p.role}</span>}
            </div>
          ))}
        </div>
      )
    },
  },
  passengers_fullname_only: {
    label: 'Passengers: full name only',
    category: 'Passengers',
    defaultWidth: '1fr',
    render: (group, ctx) => {
      const names = group.rows.flatMap(r => {
        const crewList = (ctx?.paxByTripRow && ctx.paxByTripRow[r.id]) || []
        if (crewList.length > 0) return crewList.map(c => c.full_name)
        if (r.passenger_list) return r.passenger_list.split(',').map(s => s.trim()).filter(Boolean)
        return []
      })
      if (names.length === 0) {
        return <span style={{ color: '#cbd5e1', fontStyle: 'italic', fontSize: 11 }}>no pax</span>
      }
      return (
        <div>
          {names.map((n, i) => (
            <div key={i} style={{ fontSize: '11.5px', lineHeight: 1.45, color: '#0f172a' }}>{n}</div>
          ))}
        </div>
      )
    },
  },

  // ── Locations: Pickup ──
  pickup_name: {
    label: 'Pickup: name only',
    category: 'Pickup',
    defaultWidth: '130px',
    render: (group, ctx) => {
      const loc = ctx?.locsMap?.[group.rows?.[0]?.pickup_id]
      const name = (typeof loc === 'object' ? loc?.name : loc) || group.rows?.[0]?.pickup_id || '—'
      return <span style={{ fontWeight: 600 }}>{name}</span>
    },
  },
  pickup_name_address: {
    label: 'Pickup: name + address (2 lines)',
    category: 'Pickup',
    defaultWidth: '160px',
    render: (group, ctx) => {
      const loc = ctx?.locsMap?.[group.rows?.[0]?.pickup_id]
      const name = (typeof loc === 'object' ? loc?.name : loc) || group.rows?.[0]?.pickup_id || '—'
      const addr = typeof loc === 'object' ? (loc?.pickup_point || loc?.default_pickup_point) : null
      return (
        <div>
          <div style={{ fontWeight: 600, color: '#0f172a' }}>{name}</div>
          {addr && <div style={{ fontSize: '10px', color: '#64748b', marginTop: 2 }}>{addr}</div>}
        </div>
      )
    },
  },
  pickup_maps_link_compact: {
    label: 'Pickup: maps link (compact print)',
    category: 'Pickup',
    defaultWidth: '90px',
    render: (group, ctx) => {
      const loc = ctx?.locsMap?.[group.rows?.[0]?.pickup_id]
      const url = buildMapsUrl(typeof loc === 'object' ? loc : { name: loc })
      if (!url) return <span style={{ color: '#cbd5e1' }}>—</span>
      return (
        <a href={url} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: '11px', color: '#1d4ed8', textDecoration: 'none' }}>
          🗺 Map
        </a>
      )
    },
  },
  pickup_maps_link_full: {
    label: 'Pickup: maps link (URL printed)',
    category: 'Pickup',
    defaultWidth: '180px',
    render: (group, ctx) => {
      const loc = ctx?.locsMap?.[group.rows?.[0]?.pickup_id]
      const url = buildMapsUrl(typeof loc === 'object' ? loc : { name: loc })
      if (!url) return <span style={{ color: '#cbd5e1' }}>—</span>
      return (
        <div>
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '11px', color: '#1d4ed8', textDecoration: 'none' }}>
            🗺 Map
          </a>
          <div className="show-only-on-print" style={{ fontSize: '8px', color: '#94a3b8', marginTop: 2, wordBreak: 'break-all', lineHeight: 1.3 }}>
            {url}
          </div>
        </div>
      )
    },
  },

  // ── Locations: Dropoff ──
  dropoff_name: {
    label: 'Dropoff: name only',
    category: 'Dropoff',
    defaultWidth: '130px',
    render: (group, ctx) => {
      const last = group.rows?.[group.rows.length - 1]
      const loc = ctx?.locsMap?.[last?.dropoff_id]
      const name = (typeof loc === 'object' ? loc?.name : loc) || last?.dropoff_id || '—'
      return <span style={{ fontWeight: 600 }}>{name}</span>
    },
  },
  dropoff_name_address: {
    label: 'Dropoff: name + address (2 lines)',
    category: 'Dropoff',
    defaultWidth: '160px',
    render: (group, ctx) => {
      const last = group.rows?.[group.rows.length - 1]
      const loc = ctx?.locsMap?.[last?.dropoff_id]
      const name = (typeof loc === 'object' ? loc?.name : loc) || last?.dropoff_id || '—'
      const addr = typeof loc === 'object' ? (loc?.pickup_point || loc?.default_pickup_point) : null
      return (
        <div>
          <div style={{ fontWeight: 600, color: '#0f172a' }}>{name}</div>
          {addr && <div style={{ fontSize: '10px', color: '#64748b', marginTop: 2 }}>{addr}</div>}
        </div>
      )
    },
  },
  dropoff_name_flight: {
    label: 'Dropoff: name + flight info',
    category: 'Dropoff',
    defaultWidth: '160px',
    render: (group, ctx) => {
      const last = group.rows?.[group.rows.length - 1]
      const loc = ctx?.locsMap?.[last?.dropoff_id]
      const name = (typeof loc === 'object' ? loc?.name : loc) || last?.dropoff_id || '—'
      const flight = group.flight_no || last?.flight_no
      const arrTime = group.arr_time ? group.arr_time.slice(0, 5) : null
      return (
        <div>
          <div style={{ fontWeight: 600, color: '#0f172a' }}>{name}</div>
          {(flight || arrTime) && (
            <div style={{ fontSize: '10px', color: '#1d4ed8', fontWeight: 600, marginTop: 2 }}>
              {flight || ''}{flight && arrTime ? ' · ' : ''}{arrTime || ''}
            </div>
          )}
        </div>
      )
    },
  },
  dropoff_maps_link_compact: {
    label: 'Dropoff: maps link (compact print)',
    category: 'Dropoff',
    defaultWidth: '90px',
    render: (group, ctx) => {
      const last = group.rows?.[group.rows.length - 1]
      const loc = ctx?.locsMap?.[last?.dropoff_id]
      const url = buildMapsUrl(typeof loc === 'object' ? loc : { name: loc })
      if (!url) return <span style={{ color: '#cbd5e1' }}>—</span>
      return (
        <a href={url} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: '11px', color: '#1d4ed8', textDecoration: 'none' }}>
          🗺 Map
        </a>
      )
    },
  },
  dropoff_maps_link_full: {
    label: 'Dropoff: maps link (URL printed)',
    category: 'Dropoff',
    defaultWidth: '180px',
    render: (group, ctx) => {
      const last = group.rows?.[group.rows.length - 1]
      const loc = ctx?.locsMap?.[last?.dropoff_id]
      const url = buildMapsUrl(typeof loc === 'object' ? loc : { name: loc })
      if (!url) return <span style={{ color: '#cbd5e1' }}>—</span>
      return (
        <div>
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '11px', color: '#1d4ed8', textDecoration: 'none' }}>
            🗺 Map
          </a>
          <div className="show-only-on-print" style={{ fontSize: '8px', color: '#94a3b8', marginTop: 2, wordBreak: 'break-all', lineHeight: 1.3 }}>
            {url}
          </div>
        </div>
      )
    },
  },
}

// ─── Captain Preset ───────────────────────────────────────────
// The 6 default columns inserted when the user clicks "Captain Preset"
// in the Columns editor sidebar.
export const CAPTAIN_PRESET = [
  { source_field: 'vehicle_id',                  header_label: 'Vehicle',    width: '110px', display_order: 10 },
  { source_field: 'driver_name_phone_2lines',    header_label: 'Driver',     width: '130px', display_order: 20 },
  { source_field: 'pickup_call_2lines',          header_label: 'Time',       width: '70px',  display_order: 30 },
  { source_field: 'passengers_lastname_role',    header_label: 'Passengers', width: '1fr',   display_order: 40 },
  { source_field: 'pickup_name_address',         header_label: 'From',       width: '160px', display_order: 50 },
  { source_field: 'dropoff_name_flight',         header_label: 'To',         width: '160px', display_order: 60 },
]

// ─── Editor field picker structure ────────────────────────────
// Used by the Columns editor sidebar to group fields by category.
export function getCatalogByCategory() {
  const out = {}
  for (const [key, def] of Object.entries(COLUMNS_CATALOG)) {
    if (!out[def.category]) out[def.category] = []
    out[def.category].push({ key, label: def.label, defaultWidth: def.defaultWidth })
  }
  return out
}
