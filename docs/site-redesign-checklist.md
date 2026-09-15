# v0.7.1 website migration checklist

- [x] Treat v0.7.1 (`64f4063`) as the only page and visual baseline.
- [x] Compile the historical Tailwind 3 theme and forms styles at build time.
- [x] Restore the full homepage sequence, twelve capability cards, seven
  Extension cards, original logo, and original screenshot.
- [x] Replace unsupported performance, bundle-size, and customer claims with
  source-backed v0.9.0 descriptions.
- [x] Consolidate the thirteen historical documentation chapters under `/docs/`
  with their original order and anchors.
- [x] Update documentation examples to v0.9.0 explicit entries, Documents,
  Features, Extensions, controller streams, refs, and split stylesheets.
- [x] Restore the shared Markdown/SVG Playground for the homepage and `/live/`.
- [x] Compose history, search, import, and export Features plus all seven built-in
  Extensions without changing public package exports.
- [x] Adapt the disclosed public GET stream through one controller transaction,
  including stop, unmount, failure, empty-output, and rollback behavior.
- [x] Add canonical routes, redirects, legacy hash compatibility, sitemap,
  `llms.txt`, SEO metadata, and structured data.
- [x] Add site contracts, stream tests, synchronization tests, and shared-mode
  tests; update E2E routes and selectors without running Playwright.
- [x] Inspect `/`, `/docs/`, and `/live/` at desktop and narrow responsive sizes.
- [x] Run one approved, harmless real-endpoint generation smoke test.
- [x] Run the permitted static, unit, lint, Astro, and build checks.
- [x] Record validation limits and stop all task-started preview processes.

The active direction is a faithful Astro migration, not a reinterpretation.
No build-size gate, E2E run, commit, deployment, or production claim is included.
See [the design specification](site-design-system.md) and
[the verification report](site-redesign-verification.md).
