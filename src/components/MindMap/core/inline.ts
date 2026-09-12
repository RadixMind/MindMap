import { MAX_MINDMAP_CONTENT_LENGTH, MAX_MINDMAP_INLINE_TOKENS_PER_LINE, MAX_MINDMAP_IMAGES } from './limits'

export type MindMapInlineToken =
  | { type: 'text' | 'bold' | 'italic' | 'strikethrough' | 'code' | 'highlight'; text: string }
  | { type: 'math'; text: string; display?: boolean }
  | { type: 'link' | 'image'; text: string; url: string }

type TokenType = MindMapInlineToken['type']
type Emit = (type: TokenType, start: number, end: number, urlStart?: number, urlEnd?: number, display?: boolean) => void

/** Monotonic delimiter cursors avoid retrying the same suffix for malformed input.
 * The scanner preserves the previous leftmost match and alternative precedence. */
function scan(source: string, emit: Emit): void {
  if (typeof source !== 'string' || source.length > MAX_MINDMAP_CONTENT_LENGTH) throw new Error('Mind map inline source exceeds 1000000 characters or is not a string')
  const cursors = new Map<string, number>()
  function next(delimiter: string, from: number): number {
    const prior = cursors.get(delimiter)
    if (prior !== undefined && prior >= from) return prior
    const found = source.indexOf(delimiter, from)
    const result = found < 0 ? Infinity : found
    cursors.set(delimiter, result)
    return result
  }
  const urls = new Map<number, number>()
  let plain = 0
  let i = 0
  while (i < source.length) {
    let type: TokenType | undefined
    let start = i, end = i, after = i
    let urlStart: number | undefined, urlEnd: number | undefined, display: boolean | undefined
    const image = source.startsWith('![', i)
    if (image || source[i] === '[') {
      start = i + (image ? 2 : 1)
      end = next(']', start)
      if (end < source.length && (image || end > start) && source[end + 1] === '(') {
        urlStart = end + 2
        urlEnd = urls.get(urlStart)
        if (urlEnd === undefined) {
          urlEnd = urlStart
          while (urlEnd < source.length && !/[\s)]/.test(source[urlEnd])) urlEnd++
          urls.set(urlStart, urlEnd)
        }
        if (urlEnd > urlStart && source[urlEnd] === ')') { type = image ? 'image' : 'link'; after = urlEnd + 1 }
      }
    }
    if (!type) {
      const alternatives: readonly [string, TokenType, boolean?][] = source[i] === '`' ? [['`', 'code']]
        : source[i] === '*' ? [['**', 'bold'], ['*', 'italic']]
        : source[i] === '_' ? [['__', 'bold'], ['_', 'italic']]
        : source[i] === '~' ? [['~~', 'strikethrough']]
        : source[i] === '=' ? [['==', 'highlight']]
        : source[i] === '$' ? [['$$', 'math', true], ['$', 'math']] : []
      for (const [delimiter, candidate, block] of alternatives) {
        if (!source.startsWith(delimiter, i)) continue
        start = i + delimiter.length
        // Single delimiters forbid their delimiter in the body; paired ones
        // accept a delimiter at body start as long as the body is nonempty.
        end = next(delimiter, start + (delimiter.length === 2 ? 1 : 0))
        if (end <= start || end === Infinity) continue
        const noLineBreak = delimiter.length === 2 && !block
        if ((noLineBreak && Math.min(next('\n', start), next('\r', start), next('\u2028', start), next('\u2029', start)) < end) || (delimiter === '$' && next('\n', start) < end)) continue
        type = candidate; after = end + delimiter.length; display = block
        break
      }
    }
    if (type) {
      if (plain < i) emit('text', plain, i)
      emit(type, start, end, urlStart, urlEnd, display)
      i = after
      plain = i
    } else i++
  }
  if (plain < source.length) emit('text', plain, source.length)
}

/** Bounded analysis does not allocate token text or URL substrings. */
export function analyzeMindMapInline(source: string): { tokens: number; images: number } {
  let tokens = 0, images = 0
  scan(source, (type) => {
    if (++tokens > MAX_MINDMAP_INLINE_TOKENS_PER_LINE) throw new Error('Mind map inline token limit exceeded')
    if (type === 'image' && ++images > MAX_MINDMAP_IMAGES) throw new Error('Mind map image limit exceeded')
  })
  return { tokens, images }
}

/** A single bounded tokenizer shared by React and portable SVG export. */
export function tokenizeMindMapInline(source: string): MindMapInlineToken[] {
  const tokens: MindMapInlineToken[] = []
  let images = 0
  scan(source, (type, start, end, urlStart, urlEnd, display) => {
    if (tokens.length >= MAX_MINDMAP_INLINE_TOKENS_PER_LINE) throw new Error('Mind map inline token limit exceeded')
    if (type === 'image' && ++images > MAX_MINDMAP_IMAGES) throw new Error('Mind map image limit exceeded')
    const text = source.slice(start, end)
    if (type === 'image' || type === 'link') tokens.push({ type, text, url: source.slice(urlStart, urlEnd) })
    else if (type === 'math') tokens.push({ type, text, ...(display ? { display } : {}) })
    else tokens.push({ type, text })
  })
  return tokens
}
