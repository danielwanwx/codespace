import { useStore } from '../store'
import type { GraphNode, GraphEdge } from '../store'

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
  return <div className="border-t border-gray-700/60" />
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
      aria-label="Close panel"
    >
      &times;
    </button>
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
        <h2 className="text-lg font-semibold text-white leading-tight">
          {node.semantic_label || node.label}
        </h2>
        {path && (
          <p className="text-sm text-gray-400 mt-0.5 font-mono">{path}</p>
        )}
      </div>

      <SectionDivider />

      {/* Stats */}
      <div className="px-5 py-3 text-sm text-gray-300">
        {fileCount} file{fileCount !== 1 ? 's' : ''} &middot; {symbolCount} symbol{symbolCount !== 1 ? 's' : ''}
      </div>

      <SectionDivider />

      {/* Functions list */}
      {functions.length > 0 && (
        <>
          <div className="px-5 py-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Functions</h3>
            <ul className="space-y-1">
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
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Classes</h3>
            <ul className="space-y-1">
              {classes.map((cls) => (
                <li key={cls.id} className="text-sm text-gray-300 flex items-start gap-1.5">
                  <span className="text-gray-500 mt-0.5 shrink-0">&loz;</span>
                  <span className="font-mono">{displayName(cls)}</span>
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
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Connections</h3>
          <ul className="space-y-1 text-sm">
            {outgoing.map((e, i) => (
              <li key={`out-${i}`} className="text-gray-300 flex items-start gap-1.5">
                <span className="text-blue-400 shrink-0">&rarr;</span>
                <span>
                  <span className="font-mono">{shortName(e.target)}</span>
                  <span className="text-gray-500 ml-1">({e.weight} call{e.weight !== 1 ? 's' : ''})</span>
                </span>
              </li>
            ))}
            {incoming.map((e, i) => (
              <li key={`in-${i}`} className="text-gray-300 flex items-start gap-1.5">
                <span className="text-green-400 shrink-0">&larr;</span>
                <span>
                  <span className="font-mono">{shortName(e.source)}</span>
                  <span className="text-gray-500 ml-1">({e.weight} call{e.weight !== 1 ? 's' : ''})</span>
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
    <li className="text-sm text-gray-300 flex items-start gap-1.5">
      <span className="text-gray-500 mt-0.5 shrink-0">&bull;</span>
      <button
        onClick={() => selectNode(node.id)}
        className="font-mono text-left hover:text-blue-400 transition-colors truncate"
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
        <h2 className="text-lg font-semibold text-white leading-tight">
          {displayName(node)}
        </h2>
        {location && (
          <p className="text-sm text-gray-400 mt-0.5 font-mono">{location}</p>
        )}
        {className && (
          <p className="text-xs text-gray-500 mt-0.5">class: {className}</p>
        )}
      </div>

      <SectionDivider />

      {/* Signature */}
      {signature && (
        <>
          <div className="px-5 py-3">
            <pre className="text-sm text-blue-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
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
            <p className="text-sm text-gray-300 italic leading-relaxed">
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
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Calls</h3>
            <ul className="space-y-1">
              {calls.map((callName) => {
                const target = nodeMap.get(callName)
                return (
                  <li key={callName} className="text-sm text-gray-300 flex items-start gap-1.5">
                    <span className="text-gray-500 mt-0.5 shrink-0">&bull;</span>
                    {target ? (
                      <button
                        onClick={() => selectNode(target.id)}
                        className="font-mono text-left hover:text-blue-400 transition-colors"
                      >
                        {callName}
                      </button>
                    ) : (
                      <span className="font-mono text-gray-500">{callName}</span>
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
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Called by</h3>
            <ul className="space-y-1">
              {calledBy.map((callerId) => {
                const caller = nodeMap.get(callerId)
                return (
                  <li key={callerId} className="text-sm text-gray-300 flex items-start gap-1.5">
                    <span className="text-gray-500 mt-0.5 shrink-0">&bull;</span>
                    {caller ? (
                      <button
                        onClick={() => selectNode(caller.id)}
                        className="font-mono text-left hover:text-blue-400 transition-colors"
                      >
                        {shortName(callerId)}
                      </button>
                    ) : (
                      <span className="font-mono text-gray-500">{shortName(callerId)}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
          <SectionDivider />
        </>
      )}

      {/* Explain with AI placeholder */}
      <div className="px-5 py-4">
        <div className="w-full py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-center text-sm text-gray-400 cursor-not-allowed select-none">
          Explain with AI
        </div>
      </div>
    </>
  )
}

// --- Repo panel ---

function RepoPanel({ node }: { node: GraphNode }) {
  return (
    <div className="px-5 pt-5 pb-3 pr-12">
      <h2 className="text-lg font-semibold text-white leading-tight">
        {node.label}
      </h2>
      <p className="text-sm text-gray-400 mt-1">Repository</p>
      {node.summary_l1 && (
        <p className="text-sm text-gray-300 mt-3 leading-relaxed">{node.summary_l1}</p>
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
        'h-full bg-gray-900 border-l border-gray-800 overflow-y-auto overflow-x-hidden',
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
