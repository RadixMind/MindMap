import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
const read = (path: string) => readFile(`${root}/${path}`, 'utf8')

describe('v0.7.1 website structure on the v0.9 Astro runtime', () => {
  it('keeps every legacy homepage section with truthful v0.9 copy', async () => {
    const [home, playground, playgroundStyles] = await Promise.all([
      read('site/src/pages/index.astro'),
      read('site/src/components/PlaygroundIsland.tsx'),
      read('site/src/styles/playground.css'),
    ])
    const highlights = home.slice(home.indexOf('const highlights = ['), home.indexOf('const extensions = ['))
    const extensions = home.slice(home.indexOf('const extensions = ['), home.indexOf('---\n<SiteLayout'))

    expect(highlights.match(/\{ icon:/g)).toHaveLength(12)
    expect(extensions.match(/\{ icon:/g)).toHaveLength(7)
    for (const text of [
      'The AI-Native',
      'Real-time AI Streaming.',
      'Everything you need.',
      'Extend with Extensions.',
      'Write Markdown.',
      'Built for the React Ecosystem.',
      'Built on open web standards',
      'Precision in Thought.',
    ]) expect(home).toContain(text)

    expect(home).toContain('<CodeHighlight code={markdownExample} language="mindmap" />')
    expect(home).toContain('<CodeHighlight code={reactExample} language="tsx" />')
    expect(home).toContain("from '@xiangfa/mindmap/editor'")
    expect(home).toContain("'@xiangfa/mindmap/styles/editor.css'")
    expect(home).not.toMatch(/Sub-10ms|48%|PHENTOM|ABXYOS|KIENTIC|Vertax|Lumena/)
    expect(playground).toContain('lg:min-h-[720px]')
    expect(playgroundStyles).toContain('.legacy-playground:not(.legacy-playground--fullscreen) > .legacy-playground__grid { min-height: 720px; }')
    expect(playgroundStyles).toContain('.editor-scroll { overscroll-behavior-y: contain; }')
  })

  it('publishes all thirteen legacy documentation anchors on one page', async () => {
    const [content, sidebar, page] = await Promise.all([
      read('site/src/components/DocsContent.tsx'),
      read('site/src/components/DocsSidebar.astro'),
      read('site/src/pages/docs/index.astro'),
    ])
    const ids = Array.from(content.matchAll(/<Section id="([^"]+)"/g), (match) => match[1])
    expect(ids).toEqual([
      'getting-started', 'basic-syntax', 'text-formatting', 'links-images', 'remarks', 'comments', 'task-status',
      'extended-syntax', 'ai-generation', 'custom-styling', 'api-reference', 'keyboard-shortcuts', 'utility-functions',
    ])
    expect(Array.from(sidebar.matchAll(/\{ id: '([^']+)'/g), (match) => match[1])).toEqual(ids)
    expect(page).toContain('<DocsContent />')
    expect(page).toContain('<DocsSidebar />')
    expect(page).not.toContain('client:')

    for (const currentApi of [
      '@xiangfa/mindmap/editor',
      '@xiangfa/mindmap/extensions',
      '@xiangfa/mindmap/features/ai',
      'MindMapDocument',
      'MindMapEditorRef',
      'createMindMapController',
      'createMarkdownStream',
    ]) expect(content).toContain(currentApi)
    for (const legacyTopic of [
      'Quick Start',
      'Markdown Input',
      'Read-only Editor',
      'Lightweight Viewer',
      'Markdown Editor Feature',
      'Ref API',
      'Listening for Changes',
      'i18n / Localization',
      'Dotted Lines',
      'Multi-line Node Content',
      'Tags',
      'Cross-node Connections',
      'Folding Markers',
      'Formula Support (LaTeX)',
      'Global Configuration (Frontmatter)',
      'File Attachments',
      'Custom System Prompt',
      'CSS Class Selectors',
      'Branch Colors',
      'SVG and PNG Export',
      'ToolbarConfig',
      'Ref Methods',
      'Data Structure',
      'MindMapViewer',
    ]) expect(content).toContain(legacyTopic)
    expect(content).not.toMatch(/MindMapData|\bPlugins?\b|allPlugins|frontMatterPlugin|exportMindMapToSVG|onDataChange|@xiangfa\/mindmap\/style\.css/)
  })

  it('keeps canonical Astro routes and redirects compatibility paths', async () => {
    const [live, playground, gettingStarted, syntax, ai, styling, api, layout, sitemap] = await Promise.all([
      read('site/src/pages/live.astro'),
      read('site/src/pages/playground.astro'),
      read('site/src/pages/docs/getting-started.astro'),
      read('site/src/pages/docs/syntax.astro'),
      read('site/src/pages/docs/ai.astro'),
      read('site/src/pages/docs/styling.astro'),
      read('site/src/pages/docs/api.astro'),
      read('site/src/layouts/SiteLayout.astro'),
      read('site/public/sitemap.xml'),
    ])

    expect(live).toContain('<PlaygroundIsland fullscreen client:load />')
    expect(playground).toContain("Astro.redirect('/live/', 301)")
    expect(gettingStarted).toContain('/docs/#getting-started')
    expect(syntax).toContain('/docs/#basic-syntax')
    expect(ai).toContain('/docs/#ai-generation')
    expect(styling).toContain('/docs/#custom-styling')
    expect(api).toContain('/docs/#api-reference')
    expect(layout).toContain("legacyHash.startsWith('#/live')")
    expect(layout).toContain("legacyHash.startsWith('#/docs')")
    expect(layout).toContain("window.addEventListener('hashchange', redirectLegacyHash)")
    expect(layout).toContain("['api', 'api-reference']")
    expect(layout).toContain('aria-current={active === \'home\' ? \'page\' : undefined} href="/">Home</a>')
    expect(sitemap).toContain('https://mindmap.u14.app/live/')
    expect(sitemap).not.toContain('/playground/')
  })
})
