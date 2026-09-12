import { useState } from 'react'
import type { MindMapExtension } from '../core/types'

function sameExtensions(previous: readonly MindMapExtension[] | undefined, next: readonly MindMapExtension[] | undefined): boolean {
  if (!previous || !next) return previous === next
  if (previous.length !== next.length) return false
  return previous.every((extension, index) => {
    const before = extension as unknown as Record<string, unknown>
    const after = next[index] as unknown as Record<string, unknown>
    const keys = Object.keys(before)
    return keys.length === Object.keys(after).length && keys.every((key) => Object.hasOwn(after, key) && Object.is(before[key], after[key]))
  })
}

/** Preserve equivalent hook implementations; changed hooks or option identities invalidate. */
export function useStableExtensions(extensions: readonly MindMapExtension[] | undefined): readonly MindMapExtension[] | undefined {
  const [stable, setStable] = useState(() => ({ value: extensions, signature: extensions?.map((extension) => ({ ...extension })) }))
  if (!sameExtensions(stable.signature, extensions)) {
    setStable({ value: extensions, signature: extensions?.map((extension) => ({ ...extension })) })
  }
  return stable.value
}
