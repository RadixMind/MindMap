import { useCallback, useMemo, useState } from 'react'
import { MindMapEditor } from '@xiangfa/mindmap/editor'
import { basicMindMapExtensions } from '@xiangfa/mindmap/extensions'
import { historyFeature } from '@xiangfa/mindmap/features/history'
import { searchFeature } from '@xiangfa/mindmap/features/search'
import { importFeature } from '@xiangfa/mindmap/features/import'
import { exportFeature } from '@xiangfa/mindmap/features/export'
import { markdownEditorFeature } from '@xiangfa/mindmap/features/markdown-editor'
import { aiFeature } from '@xiangfa/mindmap/features/ai'
import { useSiteTheme } from './useSiteTheme'

const DEFAULT_MARKDOWN = `Open MindMap v0.9.0
- Modular runtime #architecture
  - Core has no React or DOM
  - Static renders deterministic SVG
  - Viewer adds viewport navigation
  - Editor hosts opt-in features
- AI-native workflow #streaming
  - Markdown arrives in chunks
  - Parser emits stable patches
  - Layout preserves the viewport
- Product quality #delivery
  - Split JavaScript and CSS
  - Accessible keyboard commands
  - Verification stays close to the code`

const AI_RESULT = `AI product launch
- Discover
  - Interview target users
  - Map recurring pain points
  - Define measurable outcomes
- Design
  - Prototype the critical journey
  - Validate interaction states
  - Establish accessibility rules
- Build
  - Ship the smallest coherent slice
  - Measure bundle and runtime cost
  - Add features through extensions
- Learn
  - Review product signals
  - Record decisions
  - Iterate with evidence`

function countNodes(value: unknown): number {
  if (!value || typeof value !== 'object') return 0
  const root = value as { roots?: unknown[]; children?: unknown[] }
  const list = Array.isArray(root.roots) ? root.roots : [value]
  const visit = (node: unknown): number => {
    if (!node || typeof node !== 'object') return 0
    const children = (node as { children?: unknown[] }).children ?? []
    return 1 + children.reduce<number>((sum, child) => sum + visit(child), 0)
  }
  return list.reduce<number>((sum, node) => sum + visit(node), 0)
}

function countMarkdownNodes(markdown: string): number {
  return markdown.split('\n').filter((line) => line.trim().length > 0 && !line.trim().startsWith('%%')).length
}

async function* demoGenerator(input: unknown) {
  const payload = typeof input === 'object' && input ? input as { prompt?: unknown; signal?: AbortSignal } : null
  const prompt = typeof input === 'string' ? input : String(payload?.prompt ?? '')
  const signal = payload?.signal
  // Deterministic QA seam: this exact prompt exercises rollback and error UI.
  if (prompt.trim() === 'Simulate provider failure') throw new Error('Simulated provider failure')
  const title = prompt.trim() ? prompt.trim().slice(0, 52) : 'AI product launch'
  const output = AI_RESULT.replace('AI product launch', title)
  let cursor = 0
  while (cursor < output.length) {
    if (signal?.aborted) return
    const previousCursor = cursor
    cursor = Math.min(output.length, cursor + 12)
    yield output.slice(previousCursor, cursor)
    await new Promise((resolve) => window.setTimeout(resolve, 28))
  }
}

export default function PlaygroundIsland() {
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN)
  const [nodeCount, setNodeCount] = useState(() => countMarkdownNodes(DEFAULT_MARKDOWN))
  const [lastEvent, setLastEvent] = useState('ready')
  const extensions = useMemo(() => basicMindMapExtensions(), [])
  const theme = useSiteTheme()
  const features = useMemo(() => [
    historyFeature(),
    searchFeature(),
    importFeature(),
    exportFeature(),
    markdownEditorFeature(),
    aiFeature({
      generate: demoGenerator,
      generator: demoGenerator,
      placeholder: 'Describe the map to generate…',
      buttonLabel: 'Generate',
    }),
  ], [])

  const handleDocument = useCallback((document: unknown) => {
    setNodeCount(countNodes(document))
  }, [])

  return (
    <div className="playground-app">
      <div className="playground-app__topbar">
        <div>
          <span className="status-dot" />
          <strong>Modular editor</strong>
          <span>all optional features enabled for this demo</span>
        </div>
        <div className="playground-app__metrics">
          <span><b>{nodeCount}</b> nodes</span>
          <span><b>SVG</b> renderer</span>
          <span><b>{lastEvent}</b></span>
        </div>
      </div>
      <div className="playground-app__surface">
        <MindMapEditor
          markdown={markdown}
          extensions={extensions}
          features={features}
          theme={theme}
          autoFit="initial"
          autoFitPolicy="initial"
          onMarkdownChange={setMarkdown}
          onDocumentChange={handleDocument}
          onEvent={(event: unknown) => {
            if (event && typeof event === 'object' && 'reason' in event) setLastEvent(String((event as { reason: unknown }).reason))
          }}
        />
      </div>
      <div className="playground-app__hint">
        <span><kbd>Enter</kbd> edit</span>
        <span><kbd>Tab</kbd> child</span>
        <span><kbd>⌘ Z</kbd> history</span>
        <span><kbd>drag</kbd> pan</span>
        <span>Advanced tools are independent feature modules.</span>
      </div>
    </div>
  )
}
