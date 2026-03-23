import { useStore } from '../store'

const LEVELS = [
  { key: 'repo' as const, label: 'Repo' },
  { key: 'module' as const, label: 'Module' },
  { key: 'function' as const, label: 'Func' },
]

export function ZoomToolbar() {
  const zoomLevel = useStore((s) => s.zoomLevel)
  const setZoomLevel = useStore((s) => s.setZoomLevel)

  return (
    <div className="absolute top-5 right-6 z-10 flex gap-0">
      {LEVELS.map(({ key, label }) => {
        const isActive = zoomLevel === key
        return (
          <button
            key={key}
            onClick={() => setZoomLevel(key)}
            className={[
              'px-4 py-1.5 text-[11px] uppercase tracking-[0.12em] cursor-pointer border-none transition-all',
              isActive
                ? 'text-white bg-[#111] font-semibold'
                : 'text-[rgba(0,0,0,0.2)] bg-transparent font-normal hover:text-[rgba(0,0,0,0.5)]',
            ].join(' ')}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
