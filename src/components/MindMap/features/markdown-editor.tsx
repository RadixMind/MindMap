import { useEffect, useRef, useState } from 'react'
import { serializeMindMap } from '../core/serializer'
import type { MindMapTransaction } from '../core/types'
import type { MindMapEditorFeature, MindMapEditorFeatureComponentProps } from '../runtime/editor-types'

export interface MarkdownEditorFeatureOptions { title?: string }

// Stable private renderer: this library module exports a feature factory, not a refresh boundary.
// eslint-disable-next-line react-refresh/only-export-components
function MarkdownEditorFeature({ context, options: featureOptions }: MindMapEditorFeatureComponentProps) {
  const options = (featureOptions ?? {}) as MarkdownEditorFeatureOptions
  const title = options.title ?? context.messages.source
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState({ canonical: context.markdown, draft: context.markdown })
  const [error, setError] = useState('')
  const transaction = useRef<MindMapTransaction | null>(null)
  const pendingDraft = useRef('')
  const frame = useRef<number | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  if (source.canonical !== context.markdown) setSource({ canonical: context.markdown, draft: context.markdown })
  useEffect(() => () => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    if (timer.current !== undefined) clearTimeout(timer.current)
    transaction.current?.cancel()
    transaction.current = null
    frame.current = undefined
    timer.current = undefined
  }, [context.controller])

  function flush(): boolean {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    frame.current = undefined
    if (!transaction.current?.isActive()) return false
    try {
      transaction.current.setMarkdown(pendingDraft.current)
      setSource({ canonical: serializeMindMap(context.controller.getSnapshot().document, { extensions: context.extensions }), draft: pendingDraft.current })
      setError('')
      return true
    } catch {
      transaction.current.cancel()
      setError(context.messages.importInvalidData)
      return false
    }
  }
  function finish() {
    if (timer.current !== undefined) clearTimeout(timer.current)
    timer.current = undefined
    if (flush()) transaction.current?.commit()
    transaction.current = null
  }
  function change(value: string) {
    if (!transaction.current?.isActive()) transaction.current = context.controller.beginTransaction('markdown')
    pendingDraft.current = value
    setSource({ canonical: context.markdown, draft: value })
    if (frame.current === undefined) frame.current = requestAnimationFrame(flush)
    if (timer.current !== undefined) clearTimeout(timer.current)
    timer.current = setTimeout(finish, 600)
  }
  function close(): void {
    finish()
    setOpen(false)
  }

  function toggle(): void {
    if (open) close()
    else setOpen(true)
  }

  return <div className="mm-feature mm-feature-markdown">
    <button type="button" onClick={toggle} aria-expanded={open}>{context.messages.source}</button>
    {open && <aside className="mm-markdown-panel" aria-label={title} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
      <div className="mm-markdown-panel__header"><strong>{title}</strong><button type="button" onClick={close} aria-label={context.messages.close}>×</button></div>
      <textarea aria-label={context.messages.source} value={source.draft} spellCheck={false} onChange={(event) => change(event.target.value)} onBlur={finish} />
      {error && <p role="alert">{error}</p>}
    </aside>}
  </div>
}

export function markdownEditorFeature(options: MarkdownEditorFeatureOptions = {}): MindMapEditorFeature {
  return { id: 'markdown-editor', placement: 'toolbar', Component: MarkdownEditorFeature, options }
}
