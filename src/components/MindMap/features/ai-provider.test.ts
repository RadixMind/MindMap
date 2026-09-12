import { describe, expect, it, vi } from 'vitest'
import { buildMindMapAIRequest, readMindMapAIStream, createOpenAICompatibleGenerator, readMindMapAttachments } from './ai-provider'

describe('attachment admission and readers', () => {
  function file(size: number, text = vi.fn(async () => 'text')): File {
    return { name: 'source.txt', type: 'text/plain', size, text } as unknown as File
  }

  it('rejects count and aggregate overflow before reading any file, including existing selections', async () => {
    const text = vi.fn(async () => 'text')
    await expect(readMindMapAttachments(Array.from({ length: 11 }, () => file(1, text)), ['text'])).rejects.toMatchObject({ code: 'count' })
    await expect(readMindMapAttachments([file(1, text)], ['text'], { maxAttachments: 2 }, { count: 2, bytes: 2 })).rejects.toMatchObject({ code: 'count' })
    await expect(readMindMapAttachments(Array.from({ length: 5 }, () => file(5 * 1024 * 1024, text)), ['text'])).rejects.toMatchObject({ code: 'total-size' })
    await expect(readMindMapAttachments([file(4, text)], ['text'], { maxTotalAttachmentSize: 6 }, { count: 1, bytes: 3 })).rejects.toMatchObject({ code: 'total-size' })
    expect(text).not.toHaveBeenCalled()
  })

  it('bounds reader concurrency, preserves order, and stops queued reads after abort', async () => {
    const releases: Array<(value: string) => void> = []
    const text = vi.fn(() => new Promise<string>((resolve) => releases.push(resolve)))
    const abort = new AbortController()
    const promise = readMindMapAttachments(Array.from({ length: 8 }, () => file(1, text)), ['text'], { attachmentReadConcurrency: 2 }, undefined, abort.signal)
    expect(text).toHaveBeenCalledTimes(2)
    abort.abort()
    releases.forEach((release) => release('done'))
    await expect(promise).rejects.toThrow()
    expect(text).toHaveBeenCalledTimes(2)
    const result = await readMindMapAttachments([file(1, vi.fn(async () => 'first')), file(1, vi.fn(async () => 'second'))], ['text'], { attachmentReadConcurrency: 1 })
    expect(result.map((attachment) => attachment.text)).toEqual(['first', 'second'])
  })
})

describe('OpenAI compatible host adapter', () => {
  it('preserves UTF-8 text, image and PDF bytes in request parts', () => {
    const payload = buildMindMapAIRequest({ apiUrl: '/api/ai', model: 'configured' }, {
      prompt: '更新', markdown: '原文', document: { roots: [] }, signal: new AbortController().signal,
      attachments: [
        { type: 'text', name: '说明.txt', mimeType: 'text/plain', text: '中文✓' },
        { type: 'image', name: 'photo.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,YQ==' },
        { type: 'pdf', name: 'paper.pdf', mimeType: 'application/pdf', dataUrl: 'data:application/pdf;base64,JVBERg==' },
      ],
    })
    const body = JSON.parse(payload.body)
    expect(body.messages[1].content[1].text).toContain('中文✓')
    expect(body.messages[1].content[2].image_url.url).toBe('data:image/png;base64,YQ==')
    expect(body.messages[1].content[3].file).toEqual({ filename: 'paper.pdf', file_data: 'data:application/pdf;base64,JVBERg==' })
    expect(payload.headers.Authorization).toBeUndefined()
    expect(payload.attachments).toHaveLength(3)
  })

  it('decodes split UTF-8, CRLF events and an unterminated final event', async () => {
    const text = 'data: {"choices":[{"delta":{"content":"你"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"好"}}]}'
    const bytes = new TextEncoder().encode(text)
    const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const value of bytes) controller.enqueue(new Uint8Array([value])); controller.close() } })
    const response = new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
    let result = ''
    for await (const chunk of readMindMapAIStream(response, new AbortController().signal)) result += chunk
    expect(result).toBe('你好')
  })

  it('uses the host request hook and propagates provider errors', async () => {
    const signal = new AbortController().signal
    const generator = createOpenAICompatibleGenerator({ apiUrl: '/api/ai', model: 'configured', request: async (payload) => {
      expect(payload.signal).toBe(signal)
      return new Response('data: {"error":{"message":"provider failure"}}\n\n', { headers: { 'content-type': 'text/event-stream' } })
    } })
    const chunks = async () => { for await (const chunk of await generator({ prompt: 'map', markdown: '', document: { roots: [] }, signal }) as AsyncIterable<string>) { void chunk } }
    await expect(chunks()).rejects.toThrow('provider failure')
  })

  it.each(['text/event-stream', 'application/json'])('bounds malformed %s response bodies before JSON parsing', async (contentType) => {
    const response = new Response('x'.repeat(1_000_001), { headers: { 'content-type': contentType } })
    const consume = async () => { for await (const chunk of readMindMapAIStream(response, new AbortController().signal)) void chunk }
    await expect(consume()).rejects.toThrow('1000000')
  })
})
