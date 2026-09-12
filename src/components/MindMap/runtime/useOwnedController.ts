import { useEffect, useRef, useState } from 'react'
import { createMindMapController } from '../core/controller'
import { serializeMindMap } from '../core/serializer'
import { parseMindMap } from '../core/parser'
import { useStableExtensions } from './useStableExtensions'
import type { MindMapController, MindMapDirection, MindMapDocument, MindMapExtension, MindMapNode, MindMapThemeTokens } from '../core/types'

export interface OwnedControllerOptions {
  /** External ownership excludes document, data, markdown, defaultMarkdown and documentRevision. */
  controller?: MindMapController
  document?: MindMapDocument
  data?: MindMapNode | MindMapNode[]
  markdown?: string
  defaultMarkdown?: string
  direction?: MindMapDirection
  defaultDirection?: MindMapDirection
  extensions?: readonly MindMapExtension[]
  theme?: Partial<MindMapThemeTokens>
  /** Change this when intentionally replacing content with an earlier emitted value.
   * Echo recognition covers the active transaction and the most recently completed
   * edit/transaction, in any arrival order. Older echoes require host sequencing. */
  documentRevision?: string | number
}

/** Compact, non-cryptographic identity for echo recognition; never retains source frames. */
function markdownFingerprint(markdown: string): string {
  let a = 1779033703, b = 3144134277, c = 1013904242, d = 2773480762
  for (let index = 0; index < markdown.length; index += 1) {
    const code = markdown.charCodeAt(index)
    a = b ^ Math.imul(a ^ code, 597399067)
    b = c ^ Math.imul(b ^ code, 2869860233)
    c = d ^ Math.imul(c ^ code, 951274213)
    d = a ^ Math.imul(d ^ code, 2716044179)
  }
  a = Math.imul(c ^ (a >>> 18), 597399067)
  b = Math.imul(d ^ (b >>> 22), 2869860233)
  c = Math.imul(a ^ (c >>> 17), 951274213)
  d = Math.imul(b ^ (d >>> 19), 2716044179)
  return `${markdown.length}:${a >>> 0}:${b >>> 0}:${c >>> 0}:${d >>> 0}`
}

function createOwnedController(options: OwnedControllerOptions): MindMapController {
  const input = options.document ?? options.data ?? parseMindMap(options.markdown ?? options.defaultMarkdown ?? 'Root', { extensions: options.extensions })
  const documentDirection = !Array.isArray(input) && 'roots' in input ? input.direction : undefined
  return createMindMapController(input, { ...options, direction: documentDirection ?? options.defaultDirection })
}

export function useOwnedController(suppliedOptions: OwnedControllerOptions): MindMapController {
  if (suppliedOptions.controller) {
    const conflicting = (['document', 'data', 'markdown', 'defaultMarkdown', 'documentRevision'] as const).filter((key) => suppliedOptions[key] !== undefined)
    if (conflicting.length) throw new Error(`Mind map controller is mutually exclusive with content props: ${conflicting.join(', ')}`)
  }
  const extensions = useStableExtensions(suppliedOptions.extensions)
  const options = { ...suppliedOptions, extensions }
  const [resource, setResource] = useState(() => ({ external: options.controller, controller: options.controller ?? createOwnedController(options) }))
  if (resource.external !== options.controller) {
    setResource({ external: options.controller, controller: options.controller ?? createOwnedController(options) })
  }
  const controller = resource.controller
  const leases = useRef(new Map<MindMapController, number>())
  const previous = useRef({ controller, document: options.document, data: options.data, markdown: options.markdown, extensions: options.extensions, revision: options.documentRevision })
  const echoes = useRef<{
    controller: MindMapController
    revision: OwnedControllerOptions['documentRevision']
    active?: Set<string>
    completed: Set<string>
    documents: WeakSet<object>
  }>({ controller, revision: options.documentRevision, completed: new Set(), documents: new WeakSet() })
  const priorLayoutOptions = useRef({ controller, extensions: options.extensions })
  useEffect(() => {
    if (resource.external) return
    const counts = leases.current
    counts.set(controller, (counts.get(controller) ?? 0) + 1)
    return () => {
      counts.set(controller, (counts.get(controller) ?? 1) - 1)
      // Strict Mode replays setup before this microtask; only the final owner disposes.
      queueMicrotask(() => {
        if (counts.get(controller) !== 0) return
        controller.dispose()
        counts.delete(controller)
      })
    }
  }, [controller, resource.external])
  useEffect(() => {
    const prior = priorLayoutOptions.current
    if (!resource.external) controller.setLayoutOptions({
      ...(options.extensions !== undefined || (prior.controller === controller && prior.extensions !== undefined) ? { extensions: options.extensions } : {}),
    })
    priorLayoutOptions.current = { controller, extensions: options.extensions }
  }, [controller, options.extensions, resource.external])
  useEffect(() => {
    if (echoes.current.controller !== controller || echoes.current.revision !== options.documentRevision) {
      echoes.current = { controller, revision: options.documentRevision, completed: new Set(), documents: new WeakSet() }
    }
    const generation = echoes.current
    return controller.subscribeEvents((event) => {
      if (echoes.current !== generation) return
      const changed = event.previous.document !== event.current.document
      if (event.reason === 'external') {
        if (changed) {
          generation.active = undefined
          generation.completed = new Set()
        }
        return
      }
      if (!changed && event.phase !== 'commit' && event.phase !== 'rollback') return
      if (event.phase === 'preview') generation.active ??= new Set()
      const fingerprints = generation.active ?? new Set<string>()
      if (changed) {
        generation.documents.add(event.current.document)
        generation.documents.add(event.current.document.roots)
        try {
          const markdown = serializeMindMap(event.current.document, { extensions: options.extensions ?? controller.getLayoutOptions().extensions })
          fingerprints.add(markdownFingerprint(markdown))
        } catch {
          // Non-Markdown-representable Documents can still use `document` or `data`.
        }
      }
      if (event.phase === 'commit' || event.phase === 'rollback') {
        generation.completed = fingerprints
        generation.active = undefined
      }
    })
  }, [controller, options.extensions, options.documentRevision])
  useEffect(() => {
    const before = previous.current
    const switched = before.controller !== controller
    const reset = switched || before.revision !== options.documentRevision
    const forced = before.revision !== options.documentRevision
    const extensionChange = before.extensions !== options.extensions
    if (options.document !== undefined) {
      if (forced) controller.replaceDocument(options.document)
      else if ((reset || options.document !== before.document) && (reset || !echoes.current.documents.has(options.document)) && options.document !== controller.getSnapshot().document) controller.setDocument(options.document, 'external')
    } else if (options.data !== undefined) {
      if (forced) controller.replaceDocument({ roots: Array.isArray(options.data) ? options.data : [options.data] })
      else if ((reset || before.document !== undefined || options.data !== before.data) && (reset || !echoes.current.documents.has(options.data))) controller.setDocument({ roots: Array.isArray(options.data) ? options.data : [options.data] }, 'external')
    } else if (options.markdown !== undefined && (reset || extensionChange || before.document !== undefined || before.data !== undefined || options.markdown !== before.markdown)) {
      if (forced) controller.replaceDocument(parseMindMap(options.markdown, { extensions: options.extensions }))
      else if (reset || extensionChange || (!echoes.current.active?.has(markdownFingerprint(options.markdown)) && !echoes.current.completed.has(markdownFingerprint(options.markdown)))) {
        let currentMarkdown: string | undefined
        try {
          currentMarkdown = serializeMindMap(controller.getSnapshot().document, { extensions: options.extensions ?? controller.getLayoutOptions().extensions })
        } catch {
          // A distinct host Markdown update can replace a JSON-only Document.
        }
        if (extensionChange || options.markdown !== currentMarkdown) {
          controller.setMarkdown(options.markdown, 'external')
        }
      }
    }
    previous.current = { controller, document: options.document, data: options.data, markdown: options.markdown, extensions: options.extensions, revision: options.documentRevision }
  }, [controller, options.document, options.data, options.markdown, options.extensions, options.documentRevision, resource.external])
  return controller
}
