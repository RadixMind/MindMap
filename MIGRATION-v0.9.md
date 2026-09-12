# Migrating to Open MindMap v0.9.0

v0.9.0 is a breaking interface release. It keeps the mind map capabilities while moving them behind one TypeScript Document Runtime and explicit package entries. The migration is complete only when the new entry and its stylesheet are used together.

## Choose the runtime

| Previous use | v0.9.0 entry | Notes |
| --- | --- | --- |
| Editable `MindMap` | `@xiangfa/mindmap/editor` (`MindMapEditor`) | Use the editor when users add, rename, remove, move, or edit nodes. |
| `MindMap` with `readonly` | `@xiangfa/mindmap/viewer` (`MindMapViewer`) | Read-only behavior is a separate runtime. Pan, zoom, selection, and fit remain available. |
| Server or static preview | `@xiangfa/mindmap/static` (`StaticMindMap`) | Uses the headless parser/layout/SVG path and does not require an editor surface. |
| Parser, serializer, layout, patches, or stream | `@xiangfa/mindmap/core` | The core interface is React/DOM free. |
| Root import | `@xiangfa/mindmap` | The root `MindMap` export maps to the v0.9 editor contract. Verify the generated declaration before publishing. |

The old UMD-style file paths, `legacy-viewer`, `cognitive`, `cognitive/react`, and cognitive fallback stylesheet are not v0.9 public entries. Replace direct file references with package exports.

## Basic imports

```tsx
import { MindMapEditor } from '@xiangfa/mindmap/editor'
import '@xiangfa/mindmap/styles/editor.css'

export function Plan() {
  return <MindMapEditor markdown={'Product plan\n- Research\n- Ship'} />
}
```

```tsx
import { MindMapViewer } from '@xiangfa/mindmap/viewer'
import '@xiangfa/mindmap/styles/viewer.css'

export function ReadOnlyPlan({ markdown }: { markdown: string }) {
  return <MindMapViewer markdown={markdown} autoFit="initial" />
}
```

For a static surface:

```tsx
import { StaticMindMap } from '@xiangfa/mindmap/static'
import '@xiangfa/mindmap/styles/static.css'

<StaticMindMap markdown={markdown} />
```

## Data and controller changes

The v0.9 core uses a `MindMapDocument` with `roots`, optional `direction`, optional `theme`, and string metadata. Nodes keep a stable `id`, `text`, optional `children`, and namespaced `attributes`.

Advanced integrations should consume `MindMapController` snapshots and events instead of maintaining a second tree. The controller is the seam for parser, layout, editor, Feature, and site consumers. Viewport state stays in the rendered surface and is not part of Document history.

An externally supplied `controller` is now the sole content owner. Do not combine it with `document`, `data`, `markdown`, `defaultMarkdown`, or `documentRevision`; every surface rejects that conflict synchronously. Keep content Props on an internally owned surface, or update the external controller directly.

Controller events expose `preview`, `commit`, `rollback`, and `change` phases. Transaction patches publish live `preview` frames; `commit` finalizes the single history entry; cancellation or failure publishes `rollback`; selection and layout-only updates publish `change`. `onDocumentChange`, `onChange`, and `onMarkdownChange` are live callbacks and can observe preview frames. Persist a committed Document from `onEvent` only when `event.phase === 'commit'` is required.

`documentRevision` is an explicit host replacement token. Advance it when the host intentionally restores an older or identical authoritative Document, so the runtime clears history and cancels active work. Keep the same revision for ordinary controlled echoes of a callback value.

## Features and Extensions

Optional editor capabilities are imported from their Feature entries:

```tsx
import { MindMapEditor } from '@xiangfa/mindmap/editor'
import { historyFeature } from '@xiangfa/mindmap/features/history'
import { searchFeature } from '@xiangfa/mindmap/features/search'
import '@xiangfa/mindmap/styles/editor.css'
import '@xiangfa/mindmap/styles/features/history.css'
import '@xiangfa/mindmap/styles/features/search.css'

const features = [historyFeature(), searchFeature()]

<MindMapEditor
  markdown={markdown}
  features={features}
/>
```

Import, export, Markdown editor, and AI use the same `features/*` pattern. Syntax and render behavior uses `extensions/*`. Keep Feature and Extension arrays at module scope or memoize them with `useMemo` so their identities remain stable across renders. The existing project’s frontmatter, cross-link, LaTeX, links/images, folding, multiline, tags, dotted-line, task, remark, and comment behavior remains available through the core parser and matching extensions.

The v0.9 Node model stores extension data in namespaced `attributes`. The following table maps fields from the 0.7.1 `MindMapData` shape:

| 0.7.1 field | v0.9 field | Migration note |
| --- | --- | --- |
| `remark` | `attributes.remark.text` | Preserve the string, including line breaks. |
| `taskStatus` | `attributes.task.status` | Values remain `todo`, `doing`, or `done`. |
| `tags` | `attributes.tags.values` | Preserve the tag strings; the Tags Extension serializes them. |
| `collapsed` | `attributes.folding.collapsed` | Folding is retained in the Document and filtered from layout when enabled. |
| `dottedLine` | `attributes.connection.dotted` | The dotted-line Extension transforms the projected edge. |
| `multiLineContent` | `attributes.multiline.lines` | Each entry is one physical in-node line. |
| `anchorId` and `crossLinks` | `attributes.crossLink.anchor` and `attributes.crossLink.links` | Map `targetAnchorId` to `target`, and keep `label` and `dotted`. |
| `listRoot` | `attributes.syntax.listRoot` | Preserves a root that was written with a list marker. |
| `placeholder` | no v0.9 Document field | Omit it. Render loading or streaming status in host UI; the controller stream does not need a sentinel placeholder node. |

Use a recursive adapter when a host still receives 0.7.1 data. It copies every node and translates only the legacy flattened fields:

```tsx
import type { MindMapNode, MindMapNodeAttributes } from '@xiangfa/mindmap/core'

type LegacyCrossLink = { targetAnchorId: string; label?: string; dotted?: boolean }
type LegacyNode = {
  id: string
  text: string
  children?: readonly LegacyNode[]
  remark?: string
  taskStatus?: 'todo' | 'doing' | 'done'
  dottedLine?: boolean
  multiLineContent?: readonly string[]
  tags?: readonly string[]
  anchorId?: string
  crossLinks?: readonly LegacyCrossLink[]
  collapsed?: boolean
  placeholder?: boolean
  listRoot?: boolean
}

function adaptNode(node: LegacyNode): MindMapNode {
  const attributes: MindMapNodeAttributes = {}
  if (node.remark !== undefined) attributes.remark = { text: node.remark }
  if (node.taskStatus !== undefined) attributes.task = { status: node.taskStatus }
  if (node.tags !== undefined) attributes.tags = { values: [...node.tags] }
  if (node.collapsed !== undefined) attributes.folding = { collapsed: node.collapsed }
  if (node.dottedLine !== undefined) attributes.connection = { dotted: node.dottedLine }
  if (node.multiLineContent !== undefined) attributes.multiline = { lines: [...node.multiLineContent] }
  if (node.anchorId !== undefined || node.crossLinks !== undefined) {
    attributes.crossLink = {
      anchor: node.anchorId,
      links: (node.crossLinks ?? []).map(({ targetAnchorId, label, dotted }) => ({ target: targetAnchorId, label, dotted: dotted ?? false })),
    }
  }
  if (node.listRoot !== undefined) attributes.syntax = { listRoot: node.listRoot }
  return {
    id: node.id,
    text: node.text,
    ...(node.children === undefined ? {} : { children: node.children.map(adaptNode) }),
    ...(Object.keys(attributes).length === 0 ? {} : { attributes }),
  }
}

const document = { roots: legacyRoots.map(adaptNode) }
```

Validate the resulting Document before publishing it to a controller. The adapter deliberately omits `placeholder`; if that state must survive a persistence boundary, store it in host metadata and restore it in the surrounding UI.

## Viewport behavior

`autoFit` controls when a surface fits its content:

- `initial` fits the first usable layout and preserves later user pan/zoom.
- `always` fits after each eligible layout change.
- `never` leaves viewport control to the host.

Use a ref to call `fitView`, `focusNode`, `selectNode`, or `setDirection` through the documented Viewer or Editor ref. Viewport callbacks describe presentation changes and should not be used as Document persistence events.

## AI streaming and history

Pass a generator to the AI Feature. A generator may return complete Markdown or an async iterable of Markdown delta chunks. The runtime appends each yielded string literally; a provider that yields cumulative snapshots must adapt them to deltas before handing them to the Feature. A complete string replaces the Document once. The host must provide cancellation through the supplied `AbortSignal` and must treat stale output as invalid after a document replacement.

The runtime commits one undoable transaction per successful AI generation, drag gesture, or grouped edit. Cancellation and failure restore the pre-operation Document. A host that needs release evidence should run the focused transaction checks in the requirements matrix.

## Package and stylesheet mapping

| Old pattern | New pattern |
| --- | --- |
| `@xiangfa/mindmap/viewer` plus aggregate style | `@xiangfa/mindmap/viewer` plus `@xiangfa/mindmap/styles/viewer.css` |
| private imports from `src/components/MindMap/*` | public `core`, `static`, `viewer`, `editor`, `features/*`, or `extensions/*` entry |
| `plugins={[...]}` | `extensions={extensions}`; define or memoize the Extension array once |
| Inline `ai={{...}}` | `features={[aiFeature({ ... })]}`; keep the Feature value stable |
| `onDataChange={(data) => ...}` | `onDocumentChange={(document) => ...}`; use `document.roots` when the host still stores roots |
| `onEvent={(event: MindMapEvent) => ...}` | `onEvent` for controller events, plus `onInteractionEvent` for surface events |
| `ref.current.exportToPNG()` | `prepareMindMapSvg` then `renderSvgToPng` from `features/export` |
| cognitive runtime files | TypeScript public entries |
| legacy viewer path | `@xiangfa/mindmap/viewer` |
| one all-in-one editor with every tool | Editor plus only the required Feature entries |

There is no required aggregate stylesheet in the v0.9 export map. Import the stylesheet for the runtime and Features you use. Legacy `.mindmap-*` selectors should be moved to the semantic `.mm-*` surface selectors and theme tokens documented by the styling guide. If a host keeps an internal aggregate, it must be generated from v0.9 styles and must not reintroduce the cognitive fallback or hidden legacy code.

## Links, images, and imports

Use the shared URL policy for node links and images. It accepts HTTP and HTTPS links, `mailto`, `tel`, relative links, and fragments. Raster `data:image` sources are displayable within the shared limits, while remote HTTP(S) images are denied by default and fall back to alt text. Set `remoteImagePolicy` to an origin predicate for an allowlist, or to `"allow"` only when every sanitized remote image URL is trusted. A controller-level policy is inherited by its surfaces unless a surface overrides it.

The policy rejects control characters, backslash tricks, protocol-relative URLs, JavaScript-like schemes, SVG data URLs, and relative image sources. `prepareMindMapSvg` treats a host `imageResolver` as explicit authorization to embed the selected remote URLs; unresolved URLs remain subject to `remoteImagePolicy`, and `renderSvgToPng` rejects remaining remote image references. JSON imports must pass the bounded Document validator before reaching the controller.

Admission is stricter in v0.9.0: IDs are bounded and control-free; shared or cyclic attribute graphs are rejected; metadata, comments, attribute entries, tags, multiline lines, cross-links, inline tokens, images, render primitives, and patch batches have exported hard limits. Raw SVG passed to `renderSvgToPng` is limited to 16 MiB before URI encoding. Applications that previously accepted larger documents should split or summarize them before migration.

## Validation before release

Run the commands recorded in [the v0.9.0 requirements and validation matrix](docs/refactor-v0.9.0-requirements.md). In particular, verify every documented export, run the unit suite, build the library and Astro site, and run the permitted browser and visual checks. Treat the matrix as the source of current validation status rather than relying on historical generated reports.
