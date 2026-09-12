import type { MindMapLayout } from '../core/types'
import type { MindMapCullingOptions, MindMapViewport } from './MindMapSurface'

export interface MindMapCullingInput {
  viewport: MindMapViewport
  width: number
  height: number
  options?: MindMapCullingOptions
  pinnedNodeIds?: readonly (string | null | undefined)[]
}

/** Filters presentation only; semantic lookup indexes remain complete. */
export function cullMindMapLayout(layout: MindMapLayout, { viewport, width, height, options, pinnedNodeIds = [] }: MindMapCullingInput): MindMapLayout {
  if (options?.enabled === false || layout.nodes.length < (options?.threshold ?? 200) || width <= 0 || height <= 0 || !Number.isFinite(viewport.zoom) || viewport.zoom <= 0) return layout
  const margin = Math.max(0, options?.overscan ?? 160) / viewport.zoom
  const left = -viewport.x / viewport.zoom - margin
  const top = -viewport.y / viewport.zoom - margin
  const right = left + width / viewport.zoom + margin * 2
  const bottom = top + height / viewport.zoom + margin * 2
  const pinned = new Set(pinnedNodeIds)
  const nodes = layout.nodes.filter((node) => pinned.has(node.id) || (node.x + node.width / 2 >= left && node.x - node.width / 2 <= right && node.y + node.height / 2 >= top && node.y - node.height / 2 <= bottom))
  const edges = layout.edges.filter((edge) => {
    // Bezier curves stay within their control-point hull. Unknown commands stay visible.
    if (/[a-zA-Z]/g.test(edge.path.replace(/[MLCQ]/g, ''))) return true
    const coordinates = edge.path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)?.map(Number) ?? []
    if (!coordinates.length || coordinates.length % 2) return true
    const xs = coordinates.filter((_, index) => index % 2 === 0)
    const ys = coordinates.filter((_, index) => index % 2 === 1)
    return Math.max(...xs) >= left && Math.min(...xs) <= right && Math.max(...ys) >= top && Math.min(...ys) <= bottom
  })
  return { ...layout, nodes, edges }
}
