/**
 * DataTable — wrapper tabella con colonne fisse via CSS custom property
 *
 * Props:
 *   columns   — Array<{ key: string, label: string, width: string }>
 *               Stesso array passato a TableHeader — garantisce allineamento perfetto
 *   children  — ReactNode — le righe (es. componenti TripRow, VehicleRow…)
 *   style     — object opzionale — override stile wrapper
 *   className — string opzionale
 *
 * Il wrapper espone `--col-template` come CSS custom property in modo che
 * le righe figlie possano usarla senza importare l'array columns:
 *
 *   <div style={{ gridTemplateColumns: 'var(--col-template)' }}>
 *
 * Uso tipico:
 *   const COLS = [
 *     { key: 'time',    label: 'TIME',      width: '80px'  },
 *     { key: 'trip',    label: 'TRIP',       width: '130px' },
 *     { key: 'vehicle', label: 'VEHICLE',    width: '180px' },
 *     { key: 'route',   label: 'ROUTE',      width: '210px' },
 *     { key: 'pax',     label: 'PASSENGERS', width: '200px' },
 *   ]
 *
 *   <TableHeader columns={COLS} style={{ top: '100px' }} />
 *   <DataTable columns={COLS}>
 *     {rows.map(r => <TripRow key={r.id} ... />)}
 *   </DataTable>
 */
export function DataTable({ columns = [], children, style = {}, className = '' }) {
  const colTemplate = columns.map(c => c.width).join(' ')

  return (
    <div
      className={className}
      style={{
        background: 'white',
        // Esponi la stringa gridTemplateColumns come variabile CSS
        '--col-template': colTemplate,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/**
 * colTemplate — utility: ricava la stringa gridTemplateColumns da un array columns
 *
 * Uso nelle righe figlie (fuori da DataTable):
 *   import { colTemplate } from '@/components/ui/DataTable'
 *   <div style={{ display:'grid', gridTemplateColumns: colTemplate(COLS) }}>
 */
export function colTemplate(columns) {
  return columns.map(c => c.width).join(' ')
}
