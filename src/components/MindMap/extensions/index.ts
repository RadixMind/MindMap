export { tagsExtension } from './tags'
export { foldingExtension } from './folding'
export { multilineExtension } from './multiline'
export { dottedLineExtension } from './dotted-line'
export { frontmatterExtension } from './frontmatter'
export { crossLinkExtension } from './cross-link'
export { latexExtension } from './latex'

import type { MindMapExtension } from '../core/types'
import { tagsExtension } from './tags'
import { foldingExtension } from './folding'
import { multilineExtension } from './multiline'
import { dottedLineExtension } from './dotted-line'

export function basicMindMapExtensions(): MindMapExtension[] {
  return [tagsExtension(), foldingExtension(), multilineExtension(), dottedLineExtension()]
}
