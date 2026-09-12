import type { MindMapController, MindMapDocument } from '../core/types'
import { findNode, walkNodes } from '../core/utils'

export interface MindMapCommandContext { controller: MindMapController; readOnly: boolean }
export interface MindMapEditorCommand {
  id: string
  label: string
  enabled?: (context: MindMapCommandContext) => boolean
  execute(context: MindMapCommandContext): void | Promise<void>
}
export interface MindMapCommandState { id: string; label: string; enabled: boolean }
export interface MindMapCommandRegistry {
  list(): MindMapCommandState[]
  get(id: string): MindMapCommandState | undefined
  invoke(id: string): Promise<boolean>
}

export function createMindMapCommandRegistry(commands: readonly MindMapEditorCommand[], getContext: () => MindMapCommandContext): MindMapCommandRegistry {
  const map = new Map<string, MindMapEditorCommand>()
  for (const command of commands) {
    if (map.has(command.id)) throw new Error(`Duplicate mind map command: ${command.id}`)
    map.set(command.id, command)
  }
  function get(id: string): MindMapCommandState | undefined {
    const command = map.get(id)
    return command ? { id, label: command.label, enabled: command.enabled?.(getContext()) ?? true } : undefined
  }
  return {
    get,
    list: () => [...map.keys()].map((id) => get(id)!),
    async invoke(id) {
      const command = map.get(id)
      const context = getContext()
      if (!command || (command.enabled && !command.enabled(context))) return false
      await command.execute(context)
      return true
    },
  }
}

function location(document: MindMapDocument, id: string) {
  let found: { parentId: string | null; index: number } | null = null
  walkNodes(document, (node, parent, index) => { if (node.id === id) found = { parentId: parent?.id ?? null, index } })
  return found as { parentId: string | null; index: number } | null
}

export function mindMapTreeMoveCommands(labels: Record<'moveBefore' | 'moveAfter' | 'indent' | 'outdent', string>): MindMapEditorCommand[] {
  return (['moveBefore', 'moveAfter', 'indent', 'outdent'] as const).map((id) => {
    function destination(context: MindMapCommandContext) {
      const snapshot = context.controller.getSnapshot()
      const nodeId = snapshot.selectedNodeId
      const current = nodeId ? location(snapshot.document, nodeId) : null
      if (context.readOnly || !nodeId || !current) return null
      const siblings = current.parentId ? findNode(snapshot.document, current.parentId)?.children ?? [] : snapshot.document.roots
      if (id === 'moveBefore' && current.index > 0) return { nodeId, parentId: current.parentId, index: current.index - 1 }
      if (id === 'moveAfter' && current.index < siblings.length - 1) return { nodeId, parentId: current.parentId, index: current.index + 1 }
      if (id === 'indent' && current.index > 0) { const parent = siblings[current.index - 1]; return { nodeId, parentId: parent.id, index: parent.children?.length ?? 0 } }
      if (id === 'outdent' && current.parentId) { const parent = location(snapshot.document, current.parentId); if (parent) return { nodeId, parentId: parent.parentId, index: parent.index + 1 } }
      return null
    }
    return { id, label: labels[id], enabled: (context) => destination(context) !== null, execute(context) {
      const target = destination(context)
      if (!target) return
      const transaction = context.controller.beginTransaction('edit')
      if (transaction.applyPatches([{ type: 'move', ...target }])) transaction.commit()
      else transaction.cancel()
    } }
  })
}
