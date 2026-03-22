import { useEffect, useRef, useCallback } from 'react'
import { Graph, ComboEvent, NodeEvent } from '@antv/g6'
import type { NodeData, EdgeData, ComboData, GraphData, IElementEvent } from '@antv/g6'
import { useStore } from '../store'
import type { CodespaceGraph, GraphNode } from '../store'

// --- Color palette ---
const MODULE_COLORS = ['#3B82F6', '#22C55E', '#A855F7', '#F97316'] as const
const EDGE_COLOR = '#4B5563'

/** Convert hex to rgba string */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Build a map of module id -> index for color cycling */
function buildModuleIndex(nodes: GraphNode[]): Map<string, number> {
  const modules = nodes.filter((n) => n.type === 'module')
  const map = new Map<string, number>()
  modules.forEach((m, i) => map.set(m.id, i))
  return map
}

/** Get the module color for a given module index */
function getModuleColor(index: number): string {
  return MODULE_COLORS[index % MODULE_COLORS.length]
}

export function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<Graph | null>(null)
  const { graph: data, zoomLevel, expandedClusters, selectNode, toggleCluster, selectedNodeId } = useStore()

  const handleComboExpand = useCallback(
    (id: string) => {
      toggleCluster(id)
    },
    [toggleCluster],
  )

  useEffect(() => {
    if (!containerRef.current || !data) return

    // Destroy previous graph instance
    if (graphRef.current) {
      graphRef.current.destroy()
      graphRef.current = null
    }

    const moduleIndex = buildModuleIndex(data.nodes)
    const transformed = transformData(data, zoomLevel, expandedClusters, moduleIndex)

    const g6Graph = new Graph({
      container: containerRef.current,
      autoFit: 'view',
      animation: false,
      data: transformed,
      node: {
        type: (d: NodeData) => {
          const nodeType = d.data?.nodeType as string
          if (nodeType === 'class') return 'diamond'
          return 'circle'
        },
        style: (d: NodeData) => {
          const nodeType = d.data?.nodeType as string
          const parentModule = d.data?.parent as string | null
          const modIdx = parentModule ? (moduleIndex.get(parentModule) ?? 0) : 0
          const modColor = getModuleColor(modIdx)
          const isSelected = d.id === selectedNodeId

          const base: Record<string, unknown> = {
            labelText: (d.data?.label as string) || String(d.id),
            labelFill: '#E5E7EB',
            labelFontSize: 11,
            labelPlacement: 'bottom',
          }

          if (nodeType === 'class') {
            Object.assign(base, {
              size: 35,
              fill: modColor,
              fillOpacity: 0.7,
              stroke: modColor,
              lineWidth: 2,
            })
          } else if (nodeType === 'function') {
            Object.assign(base, {
              size: 24,
              fill: modColor,
              fillOpacity: 0.5,
              stroke: modColor,
              lineWidth: 1.5,
            })
          } else if (nodeType === 'module') {
            // Module nodes shown at module zoom level (non-combo)
            Object.assign(base, {
              size: 40,
              fill: modColor,
              fillOpacity: 0.4,
              stroke: modColor,
              lineWidth: 2,
              labelFontSize: 13,
            })
          } else {
            // repo
            Object.assign(base, {
              size: 50,
              fill: '#6366F1',
              fillOpacity: 0.6,
              stroke: '#818CF8',
              lineWidth: 2,
              labelFontSize: 14,
            })
          }

          // Selected node highlight ring
          if (isSelected) {
            Object.assign(base, {
              stroke: '#FACC15',
              lineWidth: 4,
              shadowColor: '#FACC15',
              shadowBlur: 12,
            })
          }

          return base
        },
      },
      edge: {
        style: (d: EdgeData) => {
          const weight = (d.data?.weight as number) || 1
          const confidence = (d.data?.confidence as string) || 'medium'
          const confidenceOpacity = confidence === 'high' ? 0.8 : confidence === 'low' ? 0.3 : 0.5
          return {
            stroke: EDGE_COLOR,
            lineWidth: Math.min(weight * 1.5, 8),
            strokeOpacity: confidenceOpacity,
            endArrow: true,
            endArrowSize: 6,
            endArrowFill: EDGE_COLOR,
          }
        },
      },
      combo: {
        type: 'rect',
        style: (d: ComboData) => {
          const modIdx = (d.data?.moduleIndex as number) ?? 0
          const modColor = getModuleColor(modIdx)
          return {
            fill: hexToRgba(modColor, 0.12),
            stroke: hexToRgba(modColor, 0.4),
            lineWidth: 1.5,
            radius: 8,
            labelText: (d.data?.label as string) || String(d.id),
            labelFill: modColor,
            labelFontSize: 13,
            labelFontWeight: 600,
            labelPlacement: 'top',
            padding: 20,
            collapsedSize: [60, 40],
            collapsedFill: hexToRgba(modColor, 0.25),
            collapsedStroke: modColor,
            collapsedLineWidth: 2,
            collapsedMarker: false,
          }
        },
      },
      layout: {
        type: 'combo-combined',
        preventOverlap: true,
        nodeSize: 50,
        spacing: 10,
      },
      behaviors: [
        'drag-canvas',
        'zoom-canvas',
        'drag-element',
        {
          type: 'collapse-expand',
          trigger: 'dblclick',
          onExpand: (id: string) => handleComboExpand(id),
          onCollapse: (id: string) => handleComboExpand(id),
        },
      ],
    })

    g6Graph.on(NodeEvent.CLICK, (evt: IElementEvent) => {
      selectNode((evt.target?.id as string) || null)
    })

    g6Graph.on(ComboEvent.CLICK, (evt: IElementEvent) => {
      selectNode((evt.target?.id as string) || null)
    })

    g6Graph.render()
    graphRef.current = g6Graph

    return () => {
      g6Graph.destroy()
      graphRef.current = null
    }
  }, [data, zoomLevel, expandedClusters, selectNode, selectedNodeId, handleComboExpand])

  return <div ref={containerRef} className="w-full h-full" />
}

/**
 * Transform raw CodespaceGraph data into G6 v5 GraphData with combos.
 *
 * Behavior based on zoomLevel:
 * - "repo":     Only the repo node is visible. No combos.
 * - "module":   Module combos are shown collapsed. No individual function/class nodes
 *               unless the module is in expandedClusters.
 * - "function": All modules shown as combos (expanded), all function/class nodes visible.
 */
function transformData(
  data: CodespaceGraph,
  zoomLevel: string,
  expandedClusters: Set<string>,
  moduleIndex: Map<string, number>,
): GraphData {
  if (zoomLevel === 'repo') {
    const repoNodes = data.nodes
      .filter((n) => n.type === 'repo')
      .map((n) => ({
        id: n.id,
        data: { ...n, nodeType: n.type },
      }))
    return { nodes: repoNodes, edges: [], combos: [] }
  }

  const modules = data.nodes.filter((n) => n.type === 'module')
  const combos: ComboData[] = []
  const nodes: NodeData[] = []

  // Add repo nodes (hidden from combos for now)
  // We skip repo nodes in module/function views -- combos represent modules

  // Create combos for each module
  for (const mod of modules) {
    const modIdx = moduleIndex.get(mod.id) ?? 0
    const isExpanded = zoomLevel === 'function' || expandedClusters.has(mod.id)

    combos.push({
      id: mod.id,
      data: {
        label: mod.label,
        moduleIndex: modIdx,
        nodeType: 'module',
      },
      style: isExpanded ? undefined : { collapsed: true },
    })
  }

  // Add function/class nodes into their parent combos
  const childTypes = ['function', 'class']
  const childNodes = data.nodes.filter((n) => childTypes.includes(n.type))

  for (const node of childNodes) {
    const parentMod = node.parent
    if (!parentMod) continue
    // Only add if parent module exists as a combo
    if (!moduleIndex.has(parentMod)) continue

    nodes.push({
      id: node.id,
      combo: parentMod,
      data: {
        ...node,
        nodeType: node.type,
      },
    })
  }

  // Collect all visible element IDs (nodes + combos)
  const visibleIds = new Set<string>()
  for (const n of nodes) visibleIds.add(n.id as string)
  for (const c of combos) visibleIds.add(c.id as string)

  // Build edges: filter to only those between visible elements
  const edges = data.edges
    .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
    .map((e, i) => ({
      id: `edge-${i}`,
      source: e.source,
      target: e.target,
      data: { ...e },
    }))

  return { nodes, edges, combos }
}
