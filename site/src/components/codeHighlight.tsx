import type { ReactNode } from 'react'

interface HighlightToken {
  className?: string
  text: string
}

const token = (text: string, className?: string): HighlightToken => ({ text, className })

function renderLines(lines: HighlightToken[][]): ReactNode {
  return lines.map((tokens, lineIndex) => <span key={lineIndex}>
    {tokens.map((item, tokenIndex) => item.className
      ? <span key={tokenIndex} className={item.className}>{item.text}</span>
      : <span key={tokenIndex}>{item.text}</span>)}
    {lineIndex < lines.length - 1 ? '\n' : null}
  </span>)
}

const TSX_KEYWORDS = new Set([
  'as', 'async', 'await', 'boolean', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'default', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function',
  'if', 'implements', 'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null', 'number',
  'of', 'private', 'protected', 'public', 'readonly', 'return', 'static', 'string', 'switch',
  'throw', 'true', 'try', 'type', 'typeof', 'undefined', 'var', 'void', 'while', 'yield',
])

function highlightTsxLine(line: string): HighlightToken[] {
  const tokens: HighlightToken[] = []
  const pattern = /(\{\/\*[\s\S]*?\*\/\}|\/\/[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(<\/?[\w.]+|\/?>)|(=>|\.{3}|\?\.|[!=]==?|&&|\|\||[{}()[\],.:;])|(\b\d+\.?\d*\b)|([\w$]+)/g
  let match: RegExpExecArray | null
  let cursor = 0
  while ((match = pattern.exec(line)) !== null) {
    if (match.index > cursor) tokens.push(token(line.slice(cursor, match.index)))
    const [value, comment, string, tag, operator, number, word] = match
    if (comment) tokens.push(token(value, 'hl-cmt'))
    else if (string) tokens.push(token(value, 'hl-str'))
    else if (tag) tokens.push(token(value, 'hl-tag'))
    else if (operator) tokens.push(token(value, 'hl-op'))
    else if (number) tokens.push(token(value, 'hl-num'))
    else if (word) {
      const tail = line.slice(pattern.lastIndex)
      if (TSX_KEYWORDS.has(word)) tokens.push(token(value, 'hl-kw'))
      else if (/^\s*\(/.test(tail)) tokens.push(token(value, 'hl-fn'))
      else if (/^\s*[=:]/.test(tail) && /<[\w.]+[^>]*$/.test(line.slice(0, match.index))) tokens.push(token(value, 'hl-attr'))
      else tokens.push(token(value))
    }
    cursor = pattern.lastIndex
  }
  if (cursor < line.length) tokens.push(token(line.slice(cursor)))
  return tokens
}

function highlightCssLine(line: string): HighlightToken[] {
  const tokens: HighlightToken[] = []
  const pattern = /(\/\*.*?\*\/|\/\/[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(#(?:[0-9a-fA-F]{3,8})\b)|(--[\w-]+)|(\.[\w-]+(?:\[[^\]]+\])?|#[\w-]+)|(\b\d+\.?\d*(?:px|em|rem|%|d?vh|d?vw|s|ms|deg|fr|ch)?\b)|([\w-]+)(?=\s*:)|([{};:,])/g
  let match: RegExpExecArray | null
  let cursor = 0
  while ((match = pattern.exec(line)) !== null) {
    if (match.index > cursor) tokens.push(token(line.slice(cursor, match.index)))
    const [value, comment, string, hex, variable, selector, number, property, punctuation] = match
    if (comment) tokens.push(token(value, 'hl-cmt'))
    else if (string) tokens.push(token(value, 'hl-str'))
    else if (hex || variable || number) tokens.push(token(value, 'hl-num'))
    else if (selector) tokens.push(token(value, 'hl-tag'))
    else if (property) tokens.push(token(value, 'hl-fn'))
    else if (punctuation) tokens.push(token(value, 'hl-op'))
    cursor = pattern.lastIndex
  }
  if (cursor < line.length) tokens.push(token(line.slice(cursor)))
  return tokens
}

function highlightBashLine(line: string): HighlightToken[] {
  if (!line.trim()) return [token(line)]
  if (line.trimStart().startsWith('#')) return [token(line, 'hl-cmt')]
  const match = line.match(/^(\s*)([\w-]+)(?:\s+([\w-]+))?(?:\s+(.*))?$/)
  if (!match) return [token(line)]
  const [, indent, command, subcommand, args] = match
  const tokens = [token(indent), token(command, 'hl-fn')]
  if (subcommand) tokens.push(token(' '), token(subcommand, 'hl-kw'))
  if (args) tokens.push(token(' '), token(args, 'hl-str'))
  return tokens
}

function highlightMindMapInline(value: string): HighlightToken[] {
  const tokens: HighlightToken[] = []
  const pattern = /(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|==[^=]+==|#[a-zA-Z][\w-]*|\$\$[^$]+\$\$|\$[^$\n]+\$|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|(?:->|-\.>)\s*\{#[\w-]+\}(?:\s*"[^"]*")?|\{#[\w-]+\}|\*(?!\*)[^*]+\*(?!\*))/g
  let match: RegExpExecArray | null
  let cursor = 0
  while ((match = pattern.exec(value)) !== null) {
    if (match.index > cursor) tokens.push(token(value.slice(cursor, match.index)))
    const text = match[0]
    if (text.startsWith('**')) tokens.push(token(text, 'hl-root'))
    else if (text.startsWith('~~')) tokens.push(token(text, 'hl-cmt'))
    else if (text.startsWith('`')) tokens.push(token(text, 'hl-tag'))
    else if (text.startsWith('==') || text.startsWith('$')) tokens.push(token(text, 'hl-num'))
    else if (text.startsWith('![') || text.startsWith('[') || text.includes('->') || text.includes('-.>')) tokens.push(token(text, 'hl-fn'))
    else if (text.startsWith('{#')) tokens.push(token(text, 'hl-attr'))
    else if (text.startsWith('#')) tokens.push(token(text, 'hl-kw'))
    else tokens.push(token(text, 'hl-italic'))
    cursor = pattern.lastIndex
  }
  if (cursor < value.length) tokens.push(token(value.slice(cursor)))
  return tokens
}

function highlightMindMap(code: string): ReactNode {
  let inFrontmatter = false
  const lines = code.split('\n').map((line): HighlightToken[] => {
    if (!line.trim()) return [token(line)]
    if (line.trim() === '---') {
      inFrontmatter = !inFrontmatter
      return [token(line, 'hl-op')]
    }
    if (inFrontmatter) {
      const match = line.match(/^(\s*)([\w-]+)(\s*:\s*)(.*)$/)
      return match
        ? [token(match[1]), token(match[2], 'hl-attr'), token(match[3], 'hl-op'), token(match[4], 'hl-str')]
        : [token(line)]
    }
    const comment = line.match(/^(\s*)(%%.*|>.*)$/)
    if (comment) return [token(comment[1]), token(comment[2], 'hl-cmt')]
    const detail = line.match(/^(\s*)(\|)(.*)$/)
    if (detail) return [token(detail[1]), token(detail[2], 'hl-op'), ...highlightMindMapInline(detail[3])]
    const list = line.match(/^(\s*)([-+]\.?\s)(.*)$/)
    if (list) {
      const tokens = [token(list[1]), token(list[2], 'hl-op')]
      const task = list[3].match(/^\[([ x-])\](\s*)(.*)$/)
      if (!task) return [...tokens, ...highlightMindMapInline(list[3])]
      const statusClass = task[1] === 'x' ? 'hl-str' : task[1] === '-' ? 'hl-num' : 'hl-task-pending'
      return [...tokens, token(`[${task[1]}]`, statusClass), token(task[2]), ...highlightMindMapInline(task[3])]
    }
    return [token(line, 'hl-root')]
  })
  return renderLines(lines)
}

function highlightCode(code: string, language?: string): ReactNode {
  if (language === 'tsx' || language === 'typescript') return renderLines(code.split('\n').map(highlightTsxLine))
  if (language === 'bash') return renderLines(code.split('\n').map(highlightBashLine))
  if (language === 'css') return renderLines(code.split('\n').map(highlightCssLine))
  if (language === 'mindmap') return highlightMindMap(code)
  return code
}

export default function CodeHighlight({ code, language }: { code: string; language?: string }) {
  return <>{highlightCode(code, language)}</>
}
