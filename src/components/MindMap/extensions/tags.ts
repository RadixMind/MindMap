import type { MindMapExtension, MindMapNode } from '../core/types'

const TAG_PATTERN = /(?:^|\s)#([\p{L}\p{N}_-]+)/gu

const extension: MindMapExtension = {
  id: 'tags',
  transformNode(node) {
    const values: string[] = []
    const text = node.text.replace(TAG_PATTERN, (full, tag: string) => {
      values.push(tag)
      return full.startsWith(' ') ? ' ' : ''
    }).replace(/\s{2,}/g, ' ').trim()
    if (!values.length) return node
    return {
      ...node,
      text,
      attributes: { ...(node.attributes ?? {}), tags: { values } },
    }
  },
  serializeNode(node: MindMapNode, text: string) {
    const tags = (node.attributes?.tags as { values?: string[] } | undefined)?.values ?? []
    return tags.length ? `${text} ${tags.map((tag) => `#${tag}`).join(' ')}` : text
  },
}

export function tagsExtension(): MindMapExtension {
  return { ...extension }
}
