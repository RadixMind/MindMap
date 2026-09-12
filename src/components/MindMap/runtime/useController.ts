import { useSyncExternalStore } from 'react'
import type { MindMapController, MindMapControllerSnapshot } from '../core/types'

export function useMindMapControllerSnapshot(controller: MindMapController): MindMapControllerSnapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
}
