import { describe, expect, it } from 'vitest'
import { createMindMapController } from '../controller'
import type { MindMapController, MindMapControllerEvent } from '../types'

function setup() {
  const controller = createMindMapController({ roots: [{ id: 'root', text: 'Root', children: [{ id: 'child', text: 'Child' }] }] })
  controller.selectNode('child')
  const baseline = controller.getSnapshot()
  const transaction = controller.beginTransaction('stream')
  transaction.applyPatches([{ type: 'insert', parentId: 'root', index: 1, node: { id: 'provisional', text: 'Provisional' } }])
  const preview = controller.getSnapshot()
  const events: MindMapControllerEvent[] = []
  controller.subscribeEvents((event) => events.push(event))
  return { controller, transaction, baseline, preview, events }
}

const provisionalCommands: [string, (controller: MindMapController) => boolean][] = [
  ['patch batch', (controller) => controller.applyPatches([{ type: 'update', nodeId: 'provisional', text: 'Updated' }])],
  ['update', (controller) => controller.updateNode('provisional', { text: 'Updated' })],
  ['insert', (controller) => controller.insertNode('provisional', { id: 'new', text: 'New' })],
  ['remove', (controller) => controller.removeNode('provisional')],
  ['move node', (controller) => controller.moveNode('provisional', null)],
  ['move parent', (controller) => controller.moveNode('child', 'provisional')],
  ['fold', (controller) => controller.toggleFold('provisional')],
]

describe('concurrent mutation admission', () => {
  it.each(provisionalCommands)('rejects %s against provisional-only data without touching the transaction', (_name, command) => {
    const { controller, transaction, preview, events } = setup()
    expect(command(controller)).toBe(false)
    expect(controller.getSnapshot()).toBe(preview)
    expect(transaction.isActive()).toBe(true)
    expect(events).toEqual([])
    expect(transaction.commit()).toBe(true)
    expect(events.map((event) => event.phase)).toEqual(['commit'])
    controller.dispose()
  })

  it('rejects a mixed batch atomically even if every operation is valid in the preview', () => {
    const { controller, transaction, baseline, preview, events } = setup()
    expect(controller.applyPatches([
      { type: 'update', nodeId: 'root', text: 'Would change baseline' },
      { type: 'update', nodeId: 'provisional', text: 'Only exists in preview' },
    ])).toBe(false)
    expect(controller.getSnapshot()).toBe(preview)
    expect(transaction.isActive()).toBe(true)
    expect(events).toEqual([])
    expect(transaction.cancel()).toBe(true)
    expect(controller.getSnapshot().document).toEqual(baseline.document)
    expect(controller.getSnapshot().selectedNodeId).toBe('child')
    expect(controller.getSnapshot().canUndo).toBe(false)
    expect(events.map((event) => event.phase)).toEqual(['rollback'])
    controller.dispose()
  })

  it('rejects malformed mixed batches without publishing the earlier valid operation', () => {
    const { controller, transaction, preview, events } = setup()
    expect(controller.applyPatches([
      { type: 'update', nodeId: 'root', text: 'Valid' },
      { type: 'update', nodeId: 'child', text: 'Invalid\nline' },
    ])).toBe(false)
    expect(controller.getSnapshot()).toBe(preview)
    expect(transaction.isActive()).toBe(true)
    expect(events).toEqual([])
    controller.dispose()
  })

  it('accepts committed targets hidden by the preview, rolling back before publishing one edit', () => {
    const { controller, transaction, baseline, events } = setup()
    transaction.applyPatches([{ type: 'remove', nodeId: 'child' }])
    events.length = 0
    expect(controller.updateNode('child', { text: 'User edit' })).toBe(true)
    expect(transaction.isActive()).toBe(false)
    expect(events.map((event) => event.phase)).toEqual(['rollback', 'commit'])
    expect(events[0].current.document).toEqual(baseline.document)
    expect(controller.getSnapshot().document.roots[0].children).toEqual([{ id: 'child', text: 'User edit' }])
    expect(transaction.commit()).toBe(false)
    expect(controller.undo()).toBe(true)
    expect(controller.getSnapshot().document).toEqual(baseline.document)
    expect(controller.undo()).toBe(false)
    controller.dispose()
  })

  it('computes fold changes from baseline attributes instead of preview attributes', () => {
    const { controller, transaction, baseline, events } = setup()
    transaction.applyPatches([{ type: 'update', nodeId: 'root', attributes: { folding: { collapsed: true }, remark: { text: 'Preview remark' } } }])
    events.length = 0
    expect(controller.toggleFold('root')).toBe(true)
    expect(controller.getSnapshot().document.roots[0].attributes).toEqual({ folding: { collapsed: true } })
    expect(events.map((event) => event.phase)).toEqual(['rollback', 'commit'])
    expect(transaction.isActive()).toBe(false)
    controller.undo()
    expect(controller.getSnapshot().document).toEqual(baseline.document)
    controller.dispose()
  })

  it('returns booleans for successful, no-op and disposed public mutation commands', () => {
    const controller = createMindMapController({ roots: [{ id: 'root', text: 'Root' }] })
    expect(controller.applyPatches([])).toBe(true)
    expect(controller.updateNode('root', { text: 'Root' })).toBe(true)
    expect(controller.insertNode('root', { id: 'new', text: 'New' })).toBe(true)
    expect(controller.moveNode('new', null)).toBe(true)
    expect(controller.toggleFold('root')).toBe(true)
    expect(controller.removeNode('new')).toBe(true)
    expect(controller.removeNode('new')).toBe(false)
    controller.dispose()
    expect(controller.applyPatches([])).toBe(false)
    expect(controller.updateNode('root', { text: 'Root' })).toBe(false)
    expect(controller.insertNode('root', { id: 'new', text: 'New' })).toBe(false)
    expect(controller.moveNode('root', null)).toBe(false)
    expect(controller.removeNode('root')).toBe(false)
    expect(controller.toggleFold('root')).toBe(false)
  })
})
