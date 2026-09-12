import type { MindMapExtension } from '../core/types'

/** Frontmatter parsing and round-trip metadata are part of the core format. */
export function frontmatterExtension(): MindMapExtension { return { id: 'frontmatter' } }
