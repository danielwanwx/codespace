import { useEffect, useRef } from 'react'
import { Graph, NodeEvent } from '@antv/g6'
import type { NodeData, EdgeData } from '@antv/g6'
import { useStore } from '../store'
import type { CodespaceGraph } from '../store'

export function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<Graph | null>(null)
  const { graph: data, zoomLevel, selectNode } = useStore()

  useEffect(() => {
    if (!containerRef.current || !data) return

    const g6Graph = new Graph({
      container: containerRef.current,
      autoFit: 'view',
      data: transformData(data, zoomLevel),
      node: {
        style: {
          size: 30,
          labelText: (d: NodeData) => (d.data?.label as string) || String(d.id),
        },
      },
      edge: {
        style: {
          lineWidth: (d: EdgeData) => Math.min(((d.data?.weight as number) || 1) * 2, 8),
        },
      },
      layout: {
        type: 'force',
        preventOverlap: true,
        nodeSize: 40,
      },
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
    })

    g6Graph.on(NodeEvent.CLICK, (evt) => {
      const target = (evt as unknown as { target: { id: string } }).target
      selectNode(target?.id || null)
    })

    g6Graph.render()
    graphRef.current = g6Graph

    return () => {
      g6Graph.destroy()
    }
  }, [data, zoomLevel, selectNode])

  return <div ref={containerRef} className="w-full h-full" />
}

function transformData(data: CodespaceGraph, zoomLevel: string) {
  const typeFilter = zoomLevel === 'repo' ? ['repo']
    : zoomLevel === 'module' ? ['repo', 'module']
    : ['repo', 'module', 'function', 'class']

  const visibleNodes = data.nodes
    .filter((n) => typeFilter.includes(n.type))
    .map((n) => ({
      id: n.id,
      data: { ...n },
    }))

  const visibleIds = new Set(visibleNodes.map((n) => n.id))

  const visibleEdges = data.edges
    .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
    .map((e, i) => ({
      id: `edge-${i}`,
      source: e.source,
      target: e.target,
      data: { ...e },
    }))

  return { nodes: visibleNodes, edges: visibleEdges }
}
