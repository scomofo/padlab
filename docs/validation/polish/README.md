# Performance polish validation

This pass builds on the note-depth work merged in PR #26. It covers the studio deck, responsive controls, lane-local impact effects, four-beat count-in, Focus view and reduced-motion feedback.

Automated checks: `npm run lint` and `npm run check` passed; **924 tests across 43 files**. The new integration check confirms Focus view does not stop/restart a run or disconnect keyboard input. The build still reports the existing large-bundle advisory.

The [browser report](acceptance.json) records a full First Taps keyboard performance, responsive layout checks, live Focus toggling and reduced-motion pad checks. These are synthetic input checks. Physical MIDI controllers, audible latency and the macOS package were not tested by this pass.

Reviewed captures:

- [Studio desktop](studio-desktop.png) and [mobile](studio-mobile.png)
- [Count-in](count-in.png) and [single lane](single-lane.png)
- [Dense chart](dense-lanes.png) and [mobile](dense-mobile.png)
- [Mobile Focus view](focus-mobile.png)
- [Results](results.png)

Reproduce with `node scripts/qa/polish.mjs`; optional setup and environment overrides are in [the QA guide](../../../scripts/qa/README.md).
