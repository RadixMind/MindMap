import { describe, expect, it } from 'vitest'
import { createMindMapController } from '../controller'
import type { MindMapControllerEvent } from '../types'

function setup() {
  const controller = createMindMapController('Original')
  const events: MindMapControllerEvent[] = []
  controller.subscribeEvents((event) => events.push(event))
  return { controller, events, phases: () => events.map((event) => event.phase) }
}

describe('controller event phases', () => {
  it('publishes live transaction previews followed by exactly one commit and one undo', () => {
    const { controller, events, phases } = setup()
    const transaction = controller.beginTransaction()
    transaction.setMarkdown('First')
    transaction.setMarkdown('Final')
    expect(controller.getSnapshot().document.roots[0].text).toBe('Final')
    expect(controller.getSnapshot().canUndo).toBe(false)
    transaction.commit()
    expect(phases()).toEqual(['preview', 'preview', 'commit'])
    expect(events[2].current.document).toBe(events[1].current.document)
    expect(events[2].patches).toEqual([])
    expect(events[2].current.canUndo).toBe(true)
    controller.undo()
    expect(controller.getSnapshot().document.roots[0].text).toBe('Original')
    expect(phases()).toEqual(['preview', 'preview', 'commit', 'commit'])
    controller.dispose()
  })

  it('marks cancellation including empty cancellation as rollback', () => {
    const { controller, phases } = setup()
    const transaction = controller.beginTransaction()
    transaction.setMarkdown('Preview')
    transaction.cancel()
    expect(controller.getSnapshot().document.roots[0].text).toBe('Original')
    expect(controller.getSnapshot().canUndo).toBe(false)
    controller.beginTransaction().cancel()
    expect(phases()).toEqual(['preview', 'rollback', 'rollback'])
    controller.dispose()
  })

  it('marks selection and projection changes separately without ending the transaction', () => {
    const { controller, phases } = setup()
    const transaction = controller.beginTransaction()
    transaction.setMarkdown('Preview')
    controller.selectNode('mm-0')
    controller.recompute()
    expect(transaction.isActive()).toBe(true)
    transaction.commit()
    expect(phases()).toEqual(['preview', 'change', 'change', 'commit'])
    controller.dispose()
  })

  it('rolls back a preview before committing a concurrent edit and rejects late writes', () => {
    const { controller, phases } = setup()
    const transaction = controller.beginTransaction('stream')
    transaction.setMarkdown('Preview')
    controller.updateNode('mm-0', { text: 'User edit' })
    expect(phases()).toEqual(['preview', 'rollback', 'commit'])
    expect(transaction.setMarkdown('Late')).toBe(false)
    expect(transaction.commit()).toBe(false)
    controller.undo()
    expect(controller.getSnapshot().document.roots[0].text).toBe('Original')
    controller.dispose()
  })

  it('does not invalidate a preview for malformed concurrent host input', () => {
    const { controller, phases } = setup()
    const transaction = controller.beginTransaction('stream')
    transaction.setMarkdown('Preview')
    controller.updateNode('mm-0', { text: 'Bad\nline' })
    expect(() => controller.setMarkdown('x'.repeat(1_000_001))).toThrow()
    expect(transaction.isActive()).toBe(true)
    expect(phases()).toEqual(['preview'])
    transaction.cancel()
    controller.dispose()
  })

  it('ends successful streams in one commit and failed streams in rollback', async () => {
    const { controller, phases } = setup()
    const stream = controller.createMarkdownStream()
    stream.append('Generated')
    await stream.flush()
    expect(phases()).toEqual(['preview'])
    expect(await stream.commit()).toBe(true)
    expect(phases()).toEqual(['preview', 'commit'])
    const failed = controller.createMarkdownStream()
    failed.append('Partial')
    await failed.flush()
    expect(() => failed.append('x'.repeat(1_000_001))).toThrow()
    expect(phases()).toEqual(['preview', 'commit', 'preview', 'rollback'])
    expect(controller.getSnapshot().document.roots[0].text).toBe('Generated')
    controller.dispose()
  })

  it('publishes authoritative replacement once and invalidates the old owner', () => {
    const { controller, phases } = setup()
    const transaction = controller.beginTransaction('stream')
    transaction.setMarkdown('Preview')
    controller.replaceDocument({ roots: [{ id: 'host', text: 'Replacement' }] })
    expect(phases()).toEqual(['preview', 'commit'])
    expect(transaction.cancel()).toBe(false)
    expect(controller.getSnapshot().document.roots[0].text).toBe('Replacement')
    expect(controller.getSnapshot().canUndo).toBe(false)
    controller.dispose()
  })
})
