import { MAX_MINDMAP_DEPTH, MAX_MINDMAP_PATCHES } from './limits'
import type { MindMapDocument, MindMapNode, MindMapPatch } from './types'
import { cloneAttributes, normalizeDocument, validateMindMapDocument, walkNodes } from './utils'

interface Location { node: MindMapNode; parentId: string | null }

function locations(document: MindMapDocument): Map<string, Location> {
  const result = new Map<string, Location>()
  walkNodes(document, (node, parent) => result.set(node.id, { node, parentId: parent?.id ?? null }))
  return result
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return a == null && b == null
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]))
}

function indexWithin(index: number, length: number): number {
  return Number.isNaN(index) ? length : Math.max(0, Math.min(Math.trunc(index), length))
}

export interface MindMapPatchResult {
  document: MindMapDocument
  inversePatches: MindMapPatch[]
  valid: boolean
}

/** Apply the batch through an indexed edit overlay, then materialize only dirty
 * ancestor paths. Invalid operations discard the entire overlay atomically. */
export function applyMindMapPatchesWithInverse(document: MindMapDocument, patches: readonly MindMapPatch[]): MindMapPatchResult {
  validateMindMapDocument(document)
  const invalid: MindMapPatchResult = { document, inversePatches: [], valid: false }
  if (!Array.isArray(patches) || patches.length > MAX_MINDMAP_PATCHES) return invalid
  let base = document
  let entries = locations(base)
  const childOverrides = new Map<string | null, string[]>()
  const dirty = new Set<string>()
  let changed = false
  const inversePatches: MindMapPatch[] = []

  function children(parentId: string | null): string[] {
    const cached = childOverrides.get(parentId)
    if (cached) return cached
    const source = parentId === null ? base.roots : entries.get(parentId)?.node.children ?? []
    const ids = source.map((node) => node.id)
    childOverrides.set(parentId, ids)
    return ids
  }

  // Validate prospective depth before an overlay can create a path deeper than
  // recursive materialization accepts. A batch may otherwise join many individually
  // valid subtrees into a tens-of-thousands-deep tree before final admission.
  function canAttach(rootId: string, parentId: string | null): boolean {
    let depth = 0
    for (let id = parentId; id !== null; id = entries.get(id)?.parentId ?? null) {
      if (++depth > MAX_MINDMAP_DEPTH) return false
    }
    const pending = [{ id: rootId, depth }]
    while (pending.length) {
      const next = pending.pop()!
      if (next.depth > MAX_MINDMAP_DEPTH) return false
      for (const id of children(next.id)) pending.push({ id, depth: next.depth + 1 })
    }
    return true
  }

  function mark(parentId: string | null): void {
    changed = true
    let id = parentId
    while (id !== null) {
      dirty.add(id)
      id = entries.get(id)?.parentId ?? null
    }
  }

  function materializeNode(id: string): MindMapNode {
    const entry = entries.get(id)!
    if (!dirty.has(id)) return entry.node
    const next = { ...entry.node }
    const nodes = children(id).map(materializeNode)
    if (nodes.length) next.children = nodes
    else delete next.children
    return next
  }

  function materialize(): MindMapDocument {
    return changed ? { ...base, roots: children(null).map(materializeNode) } : base
  }

  for (const patch of patches) {
    if (!patch || typeof patch !== 'object' || !['replace-document', 'insert', 'remove', 'update', 'move'].includes(patch.type)) return invalid
    if ((patch.type === 'insert' || patch.type === 'move') && ((patch.parentId !== null && (typeof patch.parentId !== 'string' || !patch.parentId)) || typeof patch.index !== 'number' || !Number.isFinite(patch.index))) return invalid
    if ((patch.type === 'remove' || patch.type === 'update' || patch.type === 'move') && (typeof patch.nodeId !== 'string' || !patch.nodeId)) return invalid
    if (patch.type === 'replace-document') {
      let replacement: MindMapDocument
      try { replacement = normalizeDocument(patch.document) } catch { return invalid }
      const current = materialize()
      if (equal(current, replacement)) continue
      inversePatches.unshift({ type: 'replace-document', document: current })
      base = replacement
      entries = locations(base)
      childOverrides.clear()
      dirty.clear()
      changed = false
      continue
    }
    if (patch.type === 'insert') {
      if (patch.parentId !== null && !entries.has(patch.parentId)) return invalid
      let incoming: MindMapNode
      try { incoming = normalizeDocument(patch.node).roots[0] } catch { return invalid }
      const incomingEntries = locations({ roots: [incoming] })
      for (const id of incomingEntries.keys()) if (entries.has(id)) return invalid
      if (entries.size + incomingEntries.size > 20_000) return invalid
      for (const [id, entry] of incomingEntries) entries.set(id, { ...entry, parentId: id === incoming.id ? patch.parentId : entry.parentId })
      if (!canAttach(incoming.id, patch.parentId)) return invalid
      const siblings = children(patch.parentId)
      siblings.splice(indexWithin(patch.index, siblings.length), 0, incoming.id)
      mark(patch.parentId)
      inversePatches.unshift({ type: 'remove', nodeId: incoming.id })
      continue
    }
    const entry = entries.get(patch.nodeId)
    if (!entry) return invalid
    if (patch.type === 'update') {
      let attributes = patch.attributes
      if (attributes !== undefined && attributes !== null) {
        try { attributes = cloneAttributes(attributes) } catch { return invalid }
      }
      if (patch.text !== undefined && (typeof patch.text !== 'string' || patch.text.length > 1_000_000)) return invalid
      const node = entry.node
      if ((patch.text === undefined || patch.text === node.text) && (attributes === undefined || equal(attributes, node.attributes))) continue
      const updated = { ...node }
      const inverse: Extract<MindMapPatch, { type: 'update' }> = { type: 'update', nodeId: node.id }
      if (patch.text !== undefined) { updated.text = patch.text; inverse.text = node.text }
      if (attributes !== undefined) {
        inverse.attributes = node.attributes ?? null
        if (attributes === null) delete updated.attributes
        else updated.attributes = attributes
      }
      entries.set(node.id, { ...entry, node: updated })
      mark(node.id)
      inversePatches.unshift(inverse)
      continue
    }
    const siblings = children(entry.parentId)
    const oldIndex = siblings.indexOf(patch.nodeId)
    if (patch.type === 'move') {
      if (patch.parentId !== null && !entries.has(patch.parentId)) return invalid
      let ancestor = patch.parentId
      while (ancestor !== null && ancestor !== patch.nodeId) ancestor = entries.get(ancestor)?.parentId ?? null
      if (ancestor === patch.nodeId || !canAttach(patch.nodeId, patch.parentId)) return invalid
      const target = children(patch.parentId)
      const index = indexWithin(patch.index, target.length - (patch.parentId === entry.parentId ? 1 : 0))
      if (patch.parentId === entry.parentId && index === oldIndex) continue
      siblings.splice(oldIndex, 1)
      mark(entry.parentId)
      target.splice(index, 0, patch.nodeId)
      entries.set(patch.nodeId, { ...entry, parentId: patch.parentId })
      mark(patch.parentId)
      inversePatches.unshift({ type: 'move', nodeId: patch.nodeId, parentId: entry.parentId, index: oldIndex })
      continue
    }
    if (patch.type !== 'remove') return invalid
    const removed = materializeNode(patch.nodeId)
    siblings.splice(oldIndex, 1)
    mark(entry.parentId)
    function removeSubtree(id: string): void {
      for (const child of children(id)) removeSubtree(child)
      entries.delete(id)
      childOverrides.delete(id)
      dirty.delete(id)
    }
    removeSubtree(patch.nodeId)
    inversePatches.unshift({ type: 'insert', parentId: entry.parentId, index: oldIndex, node: removed })
  }

  const next = materialize()
  if (next !== document) {
    try { validateMindMapDocument(next) } catch { return invalid }
  }
  return { document: next, inversePatches, valid: true }
}

export function applyMindMapPatches(document: MindMapDocument, patches: readonly MindMapPatch[]): MindMapDocument {
  return applyMindMapPatchesWithInverse(document, patches).document
}

/** Build patches using a lightweight ordered-id overlay. No document is cloned,
 * validated or re-indexed per emitted patch. */
export function diffMindMapDocuments(previous: MindMapDocument, current: MindMapDocument): MindMapPatch[] {
  validateMindMapDocument(previous)
  validateMindMapDocument(current)
  if (previous === current) return []
  if (previous.direction !== current.direction || previous.theme !== current.theme || !equal(previous.metadata, current.metadata) || !equal(previous.comments, current.comments)) {
    return equal(previous, current) ? [] : [{ type: 'replace-document', document: current }]
  }
  const before = locations(previous)
  const after = locations(current)
  const childIds = new Map<string | null, string[]>()
  childIds.set(null, previous.roots.map((node) => node.id))
  for (const [id, location] of before) childIds.set(id, (location.node.children ?? []).map((node) => node.id))
  const patches: MindMapPatch[] = []
  const limitExceeded = Symbol('patch-limit')
  function emit(patch: MindMapPatch): void {
    if (patches.length >= MAX_MINDMAP_PATCHES) throw limitExceeded
    patches.push(patch)
  }

  function visit(nodes: MindMapNode[], parentId: string | null): void {
    const siblings = childIds.get(parentId) ?? []
    childIds.set(parentId, siblings)
    nodes.forEach((node, index) => {
      const prior = before.get(node.id)
      if (!prior) {
        const inserted = { ...node }
        delete inserted.children
        emit({ type: 'insert', parentId, index, node: inserted })
        siblings.splice(index, 0, node.id)
        before.set(node.id, { node: inserted, parentId })
        childIds.set(node.id, [])
      } else {
        const oldSiblings = childIds.get(prior.parentId)!
        const oldIndex = prior.parentId === parentId && oldSiblings[index] === node.id ? index : oldSiblings.indexOf(node.id)
        if (prior.parentId !== parentId || oldIndex !== index) {
          emit({ type: 'move', nodeId: node.id, parentId, index })
          oldSiblings.splice(oldIndex, 1)
          siblings.splice(index, 0, node.id)
          before.set(node.id, { ...prior, parentId })
        }
        if (prior.node.text !== node.text || !equal(prior.node.attributes, node.attributes)) {
          emit({ type: 'update', nodeId: node.id, text: node.text, attributes: node.attributes ?? null })
        }
      }
      visit(node.children ?? [], node.id)
    })
  }
  try {
    visit(current.roots, null)
    for (const [id, location] of before) {
      if (!after.has(id) && (location.parentId === null || after.has(location.parentId))) emit({ type: 'remove', nodeId: id })
    }
  } catch (error) {
    if (error !== limitExceeded) throw error
    return [{ type: 'replace-document', document: current }]
  }
  return patches
}
