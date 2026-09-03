# TODO

Open work as of `main` @ `95d29ed` (2026-09-02), plus the coverage/hygiene
follow-up on `chore/rc-hygiene`. PR #13 (`feat/sticky-daily-loop`) is merged.
Core CI is green. The two pinned design questions are decided. Remaining work
is physical-device acceptance and cutting a release that matches current `main`.

## Release-candidate gate

PadLab is ready to call a release candidate when every item in this section passes.
Automated checks are already green on `main`; these checks cover the physical and
packaged-app surfaces CI cannot prove.

A `v0.1.0` **pre-release** already exists (2026-08-18). Current `main` is well
past that tag — daily loop, channel-aware MIDI, mixed-course progress, Electron
CSP. Do **not** reuse `v0.1.0` for the next DMG. After the acceptance checks
below pass:

1. Bump `package.json` `version` if the next cut is not `0.1.0` (the release
   workflow refuses a tag that does not match).
2. Run **Release (macOS)** from the Actions tab with tag `v0.1.1` (or
   `v0.1.0-rc.1` if you want to keep 0.1.0 and mark it prerelease), **or**
   `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. Confirm the workflow publishes both arm64 and x64 DMGs and `SHA256SUMS.txt`.

### Real-controller acceptance

Run the same checks on an **Akai MPK Mini MK4** and a **Roland SP-404 MKII**.
Record pass/fail plus device firmware if available.

- [ ] **Factory mapping:** pads trigger the expected PadLab sounds without MIDI
      Learn. On the MPK, verify both pad banks (factory notes 36-43 / 44-51).
      On the SP-404 MKII, verify all 16 pads (notes 36-51).
- [ ] **MIDI Learn:** remap at least two pads and confirm the learned mapping is
      used immediately and after reopening the app.
- [ ] **Input isolation:** after MIDI Learn, keybed notes, knobs and transport
      controls do not trigger pads or score hits.
- [ ] **Latency compensation:** test at -50 ms, 20 ms and 150 ms. Judgement timing
      should shift predictably and ordinary on-time hits must remain scoreable.
- [ ] **Retrigger debounce:** on `amen-chop-science` (level 6), play repeated fast
      same-pad strokes. Confirm intentional roll notes are not swallowed and pad
      bounce does not create phantom scored hits.
- [ ] **Hot-plug recovery:** disconnect and reconnect the controller while PadLab
      is open; input should resume without a page/app restart.
- [ ] **Daily loop on hardware:** Continue auto-starts Play; a scored Perform
      grows the streak and awards XP; Daily groove marks "Cleared today" only
      after the Perform step.

### Packaged macOS acceptance

Use the DMG produced by the release workflow, not a dev-server build.

- [ ] DMG opens and contains `PadLab.app`.
- [ ] App can be copied to `/Applications` and launched by double-clicking.
- [ ] Document the expected Gatekeeper flow for the current ad-hoc-signed build;
      no unexplained blank window or silent failure is acceptable.
      Known step: `xattr -dr com.apple.quarantine /Applications/PadLab.app`.
- [ ] Main window renders the studio (Continue / Daily groove / warmup pads)
      and opens a lesson normally.
- [ ] Web MIDI permission succeeds in the Electron shell and a connected physical
      controller appears in Device Setup.
- [ ] A lesson can be played from count-in through results with real MIDI input.
- [ ] Quit and relaunch preserves progress, settings, streak, and XP
      (`padlab-profile-v1` in localStorage).

### RC decision

- [ ] **RC PASS:** all controller and packaged-macOS checks above pass with no P0/P1
      defect and no recurring P2 defect that compromises scoring, input, startup,
      persistence or lesson completion.

## Repo hygiene

- [x] **Stale branches from the 2026-08-21 TODO.** The nine listed branches are
      gone from the remote.
- [ ] **Delete leftover `claude/app-deep-inspection-review-pr5wgb`.** Merged as
      PR #12; 0 unique commits ahead of current `main` that are not already in
      history. Safe to delete.

## Design decisions

- [x] **Empty player part scores 0% / 0\u2605.** `ScoreKeeper.summary()` short-circuits
      `total === 0` to accuracy 0 (was 100 / 3 stars). Still unreachable on a
      valid chart because the final step requires `playerPads: "all"`, but an
      authoring slip can no longer mint a clean pass. Pinned by
      `tests/engine/emptyPlayerPart.test.ts` → *"awards no score for a step with no
      player notes"*.
- [x] **Ostinato difficulty cliff is accepted.** A locked-in hat/shaker hand is
      easier than the same rate on four pads. Crossing the 0.5-beat gap ceiling
      marks the pad ostinato (0.4 weight), so a denser hat can rate easier
      (1.9 vs 3.0 effective hits/sec). That is the product. Pinned by
      `tests/scripts/difficulty.test.mjs` → *"a denser hat scores easier than a
      sparser one"*.

## Targeted coverage

The engine, validators, MIDI layer, persistence, and the daily-loop arithmetic
are already heavily tested. Do not chase presentation-line coverage for its own
sake; add tests where they protect behaviour or arithmetic.

- [x] **LessonBrowser progress aggregation:** cover `totalStars`, per-course
      `done`/`total`, completed-course state, and the guide-vs-lesson branch.
      Done by extraction: the arithmetic now lives in
      `src/lessons/courseProgress.ts` (pure, mixed courses count both kinds)
      and is covered by `tests/lessons/courseProgress.test.ts`.
- [x] **`usePadKeyboard`:** keydown mapping, ignored keys / modifiers /
      auto-repeat / form fields, `maxPad` clamp, and unmount cleanup.
      `tests/input/usePadKeyboard.test.ts`.
- [x] **Top-level smoke test:** app start, Device Setup open/close, lesson
      open/back. `tests/app.smoke.test.tsx`.
- [ ] **WebAudio only if changing synth behaviour:** build an audio-graph harness
      before asserting implementation details in `src/audio/*`.

## Known follow-ups (not blocking RC)

- Home `LessonBrowser` mounts `usePadKeyboard(8)` while `DeviceSetup` (overlay)
  mounts `usePadKeyboard(16)`. Opening Device Setup from the studio installs two
  window listeners, so one keydown emits twice. Harmless for scoring (no run is
  active) but the warmup / setup test kit can double-trigger. Hoist the hook to
  `App` or make the listener singleton before this becomes a scored-path bug.
- `dailyLesson` can pick the same chart as Continue. Fine for a small catalog;
  revisit if the daily card should always be a different groove.
- Results / Continue auto-start Play. Confirm on a real controller that the
  count-in is long enough after the click.

---

Conventions for anyone adding tests are in the README's **Tests** section. Keep
engine tests on the fake clock and validator rules backed by negative fixtures.
