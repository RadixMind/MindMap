# Extended Mindmap Syntax Support

Open MindMap keeps the core Markdown-like parser small and adds opt-in behavior through `MindMapExtension` objects. An Extension can transform a parsed node, preserve syntax during serialization, filter visible children, transform parent-child edges, or transform a completed layout.

## Enable Extensions

The basic helper returns the four Extensions that are most common in an interactive map:

```tsx
import { parseMindMap, serializeMindMap } from '@xiangfa/mindmap/core'
import {
  basicMindMapExtensions,
  crossLinkExtension,
  latexExtension,
} from '@xiangfa/mindmap/extensions'

const extensions = [
  ...basicMindMapExtensions(), // tags, folding, multiline, dotted-line
  crossLinkExtension(),
  latexExtension(),
]

const document = parseMindMap(markdown, { extensions })
const output = serializeMindMap(document, { extensions })
```

Pass the same stable Extension list to `MindMapViewer`, `MindMapEditor`, `StaticMindMap`, `layoutMindMap`, and `renderMindMapToSvg` when those paths need the syntax. No Extension is enabled automatically. Keep a list stable between React renders so the runtime can reuse its compiled extension graph; create factories at module scope or memoize them in the host component.

The package provides these public Extension factories:

| Factory | ID | Main behavior | Included by `basicMindMapExtensions()` |
| --- | --- | --- | :---: |
| `tagsExtension()` | `tags` | Extract `#tag` values and render/filter tag badges | Yes |
| `foldingExtension()` | `folding` | Store collapsed branches and hide their projected descendants | Yes |
| `multilineExtension()` | `multiline` | Store `|` continuation lines in a node | Yes |
| `dottedLineExtension()` | `dotted-line` | Mark `-.` child edges as dashed | Yes |
| `crossLinkExtension()` | `cross-link` | Add anchors and cross-branch edges | No |
| `frontmatterExtension()` | `frontmatter` | Named entry for the core frontmatter contract | No |
| `latexExtension()` | `latex` | Mark math-bearing nodes for optional LaTeX rendering | No |

Frontmatter parsing and document projection are currently performed by the core parser. The named frontmatter Extension keeps the feature discoverable and gives an explicit extension registry a stable ID; it does not add a second YAML parser.

## Dotted lines

Use `-.` as a child marker when the relationship should be shown as a dashed edge:

```mindmap
Machine Learning
- Supervised Learning
  - Classification
  -. Optional feature branch
```

With `dottedLineExtension()` enabled, the child receives `attributes.connection.dotted: true`, and the parent-child `MindMapLayoutEdge` has `dotted: true`. The React Scene and portable SVG renderer turn that flag into a dashed path. The marker is still parsed as a list item without the Extension, but it has no dotted-line attribute or presentation effect.

The Extension serializes the dotted marker only when it is present in the serializer's Extension list. Use `-.>` for a dotted cross-link; that form belongs to the Cross-link Extension below.

## Multiline node content

With `multilineExtension()` enabled, a line beginning with `|` is appended to the most recently parsed node:

```mindmap
Machine Learning
- Classification
  | **Input**: feature vector X
  | **Output**: category Y
```

The lines are stored as `attributes.multiline.lines[]` and rendered inside the node. Each continuation line is tokenized with the same inline tokenizer as the primary label, so formatting, links, images, and math can be used there as well.

`|` must occur after a node. Without the Multiline Extension, a line beginning with `|` is treated as ordinary source text and becomes a root according to the normal parser rules. Remarks and multiline lines are separate attributes:

| Source | Stored as | Display |
| --- | --- | --- |
| `> supporting text` | `attributes.remark.text` | Supporting node information and SVG title |
| `| additional line` | `attributes.multiline.lines[]` | Additional in-node line |

## Tags

Use `#tag` in a node label to attach searchable categories:

```mindmap
Tech Stack
- React #frontend #javascript
  - Next.js #framework #ssr
- Python #backend #ml
```

`tagsExtension()` recognizes a tag after the beginning of the label or whitespace when it contains Unicode letters or numbers plus `_` and `-`. It removes the tag text from the primary label and stores the values in `attributes.tags.values`. It serializes those values back as `#tag` suffixes and renders them as badges. The Editor's optional Search Feature can use those values for active tag filtering.

Without the Tags Extension, `#frontend` remains ordinary label text. If a host edits `attributes.tags` directly, pass the Tags Extension to the serializer to retain the tag syntax.

## Cross-node connections

The Cross-link Extension defines an anchor with `{#id}` and adds an outgoing edge with `-> {#id}`. A quoted label can follow the target; `-.>` creates a dotted cross-link:

```mindmap
System Architecture
- Frontend {#frontend}
  - API call -> {#gateway} "HTTP"
- Backend
  - API Gateway {#gateway}
  - Cache -.> {#frontend} "warm"
```

The anchor and link ID must contain only letters, numbers, `_`, or `-`. The parser stores the values under `attributes.crossLink`; anchored nodes receive durable IDs such as `mm-anchor-gateway`. The Extension adds a curved `MindMapLayoutEdge` between the source node and the matching anchor. A missing target and a self-link are ignored during layout. A quoted label is rendered beside the edge.

Anchor and link syntax is removed from the displayed label. Pass `crossLinkExtension()` to `serializeMindMap` to write the syntax back:

```tsx
import { crossLinkExtension } from '@xiangfa/mindmap/extensions/cross-link'
import { parseMindMap, serializeMindMap } from '@xiangfa/mindmap/core'

const extensions = [crossLinkExtension()]
const document = parseMindMap(source, { extensions })
const roundTrip = serializeMindMap(document, { extensions })
```

Cross-link geometry is part of the layout projection. Custom rendering code that consumes `MindMapLayout` should render both the normal edges and the additional edges returned by `transformLayout`.

## Folding markers

Use `+` instead of `-` to mark a node collapsed by default:

```mindmap
Project Structure
- src/
  - components/
    - Button.tsx
  + utils/
    - format.ts
    - validate.ts
```

With `foldingExtension()` enabled, `+ utils/` receives `attributes.folding.collapsed: true`. The children remain in the Document, while the layout projection filters them out. Viewer and Editor surfaces can show the fold control and expand the branch without deleting its children. A layout `foldOverrides` option can change the projected state without changing the Document.

The serializer emits `+` only when the Folding Extension is supplied. Without that Extension, `+` is accepted as a list marker but no collapsed state is stored.

## Formula support

The LaTeX Extension marks nodes containing inline or display math:

```mindmap
Loss Functions
- MSE
  | $L = \frac{1}{n}\sum_{i=1}^{n}(y_i - \hat{y}_i)^2$
- Cross Entropy
  | $$L = -\sum_i y_i\log(\hat{y}_i)$$
```

`latexExtension()` sets `attributes.latex.enabled` when a node label or multiline line contains a math token. The React runtime then lazy-loads the optional KaTeX peer for that node. KaTeX is configured for MathML output, `trust: false`, `throwOnError: false`, and warning-level strictness. If KaTeX is not installed or rendering fails, the source delimiters remain readable.

Install KaTeX only when this path is part of the host bundle:

```bash
pnpm add katex
```

The headless core never imports KaTeX. `renderMindMapToSvg` accepts an application-owned `renderMath(source, displayMode)` callback; `prepareMindMapSvg` can use an installed KaTeX peer when the LaTeX Extension is active. A custom callback should return trusted, sanitized markup such as MathML and should never return user-provided HTML directly.

## Frontmatter

Frontmatter is read by the core parser when `---` is the first line and a closing `---` is present:

```mindmap
---
direction: right
theme: auto
project: atlas
---

Project
- Research
- Delivery
```

`direction` accepts `left`, `right`, or `both`; `theme` accepts `light`, `dark`, or `auto`. These values are projected to `document.direction` and `document.theme`. Other simple `key: value` entries remain in `document.metadata` and round-trip as strings. Frontmatter is intentionally a bounded key/value format, not a full YAML implementation. See [Mindmap Syntax Specification](Mindmap%20Syntax%20Specification.md) for the parser boundary.

## Extension hooks

The public `MindMapExtension` interface has five optional hooks:

| Hook | When it runs | Typical use |
| --- | --- | --- |
| `transformNode(node, source)` | During Markdown parsing and node transformation | Parse namespaced attributes or normalize text |
| `serializeNode(node, text)` | Before a node line is serialized | Re-emit extension syntax such as tags or anchors |
| `filterChildren(node, children, collapsed)` | During layout projection | Hide or select visible descendants |
| `transformEdge(edge, parent, child)` | For each ordinary parent-child edge | Add edge flags or labels |
| `transformLayout(layout, document)` | After the normal layout is built | Add cross-links or adjust the layout projection |

Example of a small namespaced Extension:

```tsx
import type { MindMapExtension } from '@xiangfa/mindmap/core'

const priorityExtension: MindMapExtension = {
  id: 'priority',
  transformNode(node) {
    const match = node.text.match(/^\[P([1-3])\]\s*/)
    if (!match) return node
    return {
      ...node,
      text: node.text.slice(match[0].length),
      attributes: {
        ...node.attributes,
        priority: { level: Number(match[1]) },
      },
    }
  },
  serializeNode(node, text) {
    const level = (node.attributes?.priority as { level?: number } | undefined)?.level
    return level ? `[P${level}] ${text}` : text
  },
}
```

The core interface has no arbitrary React or SVG renderer hook. A custom attribute is useful only when the consuming surface already renders it, an Extension transforms the layout/edge data that the surface understands, or the host supplies its own renderer. Keep custom attributes namespaced and preserve unknown attributes when updating a node.

## Round-trip rules

Use one Extension list for parsing and serialization when Markdown fidelity matters:

```tsx
const extensions = [
  ...basicMindMapExtensions(),
  crossLinkExtension(),
  latexExtension(),
]

const document = parseMindMap(source, { extensions })
const rendered = renderMindMapToSvg(document, { extensions })
const markdown = serializeMindMap(document, { extensions })
```

Core syntax—roots, tasks, remarks, comments, frontmatter, and inline tokenization—remains available without these Extensions. Extension-owned markers such as `#tag`, `+`, `-.`, `|`, and cross-link syntax require their corresponding Extension at the parse/layout/serialize boundary. If an Extension ID appears more than once, the compiler keeps the last definition for that ID; avoid duplicate IDs unless replacement is intentional.
