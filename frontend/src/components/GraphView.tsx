import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import { useStore } from '../store'
import type { CodespaceGraph, GraphNode } from '../store'

// --- Color palette (matching preview.html) ---
// Generate 100 visually distinct colors using golden-angle hue spacing
const MODULE_COLORS: string[] = (() => {
  const colors: string[] = []
  for (let i = 0; i < 100; i++) {
    const hue = (i * 137.508) % 360  // golden angle
    const sat = 55 + (i % 3) * 15     // 55-85%
    const lit = 45 + (i % 4) * 8      // 45-69%
    colors.push(`hsl(${hue}, ${sat}%, ${lit}%)`)
  }
  return colors
})()

function getModuleColor(index: number): string {
  return MODULE_COLORS[index % MODULE_COLORS.length]
}

// --- D3 node/link types ---
interface SimNode extends d3.SimulationNodeDatum {
  id: string
  label: string
  grp: string         // module id this node belongs to
  kind: string        // 'fn' | 'cls' | 'module' | 'repo'
  grpIndex: number    // module color index
  doc: string
  nodeType: string    // original type from graph data
  raw: GraphNode
  _dragStartX?: number
  _dragStartY?: number
  [key: string]: unknown
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  weight: number
}

/** Extract string id from D3 link source/target (which may be object or string) */
function linkId(ref: string | number | SimNode): string {
  if (typeof ref === 'object' && ref !== null) return ref.id
  return String(ref)
}

// ============================================================
// GraphView component
// ============================================================
export function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null)
  const animRef = useRef<number | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)

  const { graph: data, zoomLevel, selectNode, selectedNodeId, focusNodeId, setFocusNodeId } = useStore()

  // Store selectNode in a ref so D3 callbacks always see current fn
  const selectNodeRef = useRef(selectNode)
  selectNodeRef.current = selectNode
  const selectedIdRef = useRef(selectedNodeId)
  selectedIdRef.current = selectedNodeId

  // Refs for D3 selections so selection effect can update visuals without rebuilding
  const applySelectionRef = useRef<((id: string) => void) | null>(null)
  const deselectAllRef = useRef<(() => void) | null>(null)

  // Cleanup function
  const cleanup = useCallback(() => {
    if (simRef.current) {
      simRef.current.stop()
      simRef.current = null
    }
    if (animRef.current) {
      cancelAnimationFrame(animRef.current)
      animRef.current = null
    }
    if (svgRef.current) {
      d3.select(svgRef.current).selectAll('*').remove()
      svgRef.current = null
    }
    if (tooltipRef.current) {
      tooltipRef.current.remove()
      tooltipRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current || !data) return

    cleanup()

    const container = containerRef.current
    const W = container.clientWidth
    const H = container.clientHeight
    if (W === 0 || H === 0) return

    // Build module index
    const modules = data.nodes.filter((n) => n.type === 'module')
    const moduleIndexMap = new Map<string, number>()
    modules.forEach((m, i) => moduleIndexMap.set(m.id, i))

    // Transform data based on zoom level
    const { nodes, links, groups } = transformForD3(data, zoomLevel, moduleIndexMap, W, H)
    if (nodes.length === 0) return

    // --- Create SVG ---
    const svg = d3.select(container)
      .append('svg')
      .attr('width', W)
      .attr('height', H)
      .style('width', '100%')
      .style('height', '100%')
      .style('background', '#fff')

    svgRef.current = svg.node()!

    const gRoot = svg.append('g')

    // Zoom behavior
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 5])
      .on('zoom', (ev) => {
        gRoot.attr('transform', ev.transform)
      })
    svg.call(zoomBehavior as never)

    // Click on background to deselect
    // Background click — deselect / zoom out (handlers defined below, called via ref)
    const bgClickRef = { current: () => {} }
    svg.on('click', function (ev) {
      if (ev.target === svg.node() || ev.target === gRoot.node()) {
        selectedIdRef.current = null
        selectNodeRef.current(null)
        bgClickRef.current()
      }
    })

    // --- Tooltip ---
    const tooltip = d3.select(container)
      .append('div')
      .style('position', 'absolute')
      .style('padding', '10px 14px')
      .style('pointer-events', 'none')
      .style('z-index', '100')
      .style('max-width', '240px')
      .style('background', '#111')
      .style('color', '#fff')
      .style('opacity', '0')
      .style('transition', 'opacity 0.15s')
      .style('font-family', '"Barlow", sans-serif')

    tooltipRef.current = tooltip.node()!

    // --- Group centers for cluster force ---
    const grpCenter: Record<string, { x: number; y: number }> = {}
    groups.forEach((g) => {
      grpCenter[g.id] = { x: g.cx, y: g.cy }
    })

    // Group phases for drift
    const grpPhase: Record<string, number> = {}
    groups.forEach((g, i) => {
      grpPhase[g.id] = i * 1.8
    })

    // --- Custom forces (ported from preview.html) ---
    const n = nodes.length
    const isFuncView = zoomLevel === 'function'

    // Cluster force: pulls nodes toward their group center
    // For function view: always use fixed centers with constant strength (not alpha-scaled)
    // For module view: use live centroids with alpha-scaled strength
    function forceCluster(strength: number) {
      let ns: SimNode[]
      function force(alpha: number) {
        if (isFuncView) {
          // Fixed centers, constant strength — ensures clusters stay grouped
          const s = strength * 0.002  // gentle constant pull
          ns.forEach((nd) => {
            if (nd.fx != null) return
            const gc = grpCenter[nd.grp]
            if (!gc) return
            nd.vx! += (gc.x - nd.x!) * s
            nd.vy! += (gc.y - nd.y!) * s
          })
        } else {
          // Live centroid, alpha-scaled
          const centroids: Record<string, { x: number; y: number }> = {}
          groups.forEach((g) => {
            const gn = ns.filter((n) => n.grp === g.id)
            if (!gn.length) return
            centroids[g.id] = {
              x: d3.mean(gn, (n) => n.x) ?? g.cx,
              y: d3.mean(gn, (n) => n.y) ?? g.cy,
            }
          })
          ns.forEach((nd) => {
            if (nd.fx != null) return
            const c = centroids[nd.grp]
            if (!c) return
            nd.vx! += (c.x - nd.x!) * alpha * strength
            nd.vy! += (c.y - nd.y!) * alpha * strength
          })
        }
      }
      force.initialize = function (nodes: SimNode[]) { ns = nodes }
      return force
    }

    // Drift force: floating sine-wave animation
    const t0 = Date.now()
    function forceDrift(amplitude = 0.35, pull = 0.001) {
      let ns: SimNode[]
      function force() {
        const t = (Date.now() - t0) / 1000
        ns.forEach((nd) => {
          if (nd.fx != null) return
          const gp = grpPhase[nd.grp] ?? 0
          const targetX = W * 0.5 + Math.sin(t * 0.08 + gp) * W * amplitude
          const targetY = H * 0.5 + Math.cos(t * 0.06 + gp * 0.7 + 1.2) * H * amplitude
          nd.vx! += (targetX - nd.x!) * pull
          nd.vy! += (targetY - nd.y!) * pull
        })
      }
      force.initialize = function (nodes: SimNode[]) { ns = nodes }
      return force
    }

    // --- D3 Force Simulation ---
    // Separate parameters for module vs function view
    const chargeStrength = isFuncView ? -30 : (n <= 12 ? -45 : -45 - (n - 12) * 8)
    const collisionRadius = isFuncView ? 50 : (n <= 12 ? 18 : 18 + n * 1.5)
    const driftAmplitude = isFuncView ? 0.12 : (n <= 12 ? 0.06 : Math.max(0.05 - n * 0.0005, 0.02))
    const driftPull = isFuncView ? 0.002 : (n <= 50 ? 0.0003 : 0.0001)
    const clusterStrength = isFuncView ? 3.0 : (n <= 50 ? 0.7 : 1.5)

    // Build node group lookup for link distance/strength
    const nodeGrpMap: Record<string, string> = {}
    nodes.forEach((nd) => { nodeGrpMap[nd.id] = nd.grp })

    const linkForce = d3.forceLink<SimNode, SimLink>(links)
      .id((d) => d.id)
      .distance((l) => {
        const sg = nodeGrpMap[linkId(l.source!)]
        const tg = nodeGrpMap[linkId(l.target!)]
        if (isFuncView) return sg === tg ? 40 : 500
        return sg === tg ? 40 : (n <= 12 ? 100 : 160 + n * 2)
      })
      .strength((l) => {
        const sg = nodeGrpMap[linkId(l.source!)]
        const tg = nodeGrpMap[linkId(l.target!)]
        if (isFuncView) return sg === tg ? 0.06 : 0
        return sg === tg ? 0.5 : 0.02
      })

    // Cluster-repulsion: push apart nodes from different groups
    function forceClusterRepel(strength: number, minDist: number) {
      let ns: SimNode[]
      function force(alpha: number) {
        // Compute group centroids
        const centroids: Record<string, { x: number; y: number; count: number }> = {}
        ns.forEach((nd) => {
          if (!centroids[nd.grp]) centroids[nd.grp] = { x: 0, y: 0, count: 0 }
          centroids[nd.grp].x += nd.x!
          centroids[nd.grp].y += nd.y!
          centroids[nd.grp].count++
        })
        for (const g in centroids) {
          centroids[g].x /= centroids[g].count
          centroids[g].y /= centroids[g].count
        }
        // Push each node away from other group centroids
        const grpIds = Object.keys(centroids)
        ns.forEach((nd) => {
          if (nd.fx != null) return
          for (const gid of grpIds) {
            if (gid === nd.grp) continue
            const c = centroids[gid]
            const dx = nd.x! - c.x
            const dy = nd.y! - c.y
            const dist = Math.sqrt(dx * dx + dy * dy) || 1
            if (dist < minDist) {
              const push = alpha * strength * (minDist - dist) / dist
              nd.vx! += dx * push
              nd.vy! += dy * push
            }
          }
        })
      }
      force.initialize = function (nodes: SimNode[]) { ns = nodes }
      return force
    }

    const charge = d3.forceManyBody().strength(chargeStrength)
    if (isFuncView) charge.distanceMax(150)

    const sim = d3.forceSimulation<SimNode>(nodes)
      .force('link', linkForce)
      .force('charge', charge)
      .force('collision', d3.forceCollide(collisionRadius).strength(isFuncView ? 0.3 : 1))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('cluster', forceCluster(clusterStrength) as never)
      .force('clusterRepel', forceClusterRepel(isFuncView ? 2.0 : 0.8, isFuncView ? 300 : 60) as never)
      .force('drift', forceDrift(driftAmplitude, driftPull) as never)
      .alphaDecay(isFuncView ? 1e-11 : 0)
      .alphaMin(0)
      .velocityDecay(0.75)
      .alpha(isFuncView ? 0.003 : 0.04)

    simRef.current = sim

    // Auto-fit: zoom to fit all nodes in viewport with padding
    function autoFit(animate = true) {
      const xs = nodes.map((nd) => nd.x ?? 0)
      const ys = nodes.map((nd) => nd.y ?? 0)
      const x0 = Math.min(...xs), x1 = Math.max(...xs)
      const y0 = Math.min(...ys), y1 = Math.max(...ys)
      const bw = (x1 - x0) || 1, bh = (y1 - y0) || 1
      const pad = 60
      const scale = Math.min(W / (bw + pad * 2), H / (bh + pad * 2), 1)
      const tx = W / 2 - (x0 + x1) / 2 * scale
      const ty = H / 2 - (y0 + y1) / 2 * scale
      const t = d3.zoomIdentity.translate(tx, ty).scale(scale)
      if (animate) {
        svg.transition().duration(800).call(zoomBehavior.transform as never, t)
      } else {
        svg.call(zoomBehavior.transform as never, t)
      }
    }

    // For function view: pre-run simulation synchronously so nodes start clustered
    if (isFuncView) {
      sim.stop()
      // Phase 1: cluster-only — disable links, group nodes at their centers
      sim.force('link', null)
      sim.alphaDecay(0)  // no decay during pre-run
      sim.alpha(0.3)
      for (let i = 0; i < 400; i++) sim.tick()
      // Phase 2: re-enable links, settle within clusters
      sim.force('link', linkForce)
      sim.alpha(0.1)
      for (let i = 0; i < 300; i++) sim.tick()
      // Reduce collision strength for runtime to prevent vibration but avoid overlap
      sim.force('collision', d3.forceCollide(collisionRadius).strength(0.1))
      // Resume with near-zero decay for ultra-slow breathing motion
      sim.alphaDecay(1e-11)
      sim.alpha(0.003).restart()
    }

    // For module view: warm up then fit with animation
    if (!isFuncView) {
      let autoFitDone = false
      const warmupTicks = Math.min(80 + n, 300)
      let tickCount = 0
      sim.on('tick.autofit', () => {
        tickCount++
        if (tickCount === warmupTicks && !autoFitDone) {
          autoFitDone = true
          autoFit(true)
        }
      })
    }

    // --- Render layers ---

    // L1: Edges
    const linkLayer = gRoot.append('g')
    const linkEls = linkLayer.selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', 'rgba(0,0,0,0.06)')
      .attr('stroke-width', (d) => 0.5 + Math.min(d.weight * 0.4, 1.5))
      .style('transition', 'stroke 0.3s, stroke-width 0.3s')

    // L2: Node groups
    const nodeLayer = gRoot.append('g')
    const nodeEls = nodeLayer.selectAll<SVGGElement, SimNode>('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'pointer')

    // Invisible hit area
    nodeEls.append('circle')
      .attr('r', 16)
      .attr('fill', 'transparent')
      .attr('stroke', 'none')

    // Visible shapes
    nodeEls.each(function (d) {
      const el = d3.select(this)
      const col = getModuleColor(d.grpIndex)
      const r = d.kind === 'module' ? 10 : d.kind === 'cls' ? 6 : 6
      const sw = d.kind === 'module' ? 2 : 1
      el.append('circle')
        .attr('class', 'nshape')
        .attr('r', r)
        .attr('fill', col)
        .attr('stroke', col)
        .attr('stroke-width', sw)
        .style('transition', 'all 0.25s')
    })

    // Labels — always visible
    nodeEls.append('text')
      .attr('dx', (d) => d.kind === 'module' ? 14 : 10)
      .attr('dy', 4)
      .attr('fill', (d) => d.kind === 'module' ? getModuleColor(d.grpIndex) : 'rgba(0,0,0,0.55)')
      .attr('font-size', (d) => d.kind === 'module' ? '13px' : '11px')
      .attr('font-weight', (d) => d.kind === 'module' ? '600' : '400')
      .attr('font-family', '"Barlow", sans-serif')
      .attr('pointer-events', 'none')
      .style('transition', 'fill 0.25s, font-weight 0.25s')
      .text((d) => {
        let name = d.label.replace(/\(.*\)/, '')
        return name.length > 20 ? name.slice(0, 18) + '\u2026' : name
      })

    // --- Helper: reset node style ---
    function resetNodeStyle(el: d3.Selection<SVGGElement, SimNode, null, undefined>, d: SimNode) {
      const col = getModuleColor(d.grpIndex)
      const shape = el.select('.nshape')
      const isMod = d.kind === 'module'
      shape.attr('filter', null)
        .attr('fill', col).attr('fill-opacity', 1)
        .attr('stroke', col).attr('stroke-opacity', 1)
        .attr('stroke-width', isMod ? 2 : 1)
        .attr('r', isMod ? 9 : 6)
      el.select('text')
        .attr('fill', isMod ? col : 'rgba(0,0,0,0.55)')
        .attr('font-weight', isMod ? '600' : '400')
    }

    // --- Helper: deselect all ---
    function deselectAll() {
      linkEls
        .attr('stroke', 'rgba(0,0,0,0.06)')
        .attr('stroke-width', (d) => 0.5 + Math.min(d.weight * 0.4, 1.5))
        .attr('stroke-opacity', 1)
      nodeEls.each(function (d) {
        resetNodeStyle(d3.select(this) as never, d)
      })
    }

    // --- Helper: select a node (visual updates) ---
    function applySelection(targetId: string) {
      const targetNode = nodes.find((n) => n.id === targetId)
      if (!targetNode) return

      const col = getModuleColor(targetNode.grpIndex)
      const conn = new Set([targetId])
      links.forEach((l) => {
        const sid = linkId(l.source!)
          const tid = linkId(l.target!)
        if (sid === targetId) conn.add(tid)
        if (tid === targetId) conn.add(sid)
      })

      // Edges
      linkEls
        .attr('stroke', (l) => {
          const sid = typeof l.source === 'object' ? (l.source as SimNode).id : l.source
          const tid = typeof l.target === 'object' ? (l.target as SimNode).id : l.target
          if (sid === targetId) {
            const t = nodes.find((n) => n.id === tid)
            return t ? getModuleColor(t.grpIndex) : col
          }
          if (tid === targetId) {
            const s = nodes.find((n) => n.id === sid)
            return s ? getModuleColor(s.grpIndex) : col
          }
          return 'rgba(0,0,0,0.02)'
        })
        .attr('stroke-width', (l) => {
          const sid = typeof l.source === 'object' ? (l.source as SimNode).id : l.source
          const tid = typeof l.target === 'object' ? (l.target as SimNode).id : l.target
          return (sid === targetId || tid === targetId) ? 2 : 0.3
        })
        .attr('stroke-opacity', (l) => {
          const sid = typeof l.source === 'object' ? (l.source as SimNode).id : l.source
          const tid = typeof l.target === 'object' ? (l.target as SimNode).id : l.target
          return (sid === targetId || tid === targetId) ? 0.6 : 1
        })

      // Nodes
      nodeEls.each(function (n) {
        const el = d3.select(this) as d3.Selection<SVGGElement, SimNode, null, undefined>
        const nc = getModuleColor(n.grpIndex)
        if (n.id === targetId) {
          el.select('.nshape')
            .attr('fill', nc).attr('fill-opacity', 1)
            .attr('stroke', nc).attr('stroke-width', 2.5).attr('stroke-opacity', 1)
            .attr('filter', `drop-shadow(0 0 10px ${nc}50)`)
          el.select('text').attr('fill', '#111').attr('font-weight', '700')
        } else if (conn.has(n.id)) {
          el.select('.nshape')
            .attr('stroke-opacity', 1).attr('fill-opacity', 1)
            .attr('filter', null)
          el.select('text').attr('fill', 'rgba(0,0,0,0.7)').attr('font-weight', '500')
        } else {
          el.select('.nshape')
            .attr('stroke-opacity', 0.12).attr('fill-opacity', 0.3)
            .attr('filter', null)
          el.select('text').attr('fill', 'rgba(0,0,0,0.1)').attr('font-weight', '400')
        }
      })
    }

    // --- Hover ---
    nodeEls
      .on('mouseenter', function (ev, d) {
        if (d.id === selectedIdRef.current) return
        const col = getModuleColor(d.grpIndex)
        d3.select(this).select('.nshape')
          .attr('stroke-width', d.kind === 'module' ? 3 : 2.5)
          .attr('filter', `drop-shadow(0 0 6px ${col}40)`)
        d3.select(this).select('text')
          .attr('fill', 'rgba(0,0,0,0.85)').attr('font-weight', '600')

        // Tooltip
        const kindLabel = d.kind === 'cls' ? 'CLASS' : d.kind === 'module' ? 'MODULE' : 'FUNCTION'
        tooltip.html(`
          <div style="font-size:13px;font-weight:600;">${d.label.replace(/\(.*\)/, '')}</div>
          <div style="font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.45);margin-top:2px;">${kindLabel}</div>
          ${d.doc ? `<div style="font-size:12px;font-weight:300;color:rgba(255,255,255,0.65);margin-top:3px;">${d.doc.split('\n')[0].slice(0, 120)}</div>` : ''}
        `)
        const rect = container.getBoundingClientRect()
        tooltip
          .style('left', (ev.clientX - rect.left + 16) + 'px')
          .style('top', (ev.clientY - rect.top - 10) + 'px')
          .style('opacity', '1')
      })
      .on('mousemove', function (ev) {
        const rect = container.getBoundingClientRect()
        tooltip
          .style('left', (ev.clientX - rect.left + 16) + 'px')
          .style('top', (ev.clientY - rect.top - 10) + 'px')
      })
      .on('mouseleave', function (_ev, d) {
        if (d.id === selectedIdRef.current) return
        resetNodeStyle(d3.select(this) as never, d)
        tooltip.style('opacity', '0')
      })

    // Store selection functions in refs for external use (selection effect)
    applySelectionRef.current = applySelection
    deselectAllRef.current = deselectAll

    // Wire background click to deselect + zoom out
    bgClickRef.current = () => {
      deselectAll()
      if (isFuncView) {
        autoFit(true)
      }
    }

    // --- Click --- selects node, opens detail panel, zooms in for function view
    nodeEls.on('click', function (ev, d) {
      ev.stopPropagation()
      tooltip.style('opacity', '0')
      selectedIdRef.current = d.id
      selectNodeRef.current(d.id)
      applySelection(d.id)
      // Zoom to the clicked node in function view
      if (isFuncView && d.x != null && d.y != null) {
        const scale = 1.8
        const tx = W / 2 - d.x * scale
        const ty = H / 2 - d.y * scale
        const t = d3.zoomIdentity.translate(tx, ty).scale(scale)
        svg.transition().duration(500).call(zoomBehavior.transform as never, t)
      }
    })

    // --- Drag ---
    nodeEls.call(
      d3.drag<SVGGElement, SimNode>()
        .on('start', function (ev, d) {
          tooltip.style('opacity', '0')
          if (!ev.active) sim.alphaTarget(0.4).restart()
          d.fx = d.x
          d.fy = d.y
          d._dragStartX = d.x
          d._dragStartY = d.y
        })
        .on('drag', function (ev, d) {
          d.fx = ev.x
          d.fy = ev.y
          d.x = ev.x
          d.y = ev.y
          // Shift group anchor so cluster follows
          const dx = ev.x - (d._dragStartX ?? ev.x)
          const dy = ev.y - (d._dragStartY ?? ev.y)
          if (grpCenter[d.grp]) {
            grpCenter[d.grp].x += dx * 0.15
            grpCenter[d.grp].y += dy * 0.15
          }
          d._dragStartX = ev.x
          d._dragStartY = ev.y
          ticked()
        })
        .on('end', function (ev, d) {
          if (!ev.active) {
            sim.alphaTarget(0)
          }
          d.fx = null
          d.fy = null
          d._dragStartX = undefined
          d._dragStartY = undefined
        })
    )

    // --- Tick ---
    function ticked() {
      linkEls
        .attr('x1', (d) => (d.source as SimNode).x!)
        .attr('y1', (d) => (d.source as SimNode).y!)
        .attr('x2', (d) => (d.target as SimNode).x!)
        .attr('y2', (d) => (d.target as SimNode).y!)
      nodeEls.attr('transform', (d) => `translate(${d.x},${d.y})`)
    }
    sim.on('tick', ticked)

    // --- Minimap ---
    const minimapW = 160
    const minimapH = 100
    const minimap = d3.select(container)
      .append('canvas')
      .attr('width', minimapW)
      .attr('height', minimapH)
      .style('position', 'absolute')
      .style('bottom', '20px')
      .style('left', '24px')
      .style('z-index', '10')
      .style('opacity', '0.5')
      .style('transition', 'opacity 0.3s')
      .on('mouseenter', function () { d3.select(this).style('opacity', '0.9') })
      .on('mouseleave', function () { d3.select(this).style('opacity', '0.5') })

    const mctx = minimap.node()!.getContext('2d')!

    function drawMinimap() {
      mctx.clearRect(0, 0, minimapW, minimapH)
      const xs = nodes.map((n) => n.x ?? 0)
      const ys = nodes.map((n) => n.y ?? 0)
      const mx = Math.min(...xs) - 40
      const Mx = Math.max(...xs) + 40
      const my = Math.min(...ys) - 40
      const My = Math.max(...ys) + 40
      const s = Math.min(minimapW / (Mx - mx || 1), minimapH / (My - my || 1))

      // Draw links
      links.forEach((l) => {
        const src = l.source as SimNode
        const tgt = l.target as SimNode
        if (!src.x || !tgt.x) return
        mctx.strokeStyle = 'rgba(0,0,0,0.06)'
        mctx.lineWidth = 0.5
        mctx.beginPath()
        mctx.moveTo((src.x - mx) * s, (src.y! - my) * s)
        mctx.lineTo((tgt.x - mx) * s, (tgt.y! - my) * s)
        mctx.stroke()
      })

      // Draw nodes
      nodes.forEach((n) => {
        if (!n.x) return
        const col = getModuleColor(n.grpIndex)
        mctx.fillStyle = n.id === selectedIdRef.current ? col : 'rgba(0,0,0,0.2)'
        mctx.globalAlpha = 0.6
        mctx.beginPath()
        mctx.arc((n.x - mx) * s, (n.y! - my) * s, 1.5, 0, Math.PI * 2)
        mctx.fill()
        mctx.globalAlpha = 1
      })

      animRef.current = requestAnimationFrame(drawMinimap)
    }
    drawMinimap()

    // --- Legend ---
    const legend = d3.select(container)
      .append('div')
      .style('position', 'absolute')
      .style('bottom', '140px')
      .style('left', '24px')
      .style('z-index', '10')

    groups.forEach((g) => {
      const col = getModuleColor(g.index)
      const item = legend.append('div')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('gap', '8px')
        .style('padding', '3px 0')
        .style('font-size', '11px')
        .style('font-weight', '400')
        .style('color', 'rgba(0,0,0,0.4)')
        .style('letter-spacing', '0.02em')
        .style('font-family', '"Barlow", sans-serif')

      item.append('span')
        .style('width', '8px')
        .style('height', '8px')
        .style('border-radius', '50%')
        .style('flex-shrink', '0')
        .style('background', col)

      item.append('span').text(g.label)
    })

    // Apply initial selection if any
    if (selectedIdRef.current) {
      applySelection(selectedIdRef.current)
    }

    // For function view: fit immediately (no animation) since simulation already pre-ran
    if (isFuncView) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => autoFit(false))
    }

    return () => {
      cleanup()
      applySelectionRef.current = null
      deselectAllRef.current = null
      // Remove legend
      if (container) {
        container.querySelectorAll('div[style*="position: absolute"]').forEach((el) => {
          if (el !== containerRef.current) el.remove()
        })
        container.querySelectorAll('canvas').forEach((el) => el.remove())
        container.querySelectorAll('svg').forEach((el) => el.remove())
      }
    }
  }, [data, zoomLevel, cleanup])

  // Handle selectedNodeId changes — update visuals WITHOUT rebuilding the graph
  useEffect(() => {
    if (!svgRef.current) return
    if (selectedNodeId) {
      applySelectionRef.current?.(selectedNodeId)
    } else {
      deselectAllRef.current?.()
    }
  }, [selectedNodeId])

  // Handle focusNodeId changes (from search)
  useEffect(() => {
    if (!focusNodeId || !svgRef.current) return
    // Trigger selection for the focused node
    selectNode(focusNodeId)
    setFocusNodeId(null)
  }, [focusNodeId, selectNode, setFocusNodeId])

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-white"
      style={{ position: 'relative', overflow: 'hidden' }}
    />
  )
}

// ============================================================
// Transform codespace_graph.json -> D3 nodes/links
// ============================================================

interface GroupInfo {
  id: string
  label: string
  index: number
  cx: number
  cy: number
}

function transformForD3(
  data: CodespaceGraph,
  zoomLevel: string,
  moduleIndexMap: Map<string, number>,
  W: number,
  H: number,
): { nodes: SimNode[]; links: SimLink[]; groups: GroupInfo[] } {
  const modules = data.nodes.filter((n) => n.type === 'module')

  if (zoomLevel === 'repo') {
    const repoNodes = data.nodes.filter((n) => n.type === 'repo')
    const nodes: SimNode[] = repoNodes.map((n) => ({
      id: n.id,
      label: n.label,
      grp: 'repo',
      kind: 'repo',
      grpIndex: 0,
      doc: n.summary_l1 || '',
      nodeType: 'repo',
      raw: n,
      x: W / 2,
      y: H / 2,
    }))
    return {
      nodes,
      links: [],
      groups: [{ id: 'repo', label: repoNodes[0]?.label || 'Repository', index: 0, cx: W / 2, cy: H / 2 }],
    }
  }

  // Compute group layout in an organic circular spread
  const nMods = modules.length
  const spreadR = Math.min(W, H) * 0.35
  const groups: GroupInfo[] = modules.map((mod, i) => {
    // Place groups on concentric rings with jitter
    const ring = Math.floor(i / 8)          // ~8 per ring
    const idxInRing = i % 8
    const ringCount = Math.min(8, nMods - ring * 8)
    const angle = (idxInRing / ringCount) * Math.PI * 2 + ring * 0.4
    const r = spreadR * (0.3 + ring * 0.35) + (Math.random() - 0.5) * 40
    return {
      id: mod.id,
      label: mod.semantic_label || mod.label,
      index: moduleIndexMap.get(mod.id) ?? i,
      cx: W / 2 + Math.cos(angle) * r,
      cy: H / 2 + Math.sin(angle) * r,
    }
  })

  const grpCenterMap: Record<string, { cx: number; cy: number }> = {}
  groups.forEach((g) => { grpCenterMap[g.id] = { cx: g.cx, cy: g.cy } })

  // --- Community detection (shared by module & function views) ---
  const moduleIds = new Set(modules.map((m) => m.id))
  const modEdges = data.edges
    .filter((e) => moduleIds.has(e.source) && moduleIds.has(e.target) && e.source !== e.target)

  const communityOf = detectCommunities(modules.map((m) => m.id), modEdges)
  const communityIds = [...new Set(Object.values(communityOf))]
  const communityColorMap = new Map<string, number>()
  communityIds.forEach((cid, i) => communityColorMap.set(cid, i))

  // Community group centers — organic circular layout
  // For function view, spread much wider since each community has many more nodes
  const cCount = communityIds.length
  const isFuncLevel = zoomLevel === 'function'
  const cSpreadR = Math.min(W, H) * (isFuncLevel ? 0.8 : 0.32)
  const communityGroups: GroupInfo[] = communityIds.map((cid, i) => {
    const ring = Math.floor(i / 6)
    const idxInRing = i % 6
    const ringCount = Math.min(6, cCount - ring * 6)
    const angle = (idxInRing / ringCount) * Math.PI * 2 + ring * 0.5
    const r = cSpreadR * (0.4 + ring * 0.4) + (Math.random() - 0.5) * 30
    const members = modules.filter((m) => communityOf[m.id] === cid)
    const label = members.slice(0, 3).map((m) => m.semantic_label || m.label).join(', ')
      + (members.length > 3 ? ` +${members.length - 3}` : '')
    return {
      id: cid,
      label,
      index: i,
      cx: W / 2 + Math.cos(angle) * r,
      cy: H / 2 + Math.sin(angle) * r,
    }
  })

  const commCenterMap: Record<string, { cx: number; cy: number }> = {}
  communityGroups.forEach((g) => { commCenterMap[g.id] = { cx: g.cx, cy: g.cy } })

  // Map: module id → community id
  const modToCommunity = communityOf

  if (zoomLevel === 'module') {
    // Module view: modules as nodes, grouped by community
    const nodes: SimNode[] = modules.map((mod) => {
      const comm = modToCommunity[mod.id]
      const g = commCenterMap[comm] ?? { cx: W / 2, cy: H / 2 }
      const a = Math.random() * Math.PI * 2
      const r = 20 + Math.random() * 50
      return {
        id: mod.id,
        label: mod.semantic_label || mod.label,
        grp: comm,
        kind: 'module',
        grpIndex: communityColorMap.get(comm) ?? 0,
        doc: mod.summary_l1 || '',
        nodeType: 'module',
        raw: mod,
        x: g.cx + Math.cos(a) * r,
        y: g.cy + Math.sin(a) * r,
      }
    })

    const links: SimLink[] = modEdges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight || 1,
    }))

    return { nodes, links, groups: communityGroups }
  }

  // Function view: function/class nodes grouped by SAME communities as module view
  const childTypes = ['function', 'class']
  const IMPORTANCE_THRESHOLD = 0.05
  const childNodes = data.nodes.filter((n) => {
    if (!childTypes.includes(n.type) || !n.parent || !moduleIds.has(n.parent)) return false
    const category = n.category as string | undefined
    const importance = n.importance as number | undefined
    // Always filter test-category nodes
    if (category === 'test') return false
    // Filter nodes below threshold (if importance data exists)
    if (importance != null && importance < IMPORTANCE_THRESHOLD) return false
    return true
  })

  const nodes: SimNode[] = childNodes.map((node) => {
    const comm = modToCommunity[node.parent!] ?? node.parent!
    const g = commCenterMap[comm] ?? { cx: W / 2, cy: H / 2 }
    const a = Math.random() * Math.PI * 2
    const r = 40 + Math.random() * 120  // wider initial spread for function nodes
    return {
      id: node.id,
      label: node.label,
      grp: comm,                                          // same community as module view
      kind: node.type === 'class' ? 'cls' : 'fn',
      grpIndex: communityColorMap.get(comm) ?? 0,         // same color as module view
      doc: (node.docstring as string) || node.summary_l1 || '',
      nodeType: node.type,
      raw: node,
      x: g.cx + Math.cos(a) * r,
      y: g.cy + Math.sin(a) * r,
    }
  })

  const visibleIds = new Set(nodes.map((n) => n.id))
  const links: SimLink[] = data.edges
    .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target) && e.source !== e.target)
    .map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight || 1,
    }))

  return { nodes, links, groups: communityGroups }
}

// ============================================================
// Simple label-propagation community detection
// Groups tightly-connected nodes into communities (max ~8)
// ============================================================
function detectCommunities(
  nodeIds: string[],
  edges: { source: string; target: string; weight?: number }[],
): Record<string, string> {
  // Build adjacency with weights
  const adj: Record<string, { neighbor: string; weight: number }[]> = {}
  nodeIds.forEach((id) => { adj[id] = [] })
  edges.forEach((e) => {
    const w = e.weight || 1
    if (adj[e.source]) adj[e.source].push({ neighbor: e.target, weight: w })
    if (adj[e.target]) adj[e.target].push({ neighbor: e.source, weight: w })
  })

  // Initialize: each node is its own community
  const label: Record<string, string> = {}
  nodeIds.forEach((id) => { label[id] = id })

  // Iterate: each node adopts the label most common among its neighbors (weighted)
  for (let iter = 0; iter < 15; iter++) {
    let changed = false
    // Shuffle order each iteration for stability
    const order = [...nodeIds].sort(() => Math.random() - 0.5)
    for (const nid of order) {
      const neighbors = adj[nid]
      if (!neighbors.length) continue
      // Tally weighted votes for each neighboring label
      const votes: Record<string, number> = {}
      for (const { neighbor, weight } of neighbors) {
        const nl = label[neighbor]
        votes[nl] = (votes[nl] || 0) + weight
      }
      // Pick label with highest votes
      let bestLabel = label[nid]
      let bestScore = 0
      for (const [lbl, score] of Object.entries(votes)) {
        if (score > bestScore) { bestScore = score; bestLabel = lbl }
      }
      if (bestLabel !== label[nid]) {
        label[nid] = bestLabel
        changed = true
      }
    }
    if (!changed) break
  }

  // If too many communities, merge smallest ones
  const commCounts: Record<string, number> = {}
  Object.values(label).forEach((l) => { commCounts[l] = (commCounts[l] || 0) + 1 })
  const MAX_COMMUNITIES = 12
  const sortedComms = Object.entries(commCounts).sort((a, b) => b[1] - a[1])
  if (sortedComms.length > MAX_COMMUNITIES) {
    const keepSet = new Set(sortedComms.slice(0, MAX_COMMUNITIES).map(([c]) => c))
    // Merge orphan communities into nearest large community via edges
    for (const nid of nodeIds) {
      if (keepSet.has(label[nid])) continue
      // Find best kept community among neighbors
      const votes: Record<string, number> = {}
      for (const { neighbor, weight } of adj[nid]) {
        const nl = label[neighbor]
        if (keepSet.has(nl)) {
          votes[nl] = (votes[nl] || 0) + weight
        }
      }
      let best = sortedComms[0][0] // fallback: largest community
      let bestW = 0
      for (const [lbl, w] of Object.entries(votes)) {
        if (w > bestW) { bestW = w; best = lbl }
      }
      label[nid] = best
    }
  }

  return label
}
