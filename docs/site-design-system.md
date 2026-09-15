# Website design system

Implemented on 2026-09-15 for the Open MindMap v0.9.0 Astro website. The v0.7.1
tag at `64f4063` is the sole page and visual baseline: this is a direct migration
of its structure, hierarchy, content order, and interaction intent, not a new
art direction.

## Architecture

- Astro owns the HTML shell, static content, routes, redirects, metadata,
  structured data, sitemap, and `llms.txt`.
- React hydrates only the shared `PlaygroundIsland`; documentation copy controls
  are a small progressive-enhancement script and work without a React page shell.
- Tailwind CSS 3 and `@tailwindcss/forms` compile at build time through the Astro
  integration. The historical CDN runtime is not restored.
- The package's v0.9.0 public exports remain unchanged. Website examples use the
  explicit Core, Static, Viewer, Editor, Feature, Extension, and style entries.

## Visual baseline

The site retains the v0.7.1 compact glass navigation, centered version badge and
display hero, dark install command, paired pill actions, split Markdown/SVG demo,
long-form product sections, Slate surfaces, iOS blue accent, and compact footer.
The original mint quill `logo.png` and product `screenshot.png` are reused.

The site follows the operating-system color preference. There is no manual theme
toggle. Both modes use the historical system UI font stack and a native monospace
stack for commands and code.

| Token | Light | Dark |
| --- | --- | --- |
| Page | `#FFFFFF` | `#0F1117` |
| Surface | `#FFFFFF` | `#0F172A` |
| Secondary surface | `#F8FAFC` | `#1E293B` |
| Text | `#0F172A` | `#F1F5F9` |
| Muted text | `#64748B` | `#94A3B8` |
| Accent | `#007AFF` | `#60A5FA` |

Focus rings remain visible in both modes, reduced-motion preferences collapse
animation durations, and narrow layouts stack the editor above the SVG surface.

## Homepage

The homepage preserves the historical sequence:

1. Navigation and centered hero
2. Installation command and primary actions
3. Embedded Markdown/SVG Playground
4. AI Streaming explanation
5. Twelve capability cards
6. Seven Extension cards
7. Markdown syntax section
8. React integration section
9. Open-web ecosystem strip
10. Final CTA and footer

Unsupported `Sub-10ms`, Viewer `48%`, and fake customer claims are replaced with
source-backed v0.9.0 descriptions while card count and placement remain stable.

## Documentation and routes

`/docs/` is the historical single long page with thirteen sections in its original
order. It keeps stable anchors, desktop scroll navigation, a mobile drawer, code
copying, and back-to-top behavior. Examples cover v0.9.0 Documents and Nodes,
explicit package entries, Features, Extensions, controller transactions, streams,
refs, split stylesheets, exports, URL policy, and localization.

Canonical routes are `/`, `/docs/`, and `/live/`. `/playground/` permanently
redirects to `/live/`; the five former nested documentation routes redirect to
their matching anchors. The v0.7.1 `/#/docs...` and `/#/live` hash forms are
translated on initial load and on later hash changes.

## Playground and remote generation

The homepage and `/live/` use the same component in embedded and full-screen
modes. It composes `MindMapEditor`, history/search/import/export Features, and all
seven built-in Extensions. The left Markdown source and right SVG editor share one
controlled value.

The public demo intentionally retains the historical GET endpoint. The UI states
that prompt text is sent to the external public endpoint and that attachments are
not sent. Its adapter decodes chunked UTF-8, removes `<think>` blocks and Markdown
fences, publishes cumulative controller-stream previews, commits exactly once,
and cancels and rolls back on stop, unmount, empty output, parsing failure, or
network failure.

## Boundaries

No library export, build-size gate, E2E execution, commit, deployment, or
production verification is part of this website migration.
