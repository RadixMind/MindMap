import { describe, expect, it, vi } from 'vitest'
import { createMindMapController, DEFAULT_THEME } from '../index'
import type { MindMapLayout, MindMapPatch } from '../index'

describe('view-local projections', () => {
  it('isolates viewer options without publishing or modifying shared controller state', () => {
    const controller = createMindMapController('Root\n- A\n- B')
    const snapshot = controller.getSnapshot()
    const publish = vi.fn()
    controller.subscribe(publish)
    const left = controller.getLayout({ direction: 'left' })
    const right = controller.getLayout({ direction: 'right' })
    expect(left.nodeById.get('mm-0-0')?.side).toBe('left')
    expect(right.nodeById.get('mm-0-0')?.side).toBe('right')
    expect(controller.getLayout({ direction: 'left' })).toBe(left)
    expect(controller.getLayout({ theme: { ...DEFAULT_THEME } })).toBe(snapshot.layout)
    expect(controller.getSnapshot()).toBe(snapshot)
    expect(publish).not.toHaveBeenCalled()
    expect(Object.isFrozen(left.nodes)).toBe(true)
    expect('set' in left.nodeById).toBe(false)
  })

  it('bounds projection retention and invalidates on document changes', () => {
    const project = vi.fn((layout: MindMapLayout) => layout)
    const controller = createMindMapController('Root\n- A', { extensions: [{ id: 'count', transformLayout: project }] })
    expect(project).toHaveBeenCalledTimes(1)
    const first = controller.getLayout({ theme: { nodeFontSize: 20 } })
    expect(project).toHaveBeenCalledTimes(2)
    expect(controller.getLayout({ theme: { nodeFontSize: 20 } })).toBe(first)
    for (let index = 1; index <= 8; index++) controller.getLayout({ theme: { nodeFontSize: 20 + index } })
    expect(project).toHaveBeenCalledTimes(10)
    expect(controller.getLayout({ theme: { nodeFontSize: 20 } })).not.toBe(first)
    expect(project).toHaveBeenCalledTimes(11)
    controller.updateNode('mm-0-0', { text: 'Changed' })
    expect(project).toHaveBeenCalledTimes(12)
    expect(controller.getLayout({ theme: { nodeFontSize: 20 } }).nodeById.get('mm-0-0')?.text).toBe('Changed')
    expect(project).toHaveBeenCalledTimes(13)
  })

  it('provides a stable frozen copy of base options and extension configuration', () => {
    const extension = { id: 'example' }
    const controller = createMindMapController('Root', { extensions: [extension], theme: { rootFontSize: 20 }, foldOverrides: { 'mm-0': true } })
    const options = controller.getLayoutOptions()
    expect(controller.getLayoutOptions()).toBe(options)
    expect(options.extensions?.[0]).toEqual(extension)
    expect(options.extensions?.[0]).not.toBe(extension)
    expect(Object.isFrozen(options.extensions?.[0])).toBe(true)
    expect(Object.isFrozen(options.theme)).toBe(true)
    expect(Object.isFrozen(options.foldOverrides)).toBe(true)
    controller.setLayoutOptions({ direction: 'left' })
    expect(controller.getLayoutOptions()).not.toBe(options)
    expect(options.direction).toBeUndefined()
  })
})

describe('malformed patch rejection', () => {
  it.each([
    { type: 'unknown', nodeId: 'mm-0-0' },
    { type: 'remove' },
    { type: 'move', nodeId: 'mm-0-0', parentId: 'mm-0', index: 'x' },
    { type: 'insert', parentId: 'mm-0', index: Infinity, node: { id: 'new', text: 'New' } },
    null,
  ])('rejects %j without changing redo, selection or snapshot identity', (malformed) => {
    const controller = createMindMapController('Root\n- A')
    controller.selectNode('mm-0-0')
    controller.updateNode('mm-0-0', { text: 'Edited' })
    controller.undo()
    const snapshot = controller.getSnapshot()
    controller.applyPatches([malformed as unknown as MindMapPatch])
    expect(controller.getSnapshot()).toBe(snapshot)
    expect(snapshot.canRedo).toBe(true)
    expect(snapshot.selectedNodeId).toBe('mm-0-0')
  })
})
