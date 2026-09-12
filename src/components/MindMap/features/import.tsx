import { useControllerSession } from '../runtime/useControllerSession'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { themeVariables } from '../runtime/theme'
import { normalizeDocument } from '../core/utils'
import type { MindMapDocument, MindMapNode } from '../core/types'
import type { MindMapEditorFeature, MindMapEditorFeatureComponentProps } from '../runtime/editor-types'

// Stable private renderer: this library module exports a feature factory, not a refresh boundary.
// eslint-disable-next-line react-refresh/only-export-components
function ImportFeatureSession({ context }: MindMapEditorFeatureComponentProps) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<'markdown' | 'json'>('markdown')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector('textarea')?.focus()
    return () => previous?.focus()
  }, [open])
  function submit(): void {
    if (value.length > 1_000_000) {
      setError(context.messages.importTooLarge)
      return
    }
    try {
      if (format === 'markdown') context.setMarkdown(value)
      else {
        const parsed = JSON.parse(value) as MindMapDocument | MindMapNode | MindMapNode[]
        context.controller.setDocument(normalizeDocument(parsed), 'edit')
      }
      context.emitEvent({ type: 'import', source: format, document: context.controller.getSnapshot().document })
      setError('')
      setOpen(false)
      setValue('')
    } catch (cause) {
      setError(cause instanceof SyntaxError ? context.messages.importInvalidJSON : context.messages.importInvalidData)
    }
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
    if (event.key !== 'Tab') return
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, input, select, [tabindex="0"]'))
    const first = controls[0]
    const last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return <div className="mm-feature mm-feature-import">
    <button type="button" onClick={() => setOpen(true)}>{context.messages.import}</button>
    {open && createPortal(<div className="mm-dialog-backdrop" style={themeVariables(context.theme)} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <div ref={dialogRef} className="mm-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={handleDialogKeyDown}>
        <div className="mm-dialog__header"><div><h2 id={titleId}>{context.messages.import}</h2></div><button type="button" onClick={() => setOpen(false)} aria-label={context.messages.close}>×</button></div>
        <div className="mm-dialog__tabs" role="tablist"><button type="button" className={format === 'markdown' ? 'is-active' : ''} onClick={() => setFormat('markdown')}>Markdown</button><button type="button" className={format === 'json' ? 'is-active' : ''} onClick={() => setFormat('json')}>JSON</button></div>
        <textarea aria-label={context.messages.importContent} value={value} onChange={(event) => setValue(event.target.value)} placeholder={context.messages.importPlaceholder} aria-invalid={Boolean(error)} />
        {error && <p className="mm-dialog__error" role="alert">{error}</p>}
        <div className="mm-dialog__footer"><button type="button" onClick={() => setOpen(false)}>{context.messages.cancel}</button><button type="button" className="is-primary" onClick={submit} disabled={!value.trim()}>{context.messages.importConfirm}</button></div>
      </div>
    </div>, document.body)}
  </div>
}

// eslint-disable-next-line react-refresh/only-export-components
function ImportFeature(props: MindMapEditorFeatureComponentProps) {
  const session = useControllerSession(props.context.controller)
  return <ImportFeatureSession key={session} {...props} />
}

export function importFeature(): MindMapEditorFeature {
  return { id: 'import', placement: 'toolbar', Component: ImportFeature }
}
