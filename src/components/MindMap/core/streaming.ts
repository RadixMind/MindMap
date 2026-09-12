import { applyMindMapPatches, diffMindMapDocuments } from './patches'
import { createMindMapParser } from './parser'
import { freezeDocument, reconcileMindMapIds } from './utils'
import type { MindMapMarkdownStream, MindMapParseOptions, MindMapStreamUpdate } from './types'

export interface CreateMarkdownStreamOptions extends MindMapParseOptions {
  initialMarkdown?: string
  /** Return a cancellation function. The default batches once per browser frame. */
  schedule?: (callback: () => void) => () => void
  onError?: (error: unknown) => void
}

function scheduleFrame(callback: () => void): () => void {
  if (typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(callback)
    return () => cancelAnimationFrame(id)
  }
  const id = setTimeout(callback, 16)
  return () => clearTimeout(id)
}

export function createMarkdownStream(options: CreateMarkdownStreamOptions = {}): MindMapMarkdownStream {
  let markdown = options.initialMarkdown ?? ''
  let parser = createMindMapParser(options)
  parser.append(markdown)
  let document = parser.getDocument()
  let disposed = false
  let dirty = false
  let cancelScheduled: (() => void) | undefined
  let failure: { error: unknown } | null = null
  const listeners = new Set<(update: MindMapStreamUpdate) => void>()

  function commit(): MindMapStreamUpdate | null {
    cancelScheduled?.()
    cancelScheduled = undefined
    if (disposed || !dirty) return null
    const nextDocument = reconcileMindMapIds(document, parser.getDocument())
    const patches = diffMindMapDocuments(document, nextDocument)
    document = freezeDocument(applyMindMapPatches(document, patches))
    dirty = false
    patches.forEach(Object.freeze)
    Object.freeze(patches)
    const update = Object.freeze({ markdown, document, patches })
    listeners.forEach((listener) => listener(update))
    return update
  }

  function schedule(): void {
    dirty = true
    if (cancelScheduled || disposed) return
    cancelScheduled = (options.schedule ?? scheduleFrame)(() => {
      try { commit() } catch (error) { failure = { error }; options.onError?.(error) }
    })
  }

  return {
    append(chunk) { if (!disposed && chunk) { parser.append(chunk); markdown += chunk; schedule() } },
    replace(value) {
      if (!disposed && markdown !== value) {
        const replacement = createMindMapParser(options)
        replacement.append(value)
        parser = replacement
        markdown = value
        schedule()
      }
    },
    flush() {
      if (failure) return Promise.reject(failure.error)
      try { return Promise.resolve(commit()) } catch (error) {
        failure = { error }
        options.onError?.(error)
        return Promise.reject(error)
      }
    },
    getMarkdown: () => markdown,
    getDocument: () => document,
    subscribe(listener) {
      if (!disposed) listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose() {
      disposed = true
      cancelScheduled?.()
      cancelScheduled = undefined
      listeners.clear()
    },
  }
}
