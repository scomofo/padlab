# TODO

Open work as of `main` @ `649bf09`. Each item says what it is, where it lives, and
what "done" looks like — so none of it needs recovering from memory.

## In review

- [ ] **PR #5 — fast rolls swallowed by the retrigger debounce.** CI green,
      awaiting review. Fixes a P1: on `amen-chop-science` two pad-2 notes sit a
      32nd apart at 174 BPM (43.1 ms), so hitting one late and the next early
      puts the note-ons ~23 ms apart, inside the 30 ms debounce — the second was
      discarded and its note swept as a miss.

      Worth an actual look rather than a rubber stamp: the fix makes a design
      call. Time alone cannot separate a bounce from a fast stroke, because
      charted intervals go tighter than the debounce window once ordinary timing
      error is included. So matching now runs first, and inside the window the
      two are told apart by *proximity* — a bounce lands nearer the note just
      played, a real stroke nearer the next unplayed one.

      Known limit: two note-ons arriving closer together than the second is to
      the note it would claim are read as one strike. On the tightest chart that
      means arrivals under ~12 ms — roughly 90 Hz on a single pad, which no hand
      produces, so a bounce is the only physical explanation left.

      An earlier revision measured that distance from the *charted note* rather
      than from the previous note-on, which made the threshold move with the
      player's timing error: a 1 ms duplicate was scored as a real stroke once
      the stroke itself was 21 ms late, well inside the Perfect window. Review
      caught it. Both boundaries are now pinned by tests.

## Repo hygiene

- [ ] **Delete stale branches.** Five remain, four of them dead:

      | Branch | State |
      |---|---|
      | `fix/scoring-stray-penalty` | **Delete first.** Its commit is already in `main` via cherry-pick, but the branch still carries a README from when there were 39 lessons and one workshop course. Merging it now would revert the 50-lesson docs and delete the MPK Mini Workshop section. |
      | `fix/difficulty-calibration` | Merged into `main`, no unique work. |
      | `claude/todo-implementation-3mwax4` | Merged (PR #1), no unique work. |
      | `claude/project-state-detection-81tfdq` | Merged (PR #2), no unique work. |
      | `claude/test-coverage-analysis-d9rvfq` | Live — carries PR #5. Keep until that merges. |

## Needs hardware

- [ ] **Smoke test on real controllers.** The only item that cannot be automated
      from CI. Everything upstream of it now is.

      On an **Akai MPK Mini MK4** (8 pads, factory notes 36-43 / 44-51) and a
      **Roland SP-404 MKII** (16 pads, notes 36-51), check:

      - Pads map to the right sounds out of the box, on both banks for the MPK.
      - **MIDI Learn** records a mapping, and afterwards the keybed, knobs and
        transport buttons trigger nothing. This is promised in the README and
        covered by unit tests, but never verified against real firmware.
      - The **input-latency slider** (-50..150 ms) shifts judging without turning
        good hits into misses.
      - **The retrigger debounce against real velocity pads.** This is the whole
        reason the debounce exists — bouncy pads sending duplicate note-ons — and
        it has only ever been tested against synthetic input. Play a fast roll on
        the tightest chart (`amen-chop-science`, level 6) and confirm no notes
        are dropped and no phantom strays appear. Do this after PR #5 lands.

## Open design questions

Each is pinned by a test that documents the behaviour rather than endorsing it,
so changing any of them shows up as an intentional diff. Grep
`rather than endorsing it` in `tests/`.

- [ ] **A step with no player notes scores 100% and 3 stars.**
      `src/engine/scoring.ts` short-circuits when `total === 0`. Unreachable
      today because the validator forces `playerPads: "all"` on the final scored
      step — but it is one authoring change away from awarding free stars.
      Pinned by `tests/engine/scoring.test.ts` → *"awards a full score for a step
      with no player notes"*.

- [ ] **The ostinato discount is not monotonic in density.** Crossing the
      0.5-beat gap ceiling in `scripts/lib/difficulty.mjs` flips a pad to
      "ostinato" and applies the 0.4 weight to every instant it owns, so *adding*
      notes can make a chart score easier — 1.9 vs 3.0 effective hits/sec on two
      otherwise identical charts. Since that number is what the per-level ceiling
      is checked against, a chart can be made to fit a lower tier by making it
      denser. Pinned by `tests/scripts/difficulty.test.mjs` → *"a denser hat
      scores easier than a sparser one"*.

- [ ] **`loadSettings` does no type validation.** `src/store/progress.ts` spreads
      stored values over the defaults, so a corrupt or hand-edited
      `padlab-settings-v1` puts a string straight into the timing maths —
      `latencyMs` feeds beat arithmetic in `PlayerRuntime`. Wants a guard.
      Pinned by `tests/store/progress.test.ts` → *"does not currently validate
      stored value types"*.

## Untested surface

The engine, validators, MIDI layer and persistence are at 90-100%. What is left
is ~1,500 lines at 0%, deliberately scoped out so far:

| Area | Lines | Notes |
|---|---|---|
| `src/components/*.tsx` | 1,139 | Mostly presentational. `Highway.tsx` (268) is canvas drawing — expensive to test, low risk. |
| `src/audio/*` | 245 | WebAudio synthesis; needs an audio-graph harness to assert anything meaningful. |
| `src/App.tsx` | 81 | Top-level wiring. |
| `src/input/usePadKeyboard.ts` | 21 | A React hook, so it needs Testing Library — the only reason it is not already covered. |

- [ ] If any of this gets picked up, start with `LessonBrowser`'s progress
      aggregation (`totalStars`, per-course `done`/`total`, and the
      guide-vs-lesson branch) — it is the only component with real arithmetic in
      it. Adding `@testing-library/react` would also unblock `usePadKeyboard`.

---

Conventions for anyone adding tests are in the README's **Tests** section — the
fake-clock rule for engine tests and the negative-fixture rule for validator
rules both matter and are easy to miss.
