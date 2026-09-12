// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMindMapController } from '../core/controller'
import { MindMapEditor } from '../runtime/MindMapEditor'
import { downloadMindMapFile } from '../runtime/portable'
import { aiFeature } from './ai'
import { importFeature } from './import'
import { exportFeature } from './export'

vi.mock('../runtime/portable', async (original) => ({
  ...await original<typeof import('../runtime/portable')>(),
  downloadMindMapFile: vi.fn(),
}))

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

async function type(element: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  await act(async () => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function selectFiles(input: HTMLInputElement, files: File[]): Promise<void> {
  await act(async () => {
    Object.defineProperty(input, 'files', { configurable: true, value: files })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('feature controller ownership', () => {
  it('resets AI running state and aborts the previous run across A → B → A switches', async () => {
    const first = createMindMapController('First'), second = createMindMapController('Second')
    let complete!: (value: string) => void
    let signal!: AbortSignal
    const features = [aiFeature({ generate(input) { signal = input.signal; return new Promise<string>((resolve) => { complete = resolve }) } })]
    const render = (controller = first) => <MindMapEditor controller={controller} features={features} autoFit="never" />
    await act(async () => { root.render(render()) })
    await type(container.querySelector('.mm-ai-input-wrap input')!, 'Generate')
    await act(async () => { (container.querySelector('.mm-ai-submit') as HTMLButtonElement).click() })
    await act(async () => { root.render(render(second)) })
    expect(signal.aborted).toBe(true)
    await act(async () => { root.render(render(first)); complete('Late result') })
    expect(container.querySelector('.mm-ai-stop')).toBeNull()
    expect((container.querySelector('.mm-ai-input-wrap input') as HTMLInputElement).value).toBe('')
    expect(first.getSnapshot().document.roots[0].text).toBe('First')
    expect(second.getSnapshot().document.roots[0].text).toBe('Second')
  })

  it('discards stale file reads and resets attachment capacity and loading state on switch', async () => {
    const first = createMindMapController('First'), second = createMindMapController('Second')
    let finishRead!: (value: string) => void
    const oldFile = Object.assign(new File(['old'], 'old.txt', { type: 'text/plain' }), { text: () => new Promise<string>((resolve) => { finishRead = resolve }) })
    const newFile = Object.assign(new File(['new'], 'new.txt', { type: 'text/plain' }), { text: async () => 'new' })
    const features = [aiFeature({ generate: () => 'Generated', attachments: ['text'], maxAttachments: 1 })]
    const render = (controller = first) => <MindMapEditor controller={controller} features={features} autoFit="never" />
    await act(async () => { root.render(render()) })
    await selectFiles(container.querySelector('input[type="file"]')!, [oldFile])
    await act(async () => { root.render(render(second)) })
    expect((container.querySelector('input[type="file"] + button') as HTMLButtonElement).disabled).toBe(false)
    await selectFiles(container.querySelector('input[type="file"]')!, [newFile])
    await act(async () => { finishRead('late old text') })
    expect(container.querySelector('.mm-ai-attachments')?.textContent).toContain('new.txt')
    expect(container.querySelector('.mm-ai-attachments')?.textContent).not.toContain('old.txt')
    await act(async () => { root.render(render(first)) })
    expect(container.querySelector('.mm-ai-attachments')).toBeNull()
  })

  it('shows localized batch limits without starting readers', async () => {
    const text = vi.fn(async () => 'text')
    const files = ['one', 'two'].map((name) => Object.assign(new File(['text'], `${name}.txt`, { type: 'text/plain' }), { text }))
    await act(async () => { root.render(<MindMapEditor defaultMarkdown="Root" features={[aiFeature({ attachments: ['text'], maxAttachments: 1 })]} messages={{ aiTooManyAttachments: '数量上限' }} autoFit="never" />) })
    await selectFiles(container.querySelector('input[type="file"]')!, files)
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('数量上限')
    expect(text).not.toHaveBeenCalled()
  })

  it('closes and clears import drafts when their controller changes', async () => {
    const first = createMindMapController('First'), second = createMindMapController('Second')
    const features = [importFeature()]
    await act(async () => { root.render(<MindMapEditor controller={first} features={features} autoFit="never" />) })
    await act(async () => { (container.querySelector('.mm-feature-import > button') as HTMLButtonElement).click() })
    await type(document.body.querySelector('.mm-dialog textarea')!, 'Draft for first')
    await act(async () => { root.render(<MindMapEditor controller={second} features={features} autoFit="never" />) })
    expect(document.body.querySelector('.mm-dialog')).toBeNull()
    await act(async () => { (container.querySelector('.mm-feature-import > button') as HTMLButtonElement).click() })
    expect((document.body.querySelector('.mm-dialog textarea') as HTMLTextAreaElement).value).toBe('')
    expect(second.getSnapshot().document.roots[0].text).toBe('Second')
  })

  it('aborts resolver work and prevents an old export from downloading after a controller switch', async () => {
    const first = createMindMapController('![first](https://example.com/first.png)')
    const second = createMindMapController('Second')
    let finishResolve!: (value: string | null) => void
    let signal!: AbortSignal
    const features = [exportFeature({ imageResolver: (_url, value) => { signal = value!; return new Promise((resolve) => { finishResolve = resolve }) } })]
    const render = (controller = first) => <MindMapEditor controller={controller} features={features} locale="en-US" autoFit="never" />
    async function startExport() {
      await act(async () => { (container.querySelector('.mm-feature-export > button') as HTMLButtonElement).click() })
      await act(async () => { Array.from(container.querySelectorAll<HTMLButtonElement>('.mm-feature-menu button')).find((button) => button.textContent?.includes('SVG'))!.click() })
    }
    await act(async () => { root.render(render()) })
    await startExport()
    await act(async () => { root.render(render(second)) })
    expect(signal.aborted).toBe(true)
    await act(async () => { finishResolve(null) })
    expect(downloadMindMapFile).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')).toBeNull()
    await startExport()
    expect(downloadMindMapFile).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Second'), 'image/svg+xml;charset=utf-8', 'mindmap.svg')
  })
})
