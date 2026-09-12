import type { MindMapExtension, MindMapLayoutEdge } from '../core/types'

interface CrossLinks { anchor?: string; links: Array<{ target: string; label?: string; dotted: boolean }> }

function readCrossLinks(value: unknown): CrossLinks | undefined {
  if (!value || typeof value !== 'object') return undefined
  const data = value as Partial<CrossLinks>
  const links = Array.isArray(data.links) ? data.links
    .filter((link) => link && typeof link.target === 'string' && (link.label === undefined || typeof link.label === 'string') && (link.dotted === undefined || typeof link.dotted === 'boolean'))
    .map((link) => ({ ...link, dotted: link.dotted ?? false })) : []
  return { anchor: typeof data.anchor === 'string' ? data.anchor : undefined, links }
}

const extension: MindMapExtension = {
  id: 'cross-link',
  transformNode(node) {
    const links: CrossLinks['links'] = []
    let text = node.text.replace(/(-\.>|->)\s*\{#([\w-]+)\}(?:\s+"([^"]*)")?/g, (_, arrow: string, target: string, label?: string) => { links.push({ target, label, dotted: arrow === '-.>' }); return '' })
    const anchor = text.match(/\{#([\w-]+)\}/)?.[1]
    if (!anchor && !links.length) return node
    text = text.replace(/\{#[\w-]+\}/, '').trim()
    return { ...node, text, attributes: { ...node.attributes, crossLink: { anchor, links } } }
  },
  serializeNode(node, text) {
    const value = readCrossLinks(node.attributes?.crossLink)
    if (!value) return text
    return text + (value.anchor ? ` {#${value.anchor}}` : '') + value.links.map((link) => ` ${link.dotted ? '-.>' : '->'} {#${link.target}}${link.label !== undefined ? ` "${link.label}"` : ''}`).join('')
  },
  transformLayout(layout) {
    const anchors = new Map(layout.nodes.flatMap((node) => {
      const value = readCrossLinks(node.attributes?.crossLink)
      return value?.anchor ? [[value.anchor, node] as const] : []
    }))
    const edges: MindMapLayoutEdge[] = []
    for (const node of layout.nodes) {
      const value = readCrossLinks(node.attributes?.crossLink)
      for (const [index, link] of (value?.links ?? []).entries()) {
        const target = anchors.get(link.target)
        if (!target || target.id === node.id) continue
        const dx = target.x - node.x, dy = target.y - node.y
        const distance = Math.hypot(dx, dy)
        if (!distance) continue
        const offset = Math.min(distance * .3, 60)
        const x = (node.x + target.x) / 2 - dy / distance * offset
        const y = (node.y + target.y) / 2 + dx / distance * offset
        edges.push({ id: `cross-${node.id}-${target.id}-${index}`, fromId: node.id, toId: target.id, path: `M ${node.x} ${node.y} Q ${x} ${y} ${target.x} ${target.y}`, color: node.color, dotted: link.dotted, label: link.label })
      }
    }
    return edges.length ? { ...layout, edges: [...layout.edges, ...edges] } : layout
  },
}

export function crossLinkExtension(): MindMapExtension {
  return { ...extension }
}
