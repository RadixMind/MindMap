import type { MindMapRemoteImagePolicy } from '../core/url'
import type { RenderMindMapToSvgOptions } from '../core/svg'
import type {
  MindMapController,
  MindMapDirection,
  MindMapDocument,
  MindMapExtension,
  MindMapNode,
  MindMapThemeMode,
  MindMapThemeTokens,
} from '../core/types'
import { useOwnedController } from './useOwnedController'
import { useMindMapControllerSnapshot } from './useController'
import { useProjection } from './useProjection'
import { MindMapScene } from './MindMapScene'
import { initialRuntimeTheme, themeVariables, useRuntimeTheme } from './theme'

export interface StaticMindMapProps {
  remoteImagePolicy?: MindMapRemoteImagePolicy
  controller?: MindMapController
  document?: MindMapDocument
  data?: MindMapNode | MindMapNode[]
  markdown?: string
  direction?: MindMapDirection
  extensions?: readonly MindMapExtension[]
  theme?: MindMapThemeMode
  themeTokens?: Partial<MindMapThemeTokens>
  className?: string
  ariaLabel?: string
  padding?: number
  /** Trusted synchronous math renderer for SSR. Return sanitized MathML, never raw user HTML. */
  renderMath?: RenderMindMapToSvgOptions['renderMath']
}

export function StaticMindMap({
  controller: externalController,
  document,
  data,
  markdown,
  direction,
  extensions,
  theme,
  themeTokens,
  remoteImagePolicy,
  className = '',
  ariaLabel = 'Mind map',
  padding = 32,
  renderMath,
}: StaticMindMapProps) {
  const controller = useOwnedController({ controller: externalController, document, data, markdown, direction, extensions, theme: initialRuntimeTheme(theme, { document, markdown, controller: externalController }, themeTokens) })
  const imagePolicy = remoteImagePolicy ?? controller.getLayoutOptions().remoteImagePolicy ?? 'deny'
  const snapshot = useMindMapControllerSnapshot(controller)
  const activeTheme = useRuntimeTheme(theme ?? snapshot.document.theme, themeTokens)
  const layout = useProjection(controller, snapshot, { direction, extensions, theme: activeTheme, remoteImagePolicy: imagePolicy })
  const viewBox = `${layout.bounds.minX - padding} ${layout.bounds.minY - padding} ${Math.max(1, layout.bounds.width + padding * 2)} ${Math.max(1, layout.bounds.height + padding * 2)}`
  return (
    <div className={`mm-static ${className}`.trim()} style={themeVariables(activeTheme)}>
      <svg className="mm-static__svg" role="img" aria-label={ariaLabel} viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
        <MindMapScene layout={layout} theme={activeTheme} remoteImagePolicy={imagePolicy} renderMath={renderMath} />
      </svg>
    </div>
  )
}
