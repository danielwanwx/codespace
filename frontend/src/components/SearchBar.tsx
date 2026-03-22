import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useStore } from '../store'
import type { GraphNode } from '../store'

const TYPE_BADGE_COLORS: Record<string, string> = {
  module: 'border-l-[var(--accent-blue)]',
  function: 'border-l-[#81C784]',
  class: 'border-l-[#CE93D8]',
  repo: 'border-l-[var(--accent-cyan)]',
}

export function SearchBar() {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const graph = useStore((s) => s.graph)
  const selectNode = useStore((s) => s.selectNode)
  const setFocusNodeId = useStore((s) => s.setFocusNodeId)

  // Build a lookup map of node id -> parent label
  const parentLabelMap = useMemo(() => {
    if (!graph) return new Map<string, string>()
    const map = new Map<string, string>()
    for (const node of graph.nodes) {
      map.set(node.id, node.label)
    }
    return map
  }, [graph])

  // Fuzzy search: simple case-insensitive substring match on label and id
  const results = useMemo(() => {
    if (!graph || !query.trim()) return []
    const term = query.toLowerCase()
    return graph.nodes
      .filter(
        (n: GraphNode) =>
          n.label.toLowerCase().includes(term) ||
          n.id.toLowerCase().includes(term),
      )
      .slice(0, 10)
  }, [graph, query])

  const handleSelect = useCallback(
    (nodeId: string) => {
      selectNode(nodeId)
      setFocusNodeId(nodeId)
      setQuery('')
      setIsOpen(false)
    },
    [selectNode, setFocusNodeId],
  )

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        inputRef.current?.blur()
      } else if (e.key === 'Enter' && results.length > 0) {
        handleSelect(results[0].id)
      }
    },
    [results, handleSelect],
  )

  return (
    <div
      ref={containerRef}
      className="absolute top-4 left-4 z-10 w-72"
    >
      {/* Search input */}
      <div className="relative glass-panel flex items-center">
        <span className="pl-3 text-[var(--accent-cyan)] text-[13px] select-none shrink-0">&gt;_</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="SEARCH NODES..."
          className="w-full pl-2 pr-3 py-2 text-[13px] bg-transparent text-[var(--text-primary)] border-none placeholder-[var(--text-muted)] focus:outline-none placeholder:uppercase placeholder:tracking-[0.1em] placeholder:text-[11px]"
        />
      </div>

      {/* Results dropdown */}
      {isOpen && query.trim() && results.length > 0 && (
        <ul className="mt-1 max-h-80 overflow-y-auto glass-panel">
          {results.map((node) => {
            const parentLabel = node.parent
              ? parentLabelMap.get(node.parent)
              : null
            return (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(node.id)}
                  className="w-full text-left px-3 py-2 hover:bg-[rgba(0,229,255,0.06)] transition-colors flex items-center gap-2"
                >
                  <span
                    className={`shrink-0 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.1em] border-l-2 ${TYPE_BADGE_COLORS[node.type] ?? 'border-l-[var(--panel-border)]'} text-[var(--text-muted)] bg-[rgba(24,31,34,0.5)]`}
                  >
                    {node.type}
                  </span>
                  <span className="truncate text-[13px] text-[var(--text-primary)]">
                    {node.label}
                  </span>
                  {parentLabel && (
                    <span className="ml-auto shrink-0 text-[11px] text-[var(--text-muted)]">
                      {parentLabel}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* No results message */}
      {isOpen && query.trim() && results.length === 0 && (
        <div className="mt-1 px-3 py-2 glass-panel text-[12px] text-[var(--text-muted)] uppercase tracking-[0.1em]">
          No matching nodes
        </div>
      )}
    </div>
  )
}
