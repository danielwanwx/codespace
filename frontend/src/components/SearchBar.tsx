import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useStore } from '../store'
import type { GraphNode } from '../store'

const TYPE_BADGE_COLORS: Record<string, string> = {
  module: 'bg-blue-600',
  function: 'bg-green-600',
  class: 'bg-purple-600',
  repo: 'bg-indigo-600',
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
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
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
          placeholder="Search nodes..."
          className="w-full pl-10 pr-3 py-2 text-sm bg-gray-800 text-white border border-gray-700 rounded-lg placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* Results dropdown */}
      {isOpen && query.trim() && results.length > 0 && (
        <ul className="mt-1 max-h-80 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 shadow-lg">
          {results.map((node) => {
            const parentLabel = node.parent
              ? parentLabelMap.get(node.parent)
              : null
            return (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(node.id)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors flex items-center gap-2"
                >
                  <span
                    className={`shrink-0 px-1.5 py-0.5 text-[10px] font-semibold uppercase rounded ${TYPE_BADGE_COLORS[node.type] ?? 'bg-gray-600'} text-white`}
                  >
                    {node.type}
                  </span>
                  <span className="truncate text-sm text-gray-100">
                    {node.label}
                  </span>
                  {parentLabel && (
                    <span className="ml-auto shrink-0 text-xs text-gray-500">
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
        <div className="mt-1 px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-500">
          No matching nodes
        </div>
      )}
    </div>
  )
}
