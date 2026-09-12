import { describe, expect, it } from 'vitest'
import { createMindMapController } from '../core/controller'
import { runMindMapGeneration, type MindMapAIGeneratorInput } from './ai-generation'

function input(controller: ReturnType<typeof createMindMapController>, signal = new AbortController().signal): MindMapAIGeneratorInput {
  return { prompt: 'Generate', markdown: 'Original', document: controller.getSnapshot().document, signal }
}

describe('AI generation transaction', () => {
  it('appends repeated delta chunks literally and commits one undo entry', async () => {
    const controller = createMindMapController('Original')
    const completed = await runMindMapGeneration(controller, async function* () { yield 'Root\n'; yield '- A'; yield 'A' }, input(controller))
    expect(completed).toBe(true)
    expect(controller.getSnapshot().document.roots[0].children?.[0].text).toBe('AA')
    expect(controller.undo()).toBe(true)
    expect(controller.getSnapshot().document.roots[0].text).toBe('Original')
    expect(controller.undo()).toBe(false)
    controller.dispose()
  })
  it('rolls back a failed generator', async () => {
    const controller = createMindMapController('Original')
    await expect(runMindMapGeneration(controller, async function* () { yield 'Partial'; throw new Error('failed') }, input(controller))).rejects.toThrow('failed')
    expect(controller.getSnapshot().document.roots[0].text).toBe('Original')
    expect(controller.getSnapshot().canUndo).toBe(false)
    controller.dispose()
  })
  it('ignores a non-cooperative generator result after abort', async () => {
    const controller = createMindMapController('Original')
    const abort = new AbortController()
    let resolve!: (value: string) => void
    const task = runMindMapGeneration(controller, () => new Promise<string>((done) => { resolve = done }), input(controller, abort.signal))
    abort.abort()
    resolve('Late content')
    expect(await task).toBe(false)
    expect(controller.getSnapshot().document.roots[0].text).toBe('Original')
    controller.dispose()
  })
  it('preserves host replacement when old generation settles', async () => {
    const controller = createMindMapController('Original')
    let resolve!: (value: string) => void
    const task = runMindMapGeneration(controller, () => new Promise<string>((done) => { resolve = done }), input(controller))
    controller.setMarkdown('Host document', 'external')
    resolve('Late content')
    expect(await task).toBe(false)
    expect(controller.getSnapshot().document.roots[0].text).toBe('Host document')
    controller.dispose()
  })
  it('does not replace the document with an empty provider result', async () => {
    const controller = createMindMapController('Original')
    await expect(runMindMapGeneration(controller, () => '', input(controller))).rejects.toThrow('no mind map')
    expect(controller.getSnapshot().document.roots[0].text).toBe('Original')
  })
})
