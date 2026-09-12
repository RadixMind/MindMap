import type { MindMapAIGenerator, MindMapAIGeneratorInput } from './ai-generation'

export type AIAttachmentType = 'text' | 'image' | 'pdf'
export class MindMapAttachmentError extends Error {
  readonly code: 'size' | 'type' | 'read' | 'count' | 'total-size'

  constructor(code: 'size' | 'type' | 'read' | 'count' | 'total-size') {
    super(`Attachment ${code} error`)
    this.code = code
    this.name = 'MindMapAttachmentError'
  }
}
export interface MindMapAIAttachment {
  name: string
  type: AIAttachmentType
  mimeType: string
  text?: string
  dataUrl?: string
}
export type MindMapAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } }
export interface MindMapAIRequestPayload {
  apiUrl: string
  apiKey?: string
  model: string
  messages: Array<{ role: 'system' | 'user'; content: string | MindMapAIContentPart[] }>
  headers: Record<string, string>
  body: string
  signal: AbortSignal
  attachments: readonly MindMapAIAttachment[]
}
export interface MindMapAIAttachmentLimits {
  /** Per-file byte limit; defaults to 5 MiB. */
  maxAttachmentSize?: number
  /** Total selected file count; defaults to 10. */
  maxAttachments?: number
  /** Total selected source bytes; defaults to 20 MiB. */
  maxTotalAttachmentSize?: number
  /** Concurrent file readers; defaults to 3. */
  attachmentReadConcurrency?: number
}

export interface MindMapAIConfig extends MindMapAIAttachmentLimits {
  /** Use a host/server proxy endpoint to keep provider credentials off the client. */
  apiUrl: string
  apiKey?: string
  model: string
  systemPrompt?: string
  attachments?: readonly AIAttachmentType[]
  headers?: Record<string, string>
  request?: (payload: MindMapAIRequestPayload) => Promise<Response>
}

export function buildMindMapAIRequest(config: MindMapAIConfig, input: MindMapAIGeneratorInput): MindMapAIRequestPayload {
  const content: MindMapAIContentPart[] = [{ type: 'text', text: `Current mind map:\n${input.markdown}\n\nRequest:\n${input.prompt}` }]
  for (const attachment of input.attachments ?? []) {
    if (attachment.type === 'text') content.push({ type: 'text', text: `[${attachment.name}]\n${attachment.text ?? ''}` })
    if (attachment.type === 'image' && attachment.dataUrl) content.push({ type: 'image_url', image_url: { url: attachment.dataUrl } })
    // Chat Completions file input preserves actual PDF bytes for host adapters/providers.
    if (attachment.type === 'pdf' && attachment.dataUrl) content.push({ type: 'file', file: { filename: attachment.name, file_data: attachment.dataUrl } })
  }
  const messages: MindMapAIRequestPayload['messages'] = [
    { role: 'system', content: config.systemPrompt ?? 'Return only a Markdown mind map. Use a root title and indented list items. Do not wrap the output in a code fence.' },
    { role: 'user', content },
  ]
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}), ...config.headers }
  return { apiUrl: config.apiUrl, apiKey: config.apiKey, model: config.model, messages, headers, body: JSON.stringify({ model: config.model, messages, stream: true }), signal: input.signal, attachments: input.attachments ?? [] }
}

function readEvent(event: string): { done: boolean; text: string } {
  const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
  if (!data) return { done: false, text: '' }
  if (data.trim() === '[DONE]') return { done: true, text: '' }
  let value: { choices?: Array<{ delta?: { content?: unknown } }>; error?: { message?: string } }
  try { value = JSON.parse(data) } catch { throw new Error('Invalid AI stream event.') }
  if (value.error) throw new Error(value.error.message ?? 'AI provider returned an error.')
  const text = value.choices?.[0]?.delta?.content
  return { done: false, text: typeof text === 'string' ? text : '' }
}

export async function* readMindMapAIStream(response: Response, signal: AbortSignal): AsyncGenerator<string> {
  if (!response.ok) throw new Error(`AI request failed (${response.status}).`)
  if (!response.body) throw new Error('AI response has no stream body.')
  const isStream = response.headers.get('content-type')?.includes('text/event-stream')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const cancel = () => { void reader.cancel().catch(() => undefined) }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      if (buffer.length > 1_000_000) throw new Error('AI response event exceeds 1000000 characters.')
      if (!isStream) {
        if (!done) continue
        const result = JSON.parse(buffer) as { choices?: Array<{ message?: { content?: unknown } }> }
        const content = result.choices?.[0]?.message?.content
        if (typeof content !== 'string' || !content.trim()) throw new Error('AI response has no mind map content.')
        if (!signal.aborted) yield content
        return
      }
      let boundary = /\r?\n\r?\n/.exec(buffer)
      while (boundary) {
        const event = readEvent(buffer.slice(0, boundary.index))
        buffer = buffer.slice(boundary.index + boundary[0].length)
        if (event.done) return
        if (event.text && !signal.aborted) yield event.text
        boundary = /\r?\n\r?\n/.exec(buffer)
      }
      if (done) {
        const event = readEvent(buffer)
        if (event.text && !signal.aborted) yield event.text
        return
      }
    }
  } finally {
    signal.removeEventListener('abort', cancel)
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export function createOpenAICompatibleGenerator(config: MindMapAIConfig): MindMapAIGenerator {
  return async function* (input) {
    const payload = buildMindMapAIRequest(config, input)
    const response = config.request ? await config.request(payload) : await fetch(payload.apiUrl, { method: 'POST', headers: payload.headers, body: payload.body, signal: input.signal })
    if (input.signal.aborted) { await response.body?.cancel(); return }
    yield* readMindMapAIStream(response, input.signal)
  }
}

export async function readMindMapAttachment(file: File, allowed: readonly AIAttachmentType[], maxBytes = 5 * 1024 * 1024, signal?: AbortSignal): Promise<MindMapAIAttachment> {
  signal?.throwIfAborted()
  if (file.size > maxBytes) throw new MindMapAttachmentError('size')
  let type: AIAttachmentType | undefined
  if (/^image\/(png|jpeg|gif|webp)$/i.test(file.type)) type = 'image'
  else if (file.type === 'application/pdf') type = 'pdf'
  else if (file.type.startsWith('text/') || /\.(txt|md|json|js|ts|xml|ya?ml|sql|sh|csv)$/i.test(file.name)) type = 'text'
  if (!type || !allowed.includes(type)) throw new MindMapAttachmentError('type')
  if (type === 'text') {
    const text = await file.text()
    signal?.throwIfAborted()
    return { name: file.name, mimeType: file.type, type, text }
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    const abort = () => { reader.abort(); reject(signal?.reason) }
    reader.onloadend = () => signal?.removeEventListener('abort', abort)
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new MindMapAttachmentError('read'))
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) { abort(); return }
    reader.readAsDataURL(file)
  })
  signal?.throwIfAborted()
  return { name: file.name, mimeType: file.type, type, dataUrl }
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : fallback
}

export async function readMindMapAttachments(
  files: readonly File[],
  allowed: readonly AIAttachmentType[],
  limits: MindMapAIAttachmentLimits = {},
  existing: { count: number; bytes: number } = { count: 0, bytes: 0 },
  signal?: AbortSignal,
): Promise<MindMapAIAttachment[]> {
  signal?.throwIfAborted()
  const maxCount = positiveLimit(limits.maxAttachments, 10)
  const maxTotalSize = positiveLimit(limits.maxTotalAttachmentSize, 20 * 1024 * 1024)
  const maxSize = positiveLimit(limits.maxAttachmentSize, 5 * 1024 * 1024)
  if (existing.count + files.length > maxCount) throw new MindMapAttachmentError('count')
  if (existing.bytes + files.reduce((sum, file) => sum + file.size, 0) > maxTotalSize) throw new MindMapAttachmentError('total-size')
  if (files.some((file) => file.size > maxSize)) throw new MindMapAttachmentError('size')
  const results = new Array<MindMapAIAttachment>(files.length)
  let cursor = 0
  let failed = false
  async function readNext(): Promise<void> {
    try {
      while (!failed && cursor < files.length) {
        signal?.throwIfAborted()
        const index = cursor++
        results[index] = await readMindMapAttachment(files[index], allowed, maxSize, signal)
      }
    } catch (error) {
      failed = true
      throw error
    }
  }
  const concurrency = Math.min(files.length, positiveLimit(limits.attachmentReadConcurrency, 3))
  await Promise.all(Array.from({ length: concurrency }, readNext))
  return results
}
