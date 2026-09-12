import { describe, expect, it } from 'vitest'
import { createMindMapController } from '../index'

describe('mind map controller', () => {
  it('applies immutable edit commands', () => {
    const controller = createMindMapController('Root\n- Child')
    const previous = controller.getSnapshot().document
    controller.updateNode('mm-0-0', { text: 'Updated' })
    expect(controller.getSnapshot().document.roots[0].children?.[0].text).toBe('Updated')
    expect(previous.roots[0].children?.[0].text).toBe('Child')
  })
})

