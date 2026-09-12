import { describe, expect, it, vi } from 'vitest'
import { createMarkdownStream, layoutMindMap, MAX_MINDMAP_RASTER_DATA_URL_LENGTH, parseMindMap, renderMindMapToSvg, sanitizeMindMapUrl, serializeMindMap, tokenizeMindMapInline } from '../index'
import type { MindMapDocument, MindMapNode } from '../index'

describe('legacy Markdown syntax', () => {
  const extensions = [{ id: 'folding' }, { id: 'dotted-line' }, { id: 'multiline' }]

  it.each([
    '- Root\n  - Child',
    '+ Root\n  - Child',
    '-. Root\n  - Child',
    'Root\n- Child',
    '- First\n  - A\n\n- Second\n  - B',
    'First\n- A\n\nSecond\n- B',
  ])('preserves root syntax and stable ids: %s', (source) => {
    const document = parseMindMap(source, { extensions })
    expect(serializeMindMap(document, { extensions })).toBe(source)
    expect(parseMindMap(serializeMindMap(document, { extensions }), { extensions })).toEqual(document)
    expect(document.roots[0].id).toBe('mm-0')
  })

  it('keeps inline and display math distinct through parsing, serialization and SVG rendering', async () => {
    const source = '- $$x^2$$\n  | $$y^2$$\n  - $z^2$'
    expect(tokenizeMindMapInline('$$x^2$$')).toEqual([{ type: 'math', text: 'x^2', display: true }])
    expect(tokenizeMindMapInline('$x^2$')).toEqual([{ type: 'math', text: 'x^2' }])
    const document = parseMindMap(source, { extensions })
    expect(serializeMindMap(document, { extensions })).toBe(source)
    const stream = createMarkdownStream({ extensions })
    for (const character of source) { stream.append(character); await stream.flush() }
    expect(stream.getDocument()).toEqual(document)
    stream.dispose()
    const display = layoutMindMap(parseMindMap('$$x^2$$')).nodes[0]
    const inline = layoutMindMap(parseMindMap('$x^2$')).nodes[0]
    expect(display.height).toBeGreaterThan(inline.height)
    const renderMath = vi.fn((text: string, block?: boolean) => '<math xmlns="http://www.w3.org/1998/Math/MathML" display="' + (block ? 'block' : 'inline') + '"><mi>' + text + '</mi></math>')
    const svg = renderMindMapToSvg(document, { extensions, renderMath })
    expect(renderMath).toHaveBeenNthCalledWith(1, 'x^2', true)
    expect(renderMath).toHaveBeenNthCalledWith(2, 'y^2', true)
    expect(renderMath).toHaveBeenNthCalledWith(3, 'z^2', false)
    const mathBoxes = [...svg.matchAll(/<foreignObject[^>]*>([\s\S]*?)<\/foreignObject>/g)]
    expect(mathBoxes).toHaveLength(3)
    expect(mathBoxes[0][1]).toContain('display="block"')
    expect(mathBoxes[2][1]).toContain('display="inline"')
    for (const box of mathBoxes) expect(box[1]).not.toContain('$')
  })
})

describe('direct public projection admission', () => {
  function cyclic(): MindMapDocument {
    const node: MindMapNode = { id: 'cycle', text: 'Cycle', children: [] }
    node.children!.push(node)
    return { roots: [node] }
  }

  function deep(): MindMapDocument {
    let node: MindMapNode = { id: 'leaf', text: 'Leaf' }
    for (let index = 0; index < 258; index++) node = { id: 'deep-' + index, text: 'Deep', children: [node] }
    return { roots: [node] }
  }

  it.each([
    () => ({ roots: 'invalid' }),
    () => ({ roots: [{ id: 'a', text: 123 }] }),
    () => ({ roots: [{ id: 'a', text: 'A' }, { id: 'a', text: 'Duplicate' }] }),
    cyclic,
    deep,
    () => ({ roots: Array.from({ length: 20_001 }, (_, index) => ({ id: 'n-' + index, text: 'N' })) }),
    () => ({ roots: [{ id: 'r', text: 'x'.repeat(1_000_001) }] }),
    () => ({ roots: [{ id: 'r', text: 'R', attributes: { crossLink: { links: {} } } }] }),
  ])('rejects malformed or unbounded caller input before either public renderer recurses', (fixture) => {
    const document = fixture() as unknown as MindMapDocument
    expect(() => layoutMindMap(document)).toThrow()
    expect(() => renderMindMapToSvg(document)).toThrow()
  })

  it('validates the direct node and node-array overloads too', () => {
    const document = cyclic()
    expect(() => layoutMindMap(document.roots[0])).toThrow()
    expect(() => layoutMindMap(document.roots)).toThrow()
  })

  it('enforces the raster data URL length bound before admission', () => {
    const prefix = 'data:image/png;base64,'
    const payloadLength = Math.floor((MAX_MINDMAP_RASTER_DATA_URL_LENGTH - prefix.length) / 4) * 4
    const allowed = prefix + 'A'.repeat(payloadLength)
    expect(sanitizeMindMapUrl(allowed, true)).toBe(allowed)
    expect(sanitizeMindMapUrl(allowed + 'AAAA', true)).toBeNull()
    expect(sanitizeMindMapUrl('data:image/svg+xml;base64,PHN2Zz4=', true)).toBeNull()
  })
})
