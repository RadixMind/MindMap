import { useEffect, useMemo, useState } from 'react'
import { MindMapViewer } from '@xiangfa/mindmap/viewer'
import { basicMindMapExtensions } from '@xiangfa/mindmap/extensions'
import { useSiteTheme } from './useSiteTheme'

const SOURCE = `Open MindMap
- Modular runtime
  - Static SVG
  - Lightweight Viewer
  - Composable Editor
- AI native
  - Streaming Markdown
  - Incremental patches
  - Stable layout
- Ship less
  - Import only what you use
  - Split JavaScript and CSS`

export default function HeroMindMap() {
  const [markdown, setMarkdown] = useState(SOURCE)
  const [playing, setPlaying] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(false)
  const extensions = useMemo(() => basicMindMapExtensions(), [])
  const theme = useSiteTheme()

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncReducedMotion = () => setReducedMotion(media.matches)
    syncReducedMotion()
    media.addEventListener?.('change', syncReducedMotion)
    return () => media.removeEventListener?.('change', syncReducedMotion)
  }, [])

  useEffect(() => {
    if (!playing || reducedMotion) return
    let index = 0
    let timer = 0
    const step = () => {
      index = Math.min(SOURCE.length, index + (index < 18 ? 2 : 4))
      setMarkdown(SOURCE.slice(0, index))
      if (index < SOURCE.length) timer = window.setTimeout(step, 38)
      else timer = window.setTimeout(() => {
        index = 0
        setMarkdown('')
        timer = window.setTimeout(step, 380)
      }, 4200)
    }
    timer = window.setTimeout(step, 500)
    return () => window.clearTimeout(timer)
  }, [playing, reducedMotion])

  return (
    <div className="hero-runtime">
      <div className="hero-runtime__bar">
        <div className="traffic" aria-hidden="true"><i /><i /><i /></div>
        <span>viewer.tsx</span>
        <span className="hero-runtime__status"><i /> {reducedMotion ? 'static preview' : playing ? 'streaming' : 'paused'}</span>
        <button className="hero-runtime__control" type="button" disabled={reducedMotion} aria-pressed={!playing} onClick={() => setPlaying((value) => !value)}>
          {reducedMotion ? 'Motion reduced' : playing ? 'Pause demo' : 'Play demo'}
        </button>
      </div>
      <div className="hero-runtime__canvas">
        <MindMapViewer
          markdown={markdown}
          extensions={extensions}
          theme={theme}
          toolbar={false}
          selectable
          autoFit="always"
          autoFitPolicy="always"
          ariaLabel="Streaming Open MindMap demo"
        />
      </div>
      <div className="hero-runtime__legend">
        <span><kbd>drag</kbd> pan</span>
        <span><kbd>scroll</kbd> zoom</span>
        <span className="hero-runtime__live"><i /> live component</span>
      </div>
    </div>
  )
}
