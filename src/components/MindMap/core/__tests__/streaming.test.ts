import { describe, expect, it } from 'vitest'
import { applyMindMapPatches, createMarkdownStream } from '../index'

describe('markdown stream', () => {
  it('coalesces chunks and emits applicable patches', async () => {
    const stream = createMarkdownStream({ initialMarkdown: 'Root' })
    const previous = stream.getDocument()
    stream.append('\n- Branch')
    stream.append('\n  - Leaf')
    const update = await stream.flush()
    expect(update?.document.roots[0].children?.[0].children?.[0].text).toBe('Leaf')
    expect(applyMindMapPatches(previous, update?.patches ?? [])).toEqual(update?.document)
  })
})

