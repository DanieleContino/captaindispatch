'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { fmtDate } from '../../../../lib/tripUtils'

// ─── LinkedMovementChip ───────────────────────────────────────
function LinkedMovementChip({ movementId }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!movementId) return
    fetch(`/api/crew-notes/linked?type=movement&id=${movementId}`)
      .then(r => r.json())
      .then(json => { if (json.data) setData(json.data) })
      .catch(() => {})
  }, [movementId])
  if (!data) return null
  const dirIcon  = data.direction === 'IN' ? '↓' : '↑'
  const dirColor = data.direction === 'IN' ? '#15803d' : '#b45309'
  const typeIcon = data.travel_type === 'FLIGHT' ? '✈️' : data.travel_type === 'TRAIN' ? '🚂' : '🚐'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', background: '#e0f2fe', border: '1px solid #7dd3fc', borderRadius: '5px', padding: '3px 8px', fontSize: '11px' }}>
      <span>{typeIcon}</span>
      {data.travel_number && <span style={{ fontWeight: '700', color: '#0369a1' }}>{data.travel_number}</span>}
      {data.from_location && <span style={{ color: '#0f172a' }}>{data.from_location}</span>}
      {data.from_time     && <span style={{ color: '#475569' }}>{String(data.from_time).slice(0,5)}</span>}
      {(data.from_location || data.from_time) && (data.to_location || data.to_time) && <span style={{ color: '#94a3b8' }}>→</span>}
      {data.to_location   && <span style={{ fontWeight: '700', color: '#0f172a' }}>{data.to_location}</span>}
      {data.to_time       && <span style={{ color: '#475569' }}>{String(data.to_time).slice(0,5)}</span>}
      {data.travel_date   && <span style={{ color: '#64748b', borderLeft: '1px solid #7dd3fc', paddingLeft: '5px' }}>{data.travel_date}</span>}
      <span style={{ fontWeight: '700', color: dirColor, borderLeft: '1px solid #7dd3fc', paddingLeft: '5px' }}>{dirIcon} {data.direction}</span>
    </div>
  )
}

// ─── AssignCtxTravelNotes ─────────────────────────────────────
export function AssignCtxTravelNotes({ crewId, productionId }) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!crewId || !productionId) return
    fetch(`/api/crew-notes?crew_id=${crewId}&production_id=${productionId}`)
      .then(r => r.json())
      .then(json => { setNotes(json.notes || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [crewId, productionId])

  if (loading) return (
    <div style={{ padding: '10px 12px', fontSize: '11px', color: '#94a3b8' }}>Loading travel notes…</div>
  )
  if (notes.length === 0) return (
    <div style={{ padding: '10px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
      💬 No notes for this crew member
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {notes.map(n => {
        const hasMovement = !!n.linked_movement_id
        return (
          <div key={n.id} style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '8px 10px' }}>
            {hasMovement && <LinkedMovementChip movementId={n.linked_movement_id} />}
            <div style={{ fontSize: '12px', color: '#0f172a', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: hasMovement ? '4px' : 0 }}>
              {n.content}
            </div>
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
              {n.author_name} · {n.author_role}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── CrewInfoModal ────────────────────────────────────────────
export default function CrewInfoModal({ crew, productionId, locations, onClose, overlayRight = 0 }) {
  const [details,   setDetails]   = useState(null)
  const [movements, setMovements] = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (!crew?.id || !productionId) return
    setLoading(true)
    Promise.all([
      supabase.from('crew')
        .select('uuid, display_id, full_name, role, department, phone, email, hotel_id, arrival_date, departure_date, hotel:hotel_id(id, name)')
        .eq('uuid', crew.uuid)
        .single(),
      supabase.from('travel_movements')
        .select('travel_date, direction, travel_type, from_location, from_time, to_location, to_time, travel_number, needs_transport, pickup_dep, pickup_arr')
        .eq('crew_id', crew.id)
        .eq('production_id', productionId)
        .order('travel_date', { ascending: true }),
    ]).then(([crewRes, movRes]) => {
      setDetails(crewRes.data)
      setMovements(movRes.data || [])
      setLoading(false)
    })
  }, [crew?.id, productionId])

  const locsById  = Object.fromEntries((locations || []).map(l => [l.id, l.name]))
  const hotelName = details?.hotel?.name || (details?.hotel_id ? (locsById[details.hotel_id] || details.hotel_id) : '–')
  if (!crew) return null

  return (
    <>
      <div style={{ position: 'fixed', top: 0, left: 0, bottom: 0, right: overlayRight, zIndex: 200, background: 'rgba(15,35,64,0.5)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 201, width: 'calc(100% - 40px)', maxWidth: '480px', background: 'white', borderRadius: '14px', boxShadow: '0 8px 40px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ background: '#0f2340', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '900', color: 'white' }}>{crew.full_name}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              {[details?.role, details?.department].filter(Boolean).join(' · ') || crew.department || ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '16px', lineHeight: 1, borderRadius: '6px', padding: '4px 8px' }}>✕</button>
        </div>
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Loading…</div>
        ) : (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {details?.phone && <div style={{ fontSize: '13px', color: '#0f172a' }}>📞 <a href={`tel:${details.phone}`} style={{ color: '#0f172a', textDecoration: 'none' }}>{details.phone}</a></div>}
              {details?.email && <div style={{ fontSize: '13px', color: '#0f172a' }}>✉️ <a href={`mailto:${details.email}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{details.email}</a></div>}
              {!details?.phone && !details?.email && <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>No contact info</div>}
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontSize: '13px', color: '#0f172a' }}>🏨 <strong>{hotelName}</strong></div>
              {details?.arrival_date   && <div style={{ fontSize: '12px', color: '#64748b' }}>🏨 Check-in: <strong>{fmtDate(details.arrival_date)}</strong></div>}
              {details?.departure_date && <div style={{ fontSize: '12px', color: '#64748b' }}>🏁 Check-out: <strong>{fmtDate(details.departure_date)}</strong></div>}
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '6px' }}>✈️ Travel Movements</div>
              {movements.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: '8px' }}>No travel movements found</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {movements.map((m, i) => {
                    const travelTypeEmoji = m.travel_type === 'FLIGHT' ? '✈️' : m.travel_type === 'TRAIN' ? '🚂' : m.travel_type === 'GROUND' ? '🚐' : ''
                    const pickupBadges = [m.pickup_dep, m.pickup_arr].filter(v => v && ['OA','SELF','EMPIRE','BLACKLANE'].includes(v?.toUpperCase?.()))
                    return (
                      <div key={i} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '8px 10px', fontSize: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: '800', color: '#0f2340', fontVariantNumeric: 'tabular-nums' }}>{m.travel_date ? fmtDate(m.travel_date) : '–'}</span>
                          <span style={{ padding: '1px 6px', borderRadius: '999px', fontSize: '10px', fontWeight: '800', background: m.direction === 'IN' ? '#dcfce7' : '#fff7ed', color: m.direction === 'IN' ? '#15803d' : '#c2410c', border: '1px solid ' + (m.direction === 'IN' ? '#86efac' : '#fdba74') }}>
                            {m.direction === 'IN' ? '↓ IN' : '↑ OUT'}
                          </span>
                          <span style={{ fontSize: '11px', fontWeight: '700', color: '#374151' }}>{travelTypeEmoji} {m.travel_type || 'OA'}</span>
                          {m.travel_number && <span style={{ fontWeight: '700', color: '#2563eb', fontSize: '11px' }}>{m.travel_number}</span>}
                        </div>
                        <div style={{ marginTop: '4px', color: '#374151', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                          <span style={{ color: '#64748b' }}>{m.from_location || '–'}</span>
                          {m.from_time && <span style={{ color: '#94a3b8', fontVariantNumeric: 'tabular-nums', fontSize: '11px' }}>({m.from_time.slice(0, 5)})</span>}
                          <span style={{ color: '#cbd5e1' }}>→</span>
                          <span style={{ fontWeight: '700', color: '#0f172a' }}>{m.to_location || '–'}</span>
                          {m.to_time && <span style={{ color: '#94a3b8', fontVariantNumeric: 'tabular-nums', fontSize: '11px' }}>({m.to_time.slice(0, 5)})</span>}
                        </div>
                        {(m.needs_transport || pickupBadges.length > 0) && (
                          <div style={{ marginTop: '5px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                            {m.needs_transport && <span style={{ padding: '2px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: '800', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd' }}>🚐 transport</span>}
                            {pickupBadges.map((b, bi) => <span key={bi} style={{ padding: '2px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: '700', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>{b.toUpperCase()}</span>)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
