import { useState, type KeyboardEvent } from 'react'
import type { MindMapEditorFeature, MindMapEditorFeatureComponentProps } from '../runtime/editor-types'

// Stable private renderer: this library module exports a feature factory, not a refresh boundary.
// eslint-disable-next-line react-refresh/only-export-components
function SearchFeature({ context }: MindMapEditorFeatureComponentProps) {
  const query = context.searchQuery
  const setQuery = context.setSearchQuery
  const [index, setIndex] = useState(-1)
  const matches = context.searchMatchIds
  function focus(nextIndex: number): void {
    if (!matches.length) return
    const normalized = (nextIndex + matches.length) % matches.length
    setIndex(normalized)
    const id = matches[normalized]
    context.selectNode(id)
    context.focusNode(id)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      focus(index + (event.shiftKey ? -1 : 1))
    }
    if (event.key === 'Escape') setQuery('')
  }

  const activeMatch = index < 0 || index >= matches.length ? 0 : index + 1
  return (
    <div className="mm-feature mm-feature-search" role="search">
      <span aria-hidden="true">⌕</span>
      <input value={query} placeholder={context.messages.searchPlaceholder} aria-label={context.messages.search} onChange={(event) => { setQuery(event.target.value); setIndex(-1) }} onKeyDown={handleKeyDown} />
      <small aria-live="polite">{query ? `${activeMatch}/${matches.length}` : ''}</small>
      <button type="button" onClick={() => focus(index - 1)} disabled={!matches.length} aria-label={context.messages.searchPrevious}>‹</button>
      <button type="button" onClick={() => focus(index + 1)} disabled={!matches.length} aria-label={context.messages.searchNext}>›</button>
    </div>
  )
}

export function searchFeature(): MindMapEditorFeature {
  return { id: 'search', placement: 'toolbar', Component: SearchFeature }
}
