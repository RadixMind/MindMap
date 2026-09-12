import type { MindMapRemoteImagePolicy } from '../core/url'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useCallback } from 'react'
import { findNode } from '../core/utils'
import type {
  MindMapController,
  MindMapControllerEvent,
  MindMapDirection,
  MindMapDocument,
  MindMapExtension,
  MindMapNode,
  MindMapThemeMode,
  MindMapThemeTokens,
} from '../core/types'
import { useMindMapControllerSnapshot } from './useController'
import { useOwnedController } from './useOwnedController'
import { MindMapSurface, type MindMapAutoFitPolicy, type MindMapCullingOptions, type MindMapSurfaceRef, type MindMapViewport } from './MindMapSurface'
import { initialRuntimeTheme, useRuntimeTheme } from './theme'
import type { MindMapToolbarConfig, MindMapInteractionEvent } from './editor-types'
import type { MindMapMessages } from './messages'
import { useMessages } from './useMessages'
import { useNodeFilters } from './useNodeFilters'
import { useProjection } from './useProjection'

const NO_TAGS: readonly string[] = []

export interface MindMapViewerProps {
  remoteImagePolicy?: MindMapRemoteImagePolicy
  controller?: MindMapController
  document?: MindMapDocument
  data?: MindMapNode | MindMapNode[]
  markdown?: string
  defaultMarkdown?: string
  direction?: MindMapDirection
  defaultDirection?: MindMapDirection
  onDirectionChange?: (direction: MindMapDirection) => void
  locale?: string
  messages?: Partial<MindMapMessages>
  searchQuery?: string
  activeTags?: readonly string[]
  extensions?: readonly MindMapExtension[]
  theme?: MindMapThemeMode
  themeTokens?: Partial<MindMapThemeTokens>
  className?: string
  ariaLabel?: string
  toolbar?: boolean | MindMapToolbarConfig
  selectable?: boolean
  autoFit?: MindMapAutoFitPolicy
  autoFitPolicy?: MindMapAutoFitPolicy
  culling?: MindMapCullingOptions
  selectedNodeId?: string | null
  onSelectedNodeChange?: (nodeId: string | null) => void
  onEvent?: (event: MindMapControllerEvent) => void
  onInteractionEvent?: (event: MindMapInteractionEvent) => void
  onViewportChange?: (viewport: MindMapViewport) => void
}

export interface MindMapViewerRef {
  getDocument(): MindMapDocument
  getData(): MindMapNode[]
  getController(): MindMapController
  fitView(animated?: boolean): void
  focusNode(nodeId: string): void
  selectNode(nodeId: string | null): void
  setDirection(direction: MindMapDirection): void
  getViewport(): MindMapViewport
}

export const MindMapViewer = forwardRef<MindMapViewerRef, MindMapViewerProps>(function MindMapViewer({
  controller: externalController,
  document,
  data,
  markdown,
  defaultMarkdown,
  direction,
  defaultDirection,
  onDirectionChange,
  locale,
  messages: messageOverrides,
  searchQuery = '',
  activeTags = NO_TAGS,
  extensions,
  theme,
  themeTokens,
  remoteImagePolicy,
  className,
  ariaLabel,
  toolbar = true,
  selectable = true,
  autoFit,
  autoFitPolicy,
  culling,
  selectedNodeId,
  onSelectedNodeChange,
  onEvent,
  onInteractionEvent,
  onViewportChange,
}, forwardedRef) {
  const controller = useOwnedController({ controller: externalController, document, data, markdown, defaultMarkdown, direction, defaultDirection, extensions, theme: initialRuntimeTheme(theme, { document, markdown, defaultMarkdown, controller: externalController }, themeTokens) })
  const imagePolicy = remoteImagePolicy ?? controller.getLayoutOptions().remoteImagePolicy ?? 'deny'
  const snapshot = useMindMapControllerSnapshot(controller)
  const messages = useMessages(locale, messageOverrides)
  const filters = useNodeFilters(snapshot.document, searchQuery, activeTags)
  const [foldOverrides, setFoldOverrides] = useState<Record<string, boolean>>({})
  const [viewDirection, setViewDirection] = useState<{ source: MindMapDirection | undefined; value?: MindMapDirection }>({ source: direction })
  if (viewDirection.source !== direction) setViewDirection({ source: direction })
  const toggleFold = useCallback((nodeId: string) => {
    setFoldOverrides((current) => ({ ...current, [nodeId]: !(current[nodeId] ?? Boolean(findNode(controller.getSnapshot().document, nodeId)?.attributes?.folding?.collapsed)) }))
  }, [controller])
  const activeTheme = useRuntimeTheme(theme ?? snapshot.document.theme, themeTokens)
  const surfaceRef = useRef<MindMapSurfaceRef>(null)
  const previousZoom = useRef<number | null>(null)
  const setDirection = useCallback((value: MindMapDirection) => {
    onDirectionChange?.(value)
    onInteractionEvent?.({ type: 'directionChange', direction: value })
    if (direction === undefined) setViewDirection({ source: direction, value })
  }, [direction, onDirectionChange, onInteractionEvent])
  const layout = useProjection(controller, snapshot, { direction: direction ?? viewDirection.value ?? (snapshot.document.direction ? undefined : defaultDirection), extensions, theme: activeTheme, remoteImagePolicy: imagePolicy, foldOverrides })

  useEffect(() => onEvent ? controller.subscribeEvents(onEvent) : undefined, [controller, onEvent])
  useEffect(() => {
    if (selectedNodeId !== undefined && selectedNodeId !== snapshot.selectedNodeId) controller.selectNode(selectedNodeId)
  }, [controller, selectedNodeId, snapshot.selectedNodeId])

  useImperativeHandle(forwardedRef, () => ({
    getDocument: () => controller.getSnapshot().document,
    getData: () => controller.getSnapshot().document.roots,
    getController: () => controller,
    fitView: (animated) => surfaceRef.current?.fitView(animated),
    focusNode: (nodeId) => surfaceRef.current?.focusNode(nodeId),
    selectNode: (nodeId) => controller.selectNode(nodeId),
    setDirection,
    getViewport: () => surfaceRef.current?.getViewport() ?? { x: 0, y: 0, zoom: 1 },
  }), [controller, setDirection])

  return (
    <MindMapSurface
      ref={surfaceRef}
      layout={layout}
      document={snapshot.document}
      theme={activeTheme} remoteImagePolicy={imagePolicy}
      className={className}
      ariaLabel={ariaLabel}
      toolbar={toolbar !== false && (typeof toolbar !== 'object' || toolbar.zoom !== false)}
      selectable={selectable}
      culling={culling}
      matchingNodeIds={filters.matchingIds}
      messages={messages}
      autoFit={autoFitPolicy ?? autoFit ?? 'initial'}
      selectedNodeId={snapshot.selectedNodeId}
      onNodeSelect={(nodeId) => {
        controller.selectNode(nodeId)
        onSelectedNodeChange?.(nodeId)
        onInteractionEvent?.({ type: 'nodeSelect', nodeId })
      }}
      onFoldToggle={toggleFold}
      fullscreen={typeof toolbar !== 'object' || toolbar.fullscreen !== false}
      onKeyDown={(event) => {
        if ((event.target as Element).closest('input, textarea, select, a, button, [role="button"]')) return
        const selected = controller.getSnapshot().selectedNodeId
        const node = selected ? layout.nodeById.get(selected) : null
        if (event.key === ' ' && selected) { event.preventDefault(); toggleFold(selected); return }
        if (event.shiftKey && event.code === 'Digit0') { event.preventDefault(); surfaceRef.current?.fitView(); return }
        if (event.shiftKey && ['KeyL', 'KeyR', 'KeyM'].includes(event.code)) { event.preventDefault(); setDirection(event.code === 'KeyL' ? 'left' : event.code === 'KeyR' ? 'right' : 'both'); return }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
        event.preventDefault()
        let next: string | null = selected ?? layout.nodes[0]?.id ?? null
        if (node) {
          const siblings = node.parentId ? layout.childrenByParent.get(node.parentId) ?? [] : snapshot.document.roots.map((root) => root.id)
          const index = siblings.indexOf(node.id)
          if (event.key === 'ArrowLeft') next = node.parentId ?? selected
          if (event.key === 'ArrowRight') next = layout.childrenByParent.get(node.id)?.[0] ?? selected
          if (event.key === 'ArrowUp') next = siblings[Math.max(0, index - 1)] ?? selected
          if (event.key === 'ArrowDown') next = siblings[Math.min(siblings.length - 1, index + 1)] ?? selected
        }
        controller.selectNode(next)
        onSelectedNodeChange?.(next)
        onInteractionEvent?.({ type: 'nodeSelect', nodeId: next })
      }}
      onViewportChange={(viewport) => {
        onViewportChange?.(viewport)
        onInteractionEvent?.({ type: 'viewportChange', viewport })
        if (viewport.zoom !== previousZoom.current) { previousZoom.current = viewport.zoom; onInteractionEvent?.({ type: 'zoomChange', zoom: viewport.zoom }) }
      }}
      onFullscreenChange={(fullscreen) => onInteractionEvent?.({ type: 'fullscreenChange', fullscreen })}
    />
  )
})
