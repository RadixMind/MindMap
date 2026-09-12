import { describe, expect, it } from 'vitest'
import { crossLinkExtension } from '../../extensions/cross-link'
import { multilineExtension } from '../../extensions/multiline'
import { tagsExtension } from '../../extensions/tags'
import { createMindMapController } from '../controller'
import { parseMindMap } from '../parser'
import { serializeMindMap } from '../serializer'
import type { MindMapDocument, MindMapNodeAttributes } from '../types'
import { validateMindMapDocument } from '../utils'

const document = (text = 'Root', attributes?: MindMapNodeAttributes): MindMapDocument => ({ roots: [{ id: 'root', text, ...(attributes ? { attributes } : {}) }] })
const extensions = [crossLinkExtension(), multilineExtension(), tagsExtension()]

describe('Markdown grammar admission', () => {
  it.each(['First\nSecond', 'First\rSecond', 'First\u2028Second', ' First', 'First '])('rejects unrepresentable node text %j on admission and serialization', (text) => {
    expect(() => createMindMapController(document(text))).toThrow(/one trimmed line/)
    expect(() => serializeMindMap(document(text))).toThrow(/one trimmed line/)
  })

  it.each(['bad key', 'bad:key', 'bad\nkey', ''])('rejects metadata keys outside the parser grammar: %j', (key) => {
    expect(() => serializeMindMap({ ...document(), metadata: { [key]: 'value' } })).toThrow(/metadata/)
  })

  it.each([' First', 'First ', 'First\nSecond', 'First\rSecond'])('rejects metadata values that cannot round trip: %j', (value) => {
    expect(() => serializeMindMap({ ...document(), metadata: { author: value } })).toThrow(/metadata/)
  })

  it('preserves supported Unicode, inner spaces, quotes and punctuation in metadata and text', () => {
    const input = { ...document('项目 “名字” with spaces and \'quotes\''), metadata: { 'author.name': '张三 "quoted": value', version: '' } }
    const parsed = parseMindMap(serializeMindMap(input))
    expect(parsed.roots[0].text).toBe(input.roots[0].text)
    expect(parsed.metadata).toEqual(input.metadata)
    expect(() => serializeMindMap({ ...input, direction: 'left', metadata: { direction: 'right' } })).toThrow(/Conflicting/)
  })

  it('preserves Unicode tags and rejects spaces or grammar markers in tag values', () => {
    const input = document('标签', { tags: { values: ['中文', 'café', 'tag_name-2'] } })
    expect(parseMindMap(serializeMindMap(input, { extensions }), { extensions }).roots[0].attributes?.tags).toEqual(input.roots[0].attributes?.tags)
    for (const value of ['two words', '#tag', 'tag\nnext', '']) expect(() => validateMindMapDocument(document('Root', { tags: { values: [value] } }))).toThrow(/tags/)
    for (const attributes of [{ tags: {} }, { multiline: {} }]) expect(() => validateMindMapDocument(document('Root', attributes as MindMapNodeAttributes))).toThrow(/arrays of strings/)
  })

  it('preserves empty and whitespace-bearing multiline and remark entries', () => {
    const input = document('Root', { remark: { text: '\n  note  \n' }, multiline: { lines: ['', '  content  ', ' '] } })
    const parsed = parseMindMap(serializeMindMap(input, { extensions }), { extensions })
    expect(parsed.roots[0].attributes).toEqual(input.roots[0].attributes)
    for (const line of ['one\ntwo', 'one\rtwo']) expect(() => validateMindMapDocument(document('Root', { multiline: { lines: [line] } }))).toThrow(/physical line/)
  })

  it('preserves cross-link labels with spaces, Unicode, single quotes or empty strings', () => {
    for (const label of ['', ' 名字 with spaces ', "it's a label"]) {
      const input = document('Root', { crossLink: { links: [{ target: 'target', label, dotted: false }] } })
      const parsed = parseMindMap(serializeMindMap(input, { extensions }), { extensions })
      expect((parsed.roots[0].attributes?.crossLink as { links: { label: string }[] }).links[0].label).toBe(label)
    }
    for (const label of ['a "quote"', 'one\ntwo', 'one\rtwo']) expect(() => serializeMindMap(document('Root', { crossLink: { links: [{ target: 'target', label, dotted: false }] } }), { extensions })).toThrow(/double quotes or line breaks/)
  })

  it('preserves a host cross-link when the optional dotted flag is omitted', () => {
    const input = document('Root', { crossLink: { links: [{ target: 'target', label: 'Solid' }] } })
    const parsed = parseMindMap(serializeMindMap(input, { extensions }), { extensions })
    expect((parsed.roots[0].attributes?.crossLink as { links: unknown[] }).links).toEqual([{ target: 'target', label: 'Solid', dotted: false }])
  })

  it('rejects literal recognized extension markup only when that built-in is enabled', () => {
    for (const text of ['Literal #标签', '#tag', 'Anchor {#target}', 'Link -> {#target} "Label"', 'Dotted -.> {#target}']) {
      expect(() => serializeMindMap(document(text), { extensions })).toThrow(/JSON export.*losslessly/)
      expect(parseMindMap(serializeMindMap(document(text))).roots[0].text).toBe(text)
    }
    const spaced = document('Keep  both spaces', { tags: { values: ['tag'] } })
    expect(() => serializeMindMap(spaced, { extensions })).toThrow(/JSON export.*losslessly/)
    for (const text of ['Ordinary # punctuation', 'Price #$10', 'Not an anchor {#中文}', 'Email a#tag']) {
      expect(parseMindMap(serializeMindMap(document(text), { extensions }), { extensions }).roots[0].text).toBe(text)
    }
  })

  it('rejects unsupported syntax and missing required extensions instead of dropping data', () => {
    for (const text of ['', '---', '%% comment', '> remark', '| line', '- list', '[x] literal']) expect(() => serializeMindMap(document(text))).toThrow(/syntax|structure/)
    expect(() => serializeMindMap(document('Root', { tags: { values: ['tag'] } }))).toThrow(/requires the tags extension/)
    expect(() => serializeMindMap(document('Root', { connection: { label: 'edge' } }))).toThrow(/JSON export/)
    for (const text of ['**Bold**', '-word']) expect(parseMindMap(serializeMindMap(document(text))).roots[0].text).toBe(text)
    expect(parseMindMap(serializeMindMap(document('', { syntax: { listRoot: true }, task: { status: 'done' } }))).roots[0].attributes?.task?.status).toBe('done')
  })
})
