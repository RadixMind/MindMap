import * as limits from './limits'
import { analyzeMindMapInline } from './inline'
import type { MindMapDocument, MindMapNode, MindMapNodeAttributes } from './types'

export function stableNodeId(path: readonly number[]): string {
  return `mm-${path.join('-')}`
}

export function cloneAttributes(attributes?: MindMapNodeAttributes): MindMapNodeAttributes | undefined {
  if (attributes === undefined) return undefined
  validateAttributes(attributes)
  return JSON.parse(JSON.stringify(attributes)) as MindMapNodeAttributes
}

function cloneValidatedNode(node: MindMapNode): MindMapNode {
  return {
    id: node.id,
    text: node.text,
    ...(node.attributes ? { attributes: cloneAttributes(node.attributes) } : {}),
    ...(node.children ? { children: node.children.map(cloneValidatedNode) } : {}),
  }
}

export function cloneNode(node: MindMapNode): MindMapNode {
  validateNodes([node])
  return cloneValidatedNode(node)
}

export function cloneDocument(document: MindMapDocument): MindMapDocument {
  validateMindMapDocument(document)
  return {
    roots: document.roots.map(cloneValidatedNode),
    ...(document.direction ? { direction: document.direction } : {}),
    ...(document.theme ? { theme: document.theme } : {}),
    ...(document.metadata ? { metadata: { ...document.metadata } } : {}),
    ...(document.comments ? { comments: document.comments.map((comment) => ({ ...comment })) } : {}),
  }
}

export function normalizeDocument(input: MindMapDocument | MindMapNode | readonly MindMapNode[]): MindMapDocument {
  if (!input || typeof input !== 'object') throw new Error('Mind map input requires a document or nodes')
  if (!Array.isArray(input) && 'roots' in input) {
    validateMindMapDocument(input)
    return cloneDocument(input as MindMapDocument)
  }
  const nodes: readonly MindMapNode[] = Array.isArray(input) ? input as readonly MindMapNode[] : [input as MindMapNode]
  validateNodes(nodes)
  return { roots: nodes.map(cloneValidatedNode) }
}

function assertPlain(value: unknown, label: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`Mind map ${label} must be a plain object`)
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (descriptor.get || descriptor.set) throw new Error(`Mind map ${label} cannot contain accessors`)
  }
}

function validateId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !id || id.length > limits.MAX_MINDMAP_ID_LENGTH || /[\p{Cc}\p{Cf}\u2028\u2029]/u.test(id)) throw new Error(`Mind map id must contain 1-${limits.MAX_MINDMAP_ID_LENGTH} characters without controls`)
}

function validateNodes(nodes: readonly MindMapNode[]): number {
  const ids = new Set<string>()
  const seen = new Set<object>()
  const budget = { entries: 0, size: 0 }
  let primitives = 0, images = 0
  function countText(text: string): void {
    const analysis = analyzeMindMapInline(text)
    primitives += analysis.tokens
    images += analysis.images
    if (primitives > limits.MAX_MINDMAP_RENDER_PRIMITIVES) throw new Error('Mind map render primitive limit exceeded')
    if (images > limits.MAX_MINDMAP_IMAGES) throw new Error('Mind map image limit exceeded')
  }
  function visit(children: readonly MindMapNode[], depth = 0): void {
    if (!Array.isArray(children)) throw new Error('Mind map children must be arrays')
    if (depth > limits.MAX_MINDMAP_DEPTH) throw new Error('Mind map nesting exceeds 256 levels')
    if (children.length > limits.MAX_MINDMAP_NODES) throw new Error('Mind map exceeds 20000 nodes')
    for (const node of children) {
      assertPlain(node, 'node')
      validateId(node.id)
      if (typeof node.text !== 'string') throw new Error('Mind map nodes require string text')
      if (node.text.length > limits.MAX_MINDMAP_CONTENT_LENGTH) throw new Error('Mind map content exceeds 1000000 characters')
      if (/[\r\n\u2028\u2029]/.test(node.text) || node.text !== node.text.trim()) throw new Error('Mind map node text must be one trimmed line; use multiline attributes for additional lines')
      if (ids.has(node.id)) throw new Error(`Duplicate mind map node id: ${node.id}`)
      ids.add(node.id)
      if (ids.size > limits.MAX_MINDMAP_NODES) throw new Error('Mind map exceeds 20000 nodes')
      budget.size += node.id.length + node.text.length
      if (budget.size > limits.MAX_MINDMAP_CONTENT_LENGTH) throw new Error('Mind map content exceeds 1000000 characters')
      if (node.attributes !== undefined) {
        const before = budget.size
        validateAttributes(node.attributes, seen, budget)
        budget.size = before + JSON.stringify(node.attributes).length
        if (budget.size > limits.MAX_MINDMAP_CONTENT_LENGTH) throw new Error('Mind map content exceeds 1000000 characters')
      }
      primitives += 1 + (node.attributes?.tags?.values.length ?? 0) + (node.attributes?.multiline?.lines.length ?? 0)
      primitives += (node.attributes?.crossLink as { links?: unknown[] } | undefined)?.links?.length ?? 0
      countText(node.text)
      for (const line of node.attributes?.multiline?.lines ?? []) countText(line)
      if (node.children !== undefined) visit(node.children, depth + 1)
    }
  }
  visit(nodes)
  return budget.size
}

function validateAttributes(attributes: MindMapNodeAttributes, seen = new Set<object>(), budget = { entries: 0, size: 0 }): void {
  function visit(value: unknown, depth = 0): void {
    if (++budget.entries > limits.MAX_MINDMAP_ATTRIBUTE_ENTRIES) throw new Error('Mind map attribute entry limit exceeded')
    budget.size += typeof value === 'string' ? value.length + 2 : 4
    if (budget.size > limits.MAX_MINDMAP_CONTENT_LENGTH) throw new Error('Mind map content exceeds 1000000 characters')
    if (value === undefined || value === null || typeof value === 'string' || typeof value === 'boolean') return
    if (typeof value === 'number' && Number.isFinite(value)) return
    if (typeof value !== 'object' || depth > limits.MAX_MINDMAP_DEPTH || seen.has(value)) throw new Error('Mind map attributes must contain acyclic JSON trees without shared references')
    seen.add(value)
    if (!Array.isArray(value)) assertPlain(value, 'attributes')
    const keys = Object.keys(value)
    if (keys.length > limits.MAX_MINDMAP_ATTRIBUTE_COLLECTION || (Array.isArray(value) && value.length > limits.MAX_MINDMAP_ATTRIBUTE_COLLECTION)) throw new Error('Mind map attribute collection limit exceeded')
    for (const key of keys) {
      budget.size += key.length + 3
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!
      if (descriptor.get || descriptor.set) throw new Error('Mind map attributes cannot contain accessors')
      visit(descriptor.value, depth + 1)
    }
  }
  assertPlain(attributes, 'attributes')
  visit(attributes)
  if (attributes.task !== undefined && (!attributes.task || !['todo', 'doing', 'done'].includes(attributes.task.status))) throw new Error('Invalid mind map task status')
  if (attributes.remark !== undefined && (!attributes.remark || typeof attributes.remark.text !== 'string')) throw new Error('Invalid mind map remark')
  if (attributes.remark) {
    let lines = 1
    for (const char of attributes.remark.text) if (char === '\n' && ++lines > limits.MAX_MINDMAP_MULTILINE_LINES) throw new Error('Mind map continuation limit exceeded')
    if (lines + (attributes.multiline?.lines?.length ?? 0) > limits.MAX_MINDMAP_MULTILINE_LINES) throw new Error('Mind map continuation limit exceeded')
  }
  if (attributes.remark && /[\r\u2028\u2029]/.test(attributes.remark.text)) throw new Error('Mind map remarks must use LF line endings')
  for (const [container, values] of [[attributes.tags, attributes.tags?.values], [attributes.multiline, attributes.multiline?.lines]]) {
    if (container !== undefined && (!container || !Array.isArray(values) || values.some((value) => typeof value !== 'string'))) throw new Error('Mind map tags and multiline values must be arrays of strings')
  }
  if ((attributes.tags?.values.length ?? 0) > limits.MAX_MINDMAP_TAGS_PER_NODE) throw new Error('Mind map tag limit exceeded')
  if ((attributes.multiline?.lines.length ?? 0) > limits.MAX_MINDMAP_MULTILINE_LINES) throw new Error('Mind map multiline limit exceeded')
  if (attributes.tags?.values.some((value) => !/^[\p{L}\p{N}_-]+$/u.test(value))) throw new Error('Mind map tags must contain Unicode letters, numbers, underscores or hyphens without spaces')
  if (attributes.multiline?.lines.some((line) => /[\r\n\u2028\u2029]/.test(line))) throw new Error('Each multiline attribute entry must contain one physical line')
  if (attributes.folding !== undefined && (!attributes.folding || typeof attributes.folding.collapsed !== 'boolean')) throw new Error('Invalid mind map folding state')
  if (attributes.syntax !== undefined && (!attributes.syntax || typeof attributes.syntax.listRoot !== 'boolean')) throw new Error('Invalid mind map root syntax')
  if (attributes.connection !== undefined && (!attributes.connection || typeof attributes.connection !== 'object' || (attributes.connection.dotted !== undefined && typeof attributes.connection.dotted !== 'boolean') || (attributes.connection.label !== undefined && typeof attributes.connection.label !== 'string'))) throw new Error('Invalid mind map connection')
  const crossLink = attributes.crossLink as { anchor?: unknown; links?: unknown } | undefined
  if (crossLink !== undefined) {
    if (!crossLink || typeof crossLink !== 'object' || Array.isArray(crossLink) || (crossLink.anchor !== undefined && (typeof crossLink.anchor !== 'string' || !/^[\w-]+$/.test(crossLink.anchor))) || !Array.isArray(crossLink.links)) throw new Error('Invalid mind map cross-link attributes')
    if (crossLink.links.length > limits.MAX_MINDMAP_CROSS_LINKS_PER_NODE) throw new Error('Mind map cross-link limit exceeded')
    for (const link of crossLink.links) {
      if (!link || typeof link !== 'object' || typeof link.target !== 'string' || !/^[\w-]+$/.test(link.target) || (link.label !== undefined && typeof link.label !== 'string') || (link.dotted !== undefined && typeof link.dotted !== 'boolean')) throw new Error('Invalid mind map cross-link target')
      if (link.label !== undefined && /["\r\n\u2028\u2029]/.test(link.label)) throw new Error('Mind map cross-link labels cannot contain double quotes or line breaks')
    }
  }
  const latex = attributes.latex as { enabled?: unknown } | undefined
  if (latex !== undefined && (!latex || typeof latex !== 'object' || typeof latex.enabled !== 'boolean')) throw new Error('Invalid mind map LaTeX attributes')
}

/** Validate JSON import or host input before it enters the document runtime. */
export function validateMindMapDocument(value: unknown): asserts value is MindMapDocument {
  assertPlain(value, 'document')
  if (!value || typeof value !== 'object' || !('roots' in value)) throw new Error('Mind map document requires roots')
  if (validatedFrozenDocuments.has(value)) return
  const document = value as MindMapDocument
  const nodeTextSize = validateNodes(document.roots)
  if (document.metadata !== undefined) {
    assertPlain(document.metadata, 'metadata')
    if (Object.keys(document.metadata).length > limits.MAX_MINDMAP_METADATA_ENTRIES) throw new Error('Mind map metadata entry limit exceeded')
  }
  if (Array.isArray(document.comments) && document.comments.length > limits.MAX_MINDMAP_COMMENTS) throw new Error('Mind map comment limit exceeded')
  if (document.direction !== undefined && !['left', 'right', 'both'].includes(document.direction)) throw new Error('Invalid mind map direction')
  if (document.theme !== undefined && !['light', 'dark', 'auto'].includes(document.theme)) throw new Error('Invalid mind map theme')
  if (document.metadata !== undefined && (!document.metadata || typeof document.metadata !== 'object' || Array.isArray(document.metadata) || Object.values(document.metadata).some((value) => typeof value !== 'string'))) throw new Error('Mind map metadata values must be strings')
  for (const [key, value] of Object.entries(document.metadata ?? {})) {
    if (!/^[A-Za-z0-9_.-]+$/.test(key) || /[\r\n\u2028\u2029]/.test(value) || value !== value.trim()) throw new Error('Mind map metadata requires simple keys and trimmed single-line values')
  }
  if (document.direction && document.metadata?.direction !== undefined && document.metadata.direction !== document.direction) throw new Error('Conflicting mind map direction metadata')
  if (document.theme && document.metadata?.theme !== undefined && document.metadata.theme !== document.theme) throw new Error('Conflicting mind map theme metadata')
  if (document.comments !== undefined && (!Array.isArray(document.comments) || document.comments.some((comment) => !comment || typeof comment.text !== 'string' || !/^\s*%%[^\r\n]*$/.test(comment.text) || (comment.afterNodeId !== null && typeof comment.afterNodeId !== 'string')))) throw new Error('Mind map comments must contain single comment lines and optional node anchors')
  for (const comment of document.comments ?? []) {
    assertPlain(comment, 'comment')
    if (comment.afterNodeId !== null) validateId(comment.afterNodeId)
  }
  const extraSize = JSON.stringify(document.metadata ?? {}).length + JSON.stringify(document.comments ?? []).length
  if (nodeTextSize + extraSize > 1_000_000) throw new Error('Mind map text, attributes, metadata and comments exceed 1000000 characters')
  if (deeplyFrozenDocumentValues.has(document)) validatedFrozenDocuments.add(document)
}

const validatedFrozenDocuments = new WeakSet<object>()
const deeplyFrozenDocumentValues = new WeakSet<object>()

/** Freeze owned snapshots; skip only values already recursively frozen here.
 * An extension may supply a shallow-frozen wrapper with mutable descendants. */
export function freezeDocument(document: MindMapDocument): MindMapDocument {
  validateMindMapDocument(document)
  const visited = new WeakSet<object>()
  function freeze(value: unknown): void {
    if (!value || typeof value !== 'object' || deeplyFrozenDocumentValues.has(value) || visited.has(value)) return
    visited.add(value)
    Object.freeze(value)
    for (const child of Object.values(value)) freeze(child)
    deeplyFrozenDocumentValues.add(value)
  }
  freeze(document)
  validatedFrozenDocuments.add(document)
  return document
}

/** Reconcile parser-generated positions with prior semantic identities.
 * Explicit cross-link anchors are durable identities. Unanchored Markdown has
 * no identity token: matching labels, attributes, child labels, then position is
 * a best-effort heuristic. Concurrent rename/reorder of indistinguishable
 * unanchored nodes cannot establish identity; use anchors or a host Document. */
export function reconcileMindMapIds(previous: MindMapDocument, next: MindMapDocument): MindMapDocument {
  validateMindMapDocument(previous)
  validateMindMapDocument(next)
  const fingerprint = (node: MindMapNode) => JSON.stringify([node.text, node.attributes ?? {}, node.children?.map((child) => child.text) ?? []])
  const oldByText = new Map<string, { nodes: MindMapNode[]; cursor: number }>()
  const oldById = new Map<string, MindMapNode>()
  const oldByPath = new Map<string, MindMapNode>()
  function collectPaths(nodes: MindMapNode[], parent: number[] = []): void {
    nodes.forEach((node, index) => {
      const path = [...parent, index]
      oldByPath.set(stableNodeId(path), node)
      collectPaths(node.children ?? [], path)
    })
  }
  collectPaths(previous.roots)
  walkNodes(previous, (node) => {
    oldById.set(node.id, node)
    if (node.id.startsWith('mm-anchor-')) return
    const key = fingerprint(node)
    const matches = oldByText.get(key) ?? { nodes: [], cursor: 0 }
    matches.nodes.push(node)
    oldByText.set(key, matches)
  })
  const matches = new Map<MindMapNode, MindMapNode>()
  const used = new Set<string>()
  walkNodes(next, (node) => {
    if (!node.id.startsWith('mm-anchor-')) return
    const prior = oldById.get(node.id)
    if (prior) { matches.set(node, prior); used.add(prior.id) }
  })
  // Exact labels win before positional fallback, preserving head insertions and
  // reorders. Duplicate labels are matched in their existing traversal order.
  walkNodes(next, (node) => {
    if (matches.has(node) || node.id.startsWith('mm-anchor-')) return
    const candidates = oldByText.get(fingerprint(node))
    while (candidates && candidates.cursor < candidates.nodes.length && used.has(candidates.nodes[candidates.cursor].id)) candidates.cursor++
    const prior = candidates?.nodes[candidates.cursor++]
    if (prior) { matches.set(node, prior); used.add(prior.id) }
  })
  let generated = 0
  const remapped = new Map<string, string>()
  function visit(node: MindMapNode): MindMapNode {
    let prior = matches.get(node)
    if (!prior && !node.id.startsWith('mm-anchor-')) {
      const positional = oldById.get(node.id) ?? oldByPath.get(node.id)
      if (positional && !used.has(positional.id)) prior = positional
    }
    let id = prior?.id ?? node.id
    if (!prior && (oldById.has(id) || used.has(id))) {
      do { id = 'mm-new-' + generated++ } while (oldById.has(id) || used.has(id))
    }
    used.add(id)
    remapped.set(node.id, id)
    return { ...node, id, ...(node.children ? { children: node.children.map(visit) } : {}) }
  }
  const roots = next.roots.map(visit)
  return { ...next, roots, ...(next.comments ? { comments: next.comments.map((comment) => ({ ...comment, afterNodeId: comment.afterNodeId ? remapped.get(comment.afterNodeId) ?? comment.afterNodeId : null })) } : {}) }
}

export function walkNodes(
  document: MindMapDocument,
  visitor: (node: MindMapNode, parent: MindMapNode | null, index: number, depth: number) => void,
): void {
  validateMindMapDocument(document)
  const visit = (nodes: readonly MindMapNode[], parent: MindMapNode | null, depth: number) => {
    nodes.forEach((node, index) => {
      visitor(node, parent, index, depth)
      if (node.children) visit(node.children, node, depth + 1)
    })
  }
  visit(document.roots, null, 0)
}

export function findNode(document: MindMapDocument, nodeId: string): MindMapNode | null {
  let found: MindMapNode | null = null
  walkNodes(document, (node) => {
    if (!found && node.id === nodeId) found = node
  })
  return found
}

export function withAttribute<T>(
  node: MindMapNode,
  namespace: string,
  value: T | undefined,
): MindMapNode {
  validateNodes([node])
  const attributes = { ...(node.attributes ?? {}) }
  if (value === undefined) delete attributes[namespace]
  else attributes[namespace] = value
  const result = {
    ...node,
    ...(Object.keys(attributes).length > 0 ? { attributes } : { attributes: undefined }),
  }
  validateNodes([result])
  return result
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
