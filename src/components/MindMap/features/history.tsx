import type { MindMapEditorFeature, MindMapEditorFeatureComponentProps } from '../runtime/editor-types'

// Stable private renderer: this library module exports a feature factory, not a refresh boundary.
// eslint-disable-next-line react-refresh/only-export-components
function HistoryFeature({ context }: MindMapEditorFeatureComponentProps) {
  return <div className="mm-feature mm-feature-history" aria-label="History controls">
    <button type="button" onClick={() => void context.executeCommand('undo')} disabled={!context.snapshot.canUndo} aria-label={context.messages.undo}>↶</button>
    <button type="button" onClick={() => void context.executeCommand('redo')} disabled={!context.snapshot.canRedo} aria-label={context.messages.redo}>↷</button>
  </div>
}

export function historyFeature(): MindMapEditorFeature {
  return { id: 'history', placement: 'toolbar', Component: HistoryFeature }
}
