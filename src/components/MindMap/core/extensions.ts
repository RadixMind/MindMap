import type { MindMapExtension } from './types'

export interface CompiledMindMapExtensions {
  list: readonly MindMapExtension[]
  ids: ReadonlySet<string>
  hash: string
}

const cache = new WeakMap<readonly MindMapExtension[], CompiledMindMapExtensions>()
const EMPTY_EXTENSIONS: readonly MindMapExtension[] = Object.freeze([])

export function compileExtensions(extensions: readonly MindMapExtension[] = EMPTY_EXTENSIONS): CompiledMindMapExtensions {
  const cached = cache.get(extensions)
  if (cached) return cached
  const unique = new Map<string, MindMapExtension>()
  for (const extension of extensions) unique.set(extension.id, extension)
  const list = Object.freeze([...unique.values()])
  const result: CompiledMindMapExtensions = {
    list,
    ids: new Set(list.map((extension) => extension.id)),
    hash: list.map((extension) => extension.id).join('|'),
  }
  cache.set(extensions, result)
  return result
}
