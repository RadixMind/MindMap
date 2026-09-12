import { describe, expect, it, vi } from 'vitest'
import {
  analyzeMindMapInline, applyMindMapPatchesWithInverse, cloneDocument, cloneNode,
  createMindMapController, createMindMapParser, diffMindMapDocuments, findNode,
  freezeDocument, layoutMindMap, MAX_MINDMAP_ATTRIBUTE_COLLECTION,
  MAX_MINDMAP_CROSS_LINKS_PER_NODE, MAX_MINDMAP_ID_LENGTH, MAX_MINDMAP_IMAGES,
  MAX_MINDMAP_INLINE_TOKENS_PER_LINE, MAX_MINDMAP_MULTILINE_LINES,
  MAX_MINDMAP_PATCHES, MAX_MINDMAP_TAGS_PER_NODE, measureMindMapNodeContent,
  normalizeDocument, parseMindMap, reconcileMindMapIds, renderMindMapToSvg,
  tokenizeMindMapInline, validateMindMapDocument, walkNodes, withAttribute,
} from '../index'
import type { MindMapDocument, MindMapNode, MindMapNodeAttributes, MindMapPatch } from '../types'
import { multilineExtension } from '../../extensions/multiline'

const doc = (attributes?: MindMapNodeAttributes, text = 'Root'): MindMapDocument => ({ roots: [{ id: 'root', text, ...(attributes ? { attributes } : {}) }] })

describe('bounded public admission', () => {
  it.each(['x'.repeat(MAX_MINDMAP_ID_LENGTH + 1), 'control\0id', 'id\u0085', 'id\u202e'])('rejects invalid IDs before projection and callbacks', (id) => {
    const transformLayout = vi.fn()
    const input = { roots: [{ id, text: 'Root', children: Array.from({ length: 120 }, (_, index) => ({ id: `c${index}`, text: 'Child' })) }] }
    expect(() => layoutMindMap(input, { extensions: [{ id: 'spy', transformLayout }] })).toThrow(/id/)
    expect(transformLayout).not.toHaveBeenCalled()
  })

  it('includes IDs in the total content allowance', () => {
    const input = { roots: Array.from({ length: 4100 }, (_, index) => ({ id: `${index}-` + 'x'.repeat(248), text: 'x' })) }
    expect(() => validateMindMapDocument(input)).toThrow(/1000000/)
  })

  it.each([
    { tags: { values: Array(MAX_MINDMAP_TAGS_PER_NODE + 1).fill('a') } },
    { multiline: { lines: Array(MAX_MINDMAP_MULTILINE_LINES + 1).fill('') } },
    { crossLink: { links: Array.from({ length: MAX_MINDMAP_CROSS_LINKS_PER_NODE + 1 }, () => ({ target: 'a' })) } },
    { custom: Array(MAX_MINDMAP_ATTRIBUTE_COLLECTION + 1).fill(0) },
    { remark: { text: '\n'.repeat(MAX_MINDMAP_MULTILINE_LINES) } },
  ])('rejects compact expansion on import, patches and metrics', (attributes) => {
    expect(() => normalizeDocument(doc(attributes))).toThrow(/limit/)
    expect(() => measureMindMapNodeContent(doc(attributes).roots[0], 0)).toThrow(/limit/)
    const controller = createMindMapController(doc())
    const initial = controller.getSnapshot()
    expect(controller.updateNode('root', { attributes })).toBe(false)
    expect(controller.getSnapshot()).toBe(initial)
  })

  it('rejects a shared-reference DAG while accepting ordinary JSON trees', () => {
    let shared: unknown = { leaf: 'x' }
    for (let index = 0; index < 30; index++) shared = { a: shared, b: shared }
    expect(() => cloneDocument(doc({ custom: shared }))).toThrow(/shared references/)
    expect(() => validateMindMapDocument(doc({ custom: { a: { leaf: 'x' }, b: { leaf: 'x' } } }))).not.toThrow()
  })

  it('caps aggregate attribute entries and derived records', () => {
    const attributes = { custom: Array(1000).fill(0) }
    const input = { roots: Array.from({ length: 101 }, (_, index) => ({ id: String(index), text: 'x', attributes: structuredClone(attributes) })) }
    expect(() => validateMindMapDocument(input)).toThrow(/entry limit/)
    const primitives = { roots: Array.from({ length: 18_000 }, (_, index) => ({ id: String(index), text: '`a` `b` `c`' })) }
    expect(() => layoutMindMap(primitives)).toThrow(/primitive limit/)
  })

  it('caps inline tokens and total images before rendering', () => {
    expect(() => tokenizeMindMapInline('`a`'.repeat(MAX_MINDMAP_INLINE_TOKENS_PER_LINE + 1))).toThrow(/token limit/)
    const input = { roots: Array.from({ length: MAX_MINDMAP_IMAGES + 1 }, (_, index) => ({ id: String(index), text: '![x](https://example.com/a.png)' })) }
    const policy = vi.fn(() => true)
    expect(() => renderMindMapToSvg(input, { remoteImagePolicy: policy })).toThrow(/image limit/)
    expect(policy).not.toHaveBeenCalled()
  })

  it('rejects cyclic and untyped public tree inputs before visitors', () => {
    const node: MindMapNode = { id: 'cycle', text: 'Cycle' }
    node.children = [node]
    const input = { roots: [node] }
    const visitor = vi.fn()
    const boundaries = [
      () => cloneNode(node), () => cloneDocument(input), () => normalizeDocument(null as never),
      () => freezeDocument(input), () => findNode(input, 'cycle'), () => walkNodes(input, visitor),
      () => reconcileMindMapIds(input, doc()), () => diffMindMapDocuments(input, input),
      () => applyMindMapPatchesWithInverse(input, []), () => withAttribute(node, 'custom', {}),
    ]
    for (const boundary of boundaries) {
      try { boundary(); expect.fail('Expected controlled rejection') } catch (error) { expect(error).toBeInstanceOf(Error); expect(error).not.toBeInstanceOf(RangeError) }
    }
    expect(visitor).not.toHaveBeenCalled()
  })
})

describe('bounded scanner and incremental work', () => {
  it('preserves token grammar and malformed fallback', () => {
    expect(tokenizeMindMapInline('![a](https://x) [b](./b) `c` **d** __e__ ~~f~~ ==g== $$h$$ $i$ *j* _k_')).toEqual([
      { type: 'image', text: 'a', url: 'https://x' }, { type: 'text', text: ' ' },
      { type: 'link', text: 'b', url: './b' }, { type: 'text', text: ' ' },
      { type: 'code', text: 'c' }, { type: 'text', text: ' ' }, { type: 'bold', text: 'd' }, { type: 'text', text: ' ' },
      { type: 'bold', text: 'e' }, { type: 'text', text: ' ' }, { type: 'strikethrough', text: 'f' }, { type: 'text', text: ' ' },
      { type: 'highlight', text: 'g' }, { type: 'text', text: ' ' }, { type: 'math', text: 'h', display: true }, { type: 'text', text: ' ' },
      { type: 'math', text: 'i' }, { type: 'text', text: ' ' }, { type: 'italic', text: 'j' }, { type: 'text', text: ' ' }, { type: 'italic', text: 'k' },
    ])
    expect(tokenizeMindMapInline('[[broken](url) **x** ![](data:image/png;base64,YQ==)')).toEqual([
      { type: 'link', text: '[broken', url: 'url' }, { type: 'text', text: ' ' }, { type: 'bold', text: 'x' }, { type: 'text', text: ' ' }, { type: 'image', text: '', url: 'data:image/png;base64,YQ==' },
    ])
  })

  it('searches an unmatched bracket suffix once, even on an 80000-character line', () => {
    const source = '['.repeat(80_000)
    const search = vi.spyOn(String.prototype, 'indexOf')
    try {
      expect(analyzeMindMapInline(source)).toEqual({ tokens: 1, images: 0 })
      expect(search.mock.calls.length).toBeLessThan(10)
    } finally { search.mockRestore() }
    expect(tokenizeMindMapInline(source)).toEqual([{ type: 'text', text: source }])
  })

  it('caps continuation copying during append and preserves rollback/chunk equivalence', () => {
    const options = { extensions: [multilineExtension()] }
    const source = 'Root\n' + '| x\n'.repeat(MAX_MINDMAP_MULTILINE_LINES)
    const parser = createMindMapParser(options)
    parser.append(source)
    const before = parser.getDocument()
    expect(() => parser.append('| rejected\n- Discarded\n')).toThrow(/continuation limit/)
    expect(parser.getDocument()).toEqual(before)
    parser.append('- Child\n')
    expect(parser.getDocument()).toEqual(parseMindMap(source + '- Child\n', options))
    const chunked = createMindMapParser(options)
    for (const char of source) chunked.append(char)
    expect(chunked.getDocument()).toEqual(before)
  })

  it('reconciles reversed equal labels by fingerprint without repeated comparisons', () => {
    const size = 2000
    const previous = { roots: Array.from({ length: size }, (_, index) => ({ id: `old-${index}`, text: 'Same', attributes: { tags: { values: [String(index)] } } })) }
    const next = { roots: previous.roots.toReversed().map((node, index) => ({ ...node, id: `mm-${index}` })) }
    const stringify = vi.spyOn(JSON, 'stringify')
    let result: MindMapDocument
    try {
      result = reconcileMindMapIds(previous, next)
      expect(stringify.mock.calls.length).toBeLessThan(size * 20)
    } finally { stringify.mockRestore() }
    expect(result!.roots.map((node) => node.id)).toEqual(previous.roots.map((node) => node.id).toReversed())
  })
})

describe('bounded patch batches and history', () => {
  it('rejects direct over-limit batches atomically and uses replacements for large diffs', () => {
    const controller = createMindMapController(doc())
    const before = controller.getSnapshot()
    const patches: MindMapPatch[] = Array.from({ length: MAX_MINDMAP_PATCHES + 1 }, (_, index) => ({ type: 'update', nodeId: 'root', text: String(index) }))
    expect(controller.applyPatches(patches)).toBe(false)
    expect(controller.getSnapshot()).toBe(before)
    const previous = { roots: Array.from({ length: 2000 }, (_, index) => ({ id: `n${index}`, text: 'Same' })) }
    const current = { roots: previous.roots.toReversed() }
    const diff = diffMindMapDocuments(previous, current)
    expect(diff).toEqual([{ type: 'replace-document', document: current }])
    const result = applyMindMapPatchesWithInverse(previous, diff)
    expect(result.valid).toBe(true)
    expect(result.document).toEqual(current)
    expect(applyMindMapPatchesWithInverse(result.document, result.inversePatches).document).toEqual(previous)
  })

  it('rejects batches joining valid subtrees into excessive depth before materialization', () => {
    const patches: MindMapPatch[] = []
    let parentId: string | null = null
    for (let batch = 0; batch < 64; batch++) {
      const node: MindMapNode = { id: `r${batch}`, text: 'Root' }
      let leaf = node
      for (let depth = 0; depth < 249; depth++) {
        const child: MindMapNode = { id: `n${batch}-${depth}`, text: 'Child' }
        leaf.children = [child]
        leaf = child
      }
      patches.push({ type: 'insert', node, parentId, index: 0 })
      parentId = leaf.id
    }
    const input = doc()
    const result = applyMindMapPatchesWithInverse(input, patches)
    expect(result).toEqual({ document: input, inversePatches: [], valid: false })
    expect(result.document).toBe(input)
  })

  it('compacts a long transaction while preserving cancellation and undo/redo', () => {
    const controller = createMindMapController(doc())
    for (const cancel of [true, false]) {
      const transaction = controller.beginTransaction()
      for (let index = 0; index < MAX_MINDMAP_PATCHES + 10; index++) expect(transaction.applyPatches([{ type: 'update', nodeId: 'root', text: String(index) }])).toBe(true)
      if (cancel) { transaction.cancel(); expect(controller.getSnapshot().document.roots[0].text).toBe('Root') }
      else { transaction.commit(); expect(controller.undo()).toBe(true); expect(controller.getSnapshot().document.roots[0].text).toBe('Root'); expect(controller.redo()).toBe(true); expect(controller.getSnapshot().document.roots[0].text).toBe(String(MAX_MINDMAP_PATCHES + 9)) }
    }
  })
})
