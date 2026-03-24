import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useStore } from '../store'
import type { GraphNode, GraphEdge } from '../store'
import { explainFunction, explainModule } from '../lib/llm'

/** Extract a short display name from a node's label (strip signature noise) */
function displayName(node: GraphNode): string {
  const name = node.semantic_label || node.label
  const paren = name.indexOf('(')
  return paren > 0 ? name.slice(0, paren) : name
}

/** Resolve a qualified id to a short name: "repo::mod::func" -> "func" */
function shortName(qualifiedId: string): string {
  const parts = qualifiedId.split('::')
  return parts[parts.length - 1]
}

// --- Sub-components ---

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#111] mt-5 mb-2">
      {children}
    </div>
  )
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute top-5 right-5 text-[rgba(0,0,0,0.2)] hover:text-[#111] transition-colors text-[22px] leading-none cursor-pointer border-none bg-transparent p-0"
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
  const selectNode = useStore((s) => s.selectNode)
  const path = (node.path as string) ?? ''
  const fileCount = (node.file_count as number) ?? 0
  const symbolCount = (node.symbol_count as number) ?? 0

  const functions = children.filter((c) => c.type === 'function')
  const classes = children.filter((c) => c.type === 'class')

  const outgoing = edges.filter((e) => e.source === node.id && e.target !== node.id)
  const incoming = edges.filter((e) => e.target === node.id && e.source !== node.id)

  return (
    <>
      {/* Title */}
      <div className="mb-1.5 pr-10">
        <h2 className="font-['Barlow_Condensed'] text-[26px] font-bold tracking-[0.02em] text-black leading-tight">
          {node.semantic_label || node.label}
        </h2>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 mb-5 pb-4 border-b border-[rgba(0,0,0,0.06)]">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[rgba(0,0,0,0.3)]">Module</span>
        {path && <span className="text-[12px] text-[rgba(0,0,0,0.35)] font-['JetBrains_Mono',monospace]">{path}</span>}
      </div>

      {/* Stats */}
      <div className="flex gap-4 mb-5">
        <span className="text-[12px] text-[rgba(0,0,0,0.35)]">
          <strong className="font-bold text-[rgba(0,0,0,0.7)] mr-0.5">{fileCount}</strong> files
        </span>
        <span className="text-[12px] text-[rgba(0,0,0,0.35)]">
          <strong className="font-bold text-[rgba(0,0,0,0.7)] mr-0.5">{symbolCount}</strong> symbols
        </span>
        <span className="text-[12px] text-[rgba(0,0,0,0.35)]">
          <strong className="font-bold text-[rgba(0,0,0,0.7)] mr-0.5">{outgoing.length + incoming.length}</strong> edges
        </span>
      </div>

      {/* L1 Wiki Summary */}
      {node.l1_summary && (
        <div className="mb-5">
          <SectionLabel>Overview</SectionLabel>
          <div className="text-[13px] text-[rgba(0,0,0,0.6)] leading-[1.8] [&_p]:mb-2 [&_strong]:text-[rgba(0,0,0,0.8)] [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-2 [&_li]:mb-1 [&_code]:bg-[rgba(0,0,0,0.04)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[12px] [&_code]:font-['JetBrains_Mono',monospace]">
            <ReactMarkdown>{node.l1_summary as string}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Functions list */}
      {functions.length > 0 && (
        <>
          <SectionLabel>Functions ({functions.length})</SectionLabel>
          <ul className="list-none p-0 m-0">
            {functions.map((fn) => {
              const sig = (fn.signature as string) ?? displayName(fn)
              const shortSig = sig.length > 40 ? displayName(fn) + '(...)' : sig
              return (
                <li
                  key={fn.id}
                  onClick={() => selectNode(fn.id)}
                  className="py-1 text-[13px] text-[rgba(0,0,0,0.55)] cursor-pointer hover:text-[#111] transition-colors overflow-hidden text-ellipsis whitespace-nowrap"
                  title={sig}
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[rgba(0,0,0,0.2)] mr-1.5 align-middle" />
                  {shortSig}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {/* Classes list */}
      {classes.length > 0 && (
        <>
          <SectionLabel>Classes ({classes.length})</SectionLabel>
          <ul className="list-none p-0 m-0">
            {classes.map((cls) => (
              <li
                key={cls.id}
                onClick={() => selectNode(cls.id)}
                className="py-1 text-[13px] text-[rgba(0,0,0,0.55)] cursor-pointer hover:text-[#111] transition-colors"
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#4FC3F7] mr-1.5 align-middle" />
                {displayName(cls)}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Connections */}
      {(outgoing.length > 0 || incoming.length > 0) && (
        <>
          <SectionLabel>Connections</SectionLabel>
          <ul className="list-none p-0 m-0">
            {outgoing.map((e, i) => (
              <li key={`out-${i}`} className="py-1 text-[13px] text-[rgba(0,0,0,0.55)]">
                <span className="text-[rgba(0,0,0,0.25)] mr-1">&rarr;</span>
                {shortName(e.target)}
                <span className="text-[rgba(0,0,0,0.25)] ml-1">({e.weight} call{e.weight !== 1 ? 's' : ''})</span>
              </li>
            ))}
            {incoming.map((e, i) => (
              <li key={`in-${i}`} className="py-1 text-[13px] text-[rgba(0,0,0,0.55)]">
                <span className="text-[rgba(0,0,0,0.25)] mr-1">&larr;</span>
                {shortName(e.source)}
                <span className="text-[rgba(0,0,0,0.25)] ml-1">({e.weight} call{e.weight !== 1 ? 's' : ''})</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Explain with AI */}
      <ExplainWithAI node={node} />
    </>
  )
}

// --- Function / Class panel ---

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  hub: { label: 'Hub', color: '#E91E63' },
  api: { label: 'API', color: '#2196F3' },
  internal: { label: 'Internal', color: '#78909C' },
  util: { label: 'Utility', color: '#FF9800' },
  test: { label: 'Test', color: '#9E9E9E' },
}

function ImportanceBadge({ node }: { node: GraphNode }) {
  const importance = node.importance as number | undefined
  const category = node.category as string | undefined
  if (importance == null && !category) return null

  const cat = category ? CATEGORY_LABELS[category] ?? { label: category, color: '#999' } : null
  const pct = importance != null ? Math.round(importance * 100) : null

  return (
    <div className="flex items-center gap-2 mb-4">
      {cat && (
        <span
          className="text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-0.5"
          style={{ color: cat.color, border: `1px solid ${cat.color}30`, background: `${cat.color}08` }}
        >
          {cat.label}
        </span>
      )}
      {pct != null && (
        <span className="text-[11px] text-[rgba(0,0,0,0.3)]">
          Importance: <strong className="text-[rgba(0,0,0,0.55)]">{pct}%</strong>
        </span>
      )}
    </div>
  )
}

function OverviewSummary({ node }: { node: GraphNode }) {
  const calls = (node.calls as string[]) ?? []
  const calledBy = (node.called_by as string[]) ?? []
  const category = node.category as string | undefined
  const importance = node.importance as number | undefined

  // Build a structural overview from graph data (no LLM needed)
  const parts: string[] = []

  if (node.type === 'class') {
    parts.push(`Class defined in ${(node.file as string)?.split('/').pop() ?? 'unknown'}.`)
  } else {
    const kind = category === 'hub' ? 'orchestrator function' :
                 category === 'api' ? 'entry point' :
                 category === 'util' ? 'utility function' : 'function'
    parts.push(`A ${kind} in ${(node.parent as string)?.split('::').pop() ?? 'this module'}.`)
  }

  if (calledBy.length > 0 && calls.length > 0) {
    parts.push(`Called by ${calledBy.length} symbol${calledBy.length > 1 ? 's' : ''}, calls ${calls.length}.`)
  } else if (calledBy.length > 0) {
    parts.push(`Called by ${calledBy.length} symbol${calledBy.length > 1 ? 's' : ''}.`)
  } else if (calls.length > 0) {
    parts.push(`Calls ${calls.length} other symbol${calls.length > 1 ? 's' : ''}.`)
  }

  if (importance != null && importance >= 0.5) {
    parts.push('High structural importance in the call graph.')
  }

  return (
    <div className="mb-4">
      <SectionLabel>Overview</SectionLabel>
      <p className="text-[13px] text-[rgba(0,0,0,0.5)] leading-[1.7]">{parts.join(' ')}</p>
    </div>
  )
}

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

  const nodeMap = new Map<string, GraphNode>()
  if (graph) {
    for (const n of graph.nodes) {
      nodeMap.set(n.id, n)
      const bare = shortName(n.id)
      if (!nodeMap.has(bare)) {
        nodeMap.set(bare, n)
      }
    }
  }

  const location = file + (line ? `:${line}` : '')

  return (
    <>
      {/* Title */}
      <div className="mb-1.5 pr-10">
        <h2 className="font-['Barlow_Condensed'] text-[26px] font-bold tracking-[0.02em] text-black leading-tight">
          {displayName(node)}
        </h2>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[rgba(0,0,0,0.06)]">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[rgba(0,0,0,0.3)]">
          {node.type === 'class' ? 'Class' : 'Function'}
        </span>
        {location && <span className="text-[12px] text-[rgba(0,0,0,0.35)] font-['JetBrains_Mono',monospace]">{location}</span>}
      </div>

      {/* Importance + Category badges */}
      <ImportanceBadge node={node} />

      {className && (
        <div className="text-[12px] text-[rgba(0,0,0,0.35)] mb-3">
          class: <span className="text-[rgba(0,0,0,0.55)]">{className}</span>
        </div>
      )}

      {/* Overview — always visible, no LLM needed */}
      <OverviewSummary node={node} />

      {/* Signature */}
      {signature && (
        <>
          <SectionLabel>Signature</SectionLabel>
          <div className="text-[13px] font-medium text-[rgba(0,0,0,0.7)] leading-relaxed p-2.5 bg-[rgba(0,0,0,0.025)] font-['JetBrains_Mono',monospace] break-all">
            {signature}
          </div>
        </>
      )}

      {/* Description */}
      {docstring && (
        <>
          <SectionLabel>Description</SectionLabel>
          <p className="text-[14px] text-[rgba(0,0,0,0.55)] leading-[1.8]">{docstring}</p>
        </>
      )}

      {/* Calls */}
      {calls.length > 0 && (
        <>
          <SectionLabel>Calls ({calls.length})</SectionLabel>
          <ul className="list-none p-0 m-0">
            {calls.map((callName) => {
              const target = nodeMap.get(callName)
              return (
                <li key={callName} className="py-1 text-[13px] text-[rgba(0,0,0,0.55)]">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[rgba(0,0,0,0.15)] mr-1.5 align-middle" />
                  {target ? (
                    <span
                      onClick={() => selectNode(target.id)}
                      className="cursor-pointer hover:text-[#111] transition-colors"
                    >
                      {callName}
                    </span>
                  ) : (
                    <span className="text-[rgba(0,0,0,0.25)]">{callName}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {/* Called by */}
      {calledBy.length > 0 && (
        <>
          <SectionLabel>Called By ({calledBy.length})</SectionLabel>
          <ul className="list-none p-0 m-0">
            {calledBy.map((callerId) => {
              const caller = nodeMap.get(callerId)
              return (
                <li key={callerId} className="py-1 text-[13px] text-[rgba(0,0,0,0.55)]">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[rgba(0,0,0,0.15)] mr-1.5 align-middle" />
                  {caller ? (
                    <span
                      onClick={() => selectNode(caller.id)}
                      className="cursor-pointer hover:text-[#111] transition-colors"
                    >
                      {shortName(callerId)}
                    </span>
                  ) : (
                    <span className="text-[rgba(0,0,0,0.25)]">{shortName(callerId)}</span>
                  )}
                </li>
              )
            })}
          </ul>
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
    // If summary_l1 exists (pre-generated), use it directly
    if (node.summary_l1) {
      setExplanation(node.id, node.summary_l1)
      return
    }

    if (!hasKey || !llmProvider) return
    setLoading(true)
    setError(null)
    try {
      const globalContext = graph?.global_context ?? ''

      if (node.type === 'module') {
        const children = graph?.nodes.filter((n) => n.parent === node.id) ?? []
        const symbolNames = children.map((c) => displayName(c))
        const edges = graph?.edges ?? []
        const outgoing = edges
          .filter((e) => e.source === node.id && e.target !== node.id)
          .map((e) => shortName(e.target))
        const incoming = edges
          .filter((e) => e.target === node.id && e.source !== node.id)
          .map((e) => shortName(e.source))

        const result = await explainModule(llmProvider, llmApiKey, llmModel, {
          moduleName: node.semantic_label || node.label,
          path: (node.path as string) ?? '',
          symbols: symbolNames,
          fileCount: (node.file_count as number) ?? 0,
          outgoing,
          incoming,
          globalContext,
        })
        setExplanation(node.id, result)
      } else {
        const signature = (node.signature as string) ?? node.label
        const docstring = (node.docstring as string) ?? ''
        const calls = (node.calls as string[]) ?? []
        const calledBy = (node.called_by as string[]) ?? []
        const parentId = node.parent ?? ''
        const moduleName = parentId ? shortName(parentId) : node.repo

        const result = await explainFunction(llmProvider, llmApiKey, llmModel, {
          signature,
          docstring,
          calls,
          calledBy,
          moduleName,
          globalContext,
        })
        setExplanation(node.id, result)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get explanation')
    } finally {
      setLoading(false)
    }
  }

  const wikiPath = node.wiki_path as string | undefined

  return (
    <div className="mt-5">
      <SectionLabel>AI Analysis</SectionLabel>
      {cached ? (
        <div>
          <div className="text-[13px] text-[rgba(0,0,0,0.6)] leading-[1.8] [&_p]:mb-2 [&_strong]:text-[rgba(0,0,0,0.8)] [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-2 [&_li]:mb-1 [&_code]:bg-[rgba(0,0,0,0.04)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[12px] [&_code]:font-['JetBrains_Mono',monospace]">
            <ReactMarkdown>{cached}</ReactMarkdown>
          </div>
          {wikiPath && (
            <a
              href={wikiPath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2.5 text-[12px] font-medium text-[rgba(0,0,0,0.35)] no-underline tracking-[0.04em] hover:text-[#111] transition-colors"
            >
              View full documentation &rarr;
            </a>
          )}
        </div>
      ) : (
        <div>
          <button
            onClick={hasKey ? handleExplain : undefined}
            disabled={loading || !hasKey}
            className="inline-block mt-2 px-7 py-2.5 bg-[#111] text-white border-none cursor-pointer text-[12px] font-medium uppercase tracking-[0.15em] hover:opacity-80 transition-opacity disabled:opacity-30"
          >
            {loading ? 'ANALYZING...' : 'EXPLAIN WITH AI'}
          </button>
          {!hasKey && (
            <p className="mt-2 text-[11px] text-[rgba(0,0,0,0.3)]">
              Click the gear icon (bottom-right) to configure your API key.
              <br />
              Supports Anthropic, OpenAI, DeepSeek, Google Gemini, MiniMax, Moonshot, Zhipu, Qwen, Doubao.
            </p>
          )}
          {error && (
            <p className="mt-2 text-[11px] text-red-500">{error}</p>
          )}
          {wikiPath && (
            <a
              href={wikiPath}
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-2.5 text-[12px] font-medium text-[rgba(0,0,0,0.35)] no-underline tracking-[0.04em] hover:text-[#111] transition-colors"
            >
              View full documentation &rarr;
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// --- Repo panel ---

function RepoPanel({ node }: { node: GraphNode }) {
  return (
    <>
      <div className="mb-1.5 pr-10">
        <h2 className="font-['Barlow_Condensed'] text-[26px] font-bold tracking-[0.02em] text-black leading-tight">
          {node.label}
        </h2>
      </div>
      <div className="flex items-center gap-3 mb-5 pb-4 border-b border-[rgba(0,0,0,0.06)]">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[rgba(0,0,0,0.3)]">Repository</span>
      </div>
      {node.summary_l1 && (
        <p className="text-[14px] text-[rgba(0,0,0,0.55)] leading-[1.8]">{node.summary_l1}</p>
      )}
    </>
  )
}

// --- Main SidePanel ---

export function SidePanel() {
  const selectedNodeId = useStore((s) => s.selectedNodeId)
  const selectNode = useStore((s) => s.selectNode)
  const graph = useStore((s) => s.graph)

  const isOpen = selectedNodeId !== null && graph !== null

  const selectedNode = isOpen
    ? graph.nodes.find((n) => n.id === selectedNodeId) ?? null
    : null

  const children = selectedNode && (selectedNode.type === 'module')
    ? graph!.nodes.filter((n) => n.parent === selectedNode.id)
    : []

  const moduleEdges = selectedNode && selectedNode.type === 'module' && graph
    ? graph.edges.filter((e) => {
        const isModuleSource = graph.nodes.some((n) => n.id === e.source && n.type === 'module')
        const isModuleTarget = graph.nodes.some((n) => n.id === e.target && n.type === 'module')
        return (isModuleSource || isModuleTarget) &&
               (e.source === selectedNode.id || e.target === selectedNode.id)
      })
    : []

  return (
    <div
      className={[
        'h-full border-l border-[rgba(0,0,0,0.06)] overflow-y-auto overflow-x-hidden',
        'transition-all duration-300 ease-in-out',
        'flex flex-col relative shrink-0',
        isOpen && selectedNode ? 'w-[380px] opacity-100' : 'w-0 opacity-0',
      ].join(' ')}
    >
      <div className="w-[380px] min-w-[380px] p-7">
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
