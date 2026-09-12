import { compileExtensions } from './extensions'
import type { MindMapDocument, MindMapNode, MindMapSerializeOptions } from './types'
import { validateMindMapDocument, walkNodes } from './utils'

function serializeTask(node: MindMapNode): string {
  const status = node.attributes?.task?.status
  if (status === 'done') return '[x] '
  if (status === 'doing') return '[-] '
  if (status === 'todo') return '[ ] '
  return ''
}

export function serializeMindMap(document: MindMapDocument, options: MindMapSerializeOptions = {}): string {
  validateMindMapDocument(document)
  const compiled = compileExtensions(options.extensions)
  const output: string[] = []
  const metadata = { ...(document.metadata ?? {}) }
  if (document.direction) metadata.direction = document.direction
  if (document.theme) metadata.theme = document.theme
  if (Object.keys(metadata).length) {
    output.push('---')
    for (const [key, value] of Object.entries(metadata)) output.push(`${key}: ${value}`)
    output.push('---', '')
  }
  const nodeIds = new Set<string>()
  walkNodes(document, (node) => nodeIds.add(node.id))
  const commentsByNode = new Map<string, string[]>()
  for (const comment of document.comments ?? []) {
    if (!comment.afterNodeId || !nodeIds.has(comment.afterNodeId)) output.push(comment.text)
    else {
      const comments = commentsByNode.get(comment.afterNodeId) ?? []
      comments.push(comment.text)
      commentsByNode.set(comment.afterNodeId, comments)
    }
  }

  function writeNode(node: MindMapNode, depth: number, isRoot: boolean): void {
    const attributes = node.attributes
    const bareRoot = isRoot && !attributes?.syntax?.listRoot
    if (!attributes?.task && /^\[[ xX-]\]\s*/.test(node.text)) throw new Error('Node text collides with task syntax; use task attributes')
    if (compiled.ids.has('tags')) {
      const hasLiteralTag = /(?:^|\s)#[\p{L}\p{N}_-]+/u.test(node.text)
      const wouldCollapseSpaces = attributes?.tags?.values.length && /\s{2,}/.test(node.text)
      if (hasLiteralTag || wouldCollapseSpaces) throw new Error('Node text cannot round trip through tag syntax; use JSON export to preserve literal text losslessly')
    }
    if (compiled.ids.has('cross-link') && /\{#[\w-]+\}/.test(node.text)) throw new Error('Node text contains literal cross-link markup; use JSON export to preserve literal text losslessly')
    const required = [
      [Boolean(attributes?.tags?.values.length), 'tags'],
      [Boolean(attributes?.multiline?.lines.length), 'multiline'],
      [Boolean(attributes?.folding?.collapsed), 'folding'],
      [Boolean(attributes?.connection?.dotted), 'dotted-line'],
      [Boolean(attributes?.crossLink), 'cross-link'],
      [Boolean((attributes?.latex as { enabled?: boolean } | undefined)?.enabled), 'latex'],
    ] as const
    for (const [needed, extension] of required) if (needed && !compiled.ids.has(extension)) throw new Error('Markdown serialization requires the ' + extension + ' extension')
    if (attributes?.connection?.label !== undefined || (attributes?.folding?.collapsed && attributes?.connection?.dotted)) throw new Error('This connection cannot be represented by Markdown list markers; use JSON export')
    let text = `${serializeTask(node)}${node.text}`
    for (const extension of compiled.list) text = extension.serializeNode?.(node, text) ?? text
    if (/[\r\n\u2028\u2029]/.test(text)) throw new Error('Extension serialization must produce one node line')
    text = text.trim()
    if (bareRoot && (!text || /^(?:---$|%%|>|\||(?:-\.|[-*+])(?:\s|$))/.test(text))) throw new Error('Root text collides with Markdown structure; use list-root syntax')
    let marker = '- '
    if (attributes?.folding?.collapsed && compiled.ids.has('folding')) marker = '+ '
    else if (attributes?.connection?.dotted && compiled.ids.has('dotted-line')) marker = '-. '
    if (bareRoot) output.push(text)
    else output.push(`${'  '.repeat(depth)}${marker}${text}`)

    const childDepth = depth + (bareRoot ? 0 : 1)
    const continuationIndent = '  '.repeat(childDepth)
    const remark = attributes?.remark?.text
    if (remark !== undefined) {
      for (const line of remark.split('\n')) output.push(`${continuationIndent}> ${line}`)
    }
    const multiline = attributes?.multiline?.lines
    if (multiline && compiled.ids.has('multiline')) {
      for (const line of multiline) output.push(`${continuationIndent}| ${line}`)
    }
    output.push(...commentsByNode.get(node.id) ?? [])
    for (const child of node.children ?? []) writeNode(child, childDepth, false)
  }

  document.roots.forEach((root, index) => {
    writeNode(root, 0, true)
    if (index < document.roots.length - 1) output.push('')
  })
  return output.join('\n')
}
