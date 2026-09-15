# v0.7.1 website migration verification

Date: 2026-09-15. Baseline: v0.7.1 tag at `64f4063`, migrated to the
v0.9.0 Astro and React-island architecture. Commands ran with Node 26.8.1 and
pnpm 10.30.3.

## Engineering checks

| Check | Result |
| --- | --- |
| Focused site tests | Passed: 6 files, 16 tests |
| `pnpm test` | Passed: 30 files, 240 tests |
| `pnpm lint` | Passed |
| `npx eslint . --quiet` | Passed |
| `pnpm --dir site check` | Passed: 22 files, no errors, warnings, or hints |
| `git diff --check` | Passed |
| `npm run build` | Passed: library plus 10 Astro pages |

The focused tests cover the twelve homepage cards, seven Extension cards,
thirteen documentation anchors and historical topics, canonical links and
redirects, obsolete-copy bans, code copying, light/dark literal export tokens,
Markdown/Editor synchronization, embedded/full-screen sharing, chunked UTF-8,
reasoning/fence removal, one stream commit, HTTP/empty/network/parser failures,
cancellation, unmount abort, and rollback.

No public library implementation or package export was changed by the website
migration.

## Browser observations

The final built `/`, `/docs/`, and `/live/` pages were inspected in the Codex
in-app browser at its desktop size and with a 390 by 844 responsive override.
Observed DOM widths matched the viewport width without page-wide horizontal
overflow. The host was using its automatic dark color scheme.

Verified behavior:

- The centered hero, original quill, install command, split demo, twelve-card
  capability grid, seven-card Extension grid, Markdown/React sections, open-web
  strip, CTA, and footer render in the v0.7.1 order.
- `/docs/` renders all thirteen chapters in one long page. The desktop sidebar,
  mobile drawer, expanded v0.9.0 examples, code-copy status, and anchors work.
- `/live/` fills the browser without site navigation or footer; narrow layouts
  stack the Markdown source above the SVG Editor.
- `/playground/`, `/#/live`, the original `/#/docs#api-reference` form, and the
  slash-form `/#/docs/api` all reached their canonical destinations.
- Browser console and warning logs were empty after the final route checks.

The light palette and runtime export tokens are covered by source checks, the
compiled Tailwind media variants, and unit tests. A separately emulated light
browser screenshot matrix was not run because Playwright E2E was explicitly out
of scope; the updated capture and QA scripts are ready for a later authorized run.

## Approved real-endpoint smoke

One approved request containing only the harmless prompt
`A simple release checklist with Plan, Build, and Verify` was sent to
`https://open-mindmap-ai.u14.app/api/mindmap`. The streamed result produced a
`Release Checklist` map, updated both Markdown and SVG surfaces, returned the UI
to idle, and enabled exactly one undo step. No attachment or credential was sent.

## Boundaries and cleanup

- The remote smoke verifies the public endpoint response observed on this date;
  it is not a reliability, rate-limit, privacy-policy, or production SLA claim.
- Playwright E2E, the QA/capture scripts, physical-device testing, deployment,
  npm publishing, commit creation, and production checks were not run.
- No build or output-size budget gate was added.
- Unreferenced assets from the superseded site direction were moved to the macOS
  Trash at `open-mindmap-unused-site-assets-20260915-1828`; the v0.7.1
  `logo.png` and `screenshot.png` hashes match the tag exactly.
- The temporary preview server and agent-created browser tab were closed.
