// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const source = "import { MindMapViewer } from '@xiangfa/mindmap/viewer'\n\nconst markdown = `Roadmap\n- Research`\n"
let clipboardDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  vi.resetModules()
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  document.body.innerHTML = '<div data-docs-page><article class="docs-content"><div class="docs-code-block" data-language="typescript"><pre><code></code></pre></div></article></div>'
  document.querySelector('code')!.textContent = source
})

afterEach(() => {
  document.body.replaceChildren()
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  else Reflect.deleteProperty(navigator, 'clipboard')
  vi.restoreAllMocks()
})

async function loadAndCopy() {
  await import('../../site/src/scripts/docs')
  document.querySelector<HTMLButtonElement>('.docs-copy-button')!.click()
  await vi.waitFor(() => expect(document.querySelector('.docs-copy-status')?.textContent).not.toBe(''))
}

describe('documentation code copying', () => {
  it('copies the original source including whitespace without copying the toolbar', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await loadAndCopy()
    expect(writeText).toHaveBeenCalledExactlyOnceWith(source)
    expect(document.querySelector('code')!.textContent).toBe(source)
    expect(document.querySelector('.docs-code-language')!.textContent).toBe('TypeScript')
    expect(document.querySelector('[role="status"]')!.textContent).toBe('Code copied to clipboard.')
  })

  it('preserves the source and shows a manual fallback when clipboard permissions are denied', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Not allowed'))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await loadAndCopy()
    expect(document.querySelector('.docs-copy-status.is-error')!.textContent).toContain('Select the code')
    expect(document.querySelector('code')!.textContent).toBe(source)
    const button = document.querySelector<HTMLButtonElement>('button')!
    expect(button.disabled).toBe(false)
    writeText.mockResolvedValue(undefined)
    button.click()
    await vi.waitFor(() => expect(button.textContent).toBe('Copied'))
    expect(document.querySelector('.docs-copy-status.is-error')).toBeNull()
  })
})
