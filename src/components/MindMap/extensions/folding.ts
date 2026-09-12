import type { MindMapExtension } from '../core/types'

const extension: MindMapExtension = {
  id: 'folding',
  filterChildren(_node, children, collapsed) {
    return collapsed ? [] : children
  },
}

export function foldingExtension(): MindMapExtension {
  return { ...extension }
}
