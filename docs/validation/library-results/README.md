# Lesson discovery and results polish

This pass builds on PR #27. The collection now supports word-based search across lesson titles, genres and courses, plus guide titles, devices and descriptions. Pad layout and difficulty filters combine with search. Returning from a lesson restores the search, selected filters and scroll position. Course progress always describes the full course.

Lesson cards show a small preview of the opening two bars, binned into sixteenth-note columns and colored by the chart's pads. It is a visual overview; off-grid notes are grouped into their containing column.

Results use a score ring and a separate action footer. The report scrolls independently, keeping Retry, Next and Studio available. Wait-mode practice shows a completion check without a timing score or stars. The scroll region is keyboard accessible and participates in the dialog focus trap.

Validation: `npm run check` passed with **926 tests across 43 files**; `npm run lint` passed. Build and the affected integration tests were rerun after the final accessibility refinements. Vite still reports the existing bundle-size advisory.

The [browser report](acceptance.json) covers combined filters, guides, empty-state recovery, typing without pad input, preserved search/scroll context, a full scored keyboard performance, wait-mode completion, reduced-motion stars, dialog focus, Retry and Escape. Collection widths: 320, 390, 768 and 1366 pixels. Results sizes: 320×568, 390×844, 768×900 and 844×390; the footer stays visible while details scroll.

Reviewed captures:

- [Desktop collection](collection-desktop.png) and [mobile collection](collection-mobile.png)
- [Desktop results](results-desktop.png) and [mobile results](results-mobile.png)
- [Practice completion on mobile](practice-mobile.png)

Reproduce with `node scripts/qa/library-results.mjs` using the optional Playwright setup in [the QA guide](../../../scripts/qa/README.md). These are isolated, synthetic browser checks; physical MIDI, audible latency and the macOS package were not tested in this pass.
