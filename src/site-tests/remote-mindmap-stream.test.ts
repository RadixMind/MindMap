import { describe, expect, it, vi } from 'vitest'
import { createMindMapController } from '../components/MindMap/entries/core'
import { cleanRemoteMindMap, REMOTE_MINDMAP_ENDPOINT, streamRemoteMindMap } from '../../site/src/components/remoteMindMapStream'

const encoder = new TextEncoder()

function responseFrom(chunks: Uint8Array[], status = 200): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk))
      controller.close()
    },
  }), { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

describe('public website AI stream adapter', () => {
  it('cleans reasoning and Markdown fences from cumulative output', () => {
    expect(cleanRemoteMindMap('<think>private</think>```markdown\nRoadmap\n- Ship\n```')).toBe('Roadmap\n- Ship')
    expect(cleanRemoteMindMap('<think>unfinished')).toBe('')
  })

  it('decodes split UTF-8 chunks and commits one controller history entry', async () => {
    const source = encoder.encode('<think>ignore</think>```markdown\n路线图 🚀\n- Research\n- Ship\n```')
    const rocket = source.findIndex((value) => value >= 0xf0)
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(`${REMOTE_MINDMAP_ENDPOINT}?text=Build+a+roadmap`)
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return responseFrom([source.slice(0, rocket + 1), source.slice(rocket + 1, rocket + 3), source.slice(rocket + 3)])
    })
    const controller = createMindMapController('Original\n- Keep')
    const phases: string[] = []
    const unsubscribe = controller.subscribeEvents((event) => phases.push(event.phase))

    await expect(streamRemoteMindMap(controller, 'Build a roadmap', new AbortController().signal, fetcher)).resolves.toBe(true)

    expect(controller.getSnapshot().document.roots[0]?.text).toBe('路线图 🚀')
    expect(controller.getSnapshot().document.roots[0]?.children?.map((node) => node.text)).toEqual(['Research', 'Ship'])
    expect(phases.filter((phase) => phase === 'commit')).toHaveLength(1)
    expect(controller.getSnapshot().canUndo).toBe(true)
    expect(controller.undo()).toBe(true)
    expect(controller.getSnapshot().document.roots[0]?.text).toBe('Original')

    unsubscribe()
    controller.dispose()
  })

  it('rolls back HTTP and empty-output failures', async () => {
    for (const response of [responseFrom([encoder.encode('unavailable')], 503), responseFrom([encoder.encode('<think>only reasoning</think>')])]) {
      const controller = createMindMapController('Baseline\n- Safe')
      const fetcher = vi.fn(async () => response)
      await expect(streamRemoteMindMap(controller, 'test', new AbortController().signal, fetcher)).rejects.toThrow()
      expect(controller.getSnapshot().document.roots[0]?.text).toBe('Baseline')
      expect(controller.getSnapshot().canUndo).toBe(false)
      controller.dispose()
    }
  })

  it('rolls back network and parser failures', async () => {
    const networkController = createMindMapController('Baseline\n- Safe')
    await expect(streamRemoteMindMap(
      networkController,
      'test',
      new AbortController().signal,
      vi.fn(async () => { throw new TypeError('Network unavailable') }),
    )).rejects.toThrow('Network unavailable')
    expect(networkController.getSnapshot().document.roots[0]?.text).toBe('Baseline')
    expect(networkController.getSnapshot().canUndo).toBe(false)
    networkController.dispose()

    const cancel = vi.fn()
    const dispose = vi.fn()
    const parserFailureController = {
      createMarkdownStream: () => ({
        replace: vi.fn(() => { throw new SyntaxError('Invalid Markdown') }),
        commit: vi.fn(),
        cancel,
        dispose,
      }),
    }
    await expect(streamRemoteMindMap(
      parserFailureController as never,
      'test',
      new AbortController().signal,
      vi.fn(async () => responseFrom([encoder.encode('Broken')])),
    )).rejects.toThrow('Invalid Markdown')
    expect(cancel).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('cancels the response reader and restores the baseline when aborted', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(encoder.encode('Generated\n- Preview')) },
      cancel() { cancelled = true },
    })
    const controller = createMindMapController('Baseline\n- Safe')
    const phases: string[] = []
    controller.subscribeEvents((event) => phases.push(event.phase))
    const abort = new AbortController()
    const pending = streamRemoteMindMap(controller, 'test', abort.signal, vi.fn(async () => new Response(body, { status: 200 })))

    await new Promise((resolve) => setTimeout(resolve, 25))
    abort.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancelled).toBe(true)
    expect(controller.getSnapshot().document.roots[0]?.text).toBe('Baseline')
    expect(phases).toContain('rollback')
    expect(controller.getSnapshot().canUndo).toBe(false)
    controller.dispose()
  })
})
