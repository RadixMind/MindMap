// @vitest-environment jsdom
import { act, createRef, StrictMode, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMindMapController } from '../core/controller'
import type { MindMapController } from '../core/types'
import { runMindMapGeneration } from '../features/ai-generation'
import { MindMapEditor, type MindMapEditorRef } from './MindMapEditor'
import { useOwnedController, type OwnedControllerOptions } from './useOwnedController'
import { MindMapViewer, type MindMapViewerRef } from './MindMapViewer'
import { StaticMindMap } from './StaticMindMap'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMindMapController as createController } from '../core/controller'
import { tagsExtension } from '../extensions/tags'
import { markdownEditorFeature } from '../features/markdown-editor'
import { aiFeature } from '../features/ai'
import { importFeature } from '../features/import'
import { exportFeature } from '../features/export'
import { historyFeature } from '../features/history'
import { searchFeature } from '../features/search'
import { latexExtension } from '../extensions/latex'
import { basicMindMapExtensions } from '../extensions'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function ControlledEditor({ editorRef }: { editorRef: React.RefObject<MindMapEditorRef | null> }) {
  const [markdown, setMarkdown] = useState('Original\n- Child')
  return <MindMapEditor ref={editorRef} markdown={markdown} onMarkdownChange={setMarkdown} autoFit="never" />
}

describe('React controller adapter', () => {
  it('preserves more than 64 out-of-order stream echoes through the last completed transaction', async () => {
    const ref = createRef<MindMapEditorRef>()
    const emitted: string[] = []
    const onMarkdownChange = (value: string) => emitted.push(value)
    const render = (markdown: string, revision = 0) => <MindMapEditor ref={ref} markdown={markdown} documentRevision={revision} onMarkdownChange={onMarkdownChange} autoFit="never" />
    await act(async () => { root.render(render('Original')) })
    const controller = ref.current!.getController()
    const stream = controller.createMarkdownStream()
    await act(async () => {
      for (let index = 0; index < 150; index += 1) {
        stream.replace(`Frame ${index}`)
        await stream.flush()
      }
    })
    for (const index of [0, 90, 1, 149, 30]) {
      await act(async () => { root.render(render(emitted[index])) })
      expect(stream.isActive()).toBe(true)
      expect(controller.getSnapshot().document.roots[0].text).toBe('Frame 149')
    }
    await act(async () => { await stream.commit() })
    await act(async () => { root.render(render(emitted[2])) })
    expect(controller.getSnapshot().document.roots[0].text).toBe('Frame 149')
    await act(async () => { root.render(render(emitted[0], 1)) })
    expect(controller.getSnapshot().document.roots[0].text).toBe('Frame 0')
    expect(controller.getSnapshot().canUndo).toBe(false)
  })

  it('lets distinct host updates replace a stream and expires echoes after a newer completed edit', async () => {
    const ref = createRef<MindMapEditorRef>()
    const render = (markdown: string) => <MindMapEditor ref={ref} markdown={markdown} autoFit="never" />
    await act(async () => { root.render(render('Original')) })
    const controller = ref.current!.getController()
    const stream = controller.createMarkdownStream()
    await act(async () => { stream.replace('Generated'); await stream.flush() })
    await act(async () => { root.render(render('Distinct host replacement')) })
    expect(stream.isActive()).toBe(false)
    expect(controller.getSnapshot().document.roots[0].text).toBe('Distinct host replacement')
    const id = controller.getSnapshot().document.roots[0].id
    await act(async () => { controller.updateNode(id, { text: 'Older edit' }); controller.updateNode(id, { text: 'Latest edit' }) })
    await act(async () => { root.render(render('Older edit')) })
    expect(controller.getSnapshot().document.roots[0].text).toBe('Older edit')
  })

  it('keeps inline equivalent built-in extensions from reparsing or reprojecting', async () => {
    const controller = createMindMapController('Root #tag', { extensions: basicMindMapExtensions() })
    const setMarkdown = vi.spyOn(controller, 'setMarkdown')
    const setDocument = vi.spyOn(controller, 'setDocument')
    const setLayoutOptions = vi.spyOn(controller, 'setLayoutOptions')
    const getLayout = vi.spyOn(controller, 'getLayout')
    const render = () => <MindMapEditor controller={controller} extensions={basicMindMapExtensions()} autoFit="never" />
    await act(async () => { root.render(render()) })
    setMarkdown.mockClear(); setLayoutOptions.mockClear(); getLayout.mockClear()
    await act(async () => { root.render(render()) })
    expect(setMarkdown).not.toHaveBeenCalled()
    expect(setLayoutOptions).not.toHaveBeenCalled()
    expect(getLayout).not.toHaveBeenCalled()
    const custom = { id: 'custom', transformNode: (node: { id: string; text: string }) => ({ ...node, text: 'Changed implementation' }) }
    await act(async () => { root.render(<MindMapEditor controller={controller} extensions={[custom]} autoFit="never" />) })
    expect(setDocument).not.toHaveBeenCalled()
    expect(controller.getSnapshot().document.roots[0].text).toBe('Root')
    const changed = { ...custom, transformNode: (node: { id: string; text: string }) => ({ ...node, text: 'New hook with the same ID' }) }
    await act(async () => { root.render(<MindMapEditor controller={controller} extensions={[changed]} autoFit="never" />) })
    expect(controller.getSnapshot().document.roots[0].text).toBe('Root')
  })

  it('emits one selection callback for an initial pointer click that also focuses the node', async () => {
    const onSelectedNodeChange = vi.fn()
    const onInteractionEvent = vi.fn()
    await act(async () => { root.render(<MindMapEditor defaultMarkdown="Root" onSelectedNodeChange={onSelectedNodeChange} onInteractionEvent={onInteractionEvent} autoFit="never" />) })
    const node = container.querySelector('[data-mm-node]')!
    await act(async () => { node.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(onSelectedNodeChange).toHaveBeenCalledExactlyOnceWith(node.getAttribute('data-mm-node'))
    expect(onInteractionEvent.mock.calls.filter(([event]) => event.type === 'nodeSelect')).toHaveLength(1)
  })

  it('preserves Document callbacks when a valid edit cannot be represented as Markdown', async () => {
    const ref = createRef<MindMapEditorRef>()
    const onEvent = vi.fn()
    const onDocumentChange = vi.fn()
    const onChange = vi.fn()
    const onMarkdownChange = vi.fn()
    await act(async () => {
      root.render(<MindMapEditor ref={ref} defaultMarkdown="Original" extensions={[tagsExtension()]} onEvent={onEvent} onDocumentChange={onDocumentChange} onChange={onChange} onMarkdownChange={onMarkdownChange} autoFit="never" />)
    })
    const controller = ref.current!.getController()
    const nodeId = controller.getSnapshot().document.roots[0].id
    await act(async () => { controller.updateNode(nodeId, { text: 'Literal #tag' }) })
    const document = controller.getSnapshot().document
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onDocumentChange).toHaveBeenCalledExactlyOnceWith(document)
    expect(onChange).toHaveBeenCalledExactlyOnceWith(document)
    expect(onMarkdownChange).not.toHaveBeenCalled()
    await act(async () => { controller.updateNode(nodeId, { text: 'Representable again' }) })
    expect(onMarkdownChange).toHaveBeenCalledExactlyOnceWith('Representable again')
    expect(onDocumentChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('passes preview, commit and rollback events through while document callbacks stay live', async () => {
    const ref = createRef<MindMapEditorRef>()
    const onEvent = vi.fn(), onMarkdownChange = vi.fn()
    await act(async () => { root.render(<MindMapEditor ref={ref} defaultMarkdown="Original" onEvent={onEvent} onMarkdownChange={onMarkdownChange} autoFit="never" />) })
    const controller = ref.current!.getController()
    await act(async () => {
      const transaction = controller.beginTransaction('markdown')
      transaction.setMarkdown('Committed')
      transaction.commit()
      const cancelled = controller.beginTransaction('markdown')
      cancelled.setMarkdown('Preview')
      cancelled.cancel()
    })
    expect(onEvent.mock.calls.map(([event]) => event.phase)).toEqual(['preview', 'commit', 'preview', 'rollback'])
    expect(onMarkdownChange.mock.calls.map(([markdown]) => markdown)).toEqual(['Committed', 'Preview', 'Committed'])
  })

  it('keeps built-in feature component identities stable and applies updated options', async () => {
    for (const factory of [aiFeature, importFeature, exportFeature, historyFeature, searchFeature, markdownEditorFeature]) {
      expect(factory().Component).toBe(factory().Component)
    }
    const ref = createRef<MindMapEditorRef>()
    await act(async () => { root.render(<MindMapEditor ref={ref} defaultMarkdown="Original" features={[markdownEditorFeature({ title: 'Before' })]} autoFit="never" />) })
    await act(async () => { (container.querySelector('.mm-feature-markdown button') as HTMLButtonElement).click() })
    const textarea = container.querySelector('textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'Draft')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    await act(async () => { root.render(<MindMapEditor ref={ref} defaultMarkdown="Original" features={[markdownEditorFeature({ title: 'After' })]} autoFit="never" />) })
    expect(container.querySelector('textarea')).toBe(textarea)
    expect(container.querySelector('aside')?.getAttribute('aria-label')).toBe('After')
    expect(ref.current!.getController().getSnapshot().document.roots[0].text).toBe('Draft')
    await act(async () => { textarea.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    await act(async () => { ref.current!.getController().undo() })
    expect(ref.current!.getController().getSnapshot().document.roots[0].text).toBe('Original')
  })

  it('keeps AI generation alive when a controlled host recreates its feature', async () => {
    let complete!: (value: string) => void
    let signal!: AbortSignal
    const generate = vi.fn((input: { signal: AbortSignal }) => { signal = input.signal; return new Promise<string>((resolve) => { complete = resolve }) })
    const ref = createRef<MindMapEditorRef>()
    const editor = () => <MindMapEditor ref={ref} defaultMarkdown="Original" features={[aiFeature({ generate })]} autoFit="never" />
    await act(async () => { root.render(editor()) })
    const prompt = container.querySelector('.mm-ai-input-wrap input') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(prompt, 'Generate')
      prompt.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { (container.querySelector('.mm-ai-submit') as HTMLButtonElement).click() })
    await act(async () => { root.render(editor()) })
    expect(signal.aborted).toBe(false)
    expect(container.querySelector('.mm-ai-input-wrap input')).toBe(prompt)
    expect(container.querySelector('.mm-ai-stop')).not.toBeNull()
    await act(async () => { complete('Generated') })
    expect(ref.current!.getController().getSnapshot().document.roots[0].text).toBe('Generated')
  })

  it('renders trusted synchronous math during Static SSR with readable failure fallback', () => {
    const renderMath = vi.fn((source: string, display?: boolean) => `<math display="${display ? 'block' : 'inline'}"><mi>${source}</mi></math>`)
    const markup = renderToStaticMarkup(<StaticMindMap markdown={'Root $x$\n- $$y$$'} extensions={[latexExtension()]} renderMath={renderMath} />)
    expect(markup).toContain('<math display="inline"><mi>x</mi></math>')
    expect(markup).toContain('<math display="block"><mi>y</mi></math>')
    const fallback = renderToStaticMarkup(<StaticMindMap markdown="Root $x$" extensions={[latexExtension()]} renderMath={() => { throw new Error('invalid') }} />)
    expect(fallback).toContain('$x$')
  })

  it('keeps the owned controller usable under Strict Mode and disposes on unmount', async () => {
    let controller!: MindMapController
    function Probe() {
      const value = useOwnedController({ defaultMarkdown: 'Root' })
      useEffect(() => { controller = value }, [value])
      return null
    }
    await act(async () => { root.render(<StrictMode><Probe /></StrictMode>) })
    const dispose = vi.spyOn(controller, 'dispose')
    controller.updateNode(controller.getSnapshot().document.roots[0].id, { text: 'Still active' })
    expect(controller.getSnapshot().document.roots[0].text).toBe('Still active')
    await act(async () => { root.render(null) })
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('never disposes supplied controllers and creates an owned controller when detached', async () => {
    const external = createMindMapController('External')
    const dispose = vi.spyOn(external, 'dispose')
    let active!: MindMapController
    function Probe(props: OwnedControllerOptions) {
      const value = useOwnedController(props)
      useEffect(() => { active = value }, [value])
      return null
    }
    await act(async () => { root.render(<Probe controller={external} />) })
    expect(active).toBe(external)
    await act(async () => { root.render(<Probe defaultMarkdown="Owned" />) })
    expect(active).not.toBe(external)
    expect(active.getSnapshot().document.roots[0].text).toBe('Owned')
    expect(dispose).not.toHaveBeenCalled()
    external.dispose()
  })

  it('keeps edit history when a controlled parent echoes Markdown', async () => {
    const ref = createRef<MindMapEditorRef>()
    await act(async () => { root.render(<ControlledEditor editorRef={ref} />) })
    const controller = ref.current!.getController()
    await act(async () => { controller.updateNode(controller.getSnapshot().document.roots[0].id, { text: 'Edited' }) })
    expect(controller.getSnapshot().canUndo).toBe(true)
    await act(async () => { controller.undo() })
    expect(controller.getSnapshot().document.roots[0].text).toBe('Original')
    expect(controller.getSnapshot().canUndo).toBe(false)
  })

  it('keeps a multi-frame AI transaction active through controlled Markdown echoes', async () => {
    const ref = createRef<MindMapEditorRef>()
    await act(async () => { root.render(<ControlledEditor editorRef={ref} />) })
    const controller = ref.current!.getController()
    let continueGeneration!: () => void
    const gate = new Promise<void>((resolve) => { continueGeneration = resolve })
    let result!: Promise<boolean>
    await act(async () => {
      result = runMindMapGeneration(controller, async function* () { yield 'Generated\n'; await gate; yield '- Tail' }, { prompt: 'map', markdown: ref.current!.getMarkdown(), document: controller.getSnapshot().document, signal: new AbortController().signal })
      await new Promise((resolve) => setTimeout(resolve, 25))
    })
    expect(controller.getSnapshot().document.roots[0].text).toBe('Generated')
    let committed = false
    await act(async () => { continueGeneration(); committed = await result })
    expect(committed).toBe(true)
    expect(controller.getSnapshot().document.roots[0].children?.[0].text).toBe('Tail')
    await act(async () => { controller.undo() })
    expect(controller.getSnapshot().document.roots[0].text).toBe('Original')
    expect(controller.getSnapshot().canUndo).toBe(false)
  })

  it('groups deletion of the last root and its replacement into one undo', async () => {
    const ref = createRef<MindMapEditorRef>()
    await act(async () => { root.render(<MindMapEditor ref={ref} markdown="Original" autoFit="never" />) })
    const controller = ref.current!.getController()
    const original = controller.getSnapshot().document.roots[0]
    await act(async () => { ref.current!.removeNode(original.id) })
    expect(controller.getSnapshot().document.roots[0].text).toBe('Root')
    await act(async () => { controller.undo() })
    expect(controller.getSnapshot().document.roots[0]).toEqual(original)
    expect(controller.getSnapshot().canUndo).toBe(false)
  })

  it('scopes undo to the editor receiving the keyboard event', async () => {
    const first = createMindMapController('First')
    const second = createMindMapController('Second')
    first.updateNode(first.getSnapshot().document.roots[0].id, { text: 'First edit' })
    second.updateNode(second.getSnapshot().document.roots[0].id, { text: 'Second edit' })
    await act(async () => { root.render(<><MindMapEditor controller={first} autoFit="never" /><MindMapEditor controller={second} autoFit="never" /></>) })
    await act(async () => { container.querySelector('svg')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })) })
    expect(first.getSnapshot().document.roots[0].text).toBe('First')
    expect(second.getSnapshot().document.roots[0].text).toBe('Second edit')
    first.dispose()
    second.dispose()
  })

  it('ignores a delayed parent echo from an earlier AI frame', async () => {
    const ref = createRef<MindMapEditorRef>()
    const values: string[] = []
    const onMarkdownChange = (value: string) => values.push(value)
    await act(async () => { root.render(<MindMapEditor ref={ref} markdown="Original" onMarkdownChange={onMarkdownChange} autoFit="never" />) })
    const controller = ref.current!.getController()
    const stream = controller.createMarkdownStream()
    await act(async () => { stream.replace('Frame A'); await stream.flush() })
    const firstEcho = values.at(-1)!
    await act(async () => { stream.replace('Frame B'); await stream.flush() })
    await act(async () => { root.render(<MindMapEditor ref={ref} markdown={firstEcho} onMarkdownChange={onMarkdownChange} autoFit="never" />) })
    expect(stream.isActive()).toBe(true)
    expect(controller.getSnapshot().document.roots[0].text).toBe('Frame B')
    await act(async () => { await stream.commit() })
    await act(async () => { controller.undo() })
    expect(controller.getSnapshot().document.roots[0].text).toBe('Original')
  })

  it('uses documentRevision to force an intentional reset to an earlier emitted value', async () => {
    const ref = createRef<MindMapEditorRef>()
    const render = (markdown: string, documentRevision: number) => <MindMapEditor ref={ref} markdown={markdown} documentRevision={documentRevision} autoFit="never" />
    await act(async () => { root.render(render('Original', 0)) })
    const controller = ref.current!.getController()
    const stream = controller.createMarkdownStream()
    await act(async () => { stream.replace('Updated'); await stream.flush() })
    await act(async () => { root.render(render('Updated', 1)) })
    expect(stream.isActive()).toBe(false)
    expect(controller.getSnapshot().document.roots[0].text).toBe('Updated')
    expect(controller.getSnapshot().canUndo).toBe(false)
  })

  it('keeps Viewer folding and direction changes out of document history', async () => {
    const controller = createMindMapController('Root\n- Child')
    const original = controller.getSnapshot().document
    const ref = createRef<MindMapViewerRef>()
    await act(async () => { root.render(<MindMapViewer ref={ref} controller={controller} autoFit="never" />) })
    const node = container.querySelector('[data-mm-node]')!
    await act(async () => { (node as HTMLElement).focus(); node.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })) })
    expect(container.querySelectorAll('[data-mm-node]')).toHaveLength(1)
    expect(controller.getSnapshot().layout.nodes).toHaveLength(2)
    await act(async () => { ref.current!.setDirection('left') })
    expect(controller.getSnapshot().document).toBe(original)
    expect(controller.getSnapshot().canUndo).toBe(false)
    controller.dispose()
  })

  it('does not trap Tab or editing keys in read-only mode', async () => {
    await act(async () => { root.render(<MindMapEditor markdown="Root" readOnly autoFit="never" />) })
    for (const key of ['Tab', 'Enter', 'Delete', 'Backspace']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      await act(async () => { container.querySelector('[data-mm-node]')!.dispatchEvent(event) })
      expect(event.defaultPrevented).toBe(false)
    }
  })

  it('owns wheel zoom with a non-passive listener so page scrolling cannot chain through the surface', async () => {
    const addEventListener = vi.spyOn(SVGSVGElement.prototype, 'addEventListener')
    await act(async () => { root.render(<MindMapViewer markdown="Root" autoFit="never" />) })

    const wheelRegistrations = addEventListener.mock.calls.filter(([type]) => type === 'wheel')
    expect(wheelRegistrations).toContainEqual([
      'wheel',
      expect.any(Function),
      expect.objectContaining({ passive: false }),
    ])

    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 40, clientY: 40, deltaY: 120 })
    await act(async () => { container.querySelector('svg')!.dispatchEvent(event) })
    expect(event.defaultPrevented).toBe(true)
  })

  it('moves down by one sibling and cancels editing before blur on Escape', async () => {
    const ref = createRef<MindMapEditorRef>()
    await act(async () => { root.render(<MindMapEditor ref={ref} markdown={'Root\n- A\n- B\n- C'} autoFit="never" />) })
    const controller = ref.current!.getController()
    const child = controller.getSnapshot().document.roots[0].children![0]
    await act(async () => { ref.current!.selectNode(child.id) })
    await act(async () => { container.querySelector('svg')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true })) })
    expect(controller.getSnapshot().document.roots[0].children!.map((node) => node.text)).toEqual(['B', 'A', 'C'])
    await act(async () => { ref.current!.startEditing(child.id) })
    const input = container.querySelector('.mm-editor-input') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Cancelled')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    expect(controller.getSnapshot().document.roots[0].children![1].text).toBe('A')
  })

  it('lays out Static SSR output using custom geometry tokens on the first render', () => {
    const themeTokens = { rootFontSize: 40, horizontalGap: 240, rootPaddingX: 70 }
    const expected = createController('Root\n- Child', { theme: themeTokens }).getSnapshot().layout
    const html = renderToStaticMarkup(<StaticMindMap markdown={'Root\n- Child'} themeTokens={themeTokens} padding={0} />)
    expect(html).toContain(`viewBox="${expected.bounds.minX} ${expected.bounds.minY} ${Math.max(1, expected.bounds.width)} ${Math.max(1, expected.bounds.height)}"`)
  })

  it('reparses controlled source when extensions are enabled and supports message overrides', async () => {
    const ref = createRef<MindMapEditorRef>()
    await act(async () => { root.render(<MindMapEditor ref={ref} markdown="Root #tag" locale="zh-CN" messages={{ editNode: '改写' }} autoFit="never" />) })
    expect(container.textContent).toContain('改写')
    await act(async () => { root.render(<MindMapEditor ref={ref} markdown="Root #tag" extensions={[tagsExtension()]} autoFit="never" />) })
    expect(ref.current!.getDocument().roots[0].attributes?.tags?.values).toEqual(['tag'])
  })

  it('isolates fold/theme projections between viewers sharing an external controller', async () => {
    const controller = createMindMapController('Root\n- Child')
    const baseLayout = controller.getSnapshot().layout
    const original = controller.getSnapshot().document
    await act(async () => { root.render(<><MindMapViewer className="first" controller={controller} themeTokens={{ rootFontSize: 42 }} autoFit="never" /><MindMapViewer className="second" controller={controller} autoFit="never" /></>) })
    const first = container.querySelector('.first')!
    const second = container.querySelector('.second')!
    expect(Number(first.querySelector('.mm-node-shape')!.getAttribute('width'))).toBeGreaterThan(Number(second.querySelector('.mm-node-shape')!.getAttribute('width')))
    await act(async () => { first.querySelector('.mm-fold-control')!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(first.querySelectorAll('[data-mm-node]')).toHaveLength(1)
    expect(second.querySelectorAll('[data-mm-node]')).toHaveLength(2)
    expect(controller.getSnapshot().layout).toBe(baseLayout)
    expect(controller.getSnapshot().document).toBe(original)
    controller.dispose()
  })

  it.each([false, true])('treats direction as controlled projection for external=%s', async (external) => {
    const controller = external ? createMindMapController('Root\n- Child') : undefined
    const ref = createRef<MindMapEditorRef>()
    const onDirectionChange = vi.fn()
    const render = (direction: 'left' | 'right') => <MindMapEditor ref={ref} controller={controller} markdown={external ? undefined : 'Root\n- Child'} direction={direction} onDirectionChange={onDirectionChange} locale="en-US" autoFit="never" />
    await act(async () => { root.render(render('left')) })
    const original = ref.current!.getDocument()
    const childX = () => Number(container.querySelectorAll('[data-mm-node]')[1].getAttribute('transform')!.match(/translate\(([-\d.]+)/)![1])
    expect(childX()).toBeLessThan(0)
    await act(async () => { ref.current!.setDirection('right') })
    expect(onDirectionChange).toHaveBeenCalledWith('right')
    expect(childX()).toBeLessThan(0)
    await act(async () => { root.render(render('right')) })
    expect(childX()).toBeGreaterThan(0)
    expect(ref.current!.getDocument()).toBe(original)
    expect(container.querySelectorAll('.mm-editor-direction button')[2].classList.contains('is-active')).toBe(true)
    controller?.dispose()
  })

  it('keeps the default Markdown panel behind its feature', async () => {
    await act(async () => { root.render(<MindMapEditor markdown="Root" locale="en-US" autoFit="never" />) })
    expect(container.querySelector('textarea')).toBeNull()
    expect(container.textContent).not.toContain('Text Mode')
    await act(async () => { root.render(<MindMapEditor markdown="Root" features={[markdownEditorFeature()]} locale="en-US" autoFit="never" />) })
    await act(async () => { (container.querySelector('.mm-feature-markdown button') as HTMLButtonElement).click() })
    expect(container.querySelector('textarea[aria-label="Markdown source"]')).not.toBeNull()
  })

  it('pastes system clipboard outlines transactionally and ignores stale async results', async () => {
    const ref = createRef<MindMapEditorRef>()
    const readText = vi.fn().mockResolvedValue('- Pasted\n  - Nested')
    vi.stubGlobal('navigator', { language: 'en-US', clipboard: { readText, writeText: vi.fn().mockResolvedValue(undefined) } })
    await act(async () => { root.render(<MindMapEditor ref={ref} markdown="Root" autoFit="never" />) })
    const controller = ref.current!.getController()
    await act(async () => { ref.current!.selectNode(controller.getSnapshot().document.roots[0].id) })
    await act(async () => { await ref.current!.executeCommand('paste') })
    expect(controller.getSnapshot().document.roots[0].children![0].children![0].text).toBe('Nested')
    await act(async () => { controller.undo() })
    expect(controller.getSnapshot().document.roots[0].children).toBeUndefined()
    let resolve!: (value: string) => void
    readText.mockImplementationOnce(() => new Promise<string>((done) => { resolve = done }))
    let paste!: Promise<boolean>
    await act(async () => { paste = ref.current!.executeCommand('paste'); controller.setMarkdown('Host replacement', 'external') })
    await act(async () => { resolve('Late paste'); await paste })
    expect(controller.getSnapshot().document.roots[0].text).toBe('Host replacement')
    expect(controller.getSnapshot().document.roots[0].children).toBeUndefined()
  })

  it('commits a Markdown typing session once and discards pending work after host reset', async () => {
    const ref = createRef<MindMapEditorRef>()
    const features = [markdownEditorFeature()]
    await act(async () => { root.render(<MindMapEditor ref={ref} markdown="Original" features={features} locale="en-US" autoFit="never" />) })
    await act(async () => { (container.querySelector('.mm-feature-markdown button') as HTMLButtonElement).click() })
    const textarea = container.querySelector('textarea')!
    const change = async (value: string) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, value)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    await change('Edit A')
    await change('Edit B')
    await act(async () => { textarea.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    const controller = ref.current!.getController()
    expect(controller.getSnapshot().document.roots[0].text).toBe('Edit B')
    await act(async () => { controller.undo() })
    expect(controller.getSnapshot().document.roots[0].text).toBe('Original')
    expect(controller.getSnapshot().canUndo).toBe(false)
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'Pending')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      controller.replaceDocument({ roots: [{ id: 'host', text: 'Host reset' }] })
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(controller.getSnapshot().document.roots[0].text).toBe('Host reset')
  })

  it('uses localized AI errors and import size diagnostics', async () => {
    const features = [aiFeature({ generate: () => { throw new Error('provider detail') } }), importFeature()]
    await act(async () => { root.render(<MindMapEditor markdown="Root" features={features} locale="zh-CN" messages={{ aiError: '生成出错', importTooLarge: '内容过长' }} autoFit="never" />) })
    const prompt = container.querySelector('.mm-ai-input-wrap input') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(prompt, '生成内容')
      prompt.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { (container.querySelector('.mm-ai-submit') as HTMLButtonElement).click() })
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('生成出错')
    await act(async () => { (container.querySelector('.mm-feature-import > button') as HTMLButtonElement).click() })
    const textarea = document.body.querySelector('.mm-dialog textarea') as HTMLTextAreaElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'x'.repeat(1_000_001))
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { (document.body.querySelector('.mm-dialog__footer .is-primary') as HTMLButtonElement).click() })
    expect(document.body.querySelector('.mm-dialog [role="alert"]')?.textContent).toBe('内容过长')
  })
  it('prefers newer system clipboard text and falls back to local subtree after denial', async () => {
    const ref = createRef<MindMapEditorRef>()
    const readText = vi.fn().mockResolvedValue('Newer system content')
    vi.stubGlobal('navigator', { language: 'en-US', clipboard: { readText, writeText: vi.fn().mockResolvedValue(undefined) } })
    await act(async () => { root.render(<MindMapEditor ref={ref} markdown="Local source" autoFit="never" />) })
    const controller = ref.current!.getController()
    await act(async () => { ref.current!.selectNode(controller.getSnapshot().document.roots[0].id); await ref.current!.executeCommand('copy') })
    await act(async () => { await ref.current!.executeCommand('paste') })
    expect(controller.getSnapshot().document.roots[0].children![0].text).toBe('Newer system content')
    await act(async () => { controller.undo() })
    readText.mockRejectedValueOnce(new Error('denied'))
    await act(async () => { await ref.current!.executeCommand('paste') })
    expect(controller.getSnapshot().document.roots[0].children![0].text).toBe('Local source')
  })
  it('exposes nonselectable viewers as an image instead of an empty ARIA tree', async () => {
    await act(async () => { root.render(<MindMapViewer markdown="Root" selectable={false} autoFit="never" />) })
    expect(container.querySelector('svg')!.getAttribute('role')).toBe('img')
    expect(container.querySelector('[role="treeitem"]')).toBeNull()
  })
  it('allows a normal click after a cancelled node drag', async () => {
    const ref = createRef<MindMapEditorRef>()
    await act(async () => { root.render(<MindMapEditor ref={ref} markdown={'Root\n- Child'} autoFit="never" />) })
    const svg = container.querySelector('svg')!
    svg.setPointerCapture = vi.fn()
    svg.hasPointerCapture = vi.fn(() => false)
    svg.releasePointerCapture = vi.fn()
    const nodes = container.querySelectorAll('[data-mm-node]')
    function pointer(target: Element, type: string, x: number) {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x })
      Object.defineProperty(event, 'pointerId', { value: 1 })
      target.dispatchEvent(event)
    }
    await act(async () => { pointer(nodes[1], 'pointerdown', 0); pointer(svg, 'pointermove', 20); pointer(svg, 'pointercancel', 20) })
    await act(async () => { pointer(nodes[0], 'pointerdown', 0); pointer(svg, 'pointerup', 0); nodes[0].dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(ref.current!.getController().getSnapshot().selectedNodeId).toBe(nodes[0].getAttribute('data-mm-node'))
    expect(ref.current!.getController().getSnapshot().canUndo).toBe(false)
  })
})
