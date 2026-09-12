import { describe, expect, it } from 'vitest'
import { layoutMindMap, parseMindMap } from '../index'

describe('headless layout', () => {
  it('creates maps and finite bounds without the DOM', () => {
    const layout = layoutMindMap(parseMindMap('Root\n- A\n  - A1\n- B\n  - B1'))
    expect(layout.nodes).toHaveLength(5)
    expect(layout.nodeById.size).toBe(5)
    expect(Number.isFinite(layout.bounds.width)).toBe(true)
    expect(layout.edges).toHaveLength(4)
  })
})

