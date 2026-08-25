# TODO

Open work as of `main` @ `e7c580d` (2026-08-21). Core CI is green and there are
no open pull requests or standalone issues. Remaining work is release acceptance,
two explicit design decisions, targeted coverage, and repository hygiene.

## Release-candidate gate

PadLab is ready to call a release candidate when every item in this section passes.
Automated checks are already green on `main`; these checks cover the physical and
packaged-app surfaces CI cannot prove.

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

### Packaged macOS acceptance

Use the DMG produced by the release workflow, not a dev-server build.

- [ ] DMG opens and contains `PadLab.app`.
- [ ] App can be copied to `/Applications` and launched by double-clicking.
- [ ] Document the expected Gatekeeper flow for the current ad-hoc-signed build;
      no unexplained blank window or silent failure is acceptable.
- [ ] Main window renders the lesson browser and opens a lesson normally.
- [ ] Web MIDI permission succeeds in the Electron shell and a connected physical
      controller appears in Device Setup.
- [ ] A lesson can be played from count-in through results with real MIDI input.
- [ ] Quit and relaunch preserves progress and settings.

### RC decision

- [ ] **RC PASS:** all controller and packaged-macOS checks above pass with no P0/P1
      defect and no recurring P2 defect that compromises scoring, input, startup,
      persistence or lesson completion.

## Repo hygiene

- [ ] **Delete stale branches.** Current comparison against `main` shows nine
      non-main branches. Seven are strictly behind with zero commits ahead; two
      are divergent but their intended work has already been superseded on main.
      None should be merged as-is.

      | Branch | Compared with `main` | Action |
      |---|---|---|
      | `claude/fix-x64-signing` | 0 ahead / 6 behind | Delete; PR #9 is merged. |
      | `claude/macos-release` | 0 ahead / 9 behind | Delete; PR #7 is merged. |
      | `claude/project-state-detection-81tfdq` | 0 ahead / 27 behind | Delete; merged work only. |
      | `claude/test-coverage-analysis-d9rvfq` | 0 ahead / 11 behind | Delete; PRs #3/#5 are merged. |
      | `claude/todo-file` | 0 ahead / 15 behind | Delete; PR #6 is merged. |
      | `claude/todo-implementation-3mwax4` | 0 ahead / 29 behind | Delete; merged work only. |
      | `fix/difficulty-calibration` | 0 ahead / 32 behind | Delete; merged work only. |
      | `fix/scoring-stray-penalty` | 1 ahead / 32 behind, diverged | Delete; its scoring intent was cherry-picked/adapted in PRs #4/#5. Do not merge this stale branch because it carries obsolete surrounding content. |
      | `claude/todo-implementation-covl1b` | 1 ahead / 4 behind, diverged | Delete; this was an earlier settings-validation implementation superseded by PR #11. |

## Open design questions

Each is pinned by a test that documents the behaviour rather than endorsing it,
so changing either should be an explicit product decision. Grep
`rather than endorsing it` in `tests/`.

- [ ] **Decide how a step with no player notes should score.**
      `src/engine/scoring.ts` currently short-circuits when `total === 0`, awarding
      100% and 3 stars. It is unreachable with today's validator because the final
      scored step requires `playerPads: "all"`, but an authoring change could make
      free stars reachable. Pinned by `tests/engine/scoring.test.ts` → *"awards a
      full score for a step with no player notes"*.
- [ ] **Make or explicitly accept the ostinato difficulty discontinuity.**
      Crossing the 0.5-beat gap ceiling in `scripts/lib/difficulty.mjs` marks a pad
      as ostinato and applies the 0.4 weight to all its instants. Adding notes can
      therefore lower calculated difficulty (1.9 vs 3.0 effective hits/sec in the
      pinned example). Pinned by `tests/scripts/difficulty.test.mjs` → *"a denser
      hat scores easier than a sparser one"*.

## Targeted coverage

The engine, validators, MIDI layer and persistence are already heavily tested.
Do not chase presentation-line coverage for its own sake; add tests where they
protect behaviour or arithmetic.

- [ ] **LessonBrowser progress aggregation:** cover `totalStars`, per-course
      `done`/`total`, completed-course state, and the guide-vs-lesson branch.
- [ ] **`usePadKeyboard`:** add Testing Library coverage for keydown mapping,
      ignored keys and cleanup/unmount behaviour.
- [ ] **Top-level smoke test:** add one React integration test covering app start,
      lesson selection and the Device Setup open/close path.
- [ ] **WebAudio only if changing synth behaviour:** build an audio-graph harness
      before asserting implementation details in `src/audio/*`.

---

Conventions for anyone adding tests are in the README's **Tests** section. Keep
engine tests on the fake clock and validator rules backed by negative fixtures.
