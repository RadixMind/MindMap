import { describe, expect, it } from 'vitest'
import { createMindMapController, createMindMapParser, measureMindMapNodeContent } from '../index'
import type { MindMapLayout, MindMapLayoutNode } from '../index'

describe('dimension cache retention', () => {
  it('does not retain individually oversized keys or duplicated image content', () => {
    const large = { text: 'large-' + 'x'.repeat(900_000) }
    const first = measureMindMapNodeContent(large, 1)
    expect(measureMindMapNodeContent(large, 1)).not.toBe(first)
    const image = { text: '![image](data:image/png;base64,' + 'A'.repeat(40_000) + ')' }
    const imageMetrics = measureMindMapNodeContent(image, 1)
    expect(measureMindMapNodeContent(image, 1)).not.toBe(imageMetrics)
    expect(imageMetrics.images).toHaveLength(1)
  })

  it('evicts by retained string weight before the entry-count cap', () => {
    const nodes = Array.from({ length: 12 }, (_, index) => ({ text: 'weighted-' + index, attributes: { multiline: { lines: ['x'.repeat(12_000)] } } }))
    const first = measureMindMapNodeContent(nodes[0], 1)
    for (const node of nodes.slice(1)) measureMindMapNodeContent(node, 1)
    const recent = measureMindMapNodeContent(nodes[11], 1)
    expect(measureMindMapNodeContent(nodes[11], 1)).toBe(recent)
    expect(measureMindMapNodeContent(nodes[0], 1)).not.toBe(first)
  })
})

describe('extension output ownership', () => {
  it('detaches extension attributes and retained map instances from published projections', () => {
    const attributes = { tags: { values: ['original'] } }
    let extensionLayout: MindMapLayout | undefined
    const controller = createMindMapController('Root\n- Child', { extensions: [{ id: 'owned-output', transformLayout(layout) {
      const nodes = layout.nodes.map((node) => ({ ...node, attributes }))
      extensionLayout = { ...layout, nodes, edges: layout.edges.map((edge) => ({ ...edge })), bounds: { ...layout.bounds }, nodeById: new Map(nodes.map((node) => [node.id, node])), childrenByParent: new Map([...layout.childrenByParent].map(([id, children]) => [id, children.slice()])) }
      return extensionLayout
    } }] })
    const snapshot = controller.getSnapshot()
    attributes.tags.values.push('external mutation')
    const retained = extensionLayout!
    ;(retained.nodeById as Map<string, MindMapLayoutNode>).set('injected', retained.nodes[0])
    ;(retained.childrenByParent as Map<string, string[]>).set('mm-0', ['injected'])
    expect(snapshot.layout.nodes[0].attributes?.tags?.values).toEqual(['original'])
    expect(snapshot.layout.nodeById.has('injected')).toBe(false)
    expect(snapshot.layout.childrenByParent.get('mm-0')).toEqual(['mm-0-0'])
    expect(snapshot.layout.nodeById.get('mm-0')).toBe(snapshot.layout.nodes[0])
    expect(Object.isFrozen(snapshot.layout.nodes[0].attributes?.tags?.values)).toBe(true)
    expect(controller.getSnapshot()).toBe(snapshot)
  })

  it('deeply freezes a parser extension node even if the extension shallow-froze its wrapper', () => {
    const parser = createMindMapParser({ extensions: [{ id: 'shallow-output', transformNode(node) {
      return Object.freeze({ ...node, attributes: { tags: { values: ['tag'] } } })
    } }] })
    parser.append('Root\n')
    const document = parser.getDocument()
    expect(Object.isFrozen(document.roots[0].attributes?.tags?.values)).toBe(true)
    expect(() => document.roots[0].attributes!.tags!.values.push('change')).toThrow()
  })
})
