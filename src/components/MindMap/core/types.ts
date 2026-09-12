import type { MindMapRemoteImagePolicy } from './url'
export type MindMapDirection = 'left' | 'right' | 'both'
export type MindMapThemeMode = 'light' | 'dark' | 'auto'
export type MindMapTaskStatus = 'todo' | 'doing' | 'done'
export type MindMapSide = 'left' | 'right' | 'root'

export interface MindMapNodeAttributes {
  task?: { status: MindMapTaskStatus }
  remark?: { text: string }
  tags?: { values: string[] }
  folding?: { collapsed: boolean }
  multiline?: { lines: string[] }
  connection?: { dotted?: boolean; label?: string }
  /** Preserve whether a parsed root used list syntax instead of a bare title. */
  syntax?: { listRoot: boolean }
  [namespace: string]: unknown
}

export interface MindMapNode<TAttributes extends MindMapNodeAttributes = MindMapNodeAttributes> {
  id: string
  text: string
  children?: MindMapNode<TAttributes>[]
  attributes?: TAttributes
}

export interface MindMapDocument<TAttributes extends MindMapNodeAttributes = MindMapNodeAttributes> {
  roots: MindMapNode<TAttributes>[]
  direction?: MindMapDirection
  theme?: MindMapThemeMode
  metadata?: Record<string, string>
  comments?: { text: string; afterNodeId: string | null }[]
}

export interface MindMapThemeTokens {
  background: string
  text: string
  mutedText: string
  rootFill: string
  rootText: string
  selection: string
  branches: readonly string[]
  fontFamily: string
  rootFontSize: number
  levelOneFontSize: number
  nodeFontSize: number
  horizontalGap: number
  verticalGap: number
  rootPaddingX: number
  rootPaddingY: number
  nodePaddingX: number
  nodePaddingY: number
}

export interface MindMapLayoutNode<TAttributes extends MindMapNodeAttributes = MindMapNodeAttributes> {
  id: string
  text: string
  x: number
  y: number
  width: number
  height: number
  depth: number
  side: MindMapSide
  color: string
  rootIndex: number
  branchIndex: number
  parentId?: string
  childCount: number
  attributes?: TAttributes
}

export interface MindMapLayoutEdge {
  id: string
  fromId: string
  toId: string
  path: string
  color: string
  dotted?: boolean
  label?: string
}

export interface MindMapBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

export interface MindMapLayout<TAttributes extends MindMapNodeAttributes = MindMapNodeAttributes> {
  nodes: MindMapLayoutNode<TAttributes>[]
  edges: MindMapLayoutEdge[]
  nodeById: ReadonlyMap<string, MindMapLayoutNode<TAttributes>>
  childrenByParent: ReadonlyMap<string, string[]>
  bounds: MindMapBounds
}

export interface MindMapParseOptions {
  extensions?: readonly MindMapExtension[]
}

export interface MindMapSerializeOptions {
  extensions?: readonly MindMapExtension[]
}

export interface MindMapLayoutOptions {
  /** Remote images require explicit authorization; defaults to deny. */
  remoteImagePolicy?: MindMapRemoteImagePolicy
  direction?: MindMapDirection
  extensions?: readonly MindMapExtension[]
  theme?: Partial<MindMapThemeTokens>
  splitByRoot?: Record<string, number>
  foldOverrides?: Record<string, boolean>
}

export interface MindMapExtension {
  id: string
  transformNode?(node: MindMapNode, source: string): MindMapNode
  serializeNode?(node: MindMapNode, text: string): string
  filterChildren?(node: MindMapNode, children: readonly MindMapNode[], collapsed: boolean): readonly MindMapNode[]
  transformEdge?(edge: MindMapLayoutEdge, parent: MindMapLayoutNode, child: MindMapLayoutNode): MindMapLayoutEdge
  transformLayout?(layout: MindMapLayout, document: MindMapDocument): MindMapLayout
}

export type MindMapPatch =
  | { type: 'insert'; parentId: string | null; index: number; node: MindMapNode }
  | { type: 'remove'; nodeId: string }
  | { type: 'update'; nodeId: string; text?: string; attributes?: MindMapNodeAttributes | null }
  | { type: 'move'; nodeId: string; parentId: string | null; index: number }
  | { type: 'replace-document'; document: MindMapDocument }

export type MindMapChangeReason =
  | 'initial'
  | 'external'
  | 'markdown'
  | 'patch'
  | 'edit'
  | 'history'
  | 'stream'
  | 'direction'
  | 'fold'

/** Runtime-owned immutable view. The snapshot and every reachable document or
 * projection value are frozen. Clone document input before editing it directly;
 * use controller commands to publish changes. Input model types remain usable
 * for constructing documents outside the runtime. */
export interface MindMapControllerSnapshot {
  readonly version: number
  readonly document: MindMapDocument
  readonly layout: MindMapLayout
  readonly selectedNodeId: string | null
  readonly reason: MindMapChangeReason
  readonly canUndo: boolean
  readonly canRedo: boolean
}

/** Transaction mutations are live previews; commit finalizes their single
 * history entry. Rollback restores the baseline. Selection/layout-only updates
 * use change and do not end an active transaction. Immediate edits, history
 * commands and authoritative replacements use commit. */
export type MindMapControllerEventPhase = 'preview' | 'commit' | 'rollback' | 'change'

export interface MindMapControllerEvent {
  previous: MindMapControllerSnapshot
  current: MindMapControllerSnapshot
  patches: readonly MindMapPatch[]
  reason: MindMapChangeReason
  phase: MindMapControllerEventPhase
}

export interface MindMapControllerOptions extends MindMapLayoutOptions {
  parse?: MindMapParseOptions
  historyLimit?: number
}

export interface MindMapTransaction {
  applyPatches(patches: readonly MindMapPatch[]): boolean
  setMarkdown(markdown: string): boolean
  commit(): boolean
  cancel(): boolean
  isActive(): boolean
}

export interface MindMapControllerStream extends MindMapMarkdownStream {
  commit(): Promise<boolean>
  cancel(): void
  isActive(): boolean
}

export interface MindMapController {
  getSnapshot(): MindMapControllerSnapshot
  /** Read-only projection for view-local overrides; never changes the document,
   * controller options, history, or subscriptions. */
  getLayout(options?: MindMapLayoutOptions): MindMapLayout
  getLayoutOptions(): Readonly<MindMapLayoutOptions>
  subscribe(listener: () => void): () => void
  subscribeEvents(listener: (event: MindMapControllerEvent) => void): () => void
  setDocument(document: MindMapDocument, reason?: MindMapChangeReason): void
  /** Explicit host replacement, including identical content; clears history and
   * invalidates any active transaction. Ordinary controlled echoes use setDocument. */
  replaceDocument(document: MindMapDocument): void
  setMarkdown(markdown: string, reason?: MindMapChangeReason): void
  /** Mutations return false when rejected or disposed. Concurrent mutations are
   * validated against the committed baseline before an active preview is ended. */
  applyPatches(patches: readonly MindMapPatch[], reason?: MindMapChangeReason): boolean
  selectNode(nodeId: string | null): void
  setDirection(direction: MindMapDirection): void
  updateNode(nodeId: string, update: { text?: string; attributes?: MindMapNodeAttributes | null }): boolean
  insertNode(parentId: string | null, node: MindMapNode, index?: number): boolean
  removeNode(nodeId: string): boolean
  moveNode(nodeId: string, parentId: string | null, index?: number): boolean
  toggleFold(nodeId: string): boolean
  recompute(): void
  setLayoutOptions(options: MindMapLayoutOptions): void
  beginTransaction(reason?: MindMapChangeReason): MindMapTransaction
  createMarkdownStream(options?: MindMapParseOptions & { initialMarkdown?: string }): MindMapControllerStream
  undo(): boolean
  redo(): boolean
  dispose(): void
}

export interface MindMapStreamUpdate {
  markdown: string
  document: MindMapDocument
  patches: readonly MindMapPatch[]
}

export interface MindMapMarkdownStream {
  append(chunk: string): void
  replace(markdown: string): void
  flush(): Promise<MindMapStreamUpdate | null>
  getMarkdown(): string
  getDocument(): MindMapDocument
  subscribe(listener: (update: MindMapStreamUpdate) => void): () => void
  dispose(): void
}
