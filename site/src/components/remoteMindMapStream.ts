import type { MindMapController } from '@xiangfa/mindmap/core'

export const REMOTE_MINDMAP_ENDPOINT = 'https://open-mindmap-ai.u14.app/api/mindmap'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export function cleanRemoteMindMap(source: string): string {
  return source
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .replace(/^\s*```(?:markdown|md)?\s*\n?/i, '')
    .replace(/\n?\s*```\s*$/i, '')
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
}

export async function streamRemoteMindMap(
  controller: MindMapController,
  prompt: string,
  signal: AbortSignal,
  fetcher: FetchLike = fetch,
): Promise<boolean> {
  if (signal.aborted) throw abortReason(signal)

  const stream = controller.createMarkdownStream()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let committed = false
  const cancelReader = () => { void reader?.cancel(abortReason(signal)).catch(() => undefined) }
  signal.addEventListener('abort', cancelReader, { once: true })

  try {
    const url = new URL(REMOTE_MINDMAP_ENDPOINT)
    url.searchParams.set('text', prompt)
    const response = await fetcher(url, {
      method: 'GET',
      headers: { Accept: 'text/plain' },
      referrerPolicy: 'no-referrer',
      signal,
    })

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error(`AI request failed (${response.status}).`)
    }
    if (!response.body) throw new Error('AI response has no stream body.')

    reader = response.body.getReader()
    const decoder = new TextDecoder()
    let accumulated = ''

    while (true) {
      if (signal.aborted) throw abortReason(signal)
      const { done, value } = await reader.read()
      accumulated += done ? decoder.decode() : decoder.decode(value, { stream: true })
      stream.replace(cleanRemoteMindMap(accumulated))
      if (done) break
    }

    if (signal.aborted) throw abortReason(signal)
    if (!cleanRemoteMindMap(accumulated).trim()) throw new Error('AI generated no mind map content.')
    committed = await stream.commit()
    if (!committed && !signal.aborted) throw new Error('AI generation was interrupted.')
    return committed
  } catch (error) {
    stream.cancel()
    throw error
  } finally {
    signal.removeEventListener('abort', cancelReader)
    if (!committed) await reader?.cancel().catch(() => undefined)
    reader?.releaseLock()
    stream.dispose()
  }
}
