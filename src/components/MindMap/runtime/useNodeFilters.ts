import { useMemo } from 'react'
import type { MindMapDocument } from '../core/types'
import { walkNodes } from '../core/utils'

export function filterMindMapNodes(document: MindMapDocument, query: string, activeTags: readonly string[]) {
  const allTags = new Set<string>()
  const matchIds: string[] = []
  const parents = new Map<string, string | null>()
  const normalized = query.trim().toLocaleLowerCase()
  walkNodes(document, (node, parent) => {
    parents.set(node.id, parent?.id ?? null)
    const tags = node.attributes?.tags?.values ?? []
    tags.forEach((tag) => allTags.add(tag))
    const text = [node.text, tags.join(' '), node.attributes?.remark?.text ?? '', ...(node.attributes?.multiline?.lines ?? [])].join(' ').toLocaleLowerCase()
    if ((!normalized || text.includes(normalized)) && (!activeTags.length || activeTags.some((tag) => tags.includes(tag)))) matchIds.push(node.id)
  })
  const matchingIds = new Set(matchIds)
  for (const id of matchIds) {
    let parent = parents.get(id)
    while (parent) { matchingIds.add(parent); parent = parents.get(parent) }
  }
  return { tags: [...allTags].sort(), matchIds, matchingIds: normalized || activeTags.length ? matchingIds : null }
}

export function useNodeFilters(document: MindMapDocument, query: string, activeTags: readonly string[]) {
  return useMemo(() => filterMindMapNodes(document, query, activeTags), [document, query, activeTags])
}
