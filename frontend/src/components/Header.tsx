import { useStore } from '../store'

export function Header({ repoName }: { repoName: string }) {
  const graph = useStore((s) => s.graph)

  const symbolCount = graph?.nodes.filter((n) => n.type === 'function' || n.type === 'class').length ?? 0
  const edgeCount = graph?.edges.length ?? 0
  const moduleCount = graph?.nodes.filter((n) => n.type === 'module').length ?? 0

  return (
    <div className="h-10 glass-panel border-t-0 border-x-0 flex items-center px-5 shrink-0 gap-3">
      <span className="text-xs font-medium tracking-[0.15em] uppercase text-[var(--text-primary)]">
        CODESPACE
      </span>
      <span className="text-[var(--text-muted)]">&middot;</span>
      <span className="text-xs font-medium tracking-[0.15em] uppercase text-[var(--accent-cyan)]">
        {repoName || '\u2014'}
      </span>

      {graph && (
        <>
          <span className="text-[var(--text-muted)]">&middot;</span>
          <span className="text-[11px] tracking-[0.1em] uppercase text-[var(--text-secondary)]">
            {symbolCount} SYMBOLS
          </span>
          <span className="text-[var(--text-muted)]">&middot;</span>
          <span className="text-[11px] tracking-[0.1em] uppercase text-[var(--text-secondary)]">
            {edgeCount} EDGES
          </span>
          <span className="text-[var(--text-muted)]">&middot;</span>
          <span className="text-[11px] tracking-[0.1em] uppercase text-[var(--text-secondary)]">
            {moduleCount} MODULES
          </span>
        </>
      )}
    </div>
  )
}
