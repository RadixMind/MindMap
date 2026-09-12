# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Open MindMap (`@xiangfa/mindmap`) is a modular React and TypeScript runtime for interactive SVG-based mind maps. Version 0.9.0 separates the headless Document Runtime, static SVG rendering, read-only viewing, editing, optional Features, and syntax Extensions into explicit package entries. Markdown input supports incremental streaming, and the export surface includes SVG, PNG, Markdown, JSON, and outline workflows.

## Commands

```bash
pnpm install          # Install workspace dependencies
pnpm dev              # Build the library, then start the Astro site at localhost:4321
pnpm test             # Run the Vitest suite
pnpm build            # Build the library and the Astro site
pnpm build:lib        # Build ESM/CJS entries, declarations, styles, and manifest
pnpm check:site       # Build the library and run Astro checks
pnpm build:site       # Build the library and the Astro site
pnpm lint             # Run ESLint
```

`pnpm dev:site` is the root alias for the same library-build plus Astro-dev flow. `pnpm --dir site dev` starts only the site after a library build. Focused boundary checks include `pnpm verify:boundaries`, `pnpm verify:pack`, and `pnpm verify:clean-source`.

## Architecture

**Public build targets:** `pnpm build:lib` emits the ESM/CJS library entries, declarations, styles, and bundle manifest. `pnpm build` and `pnpm build:site` build that library and the Astro site under `site/`. The root package entry is `src/components/MindMap/index.ts`; explicit entries are implemented under `src/components/MindMap/entries/`.

**Rendering:** Pure SVG — no Canvas or external layout engine is required. The headless layout algorithm in `core/layout.ts` computes deterministic node metrics, positions, bounds, and edge paths without DOM measurement. React `runtime/` components render that projection.

**Data flow:**

1. Input (`MindMapDocument`, nodes, or Markdown) → the headless parser and validator (`core/parser.ts`, `core/utils.ts`)
2. Parsed nodes and Extension attributes → layout projection (`core/layout.ts`) → `MindMapLayout` nodes and edges
3. The projection → React Scene rendering (`runtime/MindMapScene.tsx`) or portable SVG (`core/svg.ts`)
4. User commands → immutable controller patches and history (`core/controller.ts`, `core/patches.ts`) → re-layout → re-render

**Key directories under `src/components/MindMap/`:**

- `core/` — Headless Document types, parser, serializer, layout, patches, controller, streaming, SVG, inline tokens, URL policy, and validation
- `runtime/` — React Static, Viewer, Editor, Surface, Scene, theme, command, filter, and lifecycle adapters
- `entries/` — Public package entry adapters for core, surfaces, Features, and Extensions
- `features/` — Optional Editor capabilities: history, search, import, export, Markdown editor, and AI generation
- `extensions/` — Opt-in syntax/layout Extensions: tags, folding, multiline, dotted lines, cross-links, frontmatter, and LaTeX
- `styles/` — Shared runtime tokens plus surface and Feature CSS entrypoints
- `scripts/` — Library cleanup/copy/manifest, boundary, package, benchmark, and site verification scripts
- `site/` — Astro documentation, playground, and landing site

**Extension system:** Extensions implement the `MindMapExtension` hooks from `core/types.ts`. The compiler in `core/extensions.ts` chains node transformation, serialization, child filtering, edge transformation, and layout transformation hooks by stable Extension ID. `basicMindMapExtensions()` enables tags, folding, multiline, and dotted-line; cross-link, frontmatter, and LaTeX entries are explicit additions.

**Document operations** in `core/patches.ts` and `core/controller.ts` are immutable — they publish new frozen snapshots rather than mutating the current Document.

**`runtime/MindMapEditor.tsx`** is the Editor orchestrator. It wires the shared controller, viewport Surface, commands, optional Features, editing, and callbacks, and exposes the `MindMapEditorRef` imperative API. `runtime/MindMapViewer.tsx` and `runtime/StaticMindMap.tsx` provide the read-only and static surfaces.

## Conventions

- **Package manager:** pnpm
- **Language:** TypeScript with strict mode, `noUnusedLocals`/`noUnusedParameters` enabled
- **Styling:** Plain CSS with `mindmap-` prefix (BEM-like). Single CSS file exported as `dist/style.css`.
- **React:** Functional components only, React 19. No class components.
- **Externals:** React, ReactDOM, and KaTeX (optional peer dep) are external in library builds.
- **ESM preserves modules** for tree-shaking; UMD provides a single bundle.
- **ESLint:** Flat config (v9). `@typescript-eslint/no-explicit-any` is disabled.

## Code Editing Rules

When editing SVG elements or JSX with many attributes, preserve ALL existing attributes. Never drop attributes (y, width, height, fill, textAnchor, dominantBaseline, etc.) when making targeted edits.

## Task Management

When given a list of multiple tasks/issues to fix, create a TodoWrite checklist first, then work through each item sequentially and verify completion before moving on. Do not leave tasks unaddressed.

## Build & Verification

This is a TypeScript project. When creating new files with JSX, always use .tsx extension (not .ts). Run `npm run build` after changes to verify.
After fixing ESLint errors, run `npx eslint . --quiet` to confirm all errors are resolved before reporting completion.

## Styling

When fixing CSS/styling issues, check for cascading style conflicts before applying fixes. Test that new styles don't break existing ones — especially code blocks, dark mode, and z-index layering.
