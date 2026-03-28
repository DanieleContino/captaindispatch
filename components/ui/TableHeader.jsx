/**
 * TableHeader — header colonne sticky per tabelle a griglia
 *
 * Props:
 *   columns   — Array<{ key: string, label: string, width: string }>
 *               Esempio: [{ key:'time', label:'TIME', width:'80px' }, ...]
 *   style     — object opzionale — override stile wrapper (es. top sticky)
 *   className — string opzionale
 *
 * Uso tipico:
 *   const COLS = [
 *     { key: 'time',      label: 'TIME',       width: '80px'  },
 *     { key: 'trip',      label: 'TRIP',        width: '130px' },
 *     { key: 'vehicle',   label: 'VEHICLE',     width: '180px' },
 *     { key: 'route',     label: 'ROUTE',       width: '210px' },
 *     { key: 'pax',       label: 'PASSENGERS',  width: '200px' },
 *   ]
 *   <TableHeader columns={COLS} style={{ top: '100px' }} />
 */
export function TableHeader({ columns = [], style = {}, className = '' }) {
  const gridTemplateColumns = columns.map(c => c.width).join(' ')

  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns,
        justifyContent: 'start',
        alignItems: 'center',
        padding: '0 14px 0 18px',
        height: '28px',
        gap: '10px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        fontSize: '10px',
        fontWeight: '800',
        color: '#94a3b8',
        letterSpacing: '0.06em',
        position: 'sticky',
        zIndex: 10,
        ...style,
      }}
    >
      {columns.map(col => (
        <div key={col.key}>{col.label}</div>
      ))}
    </div>
  )
}
