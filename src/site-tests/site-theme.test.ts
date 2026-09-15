import { describe, expect, it } from 'vitest'
import { parseMindMap, renderMindMapToSvg } from '../components/MindMap/entries/core'
import { SITE_MAP_THEMES } from '../../site/src/data/siteTheme'

describe('website editor export colors', () => {
  it.each(['light', 'dark'] as const)('produces standalone %s SVG without website CSS dependencies', (theme) => {
    const svg = renderMindMapToSvg(parseMindMap('Roadmap\n- Research'), { theme: SITE_MAP_THEMES[theme] })
    expect(svg).not.toContain('var(')
    expect(svg).toContain(SITE_MAP_THEMES[theme].background)
    expect(svg).toContain(SITE_MAP_THEMES[theme].text)
    expect(svg).toContain('Research')
  })
})
