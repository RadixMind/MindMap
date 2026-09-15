// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PlaygroundIsland from '../../site/src/components/PlaygroundIsland'
import { streamRemoteMindMap } from '../../site/src/components/remoteMindMapStream'

vi.mock('@xiangfa/mindmap/editor', async () => {
  const React = await import('react')
  const MindMapEditor = React.forwardRef(function MockMindMapEditor(
    props: { markdown: string; onMarkdownChange?(markdown: string): void },
    ref: React.ForwardedRef<{ getController(): object }>,
  ) {
    React.useImperativeHandle(ref, () => ({ getController: () => ({}) }))
    return <button type="button" data-mock-editor onClick={() => props.onMarkdownChange?.('Visual edit\n- Synced')}>{props.markdown}</button>
  })
  return { MindMapEditor }
})

vi.mock('@xiangfa/mindmap/extensions', () => ({
  basicMindMapExtensions: () => [{ id: 'tags' }, { id: 'folding' }, { id: 'multiline' }, { id: 'dotted-line' }],
  crossLinkExtension: () => ({ id: 'cross-link' }),
  frontmatterExtension: () => ({ id: 'frontmatter' }),
  latexExtension: () => ({ id: 'latex' }),
}))
vi.mock('@xiangfa/mindmap/features/history', () => ({ historyFeature: () => ({ id: 'history' }) }))
vi.mock('@xiangfa/mindmap/features/search', () => ({ searchFeature: () => ({ id: 'search' }) }))
vi.mock('@xiangfa/mindmap/features/import', () => ({ importFeature: () => ({ id: 'import' }) }))
vi.mock('@xiangfa/mindmap/features/export', () => ({ exportFeature: () => ({ id: 'export' }) }))
vi.mock('../../site/src/components/remoteMindMapStream', () => ({ streamRemoteMindMap: vi.fn() }))

let container: HTMLDivElement
let root: Root
let mounted: boolean

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  mounted = true
  vi.mocked(streamRemoteMindMap).mockReset()
})

afterEach(async () => {
  if (mounted) await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('shared legacy playground island', () => {
  it('synchronizes Markdown edits in both directions', async () => {
    await act(async () => root.render(<PlaygroundIsland defaultMarkdown="Initial\n- Node" />))
    const textarea = container.querySelector<HTMLTextAreaElement>('.legacy-markdown-editor')!
    const editor = container.querySelector<HTMLButtonElement>('[data-mock-editor]')!

    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    valueSetter?.call(textarea, 'Typed source\n- Child')
    await act(async () => textarea.dispatchEvent(new Event('input', { bubbles: true })))
    expect(editor.textContent).toBe('Typed source\n- Child')

    await act(async () => editor.click())
    expect(textarea.value).toBe('Visual edit\n- Synced')
  })

  it('uses one component for embedded and full-screen modes', async () => {
    await act(async () => root.render(<PlaygroundIsland />))
    expect(container.querySelector('.legacy-playground')?.getAttribute('data-fullscreen')).toBe('false')
    expect(container.querySelector('.legacy-playground__grid')?.classList.contains('lg:min-h-[720px]')).toBe(true)
    expect(container.querySelector('.legacy-editor-panel')).not.toBeNull()
    expect(container.querySelector('.legacy-map-panel')).not.toBeNull()

    await act(async () => root.render(<PlaygroundIsland fullscreen />))
    expect(container.querySelector('.legacy-playground')?.getAttribute('data-fullscreen')).toBe('true')
    expect(container.querySelector('.legacy-playground--fullscreen')).not.toBeNull()
  })

  it('aborts an active remote stream when the island unmounts', async () => {
    let requestSignal: AbortSignal | undefined
    vi.mocked(streamRemoteMindMap).mockImplementation((_controller, _prompt, signal) => {
      requestSignal = signal
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    })
    await act(async () => root.render(<PlaygroundIsland />))

    const input = container.querySelector<HTMLInputElement>('[aria-label="AI mind map prompt"]')!
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    valueSetter?.call(input, 'Release checklist')
    await act(async () => input.dispatchEvent(new Event('input', { bubbles: true })))
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Generate mind map"]')!.click())

    expect(streamRemoteMindMap).toHaveBeenCalledOnce()
    expect(requestSignal?.aborted).toBe(false)
    await act(async () => root.unmount())
    mounted = false
    expect(requestSignal?.aborted).toBe(true)
  })
})
