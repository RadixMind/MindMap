import { describe, expect, it } from 'vitest'
import { createMindMapController } from '../core/controller'
import { createMindMapCommandRegistry, mindMapTreeMoveCommands } from './commands'

describe('public command registry', () => {
  it('shares disabled state and executes transactional sibling/indent/outdent commands', async () => {
    const controller = createMindMapController('Root\n- A\n- B\n- C')
    const root = controller.getSnapshot().document.roots[0]
    const id = root.children![0].id
    controller.selectNode(id)
    let readOnly = false
    const registry = createMindMapCommandRegistry(mindMapTreeMoveCommands({ moveBefore: 'Up', moveAfter: 'Down', indent: 'Indent', outdent: 'Outdent' }), () => ({ controller, readOnly }))
    expect(registry.get('moveBefore')?.enabled).toBe(false)
    expect(await registry.invoke('moveAfter')).toBe(true)
    expect(controller.getSnapshot().document.roots[0].children!.map((node) => node.text)).toEqual(['B', 'A', 'C'])
    expect(controller.undo()).toBe(true)
    expect(controller.getSnapshot().document.roots[0].children!.map((node) => node.text)).toEqual(['A', 'B', 'C'])
    expect(controller.getSnapshot().canUndo).toBe(false)
    controller.selectNode(root.children![1].id)
    await registry.invoke('indent')
    expect(controller.getSnapshot().document.roots[0].children![0].children![0].text).toBe('B')
    await registry.invoke('outdent')
    expect(controller.getSnapshot().document.roots[0].children!.map((node) => node.text)).toEqual(['A', 'B', 'C'])
    readOnly = true
    expect(await registry.invoke('moveAfter')).toBe(false)
  })
  it('rejects duplicate contributions instead of silently overriding built-ins', () => {
    const controller = createMindMapController('Root')
    const command = { id: 'copy', label: 'Copy', execute() {} }
    expect(() => createMindMapCommandRegistry([command, command], () => ({ controller, readOnly: false }))).toThrow('Duplicate')
  })
})
