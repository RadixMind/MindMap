// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PlaygroundIsland from '../../site/src/components/PlaygroundIsland'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function replaceInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('legacy Playground with the real v0.9 Editor', () => {
  it('synchronizes source edits into the SVG tree and visual edits back into Markdown', async () => {
    await act(async () => root.render(<PlaygroundIsland defaultMarkdown={'Initial root\n- Initial child'} />))
    const source = container.querySelector<HTMLTextAreaElement>('.legacy-markdown-editor')!

    await act(async () => replaceInputValue(source, 'Typed root\n- Typed parent\n  - Typed child'))
    expect(container.querySelector('[role="treeitem"][aria-label="Typed child"]')).not.toBeNull()

    const parentNode = container.querySelector<SVGGElement>('[role="treeitem"][aria-label="Typed parent"]')!
    const fold = parentNode.querySelector<SVGGElement>('.mm-fold-control')!
    await act(async () => fold.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    expect(source.value).toContain('+ Typed parent')
    expect(container.querySelector('[role="treeitem"][aria-label="Typed child"]')).toBeNull()
  })
})
