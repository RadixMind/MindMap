import { describe, expect, it, vi } from 'vitest'
import * as extensionCompiler from '../extensions'
import { layoutMindMap } from '../layout'
import type { MindMapDocument, MindMapLayoutEdge, MindMapNode } from '../types'

describe('extension compilation cache', () => {
  it('reuses the same compiled result for every omitted extension list', () => {
    const first = extensionCompiler.compileExtensions()
    expect(extensionCompiler.compileExtensions()).toBe(first)
    expect(extensionCompiler.compileExtensions(undefined)).toBe(first)
    expect(first.list).toEqual([])
    expect(first.ids.size).toBe(0)
    expect(Object.isFrozen(first.list)).toBe(true)
  })

  it('retains last-definition ordering and caller-list identity caching', () => {
    const original = { id: 'same' }
    const replacement = { id: 'same' }
    const extensions = [original, { id: 'other' }, replacement]
    const compiled = extensionCompiler.compileExtensions(extensions)
    expect(extensionCompiler.compileExtensions(extensions)).toBe(compiled)
    expect(compiled.list).toEqual([replacement, extensions[1]])
    expect(compiled.list[0]).toBe(replacement)
  })

  it('compiles once for all roots and recursive nodes in one layout', () => {
    const document: MindMapDocument = { roots: [
      { id: 'a', text: 'A', children: [{ id: 'b', text: 'B', children: [{ id: 'c', text: 'C' }] }] },
      { id: 'd', text: 'D' },
    ] }
    const filterChildren = vi.fn((_node: MindMapNode, children: readonly MindMapNode[]) => children)
    const transformEdge = vi.fn((edge: MindMapLayoutEdge) => edge)
    const compile = vi.spyOn(extensionCompiler, 'compileExtensions')
    try {
      const layout = layoutMindMap(document, { extensions: [{ id: 'hooks', filterChildren, transformEdge }] })
      expect(compile).toHaveBeenCalledTimes(1)
      expect(layout.nodes).toHaveLength(4)
      expect(filterChildren).toHaveBeenCalledTimes(4)
      expect(transformEdge).toHaveBeenCalledTimes(2)
    } finally {
      compile.mockRestore()
    }
  })
})
