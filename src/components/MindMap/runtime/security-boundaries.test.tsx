import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMindMapController, layoutMindMap, MAX_MINDMAP_IMAGES, renderMindMapToSvg } from '../core'
import type { MindMapDocument, MindMapNode } from '../core'
import { StaticMindMap } from './StaticMindMap'
import { MindMapViewer } from './MindMapViewer'
import { MindMapEditor } from './MindMapEditor'
import { InlineContent } from './InlineContent'
import { exportMindMapOutline, MAX_MINDMAP_IMAGE_RESOLVER_CALLS, MAX_MINDMAP_SVG_SOURCE_LENGTH, prepareMindMapSvg, renderSvgToPng } from './portable'

const url = 'https://images.example/asset.png'
const imageDocument: MindMapDocument = { roots: [{ id: 'root', text: `![Private image](${url})` }] }
const raster = 'data:image/png;base64,YQ=='
afterEach(() => vi.unstubAllGlobals())

describe('explicit remote image authorization', () => {
  it('defaults to alt text without remote hrefs in portable and all React surfaces', () => {
    const output = [renderMindMapToSvg(imageDocument), ...[StaticMindMap, MindMapViewer, MindMapEditor].map((Surface) => renderToStaticMarkup(<Surface document={imageDocument} />))]
    for (const markup of output) {
      expect(markup).not.toMatch(/(?:href|src)="https:/)
      expect(markup).not.toContain('<image ')
      expect(markup).toContain('Private image')
    }
    expect(layoutMindMap(imageDocument).nodes[0].height).toBeLessThan(layoutMindMap(imageDocument, { remoteImagePolicy: 'allow' }).nodes[0].height)
  })

  it('applies predicates consistently to projection, SVG, DOM and data URLs', () => {
    const remoteImagePolicy = (value: string) => value === url
    expect(renderMindMapToSvg(imageDocument, { remoteImagePolicy })).toContain(`href="${url}"`)
    for (const Surface of [StaticMindMap, MindMapViewer, MindMapEditor]) {
      expect(renderToStaticMarkup(<Surface document={imageDocument} remoteImagePolicy={remoteImagePolicy} />)).toContain(`href="${url}"`)
      expect(renderToStaticMarkup(<Surface document={imageDocument} remoteImagePolicy={() => false} />)).not.toContain('<image ')
    }
    const html = renderToStaticMarkup(<InlineContent text={imageDocument.roots[0].text} remoteImagePolicy="allow" />)
    expect(html).toContain('crossorigin="anonymous"')
    expect(html).toContain('referrerPolicy="no-referrer"')
    expect(renderToStaticMarkup(<InlineContent text={imageDocument.roots[0].text} />)).not.toContain('<img')
    expect(renderMindMapToSvg({ roots: [{ id: 'root', text: `![Embedded](${raster})` }] })).toContain(`href="${raster}"`)
    expect(renderMindMapToSvg(imageDocument, { remoteImagePolicy: () => { throw new Error('Denied') } })).not.toContain('<image ')
  })

  it('inherits explicit controller authorization and allows a surface to deny it', () => {
    const controller = createMindMapController(imageDocument, { remoteImagePolicy: 'allow' })
    for (const Surface of [StaticMindMap, MindMapViewer, MindMapEditor]) {
      expect(renderToStaticMarkup(<Surface controller={controller} />)).toContain(`href="${url}"`)
      expect(renderToStaticMarkup(<Surface controller={controller} remoteImagePolicy="deny" />)).not.toContain('<image ')
    }
  })

  it('validates before resolver side effects and bounds every resolver call', async () => {
    const resolver = vi.fn(async () => raster)
    await expect(prepareMindMapSvg({ roots: [...imageDocument.roots, ...imageDocument.roots] }, { imageResolver: resolver })).rejects.toThrow(/Duplicate/)
    expect(resolver).not.toHaveBeenCalled()
    const sources = (length: number) => ({ roots: Array.from({ length }, (_, index) => ({ id: String(index), text: `![x](https://images.example/${index}.png)` })) })
    await expect(prepareMindMapSvg(sources(MAX_MINDMAP_IMAGES + 1), { imageResolver: resolver })).rejects.toThrow(/image limit/)
    expect(resolver).not.toHaveBeenCalled()
    await prepareMindMapSvg(sources(MAX_MINDMAP_IMAGE_RESOLVER_CALLS), { imageResolver: resolver })
    expect(resolver).toHaveBeenCalledTimes(MAX_MINDMAP_IMAGE_RESOLVER_CALLS)
  })

  it('embeds explicitly resolved images, with unresolved URLs subject to the surface policy', async () => {
    expect(await prepareMindMapSvg(imageDocument, { imageResolver: async () => raster })).toContain(`href="${raster}"`)
    expect(await prepareMindMapSvg(imageDocument, { imageResolver: async () => null })).not.toContain('<image ')
    expect(await prepareMindMapSvg(imageDocument, { imageResolver: async () => null, remoteImagePolicy: 'allow' })).toContain(`href="${url}"`)
  })
})

describe('portable preflight', () => {
  it('rejects cyclic outline and SVG inputs before callbacks or recursive traversal', async () => {
    const node: MindMapNode = { id: 'r', text: 'Root' }
    node.children = [node]
    const resolver = vi.fn(async () => raster)
    const input = { roots: [node] }
    expect(() => exportMindMapOutline(input)).toThrow(/Duplicate/)
    await expect(prepareMindMapSvg(input, { imageResolver: resolver })).rejects.toThrow(/Duplicate/)
    expect(resolver).not.toHaveBeenCalled()
  })

  it('rejects oversized raw SVG before encoding or Image construction', async () => {
    const Image = vi.fn()
    const encode = vi.fn()
    vi.stubGlobal('Image', Image)
    vi.stubGlobal('encodeURIComponent', encode)
    await expect(renderSvgToPng('x'.repeat(MAX_MINDMAP_SVG_SOURCE_LENGTH + 1))).rejects.toThrow(/source length/)
    expect(Image).not.toHaveBeenCalled()
    expect(encode).not.toHaveBeenCalled()
  })
})

describe('external controller content ownership', () => {
  it('rejects conflicting content synchronously during SSR across surfaces', () => {
    const controller = createMindMapController('SECRET')
    const inputs = [{ document: { roots: [{ id: 'public', text: 'PUBLIC' }] } }, { data: [{ id: 'public', text: 'PUBLIC' }] }, { markdown: 'PUBLIC' }]
    for (const Surface of [StaticMindMap, MindMapViewer, MindMapEditor]) {
      for (const content of inputs) expect(() => renderToStaticMarkup(<Surface controller={controller} {...content} />)).toThrow(/mutually exclusive/)
    }
    expect(() => renderToStaticMarkup(<MindMapEditor controller={controller} defaultMarkdown="PUBLIC" />)).toThrow(/defaultMarkdown/)
    expect(() => renderToStaticMarkup(<MindMapEditor controller={controller} documentRevision={1} />)).toThrow(/documentRevision/)
    expect(renderToStaticMarkup(<StaticMindMap markdown="PUBLIC" />)).toContain('PUBLIC')
    expect(renderToStaticMarkup(<StaticMindMap controller={controller} />)).toContain('SECRET')
  })
})
