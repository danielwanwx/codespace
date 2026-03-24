import { create } from 'zustand'

interface CodespaceGraph {
  metadata: { repos: string[]; stats: Record<string, number> }
  global_context: string
  nodes: GraphNode[]
  edges: GraphEdge[]
}

interface GraphNode {
  id: string
  type: 'repo' | 'module' | 'class' | 'function'
  label: string
  semantic_label: string | null
  parent: string | null
  repo: string
  summary_l1: string | null
  wiki_path?: string | null
  [key: string]: unknown
}

interface GraphEdge {
  source: string
  target: string
  type: string
  weight: number
  [key: string]: unknown
}

interface AppState {
  graph: CodespaceGraph | null
  selectedNodeId: string | null
  focusNodeId: string | null
  zoomLevel: 'repo' | 'module' | 'function'
  expandedClusters: Set<string>
  setGraph: (g: CodespaceGraph) => void
  selectNode: (id: string | null) => void
  setFocusNodeId: (id: string | null) => void
  setZoomLevel: (level: 'repo' | 'module' | 'function') => void
  toggleCluster: (id: string) => void
  // LLM settings
  llmProvider: string | null
  llmApiKey: string
  llmModel: string
  setLLMSettings: (provider: string | null, key: string, model: string) => void
  // Explanation cache
  explanationCache: Record<string, string>
  setExplanation: (nodeId: string, text: string) => void
}

export const useStore = create<AppState>((set) => ({
  graph: null,
  selectedNodeId: null,
  focusNodeId: null,
  zoomLevel: 'module',
  expandedClusters: new Set(),
  setGraph: (graph) => set({ graph }),
  selectNode: (id) => set({ selectedNodeId: id }),
  setFocusNodeId: (id) => set({ focusNodeId: id }),
  setZoomLevel: (level) => set({ zoomLevel: level }),
  toggleCluster: (id) => set((state) => {
    const next = new Set(state.expandedClusters)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return { expandedClusters: next }
  }),
  // LLM settings
  llmProvider: null,
  llmApiKey: '',
  llmModel: '',
  setLLMSettings: (provider, key, model) => set({ llmProvider: provider, llmApiKey: key, llmModel: model }),
  // Explanation cache
  explanationCache: {},
  setExplanation: (nodeId, text) => set((state) => ({
    explanationCache: { ...state.explanationCache, [nodeId]: text },
  })),
}))

export type { CodespaceGraph, GraphNode, GraphEdge }
