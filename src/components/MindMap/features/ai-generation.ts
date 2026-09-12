import type { MindMapController, MindMapDocument } from '../core/types'
import type { MindMapAIAttachment } from './ai-provider'

export interface MindMapAIGeneratorInput {
  prompt: string
  markdown: string
  document: MindMapDocument
  signal: AbortSignal
  attachments?: readonly MindMapAIAttachment[]
}
export type MindMapAIGeneratorResult = string | AsyncIterable<string> | Promise<string | AsyncIterable<string>>
export type MindMapAIGenerator = (input: MindMapAIGeneratorInput) => MindMapAIGeneratorResult

/** Async iterables yield delta chunks; cumulative snapshots need an explicit adapter. */
export async function runMindMapGeneration(controller: MindMapController, generator: MindMapAIGenerator, input: MindMapAIGeneratorInput): Promise<boolean> {
  if (input.signal.aborted) return false
  const stream = controller.createMarkdownStream()
  const requestAbort = new AbortController()
  const cancelled = Symbol('cancelled')
  let resolveCancellation!: (value: typeof cancelled) => void
  const cancellation = new Promise<typeof cancelled>((resolve) => { resolveCancellation = resolve })
  const cancel = () => { stream.cancel(); requestAbort.abort(); resolveCancellation(cancelled) }
  const unsubscribe = controller.subscribeEvents(() => {
    if (!stream.isActive()) { requestAbort.abort(); resolveCancellation(cancelled) }
  })
  let iterator: AsyncIterator<string> | undefined
  input.signal.addEventListener('abort', cancel, { once: true })
  try {
    if (input.signal.aborted) return false
    const result = await Promise.race([Promise.resolve(generator({ ...input, signal: requestAbort.signal })), cancellation])
    if (result === cancelled) return false
    if (!stream.isActive() || input.signal.aborted) return false
    let hasContent = false
    if (typeof result === 'string') { hasContent = Boolean(result.trim()); stream.replace(result) }
    else {
      iterator = result[Symbol.asyncIterator]()
      while (true) {
        const chunk = await Promise.race([iterator.next(), cancellation])
        if (chunk === cancelled) return false
        if (chunk.done) break
        if (!stream.isActive() || input.signal.aborted) return false
        if (chunk.value.trim()) hasContent = true
        stream.append(chunk.value)
      }
    }
    if (input.signal.aborted) return false
    if (!hasContent) throw new Error('AI generated no mind map content.')
    return await stream.commit()
  } finally {
    input.signal.removeEventListener('abort', cancel)
    unsubscribe()
    stream.dispose()
    requestAbort.abort()
    if (iterator?.return) void iterator.return().catch(() => undefined)
  }
}
