import { useStore } from '../store'

const LEVELS = [
  { key: 'repo' as const, label: 'REPO' },
  { key: 'module' as const, label: 'MODULE' },
  { key: 'function' as const, label: 'FUNC' },
]

export function ZoomToolbar() {
  const zoomLevel = useStore((s) => s.zoomLevel)
  const setZoomLevel = useStore((s) => s.setZoomLevel)

  return (
    <div className="absolute top-4 right-4 z-10 flex flex-col gap-0 border border-[var(--panel-border)] bg-[rgba(24,31,34,0.9)] backdrop-blur-sm">
      {LEVELS.map(({ key, label }) => {
        const isActive = zoomLevel === key
        return (
          <button
            key={key}
            onClick={() => setZoomLevel(key)}
            className={[
              'px-3 py-2 text-[10px] font-medium uppercase tracking-[0.15em] transition-colors border-b border-[var(--panel-border)] last:border-b-0',
              isActive
                ? 'text-[var(--accent-cyan)] border-l-2 border-l-[var(--accent-cyan)] glow-cyan bg-[rgba(0,229,255,0.06)]'
                : 'text-[var(--text-muted)] border-l-2 border-l-transparent hover:text-[var(--text-primary)] hover:bg-[rgba(24,31,34,0.5)]',
            ].join(' ')}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
