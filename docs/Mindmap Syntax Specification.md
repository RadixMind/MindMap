# Mindmap Syntax Specification

This document describes the v0.9 Markdown-like format read by `parseMindMap` in `@xiangfa/mindmap/core`. The parser creates a `MindMapDocument`; a Viewer, Editor, Static surface, or SVG exporter then projects that document. Syntax that belongs to an Extension is enabled only when the same Extension is passed to the parse and render paths.

## Parsing a source string

```tsx
import { parseMindMap, serializeMindMap } from '@xiangfa/mindmap/core'
import { basicMindMapExtensions, crossLinkExtension, latexExtension } from '@xiangfa/mindmap/extensions'

const extensions = [
  ...basicMindMapExtensions(),
  crossLinkExtension(),
  latexExtension(),
]

const document = parseMindMap(markdown, { extensions })
const markdownAgain = serializeMindMap(document, { extensions })
```

`basicMindMapExtensions()` enables tags, folding, multiline content, and dotted lines. Cross-links and LaTeX are explicit additions. Frontmatter metadata is recognized by the core parser; `frontmatterExtension()` is available as a named Extension entry when an application keeps an explicit extension registry.

Keep the Extension list stable and pass it to every operation that needs the syntax: `parseMindMap`, `layoutMindMap`, `renderMindMapToSvg`, `serializeMindMap`, or a React surface's `extensions` prop. If an extension-owned attribute is serialized without its Extension, the attribute remains in the Document but its Markdown marker may not be emitted.

## Roots, children, and indentation

A line without a list marker is a root node. A line beginning with `-` is a list item; indentation determines its parent and depth. Blank lines are ignored and are useful for making independent root trees readable. A blank line alone does not create a node.

```mindmap
Product strategy
- Research
  - Customer interviews
  - Positioning
- Delivery
  - Prototype

Operations
- Deploy
- Observe
```

The parser also accepts `*` and `+` as list markers. `+` is an ordinary list marker unless the Folding Extension is enabled. `-.` is a dotted list marker when the Dotted-line Extension is enabled. Tabs count as two spaces for indentation; use consistent indentation so the intended parent is unambiguous.

A list-only root is valid as well:

```mindmap
- Product strategy
  - Research
```

The parser records whether a root was authored with list syntax so `serializeMindMap` can preserve that form. A bare source such as `Product strategy\n- Research` and the list-only form above produce the same tree shape. If no usable node is supplied, the Document contains one generated root named `Root`.

The parser rejects input that exceeds any of these limits:

| Limit | Value |
| --- | ---: |
| Markdown source or aggregate Document content | 1,000,000 UTF-16 code units |
| Nodes | 20,000 |
| Nesting depth | 256 levels |
| Node ID length | 256 code units |
| Metadata entries | 256 |
| Comments | 4,096 |
| Values in one attribute collection | 1,024 |
| Aggregate attribute entries | 100,000 |
| Tags on one node | 128 |
| Multiline and remark continuation lines on one node | 256 |
| Cross-links on one node | 64 |
| Inline tokens in one label or multiline line | 4,096 |
| Image tokens in one Document | 64 |
| Projected render primitives | 100,000 |
| Patches in one direct batch | 256 |

Attribute values must form an acyclic JSON tree; shared object identities, accessors, non-finite numbers, functions, and other non-JSON values are rejected. Large controller diffs may be represented by one validated `replace-document` Patch instead of hundreds of individual moves. Raw SVG passed to `renderSvgToPng` has a separate 16 MiB pre-encoding limit.

Node IDs generated from a parsed path are stable while that path is stable: the first root is `mm-0`, its first child is `mm-0-0`, and so on. IDs must be non-empty, control-free strings. A valid cross-link anchor changes the anchored node's ID to `mm-anchor-<anchor>`.

## Inline formatting

Node labels and multiline lines use the shared `tokenizeMindMapInline` tokenizer. It recognizes the following forms:

```mindmap
Product plan
- **Important** decision
- __Also bold__ wording
- *Open question*
- _Also italic_ wording
- ~~Deprecated~~ approach
- `component-name`
- ==Key concept==
- $E = mc^2$
- $$\int_0^1 x^2 dx$$
```

| Syntax | Token | Rendered effect |
| --- | --- | --- |
| `**text**` or `__text__` | `bold` | Bold text |
| `*text*` or `_text_` | `italic` | Italic text |
| `~~text~~` | `strikethrough` | Line-through text |
| `` `text` `` | `code` | Monospace text |
| `==text==` | `highlight` | Emphasized highlighted text |
| `$formula$` | `math` | Inline math when the LaTeX path is enabled |
| `$$formula$$` | `math` with `display: true` | Display math when the LaTeX path is enabled |

The tokenizer is deliberately small and Markdown-like; it is not a general Markdown parser. Unrecognized markup stays in the text token and remains readable.

## Links and images

Use link and image tokens inside a node label or multiline line:

```mindmap
Resources
- [Project brief](https://example.com/brief)
- [Local notes](./notes)
- [Jump to the API](#api)
- ![Architecture diagram](https://cdn.example.com/architecture.png)
- ![Embedded preview](data:image/png;base64,iVBORw0KGgo=)
```

The shared `sanitizeMindMapUrl` policy is applied before a URL reaches the React DOM or portable SVG:

| Token | Accepted URLs |
| --- | --- |
| Link `[label](url)` | `http:` and `https:` with a valid hostname, `mailto:`, `tel:`, relative paths, and fragments |
| Image `![alt](url)` | A bounded base64 `data:image/png`, `image/jpeg`, `image/gif`, or `image/webp` URL; sanitized `http:` and `https:` URLs only after explicit host authorization |

The runtime rejects empty values, control characters, backslashes, protocol-relative URLs such as `//cdn.example.com/a.png`, executable or local schemes, SVG data URLs, and relative image sources. Raster data URLs are limited to 1,000,000 characters. A rejected or unauthorized image falls back to its alt text.

Remote HTTP(S) images are denied by default. Set a surface's `remoteImagePolicy` to a predicate that allowlists intended origins, or to `"allow"` only when every sanitized remote URL is trusted. A policy configured on `createMindMapController` is inherited by a surface using that controller; the surface prop takes precedence. Authorized DOM images use anonymous CORS and a no-referrer policy.

Portable PNG export must be self-contained: pass an explicitly authorized `imageResolver` through `prepareMindMapSvg` to turn selected remote image URLs into safe raster data URLs before calling `renderSvgToPng`. The resolver must return a PNG, JPEG, GIF, or WebP data URL. An unresolved URL still follows `remoteImagePolicy`; PNG conversion rejects any remaining remote image reference. Browser canvas and CORS behavior still applies to the resulting image.

## Remarks

A line beginning with `>` attaches a remark to the most recently parsed node. Leading whitespace and one optional space after `>` are ignored. Consecutive remarks are joined with newline characters and do not become children.

```mindmap
Machine Learning
- Supervised Learning
  > Learn a mapping from labeled examples.
  > Use it to predict new inputs.
  - Classification
    > The output is a discrete category.
```

Remarks are stored as `attributes.remark.text`. Interactive surfaces expose them as supporting node information; portable SVG output includes them in an accessible `<title>`. A `>` line without a preceding node is ordinary text, so malformed or partial streams remain representable.

## Comments

A line beginning with `%%`, optionally after whitespace, is a source comment:

```mindmap
%% This stays in the source view
Research plan
- Interviews
  %% This note is not rendered as a node
  - Capture questions
```

Comments are stored in `document.comments` with the source text and the ID of the preceding node (`afterNodeId`). They are not rendered in the map, but `serializeMindMap` and the optional Markdown editor can preserve them. An inline occurrence such as `test%%demo` is ordinary node text; only a line prefix starts a comment.

## Task status

Task markers are recognized at the beginning of a line's node text. The marker is removed from the label and stored in `attributes.task.status`:

```mindmap
Learning Plan
- [x] Linear Algebra
- [X] Probability Theory
- [-] Optimization Theory
- [ ] Information Theory
```

| Source marker | `task.status` | Runtime marker |
| --- | --- | --- |
| `[ ] text` | `todo` | Empty task box |
| `[-] text` | `doing` | In-progress marker |
| `[x] text` or `[X] text` | `done` | Completed marker |

Tasks are core attributes, so parsing and serialization preserve their state without an Extension. The Editor task command cycles `todo` → `doing` → `done` → `todo` for the selected node.

## Frontmatter

Frontmatter is recognized only when `---` is the first source line and a matching closing `---` is present. Each body line uses a simple `key: value` form; keys may contain letters, numbers, `_`, `.`, and `-`. Values are stored as strings in `document.metadata`.

```mindmap
---
direction: right
theme: dark
owner: platform
---

Product strategy
- Research
- Delivery
```

The core Document projects these two keys when their values are valid:

| Key | Accepted values | Document field |
| --- | --- | --- |
| `direction` | `left`, `right`, `both` | `document.direction` |
| `theme` | `light`, `dark`, `auto` | `document.theme` |

Other keys remain in `document.metadata` for round trips. The frontmatter parser does not implement YAML nesting, arrays, quoted-value decoding, or arbitrary YAML types. An unclosed opening delimiter stays provisional and does not commit metadata as a completed frontmatter block.

## Document shape

The parser keeps extension data under the namespaced `attributes` object so the core Node shape remains stable:

```ts
interface MindMapNode {
  id: string
  text: string
  children?: MindMapNode[]
  attributes?: MindMapNodeAttributes
}

interface MindMapDocument {
  roots: MindMapNode[]
  direction?: 'left' | 'right' | 'both'
  theme?: 'light' | 'dark' | 'auto'
  metadata?: Record<string, string>
  comments?: { text: string; afterNodeId: string | null }[]
}

interface MindMapNodeAttributes {
  task?: { status: 'todo' | 'doing' | 'done' }
  remark?: { text: string }
  tags?: { values: string[] }
  folding?: { collapsed: boolean }
  multiline?: { lines: string[] }
  connection?: { dotted?: boolean; label?: string }
  [namespace: string]: unknown
}
```

Treat Documents and controller snapshots returned by the runtime as read-only. Use controller commands or a transaction to publish edits.

## Complete example

```mindmap
---
direction: both
theme: dark
---

Product roadmap
- **Discovery** #research
  > Confirm the problem before building.
  - [x] Interviews
  | 12 customer conversations
- **Delivery**
  + Prototype
    - API -> {#service} "HTTP"
- Service {#service}
  | $p(success) = 0.8$

%% Kept in the Markdown source
Operations
- [ ] Monitor the service
```

This example uses the core syntax plus tags, folding, multiline content, cross-links, and LaTeX. Enable the corresponding Extensions before parsing and pass the same list to the selected renderer and serializer.

## Quick reference

| Feature | Syntax | Ownership |
| --- | --- | --- |
| Root / child | Plain text / `- text` | Core |
| Alternate list marker | `* text` or `+ text` | Core marker; folding behavior is an Extension |
| Inline formatting | `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `==highlight==` | Core tokenizer |
| Math tokens | `$...$`, `$$...$$` | Core tokenizer; LaTeX rendering Extension/runtime |
| Link / image | `[label](url)` / `![alt](url)` | Core tokenizer and URL policy |
| Remark / comment | `> note` / `%% note` | Core |
| Task | `[ ]`, `[-]`, `[x]` after a list marker | Core |
| Dotted connection | `-. text` | Dotted-line Extension |
| Multiline content | `| text` | Multiline Extension |
| Tags | `#tag` | Tags Extension |
| Collapsed branch | `+ text` | Folding Extension |
| Cross-link | `{#id}`, `-> {#id}`, `-.> {#id}` | Cross-link Extension |
| Document metadata | Opening and closing `---` block | Core frontmatter parser |

See [Extended Mindmap Syntax Support](Extended%20Mindmap%20Syntax%20Support.md) for Extension setup and [Custom Styling](Custom%20Styling.md) for runtime classes and theme tokens.
