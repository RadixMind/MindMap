import { describe, expect, it, vi } from 'vitest'
vi.mock('katex', () => { throw new Error('Optional peer unavailable') })
import { prepareMindMapSvg } from './portable'
import { latexExtension } from '../extensions/latex'

describe('optional math peer', () => {
  it('exports plain content with a configured math extension when KaTeX is absent', async () => {
    await expect(prepareMindMapSvg({ roots: [{ id: 'root', text: 'Plain' }] }, { extensions: [latexExtension()] })).resolves.toContain('Plain')
  })
  it('retains escaped source math when KaTeX cannot load', async () => {
    const svg = await prepareMindMapSvg({ roots: [{ id: 'root', text: '$x^2$' }] }, { extensions: [latexExtension()] })
    expect(svg).toContain('$x^2$')
  })
})
