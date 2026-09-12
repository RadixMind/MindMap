import { describe, expect, it, vi } from 'vitest'
import { createMindMapParser, parseMindMap } from '../index'
import type { MindMapNode } from '../index'

describe('incremental parser chunk ownership', () => {
  it.each(['roots', 'children'] as const)('copies published paths once for 10000 one-line %s chunks', (shape) => {
    const source = shape === 'roots' ? '- Initial\n' : 'Initial\n'
    const parser = createMindMapParser()
    parser.append(source)
    const published = parser.getDocument()
    const chunks = Array.from({ length: 10_000 }, (_, index) => '- Node ' + index + '\n')
    const originalSlice = Array.prototype.slice
    let copiedNodeArrays = 0
    let copiedNodeElements = 0
    const slice = vi.spyOn(Array.prototype, 'slice').mockImplementation(function (this: unknown[], start?: number, end?: number) {
      const first = this[0]
      if (first && typeof first === 'object' && 'id' in first && 'text' in first) {
        copiedNodeArrays++
        copiedNodeElements += this.length
      }
      return originalSlice.call(this, start, end)
    })
    try {
      for (const chunk of chunks) parser.append(chunk)
    } finally {
      slice.mockRestore()
    }
    // This is a deterministic work counter, not a wall-clock budget. The sole
    // published root array is copied once; unpublished arrays grow in place.
    expect(copiedNodeArrays).toBe(1)
    expect(copiedNodeElements).toBe(1)
    const current = parser.getDocument()
    expect(current).toEqual(parseMindMap(source + chunks.join('')))
    expect(published.roots).toHaveLength(1)
    expect(published.roots[0].children).toBeUndefined()
    expect(Object.isFrozen(published.roots)).toBe(true)
    expect(Object.isFrozen(current.roots)).toBe(true)
  })

  it('rolls back an unsuccessful chunk that reused unpublished arrays and comments', () => {
    const parser = createMindMapParser({ extensions: [{ id: 'reject', transformNode(node: MindMapNode) {
      if (node.text === 'Fail') throw new Error('Rejected line')
      return node
    } }] })
    parser.append('Root\n- A\n')
    expect(() => parser.append('- B\n%% Must roll back\n- Fail\n')).toThrow('Rejected line')
    parser.append('- C\n')
    expect(parser.getDocument()).toEqual(parseMindMap('Root\n- A\n- C\n'))
  })

  it('rolls back overwritten metadata across unpublished chunks', () => {
    const parser = createMindMapParser({ extensions: [{ id: 'reject', transformNode(node: MindMapNode) {
      if (node.text === 'Fail') throw new Error('Rejected line')
      return node
    } }] })
    parser.append('---\ntitle: original\n')
    expect(() => parser.append('title: changed\nFail\n')).toThrow('Rejected line')
    parser.append('---\nRoot\n')
    expect(parser.getDocument().metadata).toEqual({ title: 'original' })
  })
})
