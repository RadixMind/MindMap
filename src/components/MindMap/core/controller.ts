import { MAX_MINDMAP_PATCHES } from './limits'
import { DEFAULT_THEME, layoutMindMap } from './layout'
import { parseMindMap } from './parser'
import { applyMindMapPatchesWithInverse, diffMindMapDocuments } from './patches'
import { createMarkdownStream } from './streaming'
import type {
  MindMapChangeReason, MindMapController, MindMapControllerEvent, MindMapControllerEventPhase, MindMapControllerOptions,
  MindMapControllerSnapshot, MindMapDocument, MindMapLayout, MindMapLayoutNode, MindMapLayoutOptions, MindMapNode, MindMapNodeAttributes,
  MindMapPatch, MindMapTransaction,
} from './types'
import { cloneAttributes, findNode, freezeDocument, normalizeDocument, reconcileMindMapIds } from './utils'

interface TransactionState {
  baseline: MindMapDocument
  inverse: MindMapPatch[]
  reason: MindMapChangeReason
  selectedNodeId: string | null
  cleanup?: () => void
}

interface HistoryEntry { patches: MindMapPatch[]; selectedNodeId: string | null }

function sameOptionValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>
  const keys = Object.keys(a).filter((key) => a[key] !== undefined)
  const otherKeys = Object.keys(b).filter((key) => b[key] !== undefined)
  return keys.length === otherKeys.length && keys.every((key) => sameOptionValue(a[key], b[key]))
}

function copyLayoutOptions(options: MindMapLayoutOptions): MindMapLayoutOptions {
  const theme = Object.fromEntries(Object.entries(options.theme ?? {}).filter(([key, value]) => value !== undefined && !sameOptionValue(value, DEFAULT_THEME[key as keyof typeof DEFAULT_THEME])))
  if (Array.isArray(theme.branches)) theme.branches = theme.branches.slice()
  return {
    direction: options.direction,
    remoteImagePolicy: options.remoteImagePolicy,
    extensions: options.extensions?.length ? options.extensions.slice() : undefined,
    theme: Object.keys(theme).length ? theme : undefined,
    splitByRoot: Object.keys(options.splitByRoot ?? {}).length ? { ...options.splitByRoot } : undefined,
    foldOverrides: Object.keys(options.foldOverrides ?? {}).length ? { ...options.foldOverrides } : undefined,
  }
}

function readonlyMap<K, V>(map: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const view: ReadonlyMap<K, V> = {
    get size() { return map.size },
    get: (key) => map.get(key),
    has: (key) => map.has(key),
    keys: () => map.keys(),
    values: () => map.values(),
    entries: () => map.entries(),
    [Symbol.iterator]: () => map[Symbol.iterator](),
    forEach(callback, thisArg) { map.forEach((value, key) => callback.call(thisArg, value, key, view)) },
  }
  return Object.freeze(view)
}

function freezeLayout(layout: MindMapLayout): MindMapLayout {
  const nodeCopies = new Map<MindMapLayoutNode, MindMapLayoutNode>()
  const attributeCopies = new Map<MindMapNodeAttributes, MindMapNodeAttributes>()
  function freezeAttributeValues(value: unknown): void {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return
    Object.freeze(value)
    for (const child of Object.values(value)) freezeAttributeValues(child)
  }
  function ownNode(node: MindMapLayoutNode): MindMapLayoutNode {
    const cached = nodeCopies.get(node)
    if (cached) return cached
    let attributes = node.attributes
    if (attributes) {
      let owned = attributeCopies.get(attributes)
      if (!owned) {
        owned = cloneAttributes(attributes)!
        freezeAttributeValues(owned)
        attributeCopies.set(attributes, owned)
      }
      attributes = owned
    }
    const copy = Object.freeze({ ...node, ...(attributes ? { attributes } : {}) })
    nodeCopies.set(node, copy)
    return copy
  }
  // Extension hooks may retain their arrays, maps and attribute objects. Copy
  // those containers before exposing a frozen view instead of freezing aliases.
  const nodes = layout.nodes.map(ownNode)
  const edges = layout.edges.map((edge) => Object.freeze({ ...edge }))
  const nodeById = new Map([...layout.nodeById].map(([id, node]) => [id, ownNode(node)]))
  const childrenByParent = new Map([...layout.childrenByParent].map(([id, children]) => {
    const copy = children.slice()
    Object.freeze(copy)
    return [id, copy] as const
  }))
  Object.freeze(nodes)
  Object.freeze(edges)
  return Object.freeze({ ...layout, nodes, edges, bounds: Object.freeze({ ...layout.bounds }), nodeById: readonlyMap(nodeById), childrenByParent: readonlyMap(childrenByParent) })
}

export function createMindMapController(
  input: MindMapDocument | MindMapNode | readonly MindMapNode[] | string,
  options: MindMapControllerOptions = {},
): MindMapController {
  let layoutOptions = copyLayoutOptions(options)
  let parseOptions = { extensions: options.extensions ?? options.parse?.extensions }
  const normalized = normalizeDocument(typeof input === 'string' ? parseMindMap(input, parseOptions) : input)
  const initialDocument = options.direction ? { ...normalized, direction: options.direction } : normalized
  let snapshot: MindMapControllerSnapshot = Object.freeze({
    version: 0, document: freezeDocument(initialDocument),
    layout: freezeLayout(layoutMindMap(initialDocument, layoutOptions)),
    selectedNodeId: null, reason: 'initial', canUndo: false, canRedo: false,
  })
  const listeners = new Set<() => void>()
  const eventListeners = new Set<(event: MindMapControllerEvent) => void>()
  const undoStack: HistoryEntry[] = []
  const redoStack: HistoryEntry[] = []
  const historyLimit = Math.max(0, Math.floor(options.historyLimit ?? 100))
  const projectionCache: { options: MindMapLayoutOptions; layout: MindMapLayout }[] = []
  let optionsViewSource: MindMapLayoutOptions | undefined
  let optionsView: Readonly<MindMapLayoutOptions> | undefined
  let transaction: TransactionState | null = null
  let disposed = false

  function publish(document: MindMapDocument, reason: MindMapChangeReason, patches: readonly MindMapPatch[], selected = snapshot.selectedNodeId, forceLayout = false, phase: MindMapControllerEventPhase = 'commit'): void {
    if (disposed) return
    const previous = snapshot
    if (document !== previous.document || forceLayout) projectionCache.length = 0
    snapshot = Object.freeze({
      version: previous.version + 1, document: freezeDocument(document),
      layout: document === previous.document && !forceLayout ? previous.layout : freezeLayout(layoutMindMap(document, layoutOptions)),
      selectedNodeId: selected && findNode(document, selected) ? selected : null,
      reason, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0,
    })
    const event = { previous, current: snapshot, patches, reason, phase }
    listeners.forEach((listener) => listener())
    eventListeners.forEach((listener) => listener(event))
  }

  function remember(inverse: MindMapPatch[], selectedNodeId = snapshot.selectedNodeId): void {
    if (!inverse.length) return
    undoStack.push({ patches: inverse, selectedNodeId })
    if (undoStack.length > historyLimit) undoStack.shift()
    redoStack.length = 0
  }

  function cancelActive(): void {
    if (!transaction) return
    const active = transaction
    transaction = null
    active.cleanup?.()
    const result = applyMindMapPatchesWithInverse(snapshot.document, active.inverse)
    publish(result.document, 'history', active.inverse, active.selectedNodeId, false, 'rollback')
  }

  function apply(patches: readonly MindMapPatch[], reason: MindMapChangeReason, owner?: TransactionState): boolean {
    if (disposed || (owner && transaction !== owner)) return false
    // Concurrent commands address committed nodes, never provisional-only data.
    const document = !owner && transaction
      ? applyMindMapPatchesWithInverse(snapshot.document, transaction.inverse).document
      : snapshot.document
    let result = applyMindMapPatchesWithInverse(document, patches)
    if (!result.valid) return false
    if (!owner && transaction) {
      cancelActive()
      result = applyMindMapPatchesWithInverse(snapshot.document, patches)
      if (!result.valid) return false
    }
    if (result.document === snapshot.document) return true
    if (owner) {
      if (owner.inverse.length + result.inversePatches.length > MAX_MINDMAP_PATCHES || owner.inverse.some((patch) => patch.type === 'replace-document')) owner.inverse = [{ type: 'replace-document', document: owner.baseline }]
      else owner.inverse.unshift(...result.inversePatches)
    }
    else remember(result.inversePatches)
    publish(result.document, reason, patches, snapshot.selectedNodeId, false, owner ? 'preview' : 'commit')
    return true
  }

  const controller: MindMapController = {
    getSnapshot: () => snapshot,
    getLayout(viewOptions) {
      if (!viewOptions) return snapshot.layout
      const effective = copyLayoutOptions({ ...layoutOptions, ...viewOptions })
      if (sameOptionValue(effective, layoutOptions)) return snapshot.layout
      const index = projectionCache.findIndex((entry) => sameOptionValue(entry.options, effective))
      if (index >= 0) {
        const [entry] = projectionCache.splice(index, 1)
        projectionCache.push(entry)
        return entry.layout
      }
      const layout = freezeLayout(layoutMindMap(snapshot.document, effective))
      projectionCache.push({ options: effective, layout })
      if (projectionCache.length > 8) projectionCache.shift()
      return layout
    },
    getLayoutOptions() {
      if (optionsViewSource === layoutOptions && optionsView) return optionsView
      const copy = copyLayoutOptions(layoutOptions)
      if (copy.extensions) copy.extensions = Object.freeze(copy.extensions.map((extension) => Object.freeze({ ...extension })))
      if (copy.theme) {
        if (copy.theme.branches) Object.freeze(copy.theme.branches)
        Object.freeze(copy.theme)
      }
      if (copy.splitByRoot) Object.freeze(copy.splitByRoot)
      if (copy.foldOverrides) Object.freeze(copy.foldOverrides)
      optionsViewSource = layoutOptions
      optionsView = Object.freeze(copy)
      return optionsView
    },
    subscribe(listener) {
      if (!disposed) listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    subscribeEvents(listener) {
      if (!disposed) eventListeners.add(listener)
      return () => { eventListeners.delete(listener) }
    },
    replaceDocument(document) {
      if (disposed) return
      const normalized = normalizeDocument(document)
      transaction?.cleanup?.()
      transaction = null
      undoStack.length = 0
      redoStack.length = 0
      publish(normalized, 'external', [{ type: 'replace-document', document: normalized }])
    },
    setDocument(document, reason = 'external') {
      if (disposed) return
      const normalized = normalizeDocument(document)
      if (diffMindMapDocuments(snapshot.document, normalized).length === 0) return
      if (reason === 'external') {
        transaction?.cleanup?.()
        transaction = null
        undoStack.length = 0
        redoStack.length = 0
        publish(normalized, reason, [{ type: 'replace-document', document: normalized }])
      } else {
        apply([{ type: 'replace-document', document: normalized }], reason)
      }
    },
    setMarkdown(markdown, reason = 'markdown') {
      if (disposed) return
      const parsed = parseMindMap(markdown, parseOptions)
      if (reason === 'external') controller.setDocument(reconcileMindMapIds(snapshot.document, parsed), reason)
      else {
        cancelActive()
        apply(diffMindMapDocuments(snapshot.document, reconcileMindMapIds(snapshot.document, parsed)), reason)
      }
    },
    applyPatches(patches, reason = 'patch') { return apply(patches, reason) },
    selectNode(nodeId) {
      const selected = nodeId && findNode(snapshot.document, nodeId) ? nodeId : null
      if (selected !== snapshot.selectedNodeId) publish(snapshot.document, 'external', [], selected, false, 'change')
    },
    setDirection(direction) {
      cancelActive()
      const previousDirection = layoutOptions.direction ?? snapshot.document.direction ?? 'both'
      layoutOptions = { ...layoutOptions, direction: undefined }
      if (snapshot.document.direction !== direction) apply([{ type: 'replace-document', document: { ...snapshot.document, direction } }], 'direction')
      else if (previousDirection !== direction) controller.recompute()
    },
    updateNode(nodeId, update) { return apply([{ type: 'update', nodeId, ...update }], 'edit') },
    insertNode(parentId, node, index = Number.MAX_SAFE_INTEGER) { return apply([{ type: 'insert', parentId, index, node }], 'edit') },
    removeNode(nodeId) { return apply([{ type: 'remove', nodeId }], 'edit') },
    moveNode(nodeId, parentId, index = Number.MAX_SAFE_INTEGER) { return apply([{ type: 'move', nodeId, parentId, index }], 'edit') },
    toggleFold(nodeId) {
      if (disposed) return false
      const document = transaction
        ? applyMindMapPatchesWithInverse(snapshot.document, transaction.inverse).document
        : snapshot.document
      const node = findNode(document, nodeId)
      if (!node) return false
      return apply([{ type: 'update', nodeId, attributes: { ...node.attributes, folding: { collapsed: !node.attributes?.folding?.collapsed } } }], 'fold')
    },
    recompute() { publish(snapshot.document, snapshot.reason, [], snapshot.selectedNodeId, true, 'change') },
    setLayoutOptions(nextOptions) {
      const next = copyLayoutOptions({ ...layoutOptions, ...nextOptions })
      if ('extensions' in nextOptions) parseOptions = { extensions: nextOptions.extensions ?? options.parse?.extensions }
      if (sameOptionValue(layoutOptions, next)) return
      layoutOptions = next
      controller.recompute()
    },
    beginTransaction(reason = 'edit'): MindMapTransaction {
      cancelActive()
      const owner: TransactionState = { baseline: snapshot.document, inverse: [], reason, selectedNodeId: snapshot.selectedNodeId }
      if (!disposed) transaction = owner
      function isActive(): boolean { return !disposed && transaction === owner }
      return {
        isActive,
        applyPatches(patches) { return apply(patches, reason, owner) },
        setMarkdown(markdown) {
          if (!isActive()) return false
          return apply(diffMindMapDocuments(snapshot.document, reconcileMindMapIds(snapshot.document, parseMindMap(markdown, parseOptions))), reason, owner)
        },
        commit() {
          if (!isActive()) return false
          transaction = null
          owner.cleanup?.()
          remember(owner.inverse, owner.selectedNodeId)
          publish(snapshot.document, reason, [])
          return true
        },
        cancel() {
          if (!isActive()) return false
          cancelActive()
          return true
        },
      }
    },
    createMarkdownStream(streamOptions = {}) {
      const owner = controller.beginTransaction('stream')
      const state = transaction
      const stream = createMarkdownStream({ ...parseOptions, ...streamOptions, onError: () => { owner.cancel() } })
      const unsubscribe = stream.subscribe((update) => {
        if (owner.isActive()) owner.applyPatches(diffMindMapDocuments(snapshot.document, reconcileMindMapIds(snapshot.document, update.document)))
        else stream.dispose()
      })
      function close(): void { unsubscribe(); stream.dispose() }
      if (state) state.cleanup = close
      return {
        ...stream,
        append(chunk) {
          if (!owner.isActive()) return
          try { stream.append(chunk) } catch (error) { owner.cancel(); close(); throw error }
        },
        replace(markdown) {
          if (!owner.isActive()) return
          try { stream.replace(markdown) } catch (error) { owner.cancel(); close(); throw error }
        },
        isActive: owner.isActive,
        async commit() {
          if (!owner.isActive()) { close(); return false }
          await stream.flush()
          if (owner.isActive()) owner.applyPatches(diffMindMapDocuments(snapshot.document, reconcileMindMapIds(snapshot.document, stream.getDocument())))
          const committed = owner.commit()
          close()
          return committed
        },
        cancel() { owner.cancel(); close() },
        dispose() { owner.cancel(); close() },
      }
    },
    undo() {
      if (disposed) return false
      cancelActive()
      const entry = undoStack.pop()
      if (!entry) return false
      const { patches } = entry
      const result = applyMindMapPatchesWithInverse(snapshot.document, patches)
      redoStack.push({ patches: result.inversePatches, selectedNodeId: snapshot.selectedNodeId })
      publish(result.document, 'history', patches, entry.selectedNodeId)
      return true
    },
    redo() {
      if (disposed) return false
      cancelActive()
      const entry = redoStack.pop()
      if (!entry) return false
      const { patches } = entry
      const result = applyMindMapPatchesWithInverse(snapshot.document, patches)
      undoStack.push({ patches: result.inversePatches, selectedNodeId: snapshot.selectedNodeId })
      publish(result.document, 'history', patches, entry.selectedNodeId)
      return true
    },
    dispose() {
      if (disposed) return
      cancelActive()
      disposed = true
      listeners.clear()
      eventListeners.clear()
      undoStack.length = 0
      redoStack.length = 0
      projectionCache.length = 0
    },
  }
  return controller
}
