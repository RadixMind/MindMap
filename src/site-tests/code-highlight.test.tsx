// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CodeHighlight from '../../site/src/components/codeHighlight'

function render(code: string, language: string): HTMLElement {
  document.body.innerHTML = renderToStaticMarkup(<code><CodeHighlight code={code} language={language} /></code>)
  return document.body.firstElementChild as HTMLElement
}

describe('documentation syntax highlighting', () => {
  it.each([
    ['tsx', "import { MindMapEditor } from '@xiangfa/mindmap/editor'\nreturn <MindMapEditor markdown={content} />", ['hl-kw', 'hl-str', 'hl-tag', 'hl-attr']],
    ['bash', '# pnpm\npnpm add @xiangfa/mindmap', ['hl-cmt', 'hl-fn', 'hl-kw', 'hl-str']],
    ['css', '.mm-surface { color: #61afef; }', ['hl-tag', 'hl-fn', 'hl-num', 'hl-op']],
    ['mindmap', 'Roadmap\n- [x] Ship #release\n  - Related -.> {#target} "review"\n  > Verified', ['hl-root', 'hl-op', 'hl-str', 'hl-kw', 'hl-fn', 'hl-cmt']],
  ])('colors %s snippets while preserving the original source', (language, source, classes) => {
    const code = render(source, language)
    expect(code.textContent).toBe(source)
    for (const className of classes) expect(code.querySelector(`.${className}`)).not.toBeNull()
  })
})
