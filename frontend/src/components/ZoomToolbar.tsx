import { useStore } from '../store'

const LEVELS = [
  { key: 'repo' as const, label: 'Repo' },
  { key: 'module' as const, label: 'Module' },
  { key: 'function' as const, label: 'Function' },
]

export function ZoomToolbar() {
  const zoomLevel = useStore((s) => s.zoomLevel)
  const setZoomLevel = useStore((s) => s.setZoomLevel)

  return (
    <div className="absolute top-4 right-4 z-10 flex rounded-lg overflow-hidden border border-gray-700 bg-gray-900/90 backdrop-blur-sm shadow-lg">
      {LEVELS.map(({ key, label }) => {
        const isActive = zoomLevel === key
        return (
          <button
            key={key}
            onClick={() => setZoomLevel(key)}
            className={[
              'px-4 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800',
            ].join(' ')}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
