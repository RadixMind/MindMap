import { useEffect, useState } from 'react'
import { tokenizeMindMapInline } from '../core/inline'
import { sanitizeMindMapUrl, authorizeMindMapImageUrl, type MindMapRemoteImagePolicy } from '../core/url'
import type { RenderMindMapToSvgOptions } from '../core/svg'

function MathContent({ text, display = false }: { text: string; display?: boolean }) {
  const [markup, setMarkup] = useState('')
  useEffect(() => {
    let active = true
    void import('katex').then((module) => {
      const html = module.default.renderToString(text, { output: 'mathml', displayMode: display, throwOnError: false, trust: false, strict: 'warn' })
      if (active) setMarkup(html)
    }).catch(() => { /* The optional peer may be absent; source math remains readable. */ })
    return () => { active = false }
  }, [text, display])
  const delimiter = display ? '$$' : '$'
  return markup ? <span dangerouslySetInnerHTML={{ __html: markup }} /> : <span>{`${delimiter}${text}${delimiter}`}</span>
}

export function InlineContent({ text, math = false, images = true, renderMath, remoteImagePolicy }: { text: string; math?: boolean; images?: boolean; remoteImagePolicy?: MindMapRemoteImagePolicy; renderMath?: RenderMindMapToSvgOptions['renderMath'] }) {
  return <>{tokenizeMindMapInline(text).map((token, index) => {
    switch (token.type) {
      case 'bold': return <strong key={index}>{token.text}</strong>
      case 'italic': return <em key={index}>{token.text}</em>
      case 'strikethrough': return <s key={index}>{token.text}</s>
      case 'code': return <code key={index}>{token.text}</code>
      case 'highlight': return <mark key={index}>{token.text}</mark>
      case 'math': {
        const delimiter = token.display ? '$$' : '$'
        const source = <span key={index}>{`${delimiter}${token.text}${delimiter}`}</span>
        if (!math) return source
        if (!renderMath) return <MathContent key={`${index}-${token.text}`} text={token.text} display={token.display} />
        try {
          const markup = renderMath(token.text, Boolean(token.display))
          return <span key={index} dangerouslySetInnerHTML={{ __html: markup }} />
        } catch {
          return source
        }
      }
      case 'link': {
        const href = sanitizeMindMapUrl(token.url)
        return href ? <a key={index} href={href} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>{token.text}</a> : <span key={index}>{token.text}</span>
      }
      case 'image': {
        const src = authorizeMindMapImageUrl(token.url, remoteImagePolicy)
        if (src && !images) return null
        return src ? <img key={index} src={src} alt={token.text} draggable={false} referrerPolicy="no-referrer" crossOrigin="anonymous" /> : <span key={index}>{token.text}</span>
      }
      default: return <span key={index}>{token.text}</span>
    }
  })}</>
}
