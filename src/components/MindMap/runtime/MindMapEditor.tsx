import type { MindMapRemoteImagePolicy } from '../core/url'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ComponentType,
} from 'react'
import { serializeMindMap } from '../core/serializer'
import type {
  MindMapController,
  MindMapControllerEvent,
  MindMapDirection,
  MindMapDocument,
  MindMapExtension,
  MindMapLayoutNode,
  MindMapNode,
  MindMapThemeMode,
  MindMapThemeTokens,
} from '../core/types'
import { findNode, walkNodes } from '../core/utils'
import type { MindMapEditorFeature, MindMapEditorFeatureContext, MindMapInteractionEvent, MindMapToolbarConfig } from './editor-types'
import type { MindMapMessages } from './messages'
import { useMessages } from './useMessages'
import { filterMindMapNodes, useNodeFilters } from './useNodeFilters'
import { EditorContextMenu } from './EditorContextMenu'
import { cloneNode } from '../core/utils'
import { renderMindMapToSvg } from '../core/svg'
import { parseMindMap } from '../core/parser'
import { useProjection } from './useProjection'
import { createMindMapCommandRegistry, mindMapTreeMoveCommands, type MindMapCommandRegistry, type MindMapCommandState } from './commands'
import { MindMapSurface, type MindMapAutoFitPolicy, type MindMapCullingOptions, type MindMapSurfaceRef, type MindMapViewport } from './MindMapSurface'
import { useMindMapControllerSnapshot } from './useController'
import { useOwnedController } from './useOwnedController'
import { initialRuntimeTheme, useRuntimeTheme } from './theme'

let createdNodeCounter = 0
const EMPTY_EXTENSIONS: readonly MindMapExtension[] = []
const DEFAULT_FEATURES: readonly MindMapEditorFeature[] = []
const createNodeId = () => `mm-user-${Date.now().toString(36)}-${(++createdNodeCounter).toString(36)}`

interface NodeLocation {
  parentId: string | null
  index: number
}

function locateNode(document: MindMapDocument, nodeId: string): NodeLocation | null {
  let location: NodeLocation | null = null
  walkNodes(document, (node, parent, index) => {
    if (!location && node.id === nodeId) location = { parentId: parent?.id ?? null, index }
  })
  return location
}

export interface MindMapEditorProps {
  remoteImagePolicy?: MindMapRemoteImagePolicy
  controller?: MindMapController
  document?: MindMapDocument
  documentRevision?: string | number
  data?: MindMapNode | MindMapNode[]
  markdown?: string
  defaultMarkdown?: string
  direction?: MindMapDirection
  defaultDirection?: MindMapDirection
  onDirectionChange?: (direction: MindMapDirection) => void
  locale?: string
  messages?: Partial<MindMapMessages>
  extensions?: readonly MindMapExtension[]
  features?: readonly MindMapEditorFeature[]
  theme?: MindMapThemeMode
  themeTokens?: Partial<MindMapThemeTokens>
  className?: string
  ariaLabel?: string
  toolbar?: boolean | MindMapToolbarConfig
  readOnly?: boolean
  readonly?: boolean
  searchQuery?: string
  activeTags?: readonly string[]
  onSearchChange?: (query: string) => void
  onActiveTagsChange?: (tags: string[]) => void
  textEditor?: ComponentType<{ value: string; onChange(value: string): void; readOnly?: boolean }>
  onInteractionEvent?: (event: MindMapInteractionEvent) => void
  autoFit?: MindMapAutoFitPolicy
  autoFitPolicy?: MindMapAutoFitPolicy
  culling?: MindMapCullingOptions
  selectedNodeId?: string | null
  onSelectedNodeChange?: (nodeId: string | null) => void
  onDocumentChange?: (document: MindMapDocument) => void
  onChange?: (document: MindMapDocument) => void
  onMarkdownChange?: (markdown: string) => void
  onEvent?: (event: MindMapControllerEvent) => void
  onViewportChange?: (viewport: MindMapViewport) => void
}

export interface MindMapEditorRef {
  getDocument(): MindMapDocument
  getData(): MindMapNode[]
  setData(data: MindMapNode | MindMapNode[]): void
  setMarkdown(markdown: string): void
  importData(data: MindMapNode | MindMapNode[]): void
  importMarkdown(markdown: string): void
  exportToSVG(): string
  exportToOutline(): string
  expandNode(nodeId: string): void
  collapseNode(nodeId: string): void
  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean
  executeCommand(id: string): Promise<boolean>
  getCommands(): MindMapCommandState[]
  getMarkdown(): string
  getController(): MindMapController
  fitView(animated?: boolean): void
  focusNode(nodeId: string): void
  selectNode(nodeId: string | null): void
  setDirection(direction: MindMapDirection): void
  startEditing(nodeId: string): void
  addChild(parentId?: string): string | null
  addRoot(): string | null
  addSibling(nodeId?: string): string | null
  removeNode(nodeId?: string): void
}

export const MindMapEditor = forwardRef<MindMapEditorRef, MindMapEditorProps>(function MindMapEditor({
  controller: externalController,
  document,
  documentRevision,
  data,
  markdown,
  defaultMarkdown,
  direction,
  defaultDirection,
  onDirectionChange,
  locale,
  messages: messageOverrides,
  extensions: suppliedExtensions,
  features = DEFAULT_FEATURES,
  theme,
  themeTokens,
  remoteImagePolicy,
  className,
  ariaLabel = 'Editable mind map',
  toolbar = true,
  readOnly: readOnlyProp,
  readonly: readonlyAlias,
  searchQuery: controlledQuery,
  activeTags: controlledTags,
  onSearchChange,
  onActiveTagsChange,
  textEditor: TextEditor,
  onInteractionEvent,
  autoFit,
  autoFitPolicy,
  culling,
  selectedNodeId,
  onSelectedNodeChange,
  onDocumentChange,
  onChange,
  onMarkdownChange,
  onEvent,
  onViewportChange,
}, forwardedRef) {
  const readOnly = readOnlyProp ?? readonlyAlias ?? false
  const messages = useMessages(locale, messageOverrides)
  const controls = typeof toolbar === 'object' ? toolbar : {}
  const toolbarVisible = toolbar !== false
  const controller = useOwnedController({ controller: externalController, document, documentRevision, data, markdown, defaultMarkdown, direction, defaultDirection, extensions: suppliedExtensions, theme: initialRuntimeTheme(theme, { document, markdown, defaultMarkdown, controller: externalController }, themeTokens) })
  const imagePolicy = remoteImagePolicy ?? controller.getLayoutOptions().remoteImagePolicy ?? 'deny'
  const snapshot = useMindMapControllerSnapshot(controller)
  const extensions = suppliedExtensions ?? controller.getLayoutOptions().extensions ?? EMPTY_EXTENSIONS
  const activeTheme = useRuntimeTheme(theme ?? snapshot.document.theme, themeTokens)
  const surfaceRef = useRef<MindMapSurfaceRef>(null)
  const previousZoom = useRef<number | null>(null)
  const currentMarkdown = useMemo(() => {
    try {
      return serializeMindMap(snapshot.document, { extensions })
    } catch {
      // A controlled Markdown source can be reparsed after its Extension set changes.
      // Keep that source available during the render before synchronization runs.
      return markdown ?? ''
    }
  }, [snapshot.document, extensions, markdown])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [remarkId, setRemarkId] = useState<string | null>(null)
  const [remarkDraft, setRemarkDraft] = useState('')
  const [internalQuery, setInternalQuery] = useState('')
  const [internalTags, setInternalTags] = useState<string[]>([])
  const [textMode, setTextMode] = useState(false)
  const [foldOverrides, setFoldOverrides] = useState<Record<string, boolean>>({})
  const [viewDirection, setViewDirection] = useState<{ source: MindMapDirection | undefined; value?: MindMapDirection }>({ source: direction })
  if (viewDirection.source !== direction) setViewDirection({ source: direction })
  const runtimeLayout = useProjection(controller, snapshot, { direction: direction ?? viewDirection.value ?? (snapshot.document.direction ? undefined : defaultDirection), extensions, theme: activeTheme, remoteImagePolicy: imagePolicy, ...(readOnly ? { foldOverrides } : {}) })
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const clipboard = useRef<MindMapNode | null>(null)
  const activeController = useRef<MindMapController | null>(controller)
  const [operationError, setOperationError] = useState('')
  const registryRef = useRef<MindMapCommandRegistry | null>(null)
  const executeCommand = useCallback(async (id: string) => {
    try { return await registryRef.current?.invoke(id) ?? false }
    catch { setOperationError(messages.commandError); return false }
  }, [messages.commandError])
  useEffect(() => { activeController.current = controller; return () => { activeController.current = null } }, [controller])
  const searchQuery = controlledQuery ?? internalQuery
  const activeTags = controlledTags ?? internalTags
  const filters = useNodeFilters(snapshot.document, searchQuery, activeTags)
  const editingSession = useRef<{ controller: MindMapController; nodeId: string } | null>(null)
  const [editingController, setEditingController] = useState(controller)
  if (editingController !== controller) {
    setEditingController(controller)
    setEditingId(null)
    setRemarkId(null)
  }

  useEffect(() => {
    if (selectedNodeId !== undefined && selectedNodeId !== snapshot.selectedNodeId) controller.selectNode(selectedNodeId)
  }, [controller, selectedNodeId, snapshot.selectedNodeId])

  useEffect(() => controller.subscribeEvents((event) => {
    onEvent?.(event)
    if (event.previous.document === event.current.document) return
    if (event.reason === 'external' || event.reason === 'history') {
      editingSession.current = null
      setEditingId(null)
      setRemarkId(null)
    }
    let nextMarkdown: string | undefined
    try {
      nextMarkdown = serializeMindMap(event.current.document, { extensions })
    } catch {
      // JSON-only Documents still notify Document consumers without emitting lossy Markdown.
    }
    if (nextMarkdown !== undefined) onMarkdownChange?.(nextMarkdown)
    onDocumentChange?.(event.current.document)
    onChange?.(event.current.document)
  }), [controller, extensions, onChange, onDocumentChange, onEvent, onMarkdownChange])

  const selectNode = useCallback((nodeId: string | null) => {
    controller.selectNode(nodeId)
    onSelectedNodeChange?.(nodeId)
    onInteractionEvent?.({ type: 'nodeSelect', nodeId })
  }, [controller, onSelectedNodeChange, onInteractionEvent])

  const toggleFold = useCallback((nodeId: string) => {
    if (readOnly) setFoldOverrides((current) => ({ ...current, [nodeId]: !(current[nodeId] ?? Boolean(findNode(controller.getSnapshot().document, nodeId)?.attributes?.folding?.collapsed)) }))
    else controller.toggleFold(nodeId)
  }, [controller, readOnly])

  const setDirection = useCallback((value: MindMapDirection) => {
    onDirectionChange?.(value)
    onInteractionEvent?.({ type: 'directionChange', direction: value })
    if (direction !== undefined) return
    if (readOnly) setViewDirection({ source: direction, value })
    else controller.setDirection(value)
  }, [controller, direction, readOnly, onDirectionChange, onInteractionEvent])

  const focusNode = useCallback((nodeId: string) => {
    const state = controller.getSnapshot()
    const parents = new Map<string, string | null>()
    walkNodes(state.document, (node, parent) => parents.set(node.id, parent?.id ?? null))
    let parent = parents.get(nodeId)
    while (parent) {
      if (readOnly) { const id = parent; setFoldOverrides((current) => ({ ...current, [id]: false })) }
      else if (findNode(state.document, parent)?.attributes?.folding?.collapsed) controller.toggleFold(parent)
      parent = parents.get(parent)
    }
    surfaceRef.current?.focusNode(nodeId)
    onInteractionEvent?.({ type: 'nodeFocus', nodeId })
  }, [controller, readOnly, onInteractionEvent])

  const startEditing = useCallback((nodeId: string) => {
    if (readOnly) return
    const node = findNode(controller.getSnapshot().document, nodeId)
    if (!node) return
    selectNode(nodeId)
    setDraft(node.text)
    editingSession.current = { controller, nodeId }
    setEditingId(nodeId)
  }, [controller, selectNode, readOnly])

  const commitEditing = useCallback(() => {
    if (!editingId || readOnly || editingSession.current?.controller !== controller || editingSession.current.nodeId !== editingId) return
    editingSession.current = null
    const text = draft.trim() || messages.newNode
    controller.updateNode(editingId, { text })
    setEditingId(null)
  }, [controller, draft, editingId, readOnly, messages.newNode])

  const addChild = useCallback((parentId = controller.getSnapshot().selectedNodeId ?? controller.getSnapshot().document.roots[0]?.id): string | null => {
    if (readOnly) return null
    if (!parentId) return null
    const id = createNodeId()
    controller.insertNode(parentId, { id, text: messages.newNode })
    selectNode(id)
    queueMicrotask(() => startEditing(id))
    return id
  }, [controller, selectNode, startEditing, readOnly, messages.newNode])

  const addRoot = useCallback(() => {
    if (readOnly) return null
    const id = createNodeId()
    controller.insertNode(null, { id, text: messages.newNode })
    selectNode(id)
    startEditing(id)
    return id
  }, [controller, readOnly, messages.newNode, selectNode, startEditing])

  const addSibling = useCallback((nodeId = controller.getSnapshot().selectedNodeId ?? undefined): string | null => {
    if (readOnly) return null
    if (!nodeId) return null
    const location = locateNode(controller.getSnapshot().document, nodeId)
    if (!location) return null
    const id = createNodeId()
    controller.insertNode(location.parentId, { id, text: messages.newNode }, location.index + 1)
    selectNode(id)
    queueMicrotask(() => startEditing(id))
    return id
  }, [controller, selectNode, startEditing, readOnly, messages.newNode])

  const removeNode = useCallback((nodeId = controller.getSnapshot().selectedNodeId ?? undefined) => {
    if (!nodeId || readOnly) return
    const location = locateNode(controller.getSnapshot().document, nodeId)
    const transaction = controller.beginTransaction('edit')
    transaction.applyPatches([{ type: 'remove', nodeId }])
    const remaining = controller.getSnapshot().document.roots
    if (remaining.length === 0) {
      const id = createNodeId()
      transaction.applyPatches([{ type: 'insert', parentId: null, index: 0, node: { id, text: 'Root' } }])
      transaction.commit()
      selectNode(id)
      return
    }
    transaction.commit()
    selectNode(location?.parentId ?? remaining[0].id)
  }, [controller, selectNode, readOnly])

  const moveNode = useCallback((nodeId: string, targetId: string, placement: 'before' | 'after' | 'child' = 'child') => {
    if (readOnly) return
    const document = controller.getSnapshot().document
    const node = findNode(document, nodeId)
    const target = findNode(document, targetId)
    const location = locateNode(document, targetId)
    if (!node || !target || !location || findNode({ roots: [node] }, targetId)) return
    const parentId = placement === 'child' ? targetId : location.parentId
    let index = placement === 'child' ? target.children?.length ?? 0 : location.index + (placement === 'after' ? 1 : 0)
    const origin = locateNode(document, nodeId)
    if (origin?.parentId === parentId && origin.index < index) index -= 1
    const transaction = controller.beginTransaction('edit')
    transaction.applyPatches([{ type: 'move', nodeId, parentId, index }])
    transaction.commit()
  }, [controller, readOnly])

  const copyNode = useCallback((cut = false) => {
    const selected = controller.getSnapshot().selectedNodeId
    const node = selected ? findNode(controller.getSnapshot().document, selected) : null
    if (!node) return
    clipboard.current = cloneNode(node)
    void navigator.clipboard?.writeText?.(serializeMindMap({ roots: [node] }, { extensions })).catch(() => undefined)
    if (cut && !readOnly) removeNode(node.id)
  }, [controller, extensions, readOnly, removeNode])

  const pasteNode = useCallback(async () => {
    if (readOnly) return
    const before = controller.getSnapshot()
    let nodes = clipboard.current ? [cloneNode(clipboard.current)] : []
    try {
      if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText()
        if (text.trim()) nodes = parseMindMap(text, { extensions }).roots.map(cloneNode)
      }
    } catch {
      if (activeController.current !== controller) return
      if (!nodes.length) { setOperationError(messages.clipboardUnavailable); return }
    }
    if (activeController.current !== controller || controller.getSnapshot().document !== before.document || !nodes.length) return
    walkNodes({ roots: nodes }, (node) => { node.id = createNodeId() })
    const transaction = controller.beginTransaction('edit')
    const patches = nodes.map((node, index) => ({ type: 'insert' as const, parentId: before.selectedNodeId, index: (before.selectedNodeId ? findNode(before.document, before.selectedNodeId)?.children?.length ?? 0 : before.document.roots.length) + index, node }))
    if (!transaction.applyPatches(patches)) { transaction.cancel(); setOperationError(messages.importInvalidData); return }
    transaction.commit()
    selectNode(nodes[0].id)
    setOperationError('')
  }, [controller, readOnly, selectNode, extensions, messages.clipboardUnavailable, messages.importInvalidData])

  const navigate = useCallback((key: 'parent' | 'child' | 'previous' | 'next') => {
    const state = controller.getSnapshot()
    const selected = state.selectedNodeId
    if (!selected) return selectNode(state.document.roots[0]?.id ?? null)
    const node = runtimeLayout.nodeById.get(selected)
    if (!node) return
    if (key === 'parent') return selectNode(node.parentId ?? selected)
    if (key === 'child') return selectNode(runtimeLayout.childrenByParent.get(selected)?.[0] ?? selected)
    const siblings = node.parentId ? runtimeLayout.childrenByParent.get(node.parentId) ?? [] : state.document.roots.map((root) => root.id)
    const index = siblings.indexOf(selected)
    const next = key === 'previous' ? siblings[Math.max(0, index - 1)] : siblings[Math.min(siblings.length - 1, index + 1)]
    selectNode(next ?? selected)
  }, [controller, selectNode, runtimeLayout])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (event.defaultPrevented || target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (!readOnly) void executeCommand(event.shiftKey ? 'redo' : 'undo')
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); if (!readOnly) void executeCommand('redo'); return }
    if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === 'c' || (!readOnly && ['x', 'v'].includes(event.key.toLowerCase())))) {
      event.preventDefault()
      void executeCommand(event.key.toLowerCase() === 'v' ? 'paste' : event.key.toLowerCase() === 'x' ? 'cut' : 'copy')
      return
    }
    if (target.closest('button, a, [role="button"]')) return
    if (event.key === ' ' && controller.getSnapshot().selectedNodeId) { event.preventDefault(); toggleFold(controller.getSnapshot().selectedNodeId!); return }
    if (event.shiftKey && event.code === 'Digit0') { event.preventDefault(); surfaceRef.current?.fitView(); return }
    if (event.shiftKey && ['KeyL', 'KeyR', 'KeyM'].includes(event.code)) { event.preventDefault(); setDirection(event.code === 'KeyL' ? 'left' : event.code === 'KeyR' ? 'right' : 'both'); return }
    if (event.altKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) && !readOnly) {
      event.preventDefault()
      const commands = { ArrowUp: 'moveBefore', ArrowDown: 'moveAfter', ArrowLeft: 'outdent', ArrowRight: 'indent' }
      void executeCommand(commands[event.key as keyof typeof commands])
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') return
    if (!readOnly && event.key === 'Enter' && event.shiftKey) { event.preventDefault(); void executeCommand('addSibling'); return }
    if (!readOnly && (event.key === 'Enter' || event.key === 'F2')) {
      const selected = controller.getSnapshot().selectedNodeId
      if (selected) { event.preventDefault(); void executeCommand('edit') }
      return
    }
    if (!readOnly && event.key === 'Tab') { event.preventDefault(); void executeCommand('addChild'); return }
    if (!readOnly && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); void executeCommand('delete'); return }
    if (event.key === 'Escape') { setEditingId(null); selectNode(null); return }
    if (event.key === 'ArrowLeft') { event.preventDefault(); navigate('parent') }
    else if (event.key === 'ArrowRight') { event.preventDefault(); navigate('child') }
    else if (event.key === 'ArrowUp') { event.preventDefault(); navigate('previous') }
    else if (event.key === 'ArrowDown') { event.preventDefault(); navigate('next') }
  }, [controller, navigate, selectNode, readOnly, toggleFold, setDirection, executeCommand])

  const setMarkdown = useCallback((value: string) => {
    if (!readOnly) controller.setMarkdown(value, 'markdown')
  }, [controller, readOnly])

  const context = useMemo<MindMapEditorFeatureContext>(() => ({
    controller,
    snapshot: { ...snapshot, layout: runtimeLayout },
    document: snapshot.document,
    markdown: currentMarkdown,
    extensions,
    theme: activeTheme, remoteImagePolicy: imagePolicy,
    messages,
    searchQuery,
    searchMatchIds: searchQuery.trim() ? filters.matchIds : [],
    activeTags,
    setSearchQuery: (query) => { setInternalQuery(query); onSearchChange?.(query); onInteractionEvent?.({ type: 'searchChange', query, matchCount: query.trim() ? filterMindMapNodes(controller.getSnapshot().document, query, activeTags).matchIds.length : 0 }) },
    setActiveTags: (tags) => { setInternalTags(tags); onActiveTagsChange?.(tags); onInteractionEvent?.({ type: 'tagFilterChange', tags }) },
    emitEvent: (event) => onInteractionEvent?.(event),
    selectNode,
    executeCommand,
    getCommand: (id) => registryRef.current?.get(id),
    setMarkdown,
    focusNode,
  }), [imagePolicy, activeTheme, controller, currentMarkdown, extensions, setMarkdown, snapshot, messages, searchQuery, activeTags, onSearchChange, onActiveTagsChange, onInteractionEvent, filters.matchIds, selectNode, focusNode, runtimeLayout, executeCommand])

  const commandRegistry = useMemo(() => createMindMapCommandRegistry([
    { id: 'addRoot', label: messages.newRootNode, enabled: (context) => !context.readOnly, execute: () => { addRoot() } },
    { id: 'addChild', label: messages.addChild, enabled: (context) => !context.readOnly && Boolean(context.controller.getSnapshot().selectedNodeId), execute: () => { addChild() } },
    { id: 'addSibling', label: messages.addSibling, enabled: (context) => !context.readOnly && Boolean(context.controller.getSnapshot().selectedNodeId), execute: () => { addSibling() } },
    { id: 'edit', label: messages.editNode, enabled: (context) => !context.readOnly && Boolean(context.controller.getSnapshot().selectedNodeId), execute: (context) => { const id = context.controller.getSnapshot().selectedNodeId; if (id) startEditing(id) } },
    { id: 'delete', label: messages.deleteNode, enabled: (context) => !context.readOnly && Boolean(context.controller.getSnapshot().selectedNodeId), execute: () => removeNode() },
    { id: 'copy', label: messages.copy, enabled: (context) => Boolean(context.controller.getSnapshot().selectedNodeId), execute: () => copyNode() },
    { id: 'cut', label: messages.cut, enabled: (context) => !context.readOnly && Boolean(context.controller.getSnapshot().selectedNodeId), execute: () => copyNode(true) },
    { id: 'paste', label: messages.paste, enabled: (context) => !context.readOnly, execute: pasteNode },
    { id: 'undo', label: messages.undo, enabled: (context) => !context.readOnly && context.controller.getSnapshot().canUndo, execute: () => { controller.undo(); const state = controller.getSnapshot(); onInteractionEvent?.({ type: 'undo', canUndo: state.canUndo, canRedo: state.canRedo }) } },
    { id: 'redo', label: messages.redo, enabled: (context) => !context.readOnly && context.controller.getSnapshot().canRedo, execute: () => { controller.redo(); const state = controller.getSnapshot(); onInteractionEvent?.({ type: 'redo', canUndo: state.canUndo, canRedo: state.canRedo }) } },
    ...mindMapTreeMoveCommands(messages),
    ...features.flatMap((feature) => feature.commands ?? []),
  ], () => ({ controller, readOnly })), [controller, readOnly, messages, addRoot, addChild, addSibling, startEditing, removeNode, copyNode, pasteNode, onInteractionEvent, features])
  useEffect(() => { registryRef.current = commandRegistry; return () => { registryRef.current = null } }, [commandRegistry])

  useImperativeHandle(forwardedRef, () => ({
    getDocument: () => controller.getSnapshot().document,
    getData: () => controller.getSnapshot().document.roots,
    setData: (data) => { if (!readOnly) controller.setDocument({ roots: Array.isArray(data) ? data : [data] }, 'external') },
    setMarkdown,
    importData: (data) => { if (!readOnly) controller.setDocument({ roots: Array.isArray(data) ? data : [data] }, 'edit') },
    importMarkdown: setMarkdown,
    exportToSVG: () => renderMindMapToSvg(controller.getSnapshot().document, { extensions, theme: activeTheme, remoteImagePolicy: imagePolicy }),
    exportToOutline: () => { const lines: string[] = []; walkNodes(controller.getSnapshot().document, (node, _parent, _index, depth) => lines.push(`${'  '.repeat(depth)}${node.text}`)); return lines.join('\n') },
    expandNode: (id) => { if (readOnly) setFoldOverrides((current) => ({ ...current, [id]: false })); else if (findNode(controller.getSnapshot().document, id)?.attributes?.folding?.collapsed) controller.toggleFold(id) },
    collapseNode: (id) => { if (readOnly) setFoldOverrides((current) => ({ ...current, [id]: true })); else if (!findNode(controller.getSnapshot().document, id)?.attributes?.folding?.collapsed) controller.toggleFold(id) },
    undo: () => { if (!readOnly) controller.undo() },
    redo: () => { if (!readOnly) controller.redo() },
    canUndo: () => controller.getSnapshot().canUndo,
    canRedo: () => controller.getSnapshot().canRedo,
    executeCommand,
    getCommands: () => commandRegistry.list(),
    getMarkdown: () => currentMarkdown,
    getController: () => controller,
    fitView: (animated) => surfaceRef.current?.fitView(animated),
    focusNode,
    selectNode,
    setDirection,
    startEditing,
    addChild,
    addRoot,
    addSibling,
    removeNode,
  }), [imagePolicy, addChild, addRoot, addSibling, controller, currentMarkdown, removeNode, selectNode, startEditing, readOnly, setMarkdown, activeTheme, extensions, focusNode, setDirection, executeCommand, commandRegistry])

  const renderEditorOverlay = useCallback((node: MindMapLayoutNode) => editingId === node.id ? (
    <foreignObject
      className="mm-editor-input-object"
      x={-Math.max(node.width + 24, 120) / 2}
      y={-Math.max(node.height, 40) / 2}
      width={Math.max(node.width + 24, 120)}
      height={Math.max(node.height, 40)}
    >
      <input
        className="mm-editor-input"
        value={draft}
        autoFocus
        aria-label={messages.nodeText}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); commitEditing() }
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); editingSession.current = null; setEditingId(null) }
        }}
        onBlur={commitEditing}
      />
    </foreignObject>
  ) : null, [commitEditing, draft, editingId, messages.nodeText])

  const renderFeatures = (placement: 'toolbar' | 'bottom' | 'overlay') => features
    .filter((feature) => !(feature.id === 'history' && controls.history === false) && !(feature.id === 'search' && controls.search === false))
    .filter((feature) => !readOnly || ['search', 'export'].includes(feature.id))
    .filter((feature) => (feature.placement ?? 'toolbar') === placement)
    .map((feature) => <feature.Component key={feature.id} context={context} options={feature.options} />)

  return (
    <MindMapSurface
      ref={surfaceRef}
      layout={runtimeLayout}
      document={snapshot.document}
      theme={activeTheme} remoteImagePolicy={imagePolicy}
      className={`mm-editor ${className ?? ''}`.trim()}
      ariaLabel={ariaLabel}
      selectedNodeId={snapshot.selectedNodeId}
      selectable
      toolbar={toolbarVisible && controls.zoom !== false}
      autoFit={autoFitPolicy ?? autoFit ?? 'initial'}
      onNodeSelect={selectNode}
      onNodeDoubleClick={startEditing}
      onNodeMove={readOnly ? undefined : moveNode}
      editingNodeId={editingId}
      culling={culling}
      matchingNodeIds={filters.matchingIds}
      messages={messages}
      fullscreen={controls.fullscreen !== false}
      onFullscreenChange={(fullscreen) => onInteractionEvent?.({ type: 'fullscreenChange', fullscreen })}
      onContextMenu={(event) => {
        if ((event.target as Element).closest('input, textarea, select')) return
        event.preventDefault()
        const id = (event.target as Element).closest('[data-mm-node]')?.getAttribute('data-mm-node') ?? null
        selectNode(id)
        setContextMenu({ x: event.clientX, y: event.clientY })
      }}
      onFoldToggle={toggleFold}
      onKeyDown={handleKeyDown}
      onViewportChange={(viewport) => {
        onViewportChange?.(viewport)
        onInteractionEvent?.({ type: 'viewportChange', viewport })
        if (viewport.zoom !== previousZoom.current) { previousZoom.current = viewport.zoom; onInteractionEvent?.({ type: 'zoomChange', zoom: viewport.zoom }) }
      }}
      renderNodeOverlay={renderEditorOverlay}
    >
      {toolbarVisible && <div className="mm-editor-toolbar" role="toolbar" aria-label={messages.editorLabel}>
        {!readOnly && controls.editing !== false && <div className="mm-editor-toolbar__group">
          <button type="button" onClick={() => addChild()} disabled={!snapshot.selectedNodeId}>{messages.addChild}</button>
          <button type="button" onClick={() => addSibling()} disabled={!snapshot.selectedNodeId}>{messages.addSibling}</button>
          <button type="button" onClick={() => snapshot.selectedNodeId && startEditing(snapshot.selectedNodeId)} disabled={!snapshot.selectedNodeId}>{messages.editNode}</button>
          <button type="button" onClick={() => removeNode()} disabled={!snapshot.selectedNodeId}>{messages.deleteNode}</button>
          <button type="button" disabled={!snapshot.selectedNodeId} onClick={() => {
            const node = snapshot.selectedNodeId ? findNode(snapshot.document, snapshot.selectedNodeId) : null
            if (!node) return
            const status = node.attributes?.task?.status
            const next = status === 'todo' ? 'doing' : status === 'doing' ? 'done' : 'todo'
            controller.updateNode(node.id, { attributes: { ...node.attributes, task: { status: next } } })
          }}>{messages.task}</button>
          <button type="button" disabled={!snapshot.selectedNodeId} onClick={() => {
            const node = snapshot.selectedNodeId ? findNode(snapshot.document, snapshot.selectedNodeId) : null
            if (node) { setRemarkId(node.id); setRemarkDraft(node.attributes?.remark?.text ?? '') }
          }}>{messages.remark}</button>
        </div>}
        {!readOnly && controls.direction !== false && <div className="mm-editor-direction" aria-label={messages.layout}>
          {(['left', 'both', 'right'] as const).map((value) => <button key={value} type="button" className={(direction ?? viewDirection.value ?? snapshot.document.direction ?? 'both') === value ? 'is-active' : ''} onClick={() => setDirection(value)}>{value === 'left' ? messages.layoutLeft : value === 'right' ? messages.layoutRight : messages.layoutBoth}</button>)}
        </div>}
        {TextEditor && controls.textMode !== false && <button type="button" onClick={() => { setTextMode((value) => !value); onInteractionEvent?.({ type: 'modeChange', mode: textMode ? 'view' : 'text' }) }}>{textMode ? messages.viewMode : messages.textMode}</button>}
        <div className="mm-feature-toolbar">{renderFeatures('toolbar')}</div>
        {controls.tags !== false && filters.tags.length > 0 && <label className="mm-tag-filter">{messages.tagFilter}<select multiple aria-label={messages.tagFilter} value={[...activeTags]} onChange={(event) => context.setActiveTags(Array.from(event.target.selectedOptions, (option) => option.value))}>{filters.tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select><button type="button" onClick={() => context.setActiveTags([])}>{messages.clearFilters}</button></label>}
      </div>}
      {textMode && TextEditor && <div className="mm-text-mode"><TextEditor value={currentMarkdown} onChange={setMarkdown} readOnly={readOnly} /></div>}
      {contextMenu && <EditorContextMenu {...contextMenu} theme={activeTheme} close={() => setContextMenu(null)} actions={commandRegistry.list().map((command) => ({ label: command.label, disabled: !command.enabled, run: () => { void executeCommand(command.id) } }))} />}
      {operationError && <p className="mm-operation-error" role="alert">{operationError}</p>}
      {remarkId && !readOnly && <div className="mm-node-properties" role="dialog" aria-label={messages.remark} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') setRemarkId(null) }}>
        <label>{messages.remark}<textarea aria-label={messages.remark} value={remarkDraft} onChange={(event) => setRemarkDraft(event.target.value)} autoFocus /></label>
        <button type="button" onClick={() => setRemarkId(null)}>{messages.cancel}</button>
        <button type="button" onClick={() => { const node = findNode(controller.getSnapshot().document, remarkId); if (node) controller.updateNode(node.id, { attributes: { ...node.attributes, remark: { text: remarkDraft } } }); setRemarkId(null) }}>{messages.save}</button>
      </div>}
      {!readOnly && <div className="mm-feature-overlay">{renderFeatures('overlay')}</div>}
      {!readOnly && <div className="mm-feature-bottom">{renderFeatures('bottom')}</div>}
    </MindMapSurface>
  )
})
