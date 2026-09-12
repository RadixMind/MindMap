import type { MindMapRemoteImagePolicy } from '../core/url'
import type { ComponentType } from 'react'
import type { MindMapMessages } from './messages'
import type { MindMapEditorCommand, MindMapCommandState } from './commands'
import type {
  MindMapController,
  MindMapControllerSnapshot,
  MindMapDocument,
  MindMapExtension,
  MindMapThemeTokens,
} from '../core/types'

export type MindMapFeaturePlacement = 'toolbar' | 'bottom' | 'overlay'

export interface MindMapEditorFeatureContext {
  remoteImagePolicy?: MindMapRemoteImagePolicy
  controller: MindMapController
  snapshot: MindMapControllerSnapshot
  document: MindMapDocument
  markdown: string
  extensions: readonly MindMapExtension[]
  theme: MindMapThemeTokens
  messages: MindMapMessages
  searchQuery: string
  searchMatchIds: readonly string[]
  activeTags: readonly string[]
  setSearchQuery(query: string): void
  setActiveTags(tags: string[]): void
  emitEvent(event: MindMapInteractionEvent): void
  setMarkdown(markdown: string): void
  focusNode(nodeId: string): void
  selectNode(nodeId: string | null): void
  executeCommand(id: string): Promise<boolean>
  getCommand(id: string): MindMapCommandState | undefined
}

export type MindMapInteractionEvent =
  | { type: 'directionChange'; direction: import('../core/types').MindMapDirection }
  | { type: 'nodeSelect'; nodeId: string | null }
  | { type: 'nodeFocus'; nodeId: string }
  | { type: 'searchChange'; query: string; matchCount: number }
  | { type: 'tagFilterChange'; tags: string[] }
  | { type: 'modeChange'; mode: 'view' | 'text' }
  | { type: 'zoomChange'; zoom: number }
  | { type: 'viewportChange'; viewport: { x: number; y: number; zoom: number } }
  | { type: 'fullscreenChange'; fullscreen: boolean }
  | { type: 'undo' | 'redo'; canUndo: boolean; canRedo: boolean }
  | { type: 'import'; source: 'markdown' | 'json'; document: MindMapDocument }

export interface MindMapToolbarConfig {
  zoom?: boolean
  history?: boolean
  search?: boolean
  tags?: boolean
  editing?: boolean
  direction?: boolean
  textMode?: boolean
  fullscreen?: boolean
}

export interface MindMapEditorFeatureComponentProps {
  context: MindMapEditorFeatureContext
  options?: unknown
}

export interface MindMapEditorFeature {
  id: string
  placement?: MindMapFeaturePlacement
  /** Factory options are passed as props so recreating a feature preserves its mounted state. */
  options?: unknown
  Component: ComponentType<MindMapEditorFeatureComponentProps>
  commands?: readonly MindMapEditorCommand[]
}
