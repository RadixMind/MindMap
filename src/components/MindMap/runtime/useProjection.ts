import { useMemo } from 'react'
import type { MindMapController, MindMapControllerSnapshot, MindMapLayoutOptions } from '../core/types'
import { useStableExtensions } from './useStableExtensions'

/** The controller owns projection caching; view options never modify shared state. */
export function useProjection(controller: MindMapController, snapshot: MindMapControllerSnapshot, { direction, extensions: suppliedExtensions, theme, foldOverrides, remoteImagePolicy }: MindMapLayoutOptions) {
  const extensions = useStableExtensions(suppliedExtensions)
  const document = snapshot.document
  const layout = snapshot.layout
  return useMemo(() => {
    // These references are the controller's projection invalidation keys. They
    // also keep equivalent React renders from re-entering the controller cache.
    void document
    void layout
    return controller.getLayout({
      remoteImagePolicy,
      ...(direction !== undefined ? { direction } : {}),
      ...(extensions !== undefined ? { extensions } : {}),
      ...(theme !== undefined ? { theme } : {}),
      ...(foldOverrides !== undefined ? { foldOverrides } : {}),
    })
  }, [controller, document, layout, direction, extensions, theme, foldOverrides, remoteImagePolicy])
}
