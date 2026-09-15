import type { MindMapThemeTokens } from '@xiangfa/mindmap/core'

// Use literal colors: editor export embeds these values in standalone SVG/PNG.
// CSS variables would depend on the website stylesheet after downloading.
export const SITE_MAP_THEMES: Record<'light' | 'dark', Partial<MindMapThemeTokens>> = {
  light: {
    background: '#FFFFFF', text: '#253044', mutedText: '#748096',
    rootFill: '#334155', rootText: '#FFFFFF', selection: '#007AFF',
    branches: ['#FF646B', '#43C6C3', '#8FD1B5', '#42B2D0', '#FFD87A', '#6CA9FF'],
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  dark: {
    background: '#171A23', text: '#E2E8F0', mutedText: '#94A3B8',
    rootFill: '#E2E8F0', rootText: '#0F172A', selection: '#60A5FA',
    branches: ['#FF7B81', '#5DD8D4', '#9DE0C3', '#5CC6E2', '#FFE195', '#82B8FF'],
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
}
