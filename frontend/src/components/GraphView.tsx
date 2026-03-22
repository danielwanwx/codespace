import { useEffect, useRef, useCallback } from 'react'
import { Graph, ComboEvent, NodeEvent } from '@antv/g6'
import type { NodeData, EdgeData, ComboData, GraphData, IElementEvent, ElementDatum } from '@antv/g6'
import { useStore } from '../store'
import type { CodespaceGraph, GraphNode } from '../store'

// --- SpaceX HUD Color palette ---
const MODULE_COLORS = ['#4FC3F7', '#81C784', '#CE93D8', '#FFB74D'] as const
const EDGE_COLOR = '#333c41'
const EDGE_LABEL_COLOR = '#56646a'

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
  const { graph: data, zoomLevel, expandedClusters, selectNode, toggleCluster, selectedNodeId, focusNodeId, setFocusNodeId } = useStore()

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
        state: {
          active: {
            lineWidth: 2,
            shadowColor: '#00E5FF',
            shadowBlur: 12,
            fillOpacity: 0.9,
          },
          inactive: {
            fillOpacity: 0.15,
            strokeOpacity: 0.2,
            labelOpacity: 0.3,
          },
        },
        style: (d: NodeData) => {
          const nodeType = d.data?.nodeType as string
          const parentModule = d.data?.parent as string | null
          const modIdx = parentModule ? (moduleIndex.get(parentModule) ?? 0) : 0
          const modColor = getModuleColor(modIdx)
          const isSelected = d.id === selectedNodeId

          const base: Record<string, unknown> = {
            labelText: (d.data?.label as string) || String(d.id),
            labelFill: '#969c99',
            labelFontSize: 10,
            labelFontFamily: '"JetBrains Mono", monospace',
            labelPlacement: 'bottom',
          }

          if (nodeType === 'class') {
            Object.assign(base, {
              size: 28,
              fill: '#181f22',
              fillOpacity: 1,
              stroke: '#4FC3F7',
              lineWidth: 1.5,
            })
          } else if (nodeType === 'function') {
            Object.assign(base, {
              size: 18,
              fill: '#181f22',
              fillOpacity: 1,
              stroke: '#00E5FF',
              lineWidth: 1,
            })
          } else if (nodeType === 'module') {
            // Module nodes shown at module zoom level (non-combo)
            Object.assign(base, {
              size: 36,
              fill: '#181f22',
              fillOpacity: 1,
              stroke: modColor,
              lineWidth: 1.5,
              labelFontSize: 12,
              labelFill: modColor,
            })
          } else {
            // repo
            Object.assign(base, {
              size: 44,
              fill: '#181f22',
              fillOpacity: 1,
              stroke: '#00E5FF',
              lineWidth: 2,
              labelFontSize: 13,
              labelFill: '#ededea',
            })
          }

          // Selected node highlight ring
          if (isSelected) {
            Object.assign(base, {
              stroke: '#00E5FF',
              lineWidth: 2,
              shadowColor: '#00E5FF',
              shadowBlur: 12,
            })
          }

          return base
        },
      },
      edge: {
        state: {
          active: {
            stroke: '#00E5FF',
            strokeOpacity: 0.8,
            lineWidth: 1.5,
          },
          inactive: {
            strokeOpacity: 0.08,
          },
        },
        style: (d: EdgeData) => {
          const weight = (d.data?.weight as number) || 1
          const confidence = (d.data?.confidence as string) || 'medium'
          // Weight affects opacity, not thickness
          const weightOpacity = Math.min(0.3 + weight * 0.15, 0.9)
          const confidenceOpacity = confidence === 'high' ? weightOpacity : confidence === 'low' ? weightOpacity * 0.3 : weightOpacity * 0.6
          // Keep lines thin: 1-2px
          const lineWidth = confidence === 'high' ? 1.5 : 1
          // Line dash based on confidence: solid (high), dashed (medium), dotted (low)
          const lineDash =
            confidence === 'high' ? undefined : confidence === 'low' ? [2, 4] : [6, 4]
          return {
            stroke: EDGE_LABEL_COLOR,
            lineWidth,
            strokeOpacity: confidenceOpacity,
            lineDash,
            endArrow: true,
            endArrowSize: 4,
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
            fill: hexToRgba(modColor, 0.06),
            stroke: hexToRgba(modColor, 0.3),
            lineWidth: 1,
            radius: 0,
            labelText: ((d.data?.label as string) || String(d.id)).toUpperCase(),
            labelFill: hexToRgba(modColor, 0.6),
            labelFontSize: 10,
            labelFontWeight: 500,
            labelFontFamily: '"JetBrains Mono", monospace',
            labelPlacement: 'top',
            labelLetterSpacing: 1.5,
            padding: 20,
            collapsedSize: [60, 40],
            collapsedFill: hexToRgba(modColor, 0.12),
            collapsedStroke: hexToRgba(modColor, 0.4),
            collapsedLineWidth: 1,
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
        {
          type: 'hover-activate',
          degree: 1,
          inactiveState: 'inactive',
          state: 'active',
        },
      ],
      plugins: [
        {
          type: 'minimap',
          size: [200, 150] as [number, number],
          position: 'left-bottom' as const,
          containerStyle: {
            border: '1px solid #333c41',
            borderRadius: '0px',
            backgroundColor: 'rgba(24, 31, 34, 0.9)',
            boxShadow: 'none',
          },
          maskStyle: {
            border: '1px solid #00E5FF',
            backgroundColor: 'rgba(0, 229, 255, 0.08)',
          },
        },
        {
          type: 'tooltip',
          getContent: (_event: IElementEvent, items: ElementDatum[]) => {
            const item = items?.[0]
            if (!item) return Promise.resolve('')
            const d = item as Record<string, unknown>
            const label = (d.label as string) || (d.id as string) || ''
            const nodeType = (d.nodeType as string) || (d.type as string) || ''
            const docstring = (d.docstring as string) || (d.summary_l1 as string) || ''
            const firstLine = docstring ? docstring.split('\n')[0].slice(0, 120) : ''
            return Promise.resolve(
              `<div style="background:rgba(24,31,34,0.95);color:#ededea;padding:8px 12px;font-size:12px;max-width:300px;border:1px solid #333c41;font-family:'JetBrains Mono',monospace;backdrop-filter:blur(12px);">
                <strong style="letter-spacing:0.05em;">${label}</strong>
                ${nodeType ? `<br/><span style="color:#56646a;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;">${nodeType}</span>` : ''}
                ${firstLine ? `<br/><span style="color:#969c99;font-size:11px;">${firstLine}</span>` : ''}
              </div>`,
            )
          },
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

  // Focus/zoom to a node when focusNodeId is set
  useEffect(() => {
    const g = graphRef.current
    if (!g || !focusNodeId) return
    try {
      g.focusElement(focusNodeId, { duration: 300 })
    } catch {
      // Node may not be visible at current zoom level — silently ignore
    }
    setFocusNodeId(null)
  }, [focusNodeId, setFocusNodeId])

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
