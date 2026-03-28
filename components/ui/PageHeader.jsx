/**
 * PageHeader — sub-toolbar sticky uniforme sotto la Navbar
 *
 * Props:
 *   left    — ReactNode — contenuto lato sinistro (titolo, date nav, badge contatori)
 *   right   — ReactNode — contenuto lato destro (bottoni CTA, azioni)
 *   className — string opzionale per override
 */
export function PageHeader({ left, right, className = '' }) {
  return (
    <div
      className={
        'bg-white border-b border-slate-200 px-6 h-[52px] flex items-center justify-between gap-3 sticky top-[52px] z-20 ' +
        className
      }
    >
      <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
        {left}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {right}
      </div>
    </div>
  )
}
