'use client'
import { useDraggable } from '@dnd-kit/core'
import { COLUMNS_CATALOG } from '../../../../lib/listColumnsCatalog'

const VEHICLE_COLS = ['sign_code', 'vehicle_id', 'driver_name', 'driver_phone', 'driver_name_phone_2lines']

export default function TripGroupRow({ group, locsMap, sections, moveMenuOpenFor, setMoveMenuOpenFor, onAssign, paxByTripRow, columnsConfig, gridTemplate, driverPhonesByName, vehicleMap }) {
  const dragId = 'trip::' + group.group_key + '::' + (group.vehicle_id || 'none')
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: { group },
  })
  const ctx = { locsMap, paxByTripRow, driverPhonesByName, vehicleMap }
  const isMultiLeg = group.trip_group_id && group.rows.length > 1
  const moveKey = group.group_key + '::' + (group.vehicle_id || 'none')

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.4 : 1, cursor: 'grab', pageBreakInside: 'avoid', breakInside: 'avoid' }}
    >
      {group.rows.map((row, legIndex) => {
        const isFirst = legIndex === 0
        const isLast = legIndex === group.rows.length - 1
        return (
          <div
            key={row.id || legIndex}
            className="trip-row"
            style={{
              display: 'grid',
              gridTemplateColumns: gridTemplate,
              gap: '0 8px',
              alignItems: 'flex-start',
              padding: isFirst ? '8px 14px' : '3px 14px 6px',
              borderBottom: isLast ? '1px solid #e2e8f0' : '1px dashed #f1f5f9',
              background: 'white',
              pageBreakInside: 'avoid',
              fontSize: '12px',
              lineHeight: 1.4,
              position: 'relative',
            }}
          >
            {columnsConfig.map((col, colIdx) => {
              const def = COLUMNS_CATALOG[col.source_field]
              const isVehicleCol = VEHICLE_COLS.includes(col.source_field)
              const hideCol = isMultiLeg && !isFirst && isVehicleCol
              const isLastCol = colIdx === columnsConfig.length - 1

              // Per i renderer che supportano legIndex, passa il parametro
              const content = hideCol
                ? null
                : def
                  ? def.render({ ...group, _currentRow: row }, ctx, legIndex)
                  : <span style={{ color: '#dc2626', fontSize: 10 }}>?{col.source_field}</span>

              return (
                <div
                  key={col.id}
                  style={{
                    minWidth: 0,
                    position: isLastCol ? 'relative' : 'static',
                    visibility: hideCol ? 'hidden' : 'visible',
                  }}
                >
                  {content}
                  {isLastCol && isFirst && (
                    <>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          setMoveMenuOpenFor(moveMenuOpenFor === moveKey ? null : moveKey)
                        }}
                        className="no-print"
                        style={{
                          marginTop: '4px',
                          padding: '2px 6px', borderRadius: '4px',
                          border: '1px solid #e2e8f0', background: 'white',
                          fontSize: '9px', fontWeight: '600', color: '#64748b',
                          cursor: 'pointer',
                        }}
                      >
                        Move to
                      </button>
                      {moveMenuOpenFor === moveKey && (
                        <>
                          <div
                            onClick={() => setMoveMenuOpenFor(null)}
                            className="no-print"
                            style={{ position: 'fixed', inset: 0, zIndex: 60 }}
                          />
                          <div className="no-print" style={{
                            position: 'absolute', top: '100%', right: 0, marginTop: '2px',
                            background: 'white', border: '1px solid #cbd5e1',
                            borderRadius: '7px', padding: '4px',
                            minWidth: '180px', zIndex: 61,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            textAlign: 'left',
                          }}>
                            {sections.length === 0 ? (
                              <div style={{ padding: '6px 10px', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                                No sections yet. Use &quot;Manage sections&quot; first.
                              </div>
                            ) : sections.map(s => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => onAssign(group, s.id)}
                                style={{
                                  display: 'block', width: '100%',
                                  padding: '5px 10px', textAlign: 'left',
                                  background: 'transparent', border: 'none',
                                  fontSize: '12px',
                                  fontWeight: s.parent_id ? '500' : '700',
                                  color: '#0f172a',
                                  paddingLeft: s.parent_id ? '20px' : '10px',
                                  cursor: 'pointer',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                {s.parent_id ? s.name : s.name.toUpperCase()}
                              </button>
                            ))}
                            <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '4px', paddingTop: '4px' }}>
                              <button
                                type="button"
                                onClick={() => onAssign(group, null)}
                                style={{
                                  display: 'block', width: '100%',
                                  padding: '5px 10px', textAlign: 'left',
                                  background: 'transparent', border: 'none',
                                  fontSize: '11px', color: '#dc2626', cursor: 'pointer',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                Unassign
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
