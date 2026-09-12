/** Hard admission limits, applied before cloning, layout, rendering or host callbacks.
 * Counts use UTF-16 code units and include hidden/folded content. */
export const MAX_MINDMAP_ID_LENGTH = 256
export const MAX_MINDMAP_CONTENT_LENGTH = 1_000_000
export const MAX_MINDMAP_NODES = 20_000
export const MAX_MINDMAP_DEPTH = 256
export const MAX_MINDMAP_TAGS_PER_NODE = 128
export const MAX_MINDMAP_MULTILINE_LINES = 256
export const MAX_MINDMAP_CROSS_LINKS_PER_NODE = 64
export const MAX_MINDMAP_ATTRIBUTE_COLLECTION = 1024
export const MAX_MINDMAP_ATTRIBUTE_ENTRIES = 100_000
export const MAX_MINDMAP_RENDER_PRIMITIVES = 100_000
export const MAX_MINDMAP_INLINE_TOKENS_PER_LINE = 4096
export const MAX_MINDMAP_IMAGES = 64
export const MAX_MINDMAP_COMMENTS = 4096
export const MAX_MINDMAP_METADATA_ENTRIES = 256
/** Larger diffs become one replacement; larger direct batches are rejected atomically. */
export const MAX_MINDMAP_PATCHES = 256
