import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useStore } from '../store'
import type { GraphNode } from '../store'

export function SearchBar() {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const graph = useStore((s) => s.graph)
  const selectNode = useStore((s) => s.selectNode)
  const setFocusNodeId = useStore((s) => s.setFocusNodeId)

  const parentLabelMap = useMemo(() => {
    if (!graph) return new Map<string, string>()
    const map = new Map<string, string>()
    for (const node of graph.nodes) {
      map.set(node.id, node.label)
    }
    return map
  }, [graph])

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
      className="absolute top-4 left-5 z-10 w-60"
    >
      {/* Search input — underline style matching preview.html */}
      <div className="flex items-center gap-2 pb-1.5 border-b border-[rgba(0,0,0,0.1)] focus-within:border-[rgba(0,0,0,0.25)] transition-colors">
        <svg className="w-3.5 h-3.5 stroke-[rgba(0,0,0,0.25)] fill-none shrink-0" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </svg>
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
          placeholder="Search symbols..."
          className="w-full text-[13px] bg-transparent text-[#111] border-none placeholder-[rgba(0,0,0,0.25)] focus:outline-none"
        />
      </div>

      {/* Results dropdown */}
      {isOpen && query.trim() && results.length > 0 && (
        <div className="max-h-[280px] overflow-y-auto mt-1 bg-white border-t border-[var(--panel-border)]">
          {results.map((node) => {
            const parentLabel = node.parent
              ? parentLabelMap.get(node.parent)
              : null
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => handleSelect(node.id)}
                className="w-full text-left flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-[rgba(0,0,0,0.03)] transition-colors"
              >
                <span className="text-[9px] font-semibold uppercase tracking-[0.06em] text-[rgba(0,0,0,0.25)] w-6 shrink-0">
                  {node.type === 'class' ? 'cls' : node.type === 'module' ? 'mod' : 'fn'}
                </span>
                <span className="text-[13px] font-medium text-[#222] flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  {node.label}
                </span>
                {parentLabel && (
                  <span className="text-[11px] font-light text-[rgba(0,0,0,0.3)]">
                    {parentLabel}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {isOpen && query.trim() && results.length === 0 && (
        <div className="mt-1 px-3 py-2 text-[12px] text-[rgba(0,0,0,0.25)]">
          No matching nodes
        </div>
      )}
    </div>
  )
}
