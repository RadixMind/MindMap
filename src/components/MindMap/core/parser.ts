import { MAX_MINDMAP_MULTILINE_LINES, MAX_MINDMAP_COMMENTS, MAX_MINDMAP_METADATA_ENTRIES } from './limits'
import { compileExtensions } from './extensions'
import type { MindMapDirection, MindMapDocument, MindMapNode, MindMapNodeAttributes, MindMapParseOptions, MindMapTaskStatus, MindMapThemeMode } from './types'
import { freezeDocument, stableNodeId, validateMindMapDocument } from './utils'

interface RecordLine {
  indent: number
  text: string
  bare: boolean
  attributes?: MindMapNodeAttributes
  source: string
  continuations?: number
}

interface Entry { path: number[]; indent: number }
interface ParserState {
  roots: MindMapNode[]
  stack: Entry[]
  activeBareRoot: number | null
  last: { record: RecordLine; path: number[] } | null
  firstLine: boolean
  frontmatter: 'none' | 'pending' | 'closed'
  pendingMetadata: Record<string, string>
  metadata: Record<string, string>
  count: number
  comments: NonNullable<MindMapDocument['comments']>
  owned: WeakSet<object>
  rollback?: (() => void)[]
}

function initialState(): ParserState {
  return {
    roots: [], stack: [], activeBareRoot: null, last: null, firstLine: true,
    frontmatter: 'none', pendingMetadata: Object.create(null), metadata: Object.create(null), count: 0, comments: [], owned: new WeakSet(),
  }
}

function readTask(text: string): { text: string; status?: MindMapTaskStatus } {
  const match = text.match(/^\[([ xX-])\]\s*(.*)$/)
  if (!match) return { text }
  const status: MindMapTaskStatus = match[1] === ' ' ? 'todo' : match[1] === '-' ? 'doing' : 'done'
  return { text: match[2], status }
}

function nodeAt(state: ParserState, path: number[]): MindMapNode {
  let nodes = state.roots
  let node = nodes[path[0]]
  for (let i = 1; i < path.length; i++) {
    nodes = node.children ?? []
    node = nodes[path[i]]
  }
  return node
}

function putNode(state: ParserState, path: number[], node: MindMapNode): void {
  function visit(nodes: MindMapNode[], depth: number): MindMapNode[] {
    const index = path[depth]
    const result = state.owned.has(nodes) && !Object.isFrozen(nodes) ? nodes : nodes.slice()
    state.owned.add(result)
    const previous = result[index]
    const previousLength = result.length
    state.rollback?.push(() => {
      if (index < previousLength) result[index] = previous
      else result.length = previousLength
    })
    if (depth === path.length - 1) result[index] = node
    else result[index] = { ...nodes[index], children: visit(nodes[index].children ?? [], depth + 1) }
    return result
  }
  state.roots = visit(state.roots, 0)
}

/** Stateful line parser. Completed lines retain their parsed tree; only the
 * unfinished line is previewed again as chunks arrive. Frontmatter is kept
 * provisional until its closing delimiter commits the metadata. */
export function createMindMapParser(options: MindMapParseOptions = {}): {
  append(chunk: string): void
  getDocument(): MindMapDocument
} {
  const compiled = compileExtensions(options.extensions)
  let state = initialState()
  let tail = ''
  let skipLF = false
  let sourceLength = 0

  function transform(record: RecordLine, path: number[]): MindMapNode {
    let node: MindMapNode = {
      id: stableNodeId(path), text: record.bare ? record.text || 'Root' : record.text,
      ...(record.attributes ? { attributes: record.attributes } : {}),
    }
    for (const extension of compiled.list) node = extension.transformNode?.(node, record.source) ?? node
    const anchor = (node.attributes?.crossLink as { anchor?: unknown } | undefined)?.anchor
    if (typeof anchor === 'string' && /^[\w-]+$/.test(anchor)) node = { ...node, id: 'mm-anchor-' + anchor }
    return node
  }

  function followLine(target: ParserState, namespace: 'remark' | 'multiline', value: string): void {
    if (!target.last) return
    const { record, path } = target.last
    if ((record.continuations ?? 0) >= MAX_MINDMAP_MULTILINE_LINES) throw new Error('Mind map continuation limit exceeded')
    const attributes = { ...record.attributes }
    if (namespace === 'remark') {
      const text = attributes.remark?.text
      attributes.remark = { text: text !== undefined ? text + '\n' + value : value }
    } else {
      attributes.multiline = { lines: [...(attributes.multiline?.lines ?? []), value] }
    }
    const updated = { ...record, attributes, continuations: (record.continuations ?? 0) + 1 }
    const current = nodeAt(target, path)
    const transformed = transform(updated, path)
    putNode(target, path, { ...transformed, ...(current.children ? { children: current.children } : {}) })
    target.last = { record: updated, path }
  }

  function consume(target: ParserState, source: string): void {
    if (target.firstLine) {
      target.firstLine = false
      if (source === '---') target.frontmatter = 'pending'
    } else if (target.frontmatter === 'pending') {
      if (/^---\s*$/.test(source)) {
        target.frontmatter = 'closed'
        target.metadata = target.pendingMetadata
        target.roots = []
        target.stack = []
        target.activeBareRoot = null
        target.last = null
        target.count = 0
        target.comments = []
        return
      }
      const pair = source.match(/^\s*([A-Za-z0-9_.-]+)\s*:\s*(.*?)\s*$/)
      if (pair) {
        if (!target.owned.has(target.pendingMetadata) || Object.isFrozen(target.pendingMetadata)) {
          target.pendingMetadata = Object.assign(Object.create(null), target.pendingMetadata)
          target.owned.add(target.pendingMetadata)
        }
        const metadata = target.pendingMetadata
        const key = pair[1]
        const existed = Object.hasOwn(metadata, key)
        if (!existed && Object.keys(metadata).length >= MAX_MINDMAP_METADATA_ENTRIES) throw new Error('Mind map metadata entry limit exceeded')
        const previous = metadata[key]
        target.rollback?.push(() => { if (existed) metadata[key] = previous; else delete metadata[key] })
        metadata[key] = pair[2]
      }
    }
    if (/^\s*%%/.test(source)) {
      if (target.comments.length >= MAX_MINDMAP_COMMENTS) throw new Error('Mind map comment limit exceeded')
      if (!target.owned.has(target.comments) || Object.isFrozen(target.comments)) {
        target.comments = target.comments.slice()
        target.owned.add(target.comments)
      }
      const comments = target.comments
      const previousLength = comments.length
      target.rollback?.push(() => { comments.length = previousLength })
      comments.push({ text: source, afterNodeId: target.last ? nodeAt(target, target.last.path).id : null })
      return
    }
    if (source.trim() === '') return
    const remark = source.match(/^\s*>\s?(.*)$/)
    if (remark && target.last) { followLine(target, 'remark', remark[1]); return }
    const multiline = source.match(/^\s*\|\s?(.*)$/)
    if (multiline && target.last && compiled.ids.has('multiline')) { followLine(target, 'multiline', multiline[1]); return }
    const list = source.match(/^(\s*)(-\.|[-*+])(?:\s+(.*)|\s*)$/)
    const task = readTask(list ? (list[3] ?? '').trim() : source.trim())
    let attributes: MindMapNodeAttributes | undefined = task.status ? { task: { status: task.status } } : undefined
    if (list?.[2] === '-.' && compiled.ids.has('dotted-line')) attributes = { ...attributes, connection: { dotted: true } }
    if (list?.[2] === '+' && compiled.ids.has('folding')) attributes = { ...attributes, folding: { collapsed: true } }
    const record: RecordLine = {
      indent: list ? list[1].replace(/\t/g, '  ').length : -1,
      text: task.text, bare: !list, attributes, source,
    }
    let path: number[]
    if (record.bare) {
      path = [target.roots.length]
      target.stack = []
      target.activeBareRoot = path[0]
    } else {
      while (target.stack.length && target.stack[target.stack.length - 1].indent >= record.indent) target.stack.pop()
      let parent: Entry | undefined = target.stack[target.stack.length - 1]
      if (record.indent === 0) {
        parent = target.activeBareRoot === null ? undefined : target.stack.find((entry) => entry.path.length === 1 && entry.path[0] === target.activeBareRoot)
      }
      path = parent ? [...parent.path, nodeAt(target, parent.path).children?.length ?? 0] : [target.roots.length]
      if (!parent) target.activeBareRoot = null
    }
    if (path.length > 257) throw new Error('Mind map nesting exceeds 256 levels')
    if (++target.count > 20_000) throw new Error('Mind map exceeds 20000 nodes')
    const finalRecord = path.length === 1 && !record.bare ? { ...record, attributes: { ...record.attributes, syntax: { listRoot: true } } } : record
    putNode(target, path, transform(finalRecord, path))
    target.stack.push({ path, indent: record.indent })
    target.last = { record: finalRecord, path }
  }

  return {
    append(chunk) {
      if (typeof chunk !== 'string') throw new Error('Mind map markdown chunks must be strings')
      if (sourceLength + chunk.length > 1_000_000) throw new Error('Mind map markdown exceeds 1000000 characters')
      const previous = state
      // Unpublished arrays remain privately owned across provider chunks. A
      // publication freezes shared paths; putNode copies those on the next edit.
      // The small per-append journal preserves rollback if parsing throws.
      state = { ...state, stack: state.stack.slice(), rollback: [] }
      const previousTail = tail
      const previousSkipLF = skipLF
      try {
        for (const char of chunk) {
          if (skipLF && char === '\n') { skipLF = false; continue }
          skipLF = false
          if (char === '\r' || char === '\n') {
            consume(state, tail)
            tail = ''
            skipLF = char === '\r'
          } else tail += char
        }
        sourceLength += chunk.length
        state.rollback = undefined
      } catch (error) {
        for (let index = state.rollback!.length - 1; index >= 0; index--) state.rollback![index]()
        state = previous
        tail = previousTail
        skipLF = previousSkipLF
        throw error
      }
    },
    getDocument() {
      const preview = { ...state, stack: state.stack.slice(), owned: new WeakSet(), rollback: undefined }
      if (tail) consume(preview, tail)
      const metadata = preview.metadata
      const direction = ['left', 'right', 'both'].includes(metadata.direction) ? metadata.direction as MindMapDirection : undefined
      const theme = ['light', 'dark', 'auto'].includes(metadata.theme) ? metadata.theme as MindMapThemeMode : undefined
      const document: MindMapDocument = {
        roots: preview.roots.length ? preview.roots : [{ id: stableNodeId([0]), text: 'Root' }],
        ...(direction ? { direction } : {}), ...(theme ? { theme } : {}),
        ...(Object.keys(metadata).length ? { metadata } : {}),
        ...(preview.comments.length ? { comments: preview.comments } : {}),
      }
      validateMindMapDocument(document)
      return freezeDocument(document)
    },
  }
}

export function parseMindMap(markdown: string, options: MindMapParseOptions = {}): MindMapDocument {
  const parser = createMindMapParser(options)
  parser.append(markdown)
  return parser.getDocument()
}
