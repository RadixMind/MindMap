import { useState } from 'react'
import type { MindMapController } from '../core/types'

/** A new mounted feature session for every controller switch, including A → B → A. */
export function useControllerSession(controller: MindMapController): number {
  const [session, setSession] = useState({ controller, key: 0 })
  if (session.controller !== controller) {
    setSession({ controller, key: session.key + 1 })
  }
  return session.key
}
