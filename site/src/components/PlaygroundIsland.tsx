import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle, Square, Zap } from 'lucide-react'
import { MindMapEditor, type MindMapEditorRef } from '@xiangfa/mindmap/editor'
import {
  basicMindMapExtensions,
  crossLinkExtension,
  frontmatterExtension,
  latexExtension,
} from '@xiangfa/mindmap/extensions'
import { historyFeature } from '@xiangfa/mindmap/features/history'
import { searchFeature } from '@xiangfa/mindmap/features/search'
import { importFeature } from '@xiangfa/mindmap/features/import'
import { exportFeature } from '@xiangfa/mindmap/features/export'
import { SITE_MAP_THEMES } from '../data/siteTheme'
import { streamRemoteMindMap } from './remoteMindMapStream'
import { useSiteTheme } from './useSiteTheme'

const DEFAULT_MARKDOWN = `Open MindMap
- Getting Started
  - Installation
    > npm install @xiangfa/mindmap
  - Quick Setup
  - Configuration
- Core Features
  - [x] Markdown Syntax
  - [x] Real-time Rendering
  - [-] AI Generation
  - [ ] Extension System
- Integrations
  - React
  - TypeScript
  - Astro
- Use Cases
  - Project Planning
  - Knowledge Base
  - Brainstorming`

interface PlaygroundIslandProps {
  defaultMarkdown?: string
  className?: string
  fullscreen?: boolean
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export default function PlaygroundIsland({
  defaultMarkdown = DEFAULT_MARKDOWN,
  className = '',
  fullscreen = false,
}: PlaygroundIslandProps) {
  const editorRef = useRef<MindMapEditorRef>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [markdown, setMarkdown] = useState(defaultMarkdown)
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const theme = useSiteTheme()
  const extensions = useMemo(() => [
    ...basicMindMapExtensions(),
    frontmatterExtension(),
    crossLinkExtension(),
    latexExtension(),
  ], [])
  const features = useMemo(() => [
    historyFeature(),
    searchFeature(),
    importFeature(),
    exportFeature(),
  ], [])

  useEffect(() => () => abortRef.current?.abort(), [])

  const stopGenerating = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const generate = useCallback(async () => {
    const value = prompt.trim()
    if (!value || isGenerating || !editorRef.current) return

    const abort = new AbortController()
    abortRef.current = abort
    setIsGenerating(true)
    setError('')

    try {
      await streamRemoteMindMap(editorRef.current.getController(), value, abort.signal)
      if (!abort.signal.aborted) setPrompt('')
    } catch (cause) {
      if (!abort.signal.aborted && !isAbort(cause)) {
        setError(cause instanceof Error ? cause.message : 'AI generation failed.')
      }
    } finally {
      if (abortRef.current === abort) abortRef.current = null
      setIsGenerating(false)
    }
  }, [isGenerating, prompt])

  const outerClass = fullscreen
    ? 'legacy-playground legacy-playground--fullscreen h-full w-full overflow-hidden bg-white dark:bg-slate-900'
    : 'legacy-playground relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] dark:border-slate-700/60 dark:bg-slate-900 dark:shadow-[0_32px_64px_-16px_rgba(0,0,0,0.4)]'
  const gridClass = fullscreen
    ? 'legacy-playground__grid grid h-full grid-cols-1 lg:grid-cols-12'
    : 'legacy-playground__grid grid grid-cols-1 lg:min-h-[720px] lg:grid-cols-12'

  return (
    <div className={`${outerClass} ${className}`.trim()} data-fullscreen={fullscreen ? 'true' : 'false'}>
      <div className={gridClass}>
        <section className="legacy-editor-panel flex min-h-0 flex-col border-b border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 lg:col-span-4 lg:border-b-0 lg:border-r" aria-label="Markdown editor and AI generator">
          <div className="flex items-center justify-between border-b border-slate-200/50 bg-white p-4 dark:border-slate-700/50 dark:bg-slate-900 md:p-5">
            <a className="text-xs font-bold uppercase tracking-widest text-slate-400" href="https://github.com/u14app/mindmap" target="_blank" rel="noopener noreferrer">Open MindMap</a>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">v0.9 runtime</span>
          </div>

          <div className="editor-scroll min-h-0 flex-grow overflow-auto font-mono text-[12px] leading-relaxed md:text-[13px]">
            <textarea
              className="legacy-markdown-editor"
              aria-label="Mind map Markdown"
              spellCheck={false}
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
            />
          </div>

          <div className="border-t border-slate-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 md:p-4">
            <div className={`flex items-center gap-2 rounded-full border bg-slate-50 p-2 transition-all dark:bg-slate-800 md:gap-3 ${isGenerating ? 'border-primary/30 ring-2 ring-primary/10' : 'border-slate-200 ring-primary/10 focus-within:ring-2 dark:border-slate-600'}`}>
              <input
                className="min-w-0 flex-grow border-none bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 disabled:opacity-60 dark:text-white dark:placeholder:text-slate-500"
                aria-label="AI mind map prompt"
                placeholder="Ask AI to generate a mind map..."
                type="text"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void generate()
                  }
                }}
                disabled={isGenerating}
              />
              <button
                type="button"
                onClick={isGenerating ? stopGenerating : () => void generate()}
                disabled={!isGenerating && !prompt.trim()}
                aria-label={isGenerating ? 'Stop AI generation' : 'Generate mind map'}
                className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white transition-all hover:bg-primary disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-primary dark:hover:text-white"
              >
                {isGenerating ? <><LoaderCircle size={16} className="animate-spin" aria-hidden="true" /><Square size={8} className="absolute" aria-hidden="true" /></> : <Zap size={16} aria-hidden="true" />}
              </button>
            </div>
            {error && <div className="legacy-ai-error" role="alert">{error}</div>}
            <p className="legacy-ai-disclosure">Prompts are sent to the public Open MindMap AI endpoint. Attachments are not sent.</p>
          </div>
        </section>

        <section className="legacy-map-panel relative min-h-[400px] overflow-hidden bg-white dark:bg-slate-900 lg:col-span-8 lg:min-h-0" aria-label="Interactive mind map">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] bg-[length:32px_32px] opacity-40 dark:bg-[radial-gradient(#334155_1px,transparent_1px)]" aria-hidden="true" />
          <div className="demo-mindmap-container relative">
            <MindMapEditor
              ref={editorRef}
              markdown={markdown}
              extensions={extensions}
              features={features}
              theme={theme}
              themeTokens={SITE_MAP_THEMES[theme]}
              remoteImagePolicy="deny"
              autoFit="initial"
              ariaLabel="Editable Open MindMap demo"
              onMarkdownChange={setMarkdown}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
