import { useMemo, useState } from 'react'

const RUNTIMES = [
  {
    id: 'core',
    label: 'Core',
    importPath: '@xiangfa/mindmap/core',
    summary: 'Parse, layout, patch, stream, and serialize without React or the DOM.',
    included: ['Markdown parser', 'Deterministic layout', 'Patch controller', 'SVG string export'],
    excluded: ['React', 'CSS', 'Viewport UI', 'Editor features'],
  },
  {
    id: 'static',
    label: 'Static',
    importPath: '@xiangfa/mindmap/static',
    summary: 'A deterministic SVG surface for documents, reports, and server-rendered pages.',
    included: ['Core runtime', 'React SVG renderer', 'Theme tokens', 'Accessible labels'],
    excluded: ['Pan and zoom', 'Selection', 'Editing', 'Feature host'],
  },
  {
    id: 'viewer',
    label: 'Viewer',
    importPath: '@xiangfa/mindmap/viewer',
    summary: 'Read-only navigation for AI responses, dashboards, and embedded knowledge maps.',
    included: ['Static renderer', 'Pan and zoom', 'Fit view', 'Node selection'],
    excluded: ['Text inputs', 'Drag reorder', 'History', 'AI composer'],
  },
  {
    id: 'editor',
    label: 'Editor',
    importPath: '@xiangfa/mindmap/editor',
    summary: 'A focused editing surface that grows through opt-in feature modules.',
    included: ['Viewer runtime', 'Node commands', 'Keyboard editing', 'Feature slots'],
    excluded: ['History by default', 'Search by default', 'Import by default', 'AI by default'],
  },
]

function importName(id: string): string {
  if (id === 'core') return 'parseMindMap'
  if (id === 'static') return 'StaticMindMap'
  if (id === 'viewer') return 'MindMapViewer'
  return 'MindMapEditor'
}

export default function RuntimeLab() {
  const [activeId, setActiveId] = useState('viewer')
  const active = useMemo(() => RUNTIMES.find((item) => item.id === activeId) ?? RUNTIMES[2], [activeId])

  return (
    <div className="runtime-lab">
      <div className="runtime-lab__tabs" role="tablist" aria-label="Runtime footprint">
        {RUNTIMES.map((runtime) => (
          <button
            key={runtime.id}
            type="button"
            role="tab"
            aria-selected={active.id === runtime.id}
            className={active.id === runtime.id ? 'is-active' : ''}
            onClick={() => setActiveId(runtime.id)}
          >
            <span>{runtime.label}</span>
            <small>public entry</small>
          </button>
        ))}
      </div>
      <div className="runtime-lab__body">
        <div className="runtime-lab__copy">
          <span className="runtime-lab__kicker">{active.label} runtime</span>
          <h3>{active.summary}</h3>
          <button
            type="button"
            className="install-line"
            onClick={() => navigator.clipboard?.writeText(`import { ${importName(active.id)} } from '${active.importPath}'`)}
            aria-label="Copy import statement"
          >
            <code>import {'{ … }'} from <b>'{active.importPath}'</b></code>
            <span>copy</span>
          </button>
          <div className="footprint">
            <div><span>Entry graph</span><strong>Measured in build</strong></div>
            <small>Exact bundle data is shown after the current release build writes a fresh manifest.</small>
          </div>
        </div>
        <div className="runtime-lab__matrix">
          <div>
            <span className="matrix-label matrix-label--yes">Included</span>
            {active.included.map((item) => <p key={item}><i>✓</i>{item}</p>)}
          </div>
          <div>
            <span className="matrix-label">Not in this entry</span>
            {active.excluded.map((item) => <p key={item}><i>×</i>{item}</p>)}
          </div>
        </div>
      </div>
    </div>
  )
}
