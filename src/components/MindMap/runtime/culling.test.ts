import { describe, expect, it } from 'vitest'
import { createMindMapController } from '../core/controller'
import { cullMindMapLayout } from './culling'

function fixture() {
  const layout = createMindMapController('Root\n- Child').getSnapshot().layout
  const nodes = Array.from({ length: 5 }, (_, index) => ({ ...layout.nodes[0], id: String(index), x: index * 300, y: 0, width: 50, height: 30 }))
  return { ...layout, nodes, nodeById: new Map(nodes.map((node) => [node.id, node])), edges: [
    { id: 'visible', fromId: '0', toId: '1', color: 'red', path: 'M 0 0 C 100 0 200 0 300 0' },
    { id: 'outside', fromId: '3', toId: '4', color: 'red', path: 'M 900 0 C 1000 0 1100 0 1200 0' },
    { id: 'crossing', fromId: '3', toId: '4', color: 'red', path: 'M -300 0 Q 0 30 300 0' },
  ] }
}

describe('production viewport culling', () => {
  it('returns full identity for disabled mode or below threshold', () => {
    const layout = fixture()
    expect(cullMindMapLayout(layout, { viewport: { x: 0, y: 0, zoom: 1 }, width: 100, height: 100, options: { enabled: false } })).toBe(layout)
    expect(cullMindMapLayout(layout, { viewport: { x: 0, y: 0, zoom: 1 }, width: 100, height: 100, options: { threshold: 6 } })).toBe(layout)
  })
  it('uses viewport/zoom and retains crossing curves while removing offscreen edges', () => {
    const layout = fixture()
    const culled = cullMindMapLayout(layout, { viewport: { x: -600, y: 50, zoom: 2 }, width: 100, height: 100, options: { threshold: 0, overscan: 0 } })
    expect(culled.nodes.map((node) => node.id)).toEqual(['1'])
    expect(culled.edges.map((edge) => edge.id)).toEqual(['visible', 'crossing'])
    expect(culled.nodeById).toBe(layout.nodeById)
  })
  it('pins selected, editing and focused nodes and expands with overscan', () => {
    const layout = fixture()
    const pinned = cullMindMapLayout(layout, { viewport: { x: 0, y: 50, zoom: 1 }, width: 100, height: 100, options: { threshold: 0, overscan: 0 }, pinnedNodeIds: ['2', '3', '4'] })
    expect(pinned.nodes.map((node) => node.id)).toEqual(['0', '2', '3', '4'])
    const overscan = cullMindMapLayout(layout, { viewport: { x: 0, y: 50, zoom: 1 }, width: 100, height: 100, options: { threshold: 0, overscan: 250 } })
    expect(overscan.nodes.map((node) => node.id)).toEqual(['0', '1'])
  })
})
