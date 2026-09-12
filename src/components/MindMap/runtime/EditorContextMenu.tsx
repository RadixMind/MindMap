import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { MindMapThemeTokens } from '../core/types'
import { themeVariables } from './theme'

export interface EditorContextAction { label: string; disabled?: boolean; run(): void }

export function EditorContextMenu({ x, y, actions, close, theme }: { x: number; y: number; actions: EditorContextAction[]; close(): void; theme: MindMapThemeTokens }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    return () => previous?.focus()
  }, [])
  return createPortal(<div className="mm-context-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) close() }} style={themeVariables(theme)}>
    <div ref={ref} className="mm-context-menu" role="menu" style={{ left: Math.max(8, Math.min(x, window.innerWidth - 220)), top: Math.max(8, Math.min(y, window.innerHeight - actions.length * 36 - 20)) }} onKeyDown={(event) => {
      event.stopPropagation()
      if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); close(); return }
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus() }
      if (event.key === 'Home') { event.preventDefault(); buttons[0]?.focus() }
      if (event.key === 'End') { event.preventDefault(); buttons.at(-1)?.focus() }
    }}>
      {actions.map((action) => <button key={action.label} type="button" role="menuitem" disabled={action.disabled} onClick={() => { close(); action.run() }}>{action.label}</button>)}
    </div>
  </div>, document.body)
}
