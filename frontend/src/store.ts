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
  zoomLevel: 'repo' | 'module' | 'function'
  expandedClusters: Set<string>
  setGraph: (g: CodespaceGraph) => void
  selectNode: (id: string | null) => void
  setZoomLevel: (level: 'repo' | 'module' | 'function') => void
  toggleCluster: (id: string) => void
}

export const useStore = create<AppState>((set) => ({
  graph: null,
  selectedNodeId: null,
  zoomLevel: 'module',
  expandedClusters: new Set(),
  setGraph: (graph) => set({ graph }),
  selectNode: (id) => set({ selectedNodeId: id }),
  setZoomLevel: (level) => set({ zoomLevel: level }),
  toggleCluster: (id) => set((state) => {
    const next = new Set(state.expandedClusters)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return { expandedClusters: next }
  }),
}))

export type { CodespaceGraph, GraphNode, GraphEdge }
