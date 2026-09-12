import { DEFAULT_THEME, layoutMindMap, measureMindMapNodeContent } from './layout'
import { tokenizeMindMapInline } from './inline'
import type { MindMapInlineToken } from './inline'
import type { MindMapDocument, MindMapLayoutOptions, MindMapLayoutNode } from './types'
import { sanitizeMindMapUrl, authorizeMindMapImageUrl, type MindMapRemoteImagePolicy } from './url'
import { escapeXml } from './utils'

export interface RenderMindMapToSvgOptions extends MindMapLayoutOptions {
  padding?: number
  className?: string
  title?: string
  description?: string
  /** Application-owned renderer only, e.g. KaTeX with trust:false and
   * output:'mathml'. Never return user-provided HTML directly. A thrown render
   * error falls back to escaped source text; core never loads a math package. */
  renderMath?: (source: string, displayMode?: boolean) => string
}

function taskPrefix(node: MindMapLayoutNode): string {
  switch (node.attributes?.task?.status) {
    case 'done': return '✓ '
    case 'doing': return '◐ '
    case 'todo': return '○ '
    default: return ''
  }
}

function textToken(token: MindMapInlineToken, policy?: MindMapRemoteImagePolicy): string {
  const text = escapeXml(token.text)
  switch (token.type) {
    case 'image': return authorizeMindMapImageUrl(token.url, policy) ? '' : text
    case 'link': {
      const url = sanitizeMindMapUrl(token.url)
      return url ? '<a href="' + escapeXml(url) + '" target="_blank" rel="noopener noreferrer"><tspan text-decoration="underline">' + text + '</tspan></a>' : text
    }
    case 'bold': return '<tspan font-weight="700">' + text + '</tspan>'
    case 'italic': return '<tspan font-style="italic">' + text + '</tspan>'
    case 'strikethrough': return '<tspan text-decoration="line-through">' + text + '</tspan>'
    case 'code': return '<tspan font-family="monospace">' + text + '</tspan>'
    case 'highlight': return '<tspan font-weight="700" text-decoration="underline">' + text + '</tspan>'
    case 'math': return escapeXml((token.display ? '$$' : '$') + token.text + (token.display ? '$$' : '$'))
    default: return text
  }
}

function mathLine(tokens: MindMapInlineToken[], renderMath: (source: string, displayMode?: boolean) => string, policy?: MindMapRemoteImagePolicy): string {
  return tokens.map((token) => {
    const text = escapeXml(token.text)
    switch (token.type) {
      case 'math': {
        try { return renderMath(token.text, Boolean(token.display)) } catch { return escapeXml((token.display ? '$$' : '$') + token.text + (token.display ? '$$' : '$')) }
      }
      case 'image': return authorizeMindMapImageUrl(token.url, policy) ? '' : text
      case 'bold': return '<strong>' + text + '</strong>'
      case 'italic': return '<em>' + text + '</em>'
      case 'strikethrough': return '<s>' + text + '</s>'
      case 'code': return '<code>' + text + '</code>'
      case 'highlight': return '<mark>' + text + '</mark>'
      case 'link': {
        const url = sanitizeMindMapUrl(token.url)
        return url ? '<a href="' + escapeXml(url) + '" target="_blank" rel="noopener noreferrer">' + text + '</a>' : text
      }
      default: return text
    }
  }).join('')
}

export function renderMindMapToSvg(document: MindMapDocument, options: RenderMindMapToSvgOptions = {}): string {
  const padding = Number.isFinite(options.padding) ? Math.max(0, options.padding!) : 48
  const layout = layoutMindMap(document, options)
  const minX = layout.bounds.minX - padding
  const minY = layout.bounds.minY - padding
  const width = Math.max(1, layout.bounds.width + padding * 2)
  const height = Math.max(1, layout.bounds.height + padding * 2)
  const theme = { ...DEFAULT_THEME, ...options.theme }
  const edges = layout.edges.map((edge) => {
    const path = '<path d="' + escapeXml(edge.path) + '" fill="none" stroke="' + escapeXml(edge.color) + '" stroke-width="2.2" stroke-linecap="round"' + (edge.dotted ? ' stroke-dasharray="6 6"' : '') + '/>'
    const from = layout.nodeById.get(edge.fromId), to = layout.nodeById.get(edge.toId)
    if (!edge.label || !from || !to) return path
    return path + '<text x="' + ((from.x + to.x) / 2).toFixed(2) + '" y="' + ((from.y + to.y) / 2 - 8).toFixed(2) + '" text-anchor="middle" font-size="12" fill="' + escapeXml(theme.mutedText) + '">' + escapeXml(edge.label) + '</text>'
  }).join('')

  const nodes = layout.nodes.map((node) => {
    const root = node.depth === 0
    const color = root ? theme.rootText : theme.text
    const metrics = measureMindMapNodeContent(node, node.depth, theme, options.remoteImagePolicy)
    const { fontSize, labelY } = metrics
    const tokens = tokenizeMindMapInline(node.text)
    const label = escapeXml(taskPrefix(node) + node.text)
    const box = 'x="' + (-node.width / 2).toFixed(2) + '" y="' + (-node.height / 2).toFixed(2) + '" width="' + node.width.toFixed(2) + '" height="' + node.height.toFixed(2) + '"'
    const shape = root
      ? '<rect ' + box + ' rx="' + Math.min(node.height / 2, 24).toFixed(2) + '" fill="' + escapeXml(node.color) + '"/>'
      : '<rect ' + box + ' rx="8" fill="' + escapeXml(theme.background) + '" fill-opacity=".96" stroke="' + escapeXml(node.color) + '" stroke-opacity=".22"/><path d="M ' + (-node.width / 2 + 8).toFixed(2) + ' ' + (node.height / 2 - 3).toFixed(2) + ' H ' + (node.width / 2 - 8).toFixed(2) + '" stroke="' + escapeXml(node.color) + '" stroke-width="2" stroke-linecap="round"/>'
    const font = 'font-family="' + escapeXml(theme.fontFamily) + '" font-size="' + fontSize + '" fill="' + escapeXml(color) + '"'
    let content: string
    if (options.renderMath && tokens.some((token) => token.type === 'math')) {
      content = '<foreignObject x="' + (-node.width / 2 + 8).toFixed(2) + '" y="' + metrics.labelTop.toFixed(2) + '" width="' + (node.width - 16).toFixed(2) + '" height="' + metrics.labelHeight.toFixed(2) + '"><div xmlns="http://www.w3.org/1999/xhtml" style="text-align:center;font-family:' + escapeXml(theme.fontFamily) + ';font-size:' + fontSize + 'px;color:' + escapeXml(color) + '">' + escapeXml(taskPrefix(node)) + mathLine(tokens, options.renderMath, options.remoteImagePolicy) + '</div></foreignObject>'
    } else {
      content = '<text x="0" y="' + labelY.toFixed(2) + '" text-anchor="middle" dominant-baseline="central" ' + font + ' font-weight="' + (root ? 650 : node.depth === 1 ? 600 : 450) + '">' + escapeXml(taskPrefix(node)) + tokens.map((token) => textToken(token, options.remoteImagePolicy)).join('') + '</text>'
    }
    for (const line of metrics.multiline) {
      const items = tokenizeMindMapInline(line.text)
      if (options.renderMath && items.some((token) => token.type === 'math')) {
        content += '<foreignObject x="' + (-node.width / 2 + 8).toFixed(2) + '" y="' + line.top.toFixed(2) + '" width="' + (node.width - 16).toFixed(2) + '" height="' + line.height.toFixed(2) + '"><div xmlns="http://www.w3.org/1999/xhtml" style="text-align:center;font-size:' + line.fontSize.toFixed(2) + 'px;color:' + escapeXml(color) + '">' + mathLine(items, options.renderMath, options.remoteImagePolicy) + '</div></foreignObject>'
      } else {
        content += '<text x="0" y="' + line.y.toFixed(2) + '" text-anchor="middle" dominant-baseline="central" font-family="' + escapeXml(theme.fontFamily) + '" font-size="' + line.fontSize.toFixed(2) + '" fill="' + escapeXml(color) + '">' + items.map((token) => textToken(token, options.remoteImagePolicy)).join('') + '</text>'
      }
    }
    const tags = node.attributes?.tags?.values ?? []
    if (metrics.tagY !== null) {
      content += '<text x="0" y="' + metrics.tagY.toFixed(2) + '" text-anchor="middle" dominant-baseline="central" font-size="' + metrics.tagFontSize.toFixed(2) + '" fill="' + escapeXml(color) + '">' + tags.map((tag) => escapeXml('#' + tag)).join('  ') + '</text>'
    }
    for (const image of metrics.images) {
      content += '<image x="' + image.x.toFixed(2) + '" y="' + image.y.toFixed(2) + '" width="' + image.width.toFixed(2) + '" height="' + image.height.toFixed(2) + '" preserveAspectRatio="xMidYMid meet" crossorigin="anonymous" referrerpolicy="no-referrer" href="' + escapeXml(image.url) + '"><title>' + escapeXml(image.alt) + '</title></image>'
    }
    const remark = node.attributes?.remark?.text
    const title = remark ? '<title>' + escapeXml(remark) + '</title>' : ''
    return '<g transform="translate(' + node.x.toFixed(2) + ' ' + node.y.toFixed(2) + ')" aria-label="' + label + '">' + title + shape + content + '</g>'
  }).join('')
  const accessibleTitle = options.title ?? (document.roots.map((node) => tokenizeMindMapInline(node.text).map((token) => token.text).join('')).join(', ') || 'Mind map')
  const description = options.description ?? layout.nodes.map((node) => '  '.repeat(node.depth) + taskPrefix(node) + node.text).join('\n')
  const title = '<title>' + escapeXml(accessibleTitle) + '</title><desc>' + escapeXml(description) + '</desc>'
  return '<svg xmlns="http://www.w3.org/2000/svg" class="' + escapeXml(options.className ?? 'mindmap-static-svg') + '" viewBox="' + minX.toFixed(2) + ' ' + minY.toFixed(2) + ' ' + width.toFixed(2) + ' ' + height.toFixed(2) + '" width="' + width.toFixed(2) + '" height="' + height.toFixed(2) + '" role="img" aria-label="' + escapeXml(accessibleTitle) + '">' + title + '<rect x="' + minX.toFixed(2) + '" y="' + minY.toFixed(2) + '" width="' + width.toFixed(2) + '" height="' + height.toFixed(2) + '" fill="' + escapeXml(theme.background) + '"/>' + edges + nodes + '</svg>'
}
