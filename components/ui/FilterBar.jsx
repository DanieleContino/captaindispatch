/**
 * FilterBar — wrapper flex per toolbar di filtri
 *
 * Props:
 *   left      — ReactNode — contenuto lato sinistro
 *   right     — ReactNode — contenuto lato destro
 *   className — string opzionale per override
 */
export function FilterBar({ left, right, className = '' }) {
  return (
    <div
      className={
        'bg-white border-b border-slate-200 px-6 h-[48px] flex items-center justify-between gap-3 ' +
        className
      }
    >
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        {left}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {right}
      </div>
    </div>
  )
}

/**
 * FilterPill — bottone pill toggle per filtri CLASS / STATUS
 *
 * Props:
 *   label    — string
 *   active   — boolean
 *   color    — { bg, color, border } — opzionale, usato quando active=true
 *   onClick  — fn
 *   className — string opzionale
 */
export function FilterPill({ label, active, color, onClick, className = '' }) {
  const activeStyle = active
    ? color
      ? { background: color.bg, color: color.color, borderColor: color.border }
      : { background: '#0f2340', color: 'white', borderColor: '#0f2340' }
    : { background: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }

  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 8px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: '700',
        cursor: 'pointer',
        border: '1px solid',
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        transition: 'background 0.1s, color 0.1s',
        ...activeStyle,
      }}
      className={className}
    >
      {label}
    </button>
  )
}

/**
 * FilterInput — input di ricerca testuale uniforme
 *
 * Props:
 *   value       — string
 *   onChange    — fn(e)
 *   placeholder — string
 *   className   — string opzionale
 *   style       — object opzionale
 */
export function FilterInput({ value, onChange, placeholder = 'Search…', className = '', style = {} }) {
  return (
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{
        padding: '4px 10px',
        border: '1px solid #e2e8f0',
        borderRadius: '7px',
        fontSize: '12px',
        color: '#0f172a',
        background: 'white',
        outline: 'none',
        ...style,
      }}
      className={className}
    />
  )
}
