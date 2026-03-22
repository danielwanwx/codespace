import { useState } from 'react'
import { useStore } from '../store'
import type { GraphNode, GraphEdge } from '../store'
import { explainFunction } from '../lib/llm'

/** Extract a short display name from a node's label (strip signature noise) */
function displayName(node: GraphNode): string {
  const name = node.semantic_label || node.label
  // For functions/classes, just show the identifier before the first '('
  const paren = name.indexOf('(')
  return paren > 0 ? name.slice(0, paren) : name
}

/** Resolve a qualified id to a short name: "repo::mod::func" -> "func" */
function shortName(qualifiedId: string): string {
  const parts = qualifiedId.split('::')
  return parts[parts.length - 1]
}

// --- Sub-components ---

function SectionDivider() {
  return <div className="border-t border-[var(--panel-border)]" style={{ opacity: 0.5 }} />
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-muted)] mb-2 pb-1 border-b border-[var(--panel-border)]" style={{ borderBottomWidth: '1px' }}>
      {children}
    </h3>
  )
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent-cyan)] transition-colors"
      aria-label="Close panel"
    >
      &times;
    </button>
  )
}

function DataField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="mb-1">
      <span className="text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">{label}</span>
      <div className="text-[14px] text-[var(--text-primary)]">{value}</div>
    </div>
  )
}

// --- Module / Cluster panel ---

function ModulePanel({ node, children, edges }: {
  node: GraphNode
  children: GraphNode[]
  edges: GraphEdge[]
}) {
  const path = (node.path as string) ?? ''
  const fileCount = (node.file_count as number) ?? 0
  const symbolCount = (node.symbol_count as number) ?? 0

  const functions = children.filter((c) => c.type === 'function')
  const classes = children.filter((c) => c.type === 'class')

  // Outgoing edges: this module is the source
  const outgoing = edges.filter((e) => e.source === node.id && e.target !== node.id)
  // Incoming edges: this module is the target
  const incoming = edges.filter((e) => e.target === node.id && e.source !== node.id)

  return (
    <>
      {/* Header */}
      <div className="px-5 pt-5 pb-3 pr-12">
        <h2 className="text-sm font-medium uppercase tracking-[0.15em] text-[var(--text-primary)] leading-tight">
          {node.semantic_label || node.label}
        </h2>
        {path && (
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{path}</p>
        )}
      </div>

      <SectionDivider />

      {/* Stats */}
      <div className="px-5 py-3 flex gap-4">
        <DataField label="files" value={fileCount} />
        <DataField label="symbols" value={symbolCount} />
      </div>

      <SectionDivider />

      {/* Functions list */}
      {functions.length > 0 && (
        <>
          <div className="px-5 py-3">
            <SectionHeader>Functions</SectionHeader>
            <ul className="space-y-0.5">
              {functions.map((fn) => (
                <FunctionListItem key={fn.id} node={fn} />
              ))}
            </ul>
          </div>
          <SectionDivider />
        </>
      )}

      {/* Classes list */}
      {classes.length > 0 && (
        <>
          <div className="px-5 py-3">
            <SectionHeader>Classes</SectionHeader>
            <ul className="space-y-0.5">
              {classes.map((cls) => (
                <li key={cls.id} className="text-[13px] text-[var(--text-secondary)] flex items-start gap-1.5 py-0.5">
                  <span className="text-[var(--accent-blue)] mt-0.5 shrink-0">&loz;</span>
                  <span>{displayName(cls)}</span>
                </li>
              ))}
            </ul>
          </div>
          <SectionDivider />
        </>
      )}

      {/* Connections */}
      {(outgoing.length > 0 || incoming.length > 0) && (
        <div className="px-5 py-3">
          <SectionHeader>Connections</SectionHeader>
          <ul className="space-y-0.5 text-[13px]">
            {outgoing.map((e, i) => (
              <li key={`out-${i}`} className="text-[var(--text-secondary)] flex items-start gap-1.5">
                <span className="text-[var(--accent-cyan)] shrink-0">&rarr;</span>
                <span>
                  <span>{shortName(e.target)}</span>
                  <span className="text-[var(--text-muted)] ml-1">({e.weight} call{e.weight !== 1 ? 's' : ''})</span>
                </span>
              </li>
            ))}
            {incoming.map((e, i) => (
              <li key={`in-${i}`} className="text-[var(--text-secondary)] flex items-start gap-1.5">
                <span className="text-[#81C784] shrink-0">&larr;</span>
                <span>
                  <span>{shortName(e.source)}</span>
                  <span className="text-[var(--text-muted)] ml-1">({e.weight} call{e.weight !== 1 ? 's' : ''})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function FunctionListItem({ node }: { node: GraphNode }) {
  const selectNode = useStore((s) => s.selectNode)
  const sig = (node.signature as string) ?? displayName(node)
  // Show short signature: just the name + params
  const shortSig = sig.length > 40 ? displayName(node) + '(...)' : sig

  return (
    <li className="text-[13px] text-[var(--text-secondary)] flex items-start gap-1.5">
      <span className="text-[var(--text-muted)] mt-0.5 shrink-0">&bull;</span>
      <button
        onClick={() => selectNode(node.id)}
        className="text-left hover:text-[var(--accent-cyan)] transition-colors truncate py-0.5 border-l-2 border-transparent hover:border-[var(--accent-cyan)] pl-1 -ml-1"
        title={sig}
      >
        {shortSig}
      </button>
    </li>
  )
}

// --- Function / Class panel ---

function FunctionPanel({ node }: { node: GraphNode }) {
  const selectNode = useStore((s) => s.selectNode)
  const graph = useStore((s) => s.graph)

  const file = (node.file as string) ?? ''
  const line = (node.line as number) ?? 0
  const signature = (node.signature as string) ?? ''
  const docstring = (node.docstring as string) ?? ''
  const className = (node.class_name as string) ?? ''
  const calls = (node.calls as string[]) ?? []
  const calledBy = (node.called_by as string[]) ?? []

  // Build a lookup of all node ids for linking
  const nodeMap = new Map<string, GraphNode>()
  if (graph) {
    for (const n of graph.nodes) {
      nodeMap.set(n.id, n)
      // Also index by short name for calls list matching
      const bare = shortName(n.id)
      if (!nodeMap.has(bare)) {
        nodeMap.set(bare, n)
      }
    }
  }

  const location = file + (line ? `:${line}` : '')

  return (
    <>
      {/* Header */}
      <div className="px-5 pt-5 pb-3 pr-12">
        <h2 className="text-sm font-medium uppercase tracking-[0.15em] text-[var(--text-primary)] leading-tight">
          {displayName(node)}
        </h2>
        {location && (
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{location}</p>
        )}
        {className && (
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 uppercase tracking-[0.1em]">class: {className}</p>
        )}
      </div>

      <SectionDivider />

      {/* Signature */}
      {signature && (
        <>
          <div className="px-5 py-3">
            <pre className="text-[13px] text-[var(--accent-blue)] whitespace-pre-wrap break-all leading-relaxed">
              {signature}
            </pre>
          </div>
          <SectionDivider />
        </>
      )}

      {/* Docstring */}
      {docstring && (
        <>
          <div className="px-5 py-3">
            <p className="text-[13px] text-[var(--text-secondary)] italic leading-relaxed">
              &ldquo;{docstring}&rdquo;
            </p>
          </div>
          <SectionDivider />
        </>
      )}

      {/* Calls */}
      {calls.length > 0 && (
        <>
          <div className="px-5 py-3">
            <SectionHeader>Calls</SectionHeader>
            <ul className="space-y-0.5">
              {calls.map((callName) => {
                const target = nodeMap.get(callName)
                return (
                  <li key={callName} className="text-[13px] text-[var(--text-secondary)] flex items-start gap-1.5">
                    <span className="text-[var(--text-muted)] mt-0.5 shrink-0">&bull;</span>
                    {target ? (
                      <button
                        onClick={() => selectNode(target.id)}
                        className="text-left hover:text-[var(--accent-cyan)] transition-colors border-l-2 border-transparent hover:border-[var(--accent-cyan)] pl-1 -ml-1 py-0.5"
                      >
                        {callName}
                      </button>
                    ) : (
                      <span className="text-[var(--text-muted)]">{callName}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
          <SectionDivider />
        </>
      )}

      {/* Called by */}
      {calledBy.length > 0 && (
        <>
          <div className="px-5 py-3">
            <SectionHeader>Called By</SectionHeader>
            <ul className="space-y-0.5">
              {calledBy.map((callerId) => {
                const caller = nodeMap.get(callerId)
                return (
                  <li key={callerId} className="text-[13px] text-[var(--text-secondary)] flex items-start gap-1.5">
                    <span className="text-[var(--text-muted)] mt-0.5 shrink-0">&bull;</span>
                    {caller ? (
                      <button
                        onClick={() => selectNode(caller.id)}
                        className="text-left hover:text-[var(--accent-cyan)] transition-colors border-l-2 border-transparent hover:border-[var(--accent-cyan)] pl-1 -ml-1 py-0.5"
                      >
                        {shortName(callerId)}
                      </button>
                    ) : (
                      <span className="text-[var(--text-muted)]">{shortName(callerId)}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
          <SectionDivider />
        </>
      )}

      {/* Explain with AI */}
      <ExplainWithAI node={node} />
    </>
  )
}

// --- Explain with AI ---

function ExplainWithAI({ node }: { node: GraphNode }) {
  const llmProvider = useStore((s) => s.llmProvider)
  const llmApiKey = useStore((s) => s.llmApiKey)
  const llmModel = useStore((s) => s.llmModel)
  const explanationCache = useStore((s) => s.explanationCache)
  const setExplanation = useStore((s) => s.setExplanation)
  const graph = useStore((s) => s.graph)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cached = explanationCache[node.id]
  const hasKey = llmProvider !== null && llmApiKey.length > 0

  async function handleExplain() {
    if (!hasKey || !llmProvider) return
    setLoading(true)
    setError(null)
    try {
      const signature = (node.signature as string) ?? node.label
      const docstring = (node.docstring as string) ?? ''
      const calls = (node.calls as string[]) ?? []
      const calledBy = (node.called_by as string[]) ?? []
      // Derive module name from parent or node id
      const parentId = node.parent ?? ''
      const moduleName = parentId ? shortName(parentId) : node.repo
      const globalContext = graph?.global_context ?? ''

      const result = await explainFunction(llmProvider, llmApiKey, llmModel, {
        signature,
        docstring,
        calls,
        calledBy,
        moduleName,
        globalContext,
      })
      setExplanation(node.id, result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get explanation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-5 py-4">
      {cached ? (
        <div className="text-[13px] text-[var(--text-secondary)] leading-relaxed glass-panel p-3">
          {cached}
        </div>
      ) : !hasKey ? (
        <div className="w-full py-2.5 glass-panel text-center text-[12px] text-[var(--text-muted)] select-none uppercase tracking-[0.1em]">
          Configure API key in settings
        </div>
      ) : (
        <>
          <button
            onClick={handleExplain}
            disabled={loading}
            className="w-full py-2.5 border border-[var(--accent-cyan)] text-[var(--accent-cyan)] hover:bg-[rgba(0,229,255,0.08)] disabled:border-[var(--panel-border)] disabled:text-[var(--text-muted)] text-[12px] font-medium uppercase tracking-[0.15em] transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="inline-block w-4 h-4 border border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
                ANALYZING...
              </>
            ) : (
              'EXPLAIN WITH AI'
            )}
          </button>
          {error && (
            <p className="mt-2 text-[11px] text-[var(--error-red)]">{error}</p>
          )}
        </>
      )}
    </div>
  )
}

// --- Repo panel ---

function RepoPanel({ node }: { node: GraphNode }) {
  return (
    <div className="px-5 pt-5 pb-3 pr-12">
      <h2 className="text-sm font-medium uppercase tracking-[0.15em] text-[var(--text-primary)] leading-tight">
        {node.label}
      </h2>
      <p className="text-[11px] text-[var(--text-muted)] mt-1 uppercase tracking-[0.1em]">Repository</p>
      {node.summary_l1 && (
        <p className="text-[13px] text-[var(--text-secondary)] mt-3 leading-relaxed">{node.summary_l1}</p>
      )}
    </div>
  )
}

// --- Main SidePanel ---

export function SidePanel() {
  const selectedNodeId = useStore((s) => s.selectedNodeId)
  const selectNode = useStore((s) => s.selectNode)
  const graph = useStore((s) => s.graph)

  const isOpen = selectedNodeId !== null && graph !== null

  // Look up the selected node
  const selectedNode = isOpen
    ? graph.nodes.find((n) => n.id === selectedNodeId) ?? null
    : null

  // For module nodes: find children and relevant edges
  const children = selectedNode && (selectedNode.type === 'module')
    ? graph!.nodes.filter((n) => n.parent === selectedNode.id)
    : []

  // Module-level edges (edges between modules, not between functions)
  const moduleEdges = selectedNode && selectedNode.type === 'module' && graph
    ? graph.edges.filter((e) => {
        // Only module-level edges (edges where source or target is a module id)
        const isModuleSource = graph.nodes.some((n) => n.id === e.source && n.type === 'module')
        const isModuleTarget = graph.nodes.some((n) => n.id === e.target && n.type === 'module')
        return (isModuleSource || isModuleTarget) &&
               (e.source === selectedNode.id || e.target === selectedNode.id)
      })
    : []

  return (
    <div
      className={[
        'h-full glass-panel corner-accents border-t-0 border-b-0 border-r-0 overflow-y-auto overflow-x-hidden',
        'transition-all duration-300 ease-in-out',
        'flex flex-col relative shrink-0',
        isOpen && selectedNode ? 'w-[380px] opacity-100' : 'w-0 opacity-0',
      ].join(' ')}
    >
      {/* Inner wrapper prevents content from collapsing during transition */}
      <div className="w-[380px] min-w-[380px]">
        {selectedNode && (
          <>
            <CloseButton onClick={() => selectNode(null)} />

            {selectedNode.type === 'module' && (
              <ModulePanel node={selectedNode} children={children} edges={moduleEdges} />
            )}

            {(selectedNode.type === 'function' || selectedNode.type === 'class') && (
              <FunctionPanel node={selectedNode} />
            )}

            {selectedNode.type === 'repo' && (
              <RepoPanel node={selectedNode} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
