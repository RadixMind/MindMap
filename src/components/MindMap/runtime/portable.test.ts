import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareMindMapSvg, renderSvgToPng } from './portable'
import { latexExtension } from '../extensions/latex'

afterEach(() => vi.unstubAllGlobals())

describe('portable rendering', () => {
  it.each([[1_000_000, 1_000_000], [10_000_000, 10], [10, 10_000_000]])('bounds PNG canvas allocation for %s × %s images', async (width, height) => {
    class LoadedImage {
      naturalWidth = width
      naturalHeight = height
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) { queueMicrotask(() => this.onload?.()) }
    }
    const drawing = { drawImage: vi.fn() }
    const canvas = { width: 0, height: 0, getContext: () => drawing, toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['png'])) }
    vi.stubGlobal('Image', LoadedImage)
    vi.stubGlobal('document', { createElement: () => canvas })
    await renderSvgToPng('<svg />')
    expect(canvas.width).toBeGreaterThan(0)
    expect(canvas.height).toBeGreaterThan(0)
    expect(canvas.width).toBeLessThanOrEqual(8192)
    expect(canvas.height).toBeLessThanOrEqual(8192)
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(16_777_216)
    expect(drawing.drawImage).toHaveBeenCalledWith(expect.any(LoadedImage), 0, 0, canvas.width, canvas.height)
  })

  it.each([0, -1, Infinity, NaN])('rejects invalid PNG scale %s before allocating', async (scale) => {
    const createElement = vi.fn()
    vi.stubGlobal('document', { createElement })
    await expect(renderSvgToPng('<svg />', scale)).rejects.toThrow('positive finite')
    expect(createElement).not.toHaveBeenCalled()
  })

  it('never fetches remote image URLs by default', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const svg = await prepareMindMapSvg({ roots: [{ id: 'root', text: '![Example](https://images.example/photo.png)' }] })
    expect(svg).toContain('https://images.example/photo.png')
    expect(fetch).not.toHaveBeenCalled()
    expect(svg).not.toContain('<image ')
    expect(svg).toContain('Example')
    const allowed = await prepareMindMapSvg({ roots: [{ id: 'root', text: '![Example](https://images.example/photo.png)' }] }, { remoteImagePolicy: 'allow' })
    await expect(renderSvgToPng(allowed)).rejects.toThrow('imageResolver')
  })
  it('embeds main and multiline images only through the host resolver', async () => {
    const resolver = vi.fn(async () => 'data:image/png;base64,YQ==')
    const svg = await prepareMindMapSvg({ roots: [{ id: 'root', text: '![One](https://images.example/one.png)', attributes: { multiline: { lines: ['![Two](https://images.example/two.png)'] } } }] }, { imageResolver: resolver })
    expect(resolver).toHaveBeenCalledTimes(2)
    expect(svg.match(/<image /g)).toHaveLength(2)
    expect(svg).not.toContain('https://images.example')
  })
  it('rejects active image payloads returned by a host resolver', async () => {
    await expect(prepareMindMapSvg({ roots: [{ id: 'root', text: '![Image](https://images.example/one.png)' }] }, { imageResolver: async () => 'data:image/svg+xml;base64,PHN2Zz4=' })).rejects.toThrow('data URL')
  })
  it('loads optional KaTeX for MathML export', async () => {
    const svg = await prepareMindMapSvg({ roots: [{ id: 'root', text: '$x^2$' }] }, { extensions: [latexExtension()] })
    expect(svg).toContain('<math')
    expect(svg).toContain('<msup>')
  })
  it('limits resolver concurrency and stops launching work after abort', async () => {
    const abort = new AbortController()
    let active = 0, maximum = 0, started = 0
    const releases: Array<() => void> = []
    const promise = prepareMindMapSvg({ roots: Array.from({ length: 8 }, (_, index) => ({ id: String(index), text: `![Image](https://images.example/${index}.png)` })) }, { signal: abort.signal, imageResolver: async () => {
      started += 1
      active += 1
      maximum = Math.max(maximum, active)
      await new Promise<void>((resolve) => releases.push(resolve))
      active -= 1
      return 'data:image/png;base64,YQ=='
    } })
    expect(started).toBe(4)
    abort.abort()
    releases.forEach((release) => release())
    await expect(promise).rejects.toThrow()
    expect(maximum).toBe(4)
    expect(started).toBe(4)
  })
})
