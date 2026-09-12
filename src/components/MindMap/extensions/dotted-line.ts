import type { MindMapExtension } from '../core/types'

const extension: MindMapExtension = {
  id: 'dotted-line',
  transformEdge(edge, _parent, child) {
    const dotted = Boolean((child.attributes?.connection as { dotted?: boolean } | undefined)?.dotted)
    return dotted ? { ...edge, dotted: true } : edge
  },
}

export function dottedLineExtension(): MindMapExtension {
  return { ...extension }
}
