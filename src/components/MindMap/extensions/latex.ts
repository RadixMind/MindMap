import type { MindMapExtension } from '../core/types'

const extension: MindMapExtension = {
  id: 'latex',
  transformNode(node) {
    if (!/\$[^$]+\$/.test([node.text, ...(node.attributes?.multiline?.lines ?? [])].join('\n'))) return node
    return { ...node, attributes: { ...node.attributes, latex: { enabled: true } } }
  },
}

/** KaTeX is loaded only when the renderer encounters math with this extension. */
export function latexExtension(): MindMapExtension {
  return { ...extension }
}
