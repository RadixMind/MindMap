# Contributing to Open MindMap

Thank you for contributing to Open MindMap. The repository contains the v0.9.0 React and TypeScript package, its headless document runtime, and the Astro documentation site. Keep changes small, preserve the public contracts, and leave a reproducible verification trail in the pull request.

## Before you start

Use Node.js 24.18.0 for the current repository validation environment. The package declares pnpm 10.30.3 in `packageManager`; Corepack can provide the matching pnpm executable:

```bash
corepack enable
corepack prepare pnpm@10.30.3 --activate
```

Fork or clone the repository, create a branch from the default branch, and install the workspace dependencies:

```bash
git clone https://github.com/u14app/mindmap.git
cd mindmap
pnpm install
```

The package is published as `@xiangfa/mindmap`. React and ReactDOM are peer dependencies. KaTeX is an optional peer dependency used by the LaTeX extension and is only needed by applications that enable that path.

## Run the site locally

The root development command builds the library first and then starts the Astro site at `http://localhost:4321`:

```bash
pnpm dev
```

`pnpm dev:site` is the same root convenience command. To start only the site after a library build, use:

```bash
pnpm build:lib
pnpm --dir site dev
```

Stop a development or preview process with `Ctrl-C` when you finish. The site package also provides `pnpm --dir site preview` for serving an already-built site.

## Commands

Run the smallest relevant check while iterating, then run the project build before submitting a pull request.

| Command | Purpose |
| --- | --- |
| `pnpm test` | Run the Vitest suite. |
| `pnpm test:unit` | Alias for the Vitest suite. |
| `pnpm build:lib` | Clean `dist/`, build ESM and CJS entries, emit declarations, copy styles, and write the bundle manifest. |
| `pnpm check:site` | Build the library and run Astro's site type/content checks. |
| `pnpm build:site` | Build the library and the production Astro site. |
| `pnpm build` | Build the library and the production site. |
| `pnpm lint` | Run ESLint over the repository. |
| `pnpm verify:boundaries` | Check the headless core boundary, public artifact matrix, package exports, and retired source paths. |
| `pnpm verify:pack` | Check the package archive and published file list. |
| `pnpm verify:clean-source` | Check for disallowed generated or legacy source files. |
| `pnpm benchmark` | Run the checked-in benchmark script and write its report. |
| `pnpm verify` | Run the broad unit, library, boundary, package, benchmark, and site checks in sequence. |
| `pnpm qa:site` | Run the Playwright-based site QA script against a running site. |

For a focused Vitest run, pass a test path through pnpm, for example:

```bash
pnpm test:unit -- src/components/MindMap/core/__tests__/parser.test.ts
```

When correcting an ESLint error, run the repository's quiet error check after the fix:

```bash
npx eslint . --quiet
```

`pnpm test:e2e` runs the Playwright browser suite and requires a built or running site according to the Playwright configuration. Treat browser and device behavior as separate evidence from unit, type, lint, or static checks; run E2E only when the task explicitly authorizes it. `pnpm capture:site` and `pnpm record:check` likewise produce verification artifacts and are not substitutes for the checks above.

## Repository structure

The library source is under `src/components/MindMap/`:

```text
src/components/MindMap/
  core/         Headless Document, parser, serializer, layout, patches, controller,
                streaming, SVG, inline-token, URL, and validation code
  runtime/      React Surface, Scene, Static, Viewer, Editor, theme, commands,
                filters, and lifecycle adapters
  entries/      Public package entry adapters for core, surfaces, Features,
                and Extensions
  features/     Optional Editor capabilities such as history, search, import,
                export, Markdown editing, and AI generation
  extensions/   Syntax and layout extensions such as tags, folding, multiline,
                dotted lines, cross-links, frontmatter, and LaTeX
  styles/       Runtime and per-Feature CSS entrypoints
```

The `core/` tree must remain independent of React, ReactDOM, browser globals, and CSS. It is the source of truth for the immutable Document and its layout projection. React surfaces render that projection; viewport pan and zoom are presentation state. Features consume the shared Editor controller instead of maintaining a second tree or history stack. The Astro site lives in `site/`; repository scripts live in `scripts/`; browser tests live in `tests/e2e/`. Historical source may remain while the migration is completed, but new imports belong to the current directories and public entries above.

The public package entries are:

- `@xiangfa/mindmap/core`
- `@xiangfa/mindmap/static`
- `@xiangfa/mindmap/viewer`
- `@xiangfa/mindmap/editor`
- `@xiangfa/mindmap/features/*`
- `@xiangfa/mindmap/extensions/*`
- `@xiangfa/mindmap/styles/*`

Import these entries instead of files from `src/`. The root `@xiangfa/mindmap` entry aliases the Editor surface as `MindMap` for the v0.9 contract.

## Implementation conventions

- Trace the complete execution path before changing a cross-boundary behavior. For Markdown, that path is parser → Document attributes → layout → React or SVG rendering → serializer/export.
- Preserve the namespaced `MindMapNode.attributes` shape, public entry names, stylesheet paths, URL policy, and extension IDs unless the issue explicitly changes the contract.
- Keep extension arrays stable between renders. Extensions are composable hooks for node transformation, serialization, child visibility, edge transformation, and layout transformation; they do not currently provide an arbitrary renderer hook.
- Use `.tsx` for files that contain JSX and keep CSS selectors under the `mm-` namespace. Add or update the matching style entry when a public Feature or runtime surface needs styles.
- Preserve existing SVG attributes when making a targeted JSX change. A change to one attribute must not remove geometry, paint, accessibility, or interaction attributes that are already present.
- Keep user input bounded and escaped. Reuse the core parser, validator, `sanitizeMindMapUrl`, and SVG escaping helpers instead of introducing a second conversion path.
- Keep documentation examples aligned with declarations and source behavior. Mark browser, PNG, network, or deployment behavior only when that boundary has been checked.

## Tests and verification

Add a focused test when a change alters a parser rule, extension, controller transition, layout projection, export policy, or runtime interaction. Core and runtime tests are colocated under `src/components/MindMap/`; the repository currently uses Vitest rather than a separate test package.

Before opening a pull request, run the checks that cover the changed boundary. A library or runtime change normally needs:

```bash
pnpm test:unit
pnpm build:lib
pnpm lint
pnpm verify:boundaries
pnpm verify:pack
pnpm build
```

Documentation or site changes should also run `pnpm check:site` and `pnpm build:site`. Report the exact commands and results. Distinguish local unit, type, lint, and static checks from browser E2E, visual, network, package-publication, and deployment evidence. Generated reports with `unknown`, zero captures, or an external workspace path do not establish a passing check.

## Pull requests

Describe the user-visible problem and resulting behavior first. Include the affected files, the execution path you changed, verification commands and results, and any boundary that still needs browser or maintainer validation. Keep unrelated formatting or refactors out of the pull request.

For syntax or styling changes, include a small Markdown or CSS example and link to the relevant reference:

- [Mindmap Syntax Specification](docs/Mindmap%20Syntax%20Specification.md)
- [Extended Mindmap Syntax Support](docs/Extended%20Mindmap%20Syntax%20Support.md)
- [Custom Styling](docs/Custom%20Styling.md)
- [Migration guide](MIGRATION-v0.9.md)

Use a concise imperative commit subject, such as `Document the v0.9 extension boundary`. Maintainers handle release, publication, and deployment decisions.

## Reporting a problem

Search the [existing issues](https://github.com/u14app/mindmap/issues) before filing a duplicate. Include the input Markdown or `MindMapDocument`, the public entry used, expected and actual behavior, browser and operating-system details for UI problems, and the smallest reproduction you can share. For security-sensitive reports, follow the repository's security reporting process rather than publishing exploit details in a public issue.
