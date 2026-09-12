import { tokenizeMindMapInline } from '../core/inline'
import { renderMindMapToSvg, type RenderMindMapToSvgOptions } from '../core/svg'
import type { MindMapDocument, MindMapNode } from '../core/types'
import { sanitizeMindMapUrl } from '../core/url'
import { walkNodes, validateMindMapDocument, cloneDocument } from '../core/utils'
import { MAX_MINDMAP_CONTENT_LENGTH, MAX_MINDMAP_IMAGES } from '../core/limits'

/** Maximum raw SVG UTF-16 source length, checked before Image or URI allocation. */
export const MAX_MINDMAP_SVG_SOURCE_LENGTH = 16 * 1024 * 1024
/** Includes every resolver invocation, regardless of result. */
export const MAX_MINDMAP_IMAGE_RESOLVER_CALLS = MAX_MINDMAP_IMAGES

export function exportMindMapOutline(document: MindMapDocument): string {
  validateMindMapDocument(document)
  const lines: string[] = []
  walkNodes(document, (node, _parent, _index, depth) => lines.push(`${'  '.repeat(depth)}${node.text}`))
  return lines.join('\n')
}

export interface PrepareMindMapSvgOptions extends RenderMindMapToSvgOptions {
  /** Host-owned, explicitly authorized resolver. Return a safe raster data URL or null. */
  imageResolver?: (url: string, signal?: AbortSignal) => Promise<string | null>
  signal?: AbortSignal
}

export async function prepareMindMapSvg(document: MindMapDocument, options: PrepareMindMapSvgOptions = {}): Promise<string> {
  validateMindMapDocument(document)
  document = cloneDocument(document)
  options.signal?.throwIfAborted()
  let renderMath = options.renderMath
  let hasMath = false
  walkNodes(document, (node) => { if ([node.text, ...(node.attributes?.multiline?.lines ?? [])].flatMap(tokenizeMindMapInline).some((token) => token.type === 'math')) hasMath = true })
  if (!renderMath && hasMath && options.extensions?.some((extension) => extension.id === 'latex')) {
    const katex = await import('katex').catch(() => null)
    if (katex) renderMath = (source, displayMode) => katex.default.renderToString(source, { output: 'mathml', displayMode, trust: false, throwOnError: false, strict: 'warn' })
  }
  const urls = new Map<string, number>()
  walkNodes(document, (node) => {
    for (const token of [node.text, ...(node.attributes?.multiline?.lines ?? [])].flatMap(tokenizeMindMapInline)) {
      if (token.type === 'image') { const url = sanitizeMindMapUrl(token.url, true); if (url && !url.startsWith('data:')) urls.set(url, (urls.get(url) ?? 0) + 1) }
    }
  })
  if (urls.size > MAX_MINDMAP_IMAGE_RESOLVER_CALLS) throw new Error('Mind map image resolver call limit exceeded')
  const embedded = new Map<string, string>()
  if (options.imageResolver) {
    const pending = [...urls.keys()]
    let embeddedLength = 0
    let cursor = 0
    let failed = false
    async function resolveImages() {
      try {
        while (!failed && cursor < pending.length) {
          options.signal?.throwIfAborted()
          const url = pending[cursor++]
          const data = await options.imageResolver!(url, options.signal)
          options.signal?.throwIfAborted()
          if (data === null) continue
          if (!data.startsWith('data:') || !sanitizeMindMapUrl(data, true)) throw new Error('Image resolver must return a PNG, JPEG, GIF or WebP data URL.')
          embeddedLength += data.length * urls.get(url)!
          if (embeddedLength > MAX_MINDMAP_CONTENT_LENGTH) throw new Error('Resolved mind map images exceed the document content limit.')
          embedded.set(url, data)
        }
      } catch (error) { failed = true; throw error }
    }
    await Promise.all(Array.from({ length: Math.min(4, pending.length) }, resolveImages))
  }
  function replaceImages(text: string): string {
    let cursor = 0
    const parts: string[] = []
    for (const token of tokenizeMindMapInline(text)) {
      if (token.type !== 'image') continue
      const original = `![${token.text}](${token.url})`
      const offset = text.indexOf(original, cursor)
      if (offset < 0) continue
      const data = embedded.get(sanitizeMindMapUrl(token.url, true) ?? '')
      if (!data) continue
      parts.push(text.slice(cursor, offset), `![${token.text}](${data})`)
      cursor = offset + original.length
    }
    parts.push(text.slice(cursor))
    return parts.join('')
  }
  function embedNode(node: MindMapNode): MindMapNode {
    const text = replaceImages(node.text)
    const attributes = node.attributes?.multiline ? { ...node.attributes, multiline: { lines: node.attributes.multiline.lines.map(replaceImages) } } : node.attributes
    return { ...node, text, attributes, ...(node.children ? { children: node.children.map(embedNode) } : {}) }
  }
  const source = embedded.size ? { ...document, roots: document.roots.map(embedNode) } : document
  return renderMindMapToSvg(source, { ...options, renderMath })
}

export async function renderSvgToPng(svg: string, scale = 2): Promise<Blob> {
  if (typeof svg !== 'string' || svg.length > MAX_MINDMAP_SVG_SOURCE_LENGTH) throw new Error('PNG export SVG source length limit exceeded.')
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('PNG export scale must be a positive finite number.')
  if (/<image\b[^>]*\bhref=["']https?:/i.test(svg)) throw new Error('PNG export with remote images requires an imageResolver that embeds them.')
  const image = new Image()
  // A self-contained data URL also allows browsers to rasterize MathML foreignObjects.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Unable to render this SVG as PNG.'))
      image.src = url
    })
    const width = image.naturalWidth
    const height = image.naturalHeight
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('PNG export requires nonempty image dimensions.')
    // Bound allocation even for valid Documents with very large layout bounds.
    const maxSide = 8192
    const maxPixels = 16_777_216
    let outputWidth = Math.ceil(width * scale)
    let outputHeight = Math.ceil(height * scale)
    if (outputWidth > maxSide || outputHeight > maxSide || outputWidth * outputHeight > maxPixels) {
      const safeScale = Math.min(scale, maxSide / width, maxSide / height, Math.sqrt(maxPixels / width / height))
      outputWidth = Math.max(1, Math.floor(width * safeScale))
      outputHeight = Math.max(1, Math.floor(height * safeScale))
    }
    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const drawing = canvas.getContext('2d')
    if (!drawing) throw new Error('PNG export requires a 2D canvas context.')
    drawing.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG export failed.')), 'image/png'))
  } finally { image.onload = null; image.onerror = null }
}

export function downloadMindMapFile(content: BlobPart, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
