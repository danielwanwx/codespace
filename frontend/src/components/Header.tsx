import { useStore } from '../store'

export function Header({ repoName: _repoName }: { repoName: string }) {
  const graph = useStore((s) => s.graph)

  const symbolCount = graph?.nodes.filter((n) => n.type === 'function' || n.type === 'class').length ?? 0
  const edgeCount = graph?.edges.length ?? 0
  const moduleCount = graph?.nodes.filter((n) => n.type === 'module').length ?? 0

  return (
    <div className="h-[52px] flex items-center px-8 shrink-0 border-b border-[var(--panel-border)]">
      <span className="font-['Barlow_Condensed'] text-[18px] font-semibold tracking-[0.35em] uppercase text-[#111] mr-10">
        Codespace
      </span>

      {graph && (
        <div className="flex gap-6">
          <span className="text-[12px] text-[var(--text-label)]">
            <strong className="font-semibold text-[rgba(0,0,0,0.7)] mr-0.5">{symbolCount}</strong> symbols
          </span>
          <span className="text-[12px] text-[var(--text-label)]">
            <strong className="font-semibold text-[rgba(0,0,0,0.7)] mr-0.5">{edgeCount}</strong> edges
          </span>
          <span className="text-[12px] text-[var(--text-label)]">
            <strong className="font-semibold text-[rgba(0,0,0,0.7)] mr-0.5">{moduleCount}</strong> modules
          </span>
        </div>
      )}
    </div>
  )
}
