import { describe, expect, it } from 'vitest'
import { parseMindMap, serializeMindMap } from '../index'

describe('modular core parser', () => {
  it('parses a bare root, tasks, remarks, and stable ids', () => {
    const document = parseMindMap('Roadmap\n- [x] Foundation\n  > shipped\n  - Runtime')
    expect(document.roots[0].id).toBe('mm-0')
    expect(document.roots[0].children?.[0].id).toBe('mm-0-0')
    expect(document.roots[0].children?.[0].attributes?.task).toEqual({ status: 'done' })
    expect(document.roots[0].children?.[0].attributes?.remark).toEqual({ text: 'shipped' })
  })

  it('round trips a basic map', () => {
    const source = 'Root\n- Branch A\n  - Leaf\n- Branch B'
    const document = parseMindMap(source)
    expect(parseMindMap(serializeMindMap(document))).toEqual(document)
  })
})

