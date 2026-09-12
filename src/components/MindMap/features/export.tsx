import { useControllerSession } from '../runtime/useControllerSession'
import { useEffect, useRef, useState } from 'react'
import { serializeMindMap } from '../core/serializer'
import type { MindMapEditorFeature, MindMapEditorFeatureComponentProps } from '../runtime/editor-types'
import { downloadMindMapFile, exportMindMapOutline, prepareMindMapSvg, renderSvgToPng, type PrepareMindMapSvgOptions } from '../runtime/portable'
export { prepareMindMapSvg, renderSvgToPng, exportMindMapOutline } from '../runtime/portable'
export type { PrepareMindMapSvgOptions } from '../runtime/portable'

// Stable private renderer: this library module exports a feature factory, not a refresh boundary.
// eslint-disable-next-line react-refresh/only-export-components
function ExportFeatureSession({ context, options: featureOptions }: MindMapEditorFeatureComponentProps) {
  const options = (featureOptions ?? {}) as Pick<PrepareMindMapSvgOptions, 'imageResolver' | 'renderMath' | 'remoteImagePolicy'>
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => {
    pending.current?.abort()
    pending.current = null
  }, [])
  async function visual(format: 'svg' | 'png') {
    if (pending.current) return
    const abort = new AbortController()
    pending.current = abort
    setExporting(true)
    setError('')
    try {
      const svg = await prepareMindMapSvg(context.controller.getSnapshot().document, { remoteImagePolicy: context.remoteImagePolicy, ...options, signal: abort.signal, extensions: context.extensions, theme: context.theme, title: 'Open MindMap' })
      if (pending.current !== abort) return
      if (format === 'png') {
        const png = await renderSvgToPng(svg)
        if (pending.current !== abort) return
        downloadMindMapFile(png, 'image/png', 'mindmap.png')
      }
      else downloadMindMapFile(svg, 'image/svg+xml;charset=utf-8', 'mindmap.svg')
      setOpen(false)
    } catch {
      if (pending.current === abort) setError(context.messages.exportError)
    } finally {
      if (pending.current === abort) {
        pending.current = null
        setExporting(false)
      }
    }
  }
  const messages = context.messages
  return <div className="mm-feature mm-feature-export">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>{messages.export}</button>
    {error && <span role="alert">{error}</span>}
    {open && <div className="mm-feature-menu" onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') setOpen(false) }}>
      <button type="button" onClick={() => { downloadMindMapFile(serializeMindMap(context.document, { extensions: context.extensions }), 'text/markdown;charset=utf-8', 'mindmap.md'); setOpen(false) }}>{messages.exportMarkdown}</button>
      <button type="button" onClick={() => { downloadMindMapFile(JSON.stringify(context.document, null, 2), 'application/json;charset=utf-8', 'mindmap.json'); setOpen(false) }}>{messages.exportJSON}</button>
      <button type="button" disabled={exporting} onClick={() => void visual('svg')}>{messages.exportSVG}</button>
      <button type="button" disabled={exporting} onClick={() => void visual('png')}>{messages.exportPNG}</button>
      <button type="button" onClick={() => { downloadMindMapFile(exportMindMapOutline(context.document), 'text/plain;charset=utf-8', 'mindmap.txt'); setOpen(false) }}>{messages.exportOutline}</button>
    </div>}
  </div>
}

// eslint-disable-next-line react-refresh/only-export-components
function ExportFeature(props: MindMapEditorFeatureComponentProps) {
  const session = useControllerSession(props.context.controller)
  return <ExportFeatureSession key={session} {...props} />
}

export function exportFeature(options: Pick<PrepareMindMapSvgOptions, 'imageResolver' | 'renderMath' | 'remoteImagePolicy'> = {}): MindMapEditorFeature {
  return { id: 'export', placement: 'toolbar', Component: ExportFeature, options }
}
