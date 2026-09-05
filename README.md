# PadLab

A Melodics-style finger-drumming trainer for pad controllers. Lessons scroll toward a hit line; you play them on your pads and get judged on timing.

Built for the **Akai MPK Mini MK4** (8 pads) and **Roland SP-404 MKII** (16 pads), but any MIDI controller works — and so do your computer keyboard (`Z X C V / A S D F / Q W E R / 1 2 3 4`, bottom row = pads 1-4) and mouse/touch on the on-screen pads.

## Run it

```
npm install
npm run dev        # http://localhost:8743
```

Use Chrome or Edge — Web MIDI is required for hardware controllers. Allow MIDI access when prompted.

## How it works

- **Lessons** live in `src/lessons/data/*.json` — 50 original charts across levels 1-6, grouped into courses (`src/lessons/courses.json`): Foundations, Technique Workouts, Hip-Hop Lab, Four to the Floor, Breaks & Bass, and Global Grooves. Each is a chart of `{t, pad, vel}` events plus **steps**: early steps give you one or two pads (the rest of the kit auto-plays as backing) at reduced tempo; the final **Perform** step is the whole kit at full speed and is what saves stars.
- **Guides** live in `src/guides/data/*.json` — hardware walkthroughs rather than playable charts, grouped into two more courses: the **SP-404 MKII Workshop** (resampling a first beat, chopping and shaping samples, importing and laying out a kit, the pattern sequencer, Bus FX / printing effects, and building a live set) and the **MPK Mini MK4 Workshop** (pads and banks, note repeat and the arpeggiator, saved programs and knob assignments). They open in a step-by-step viewer with button-combo keycaps, a pad diagram per step, "you'll know it worked when" checkpoints, and a practice metronome. Your position in each guide is remembered.
- **Modes** — *Listen* (the app plays it), *Practice* (playback waits at each note until you hit the right pad), *Play* (scored: Perfect ±45 ms, Great ±90 ms, Good ±135 ms; 3 stars at 90 %). Extra hits cost accuracy proportionally, capped at 20 points, so sloppiness can't wipe out a run where you hit every note. Repeat hits on the same pad within 30 ms are treated as one hit, since velocity pads bounce and some controllers send duplicate note-ons.
- **Sound** is a fully synthesized 16-voice drum kit (WebAudio — no samples), scheduled on the AudioContext clock with a lookahead scheduler, so timing doesn't wobble with the UI thread.
- **Devices** — MPK Mini pads map from factory notes 36-43 (bank A) / 44-51 (bank B); SP-404 MKII pads from notes 36-51. Mapping is channel-aware: the MPK profile ignores everything on the keybed's factory channel (1), because the keybed's lower octaves reuse the Bank B note numbers and would otherwise score phantom pad hits. If your unit sends anything else, open the device panel (chip in the top-right of the lesson list) and run **MIDI Learn** — tap your pads in order once and the mapping is saved. A learned mapping is authoritative and remembers the channel along with the note: anything outside it (keybed, knobs, transport buttons) is ignored, so nothing but your pads can trigger a sound. There's also an input-latency slider if hits feel systematically late — it shifts both judging *and* miss detection, so raising it never turns a good hit into a miss.
- **Daily loop** — the home screen leads with **Continue** (the next unmastered lesson, auto-starts) and a **Daily groove** (one chart a day in your current level band, +60 XP). A scored Perform grows a streak, awards XP toward ranks (Rookie → Legend), and unlocks badges. Every 7 days of streak earns a **streak freeze** (max 2): miss one day and the next Perform spends a freeze to bridge the gap instead of resetting. The home screen shows the streak as *at risk* once yesterday's goal is the last one met, and as *frozen* when a freeze will save it. A **daily XP goal** (150 XP) fills a ring on the home screen and a bar on the results card. Practice steps still pay a little XP so they feel like play; only Perform counts for stars, streak, and the daily bonus.
- **Results** — after each run the card shows a five-bucket timing histogram (early / on / late), your average lean in ms, and one line on what to fix next: how far you are from the next star and how many notes that is, or which way you are leaning. XP and the rank bar count up from where you were.
- **Progress** (best accuracy + stars per lesson, plus XP / streak / rank in `padlab-profile-v1`) and settings persist in localStorage.

## Add a lesson

Two options. Write a JSON file into `src/lessons/data/` by hand following the shape of the existing ones, or — easier for anything rhythmically dense — describe it as a step grid and let `scripts/lib/chart.mjs` generate it. In a grid, one string is one bar, its length sets the resolution (16 chars = sixteenths), and each character is a velocity: `X` accent, `x` normal, `o` medium, `s` soft, `g` ghost, `.` rest.

```js
grid: {
  1: 'x...x...x...x...',   // kick: four on the floor
  3: '....x.......x...',   // clap: backbeat
  6: '..o...o...o...o.',   // open hat: offbeats
}
```

See `scripts/gen-*.mjs` for the courses authored this way. To add a hardware walkthrough instead, drop a JSON file in `src/guides/data/` following `src/guides/types.ts` — steps take `body` lines, optional `keys` combos (`[["SHIFT","TAP TEMPO"]]`), `pads` to highlight, a `checkpoint`, and a `tip`. A guide's `course` must exist in `src/lessons/courses.json`; a course containing only guides is fine.

Either route, validate before committing:

```bash
npm run validate
```

The validator enforces pad mappings, event ranges, grid alignment, step sanity, per-pad spacing, and known course ids. It rejects charts with more than three notes on the same instant (unplayable with two hands) and warns when a chart is denser than its difficulty level claims. Its rules live in `scripts/lib/validate.mjs`; the two `scripts/validate-*.mjs` entry points just read files, print, and set the exit code.

## Desktop app (macOS)

The **Release (macOS)** workflow builds `PadLab.app` for both Mac architectures
and publishes the DMGs to a GitHub release. Push a `v*` tag, or run it from the
Actions tab and give it a tag name.

To build one locally — macOS only, since it needs `codesign` and `hdiutil`:

```bash
npm install --no-save electron@33.2.1
npm run package:mac            # arm64; pass x64 for Intel
```

The shell is `electron/main.cjs`. Two things there are load-bearing rather than
incidental:

- It serves the app over a registered `padlab://` scheme, not `file://`.
  Chromium refuses to load ES modules from a `file://` origin (opaque to CORS),
  so `loadFile` gives a blank window. The scheme also makes the page a secure
  context, which Web MIDI requires.
- The packaging script never renames `Contents/MacOS/Electron`. Electron
  resolves its helper processes from that name and the shipped helpers are
  called `Electron Helper*`; renaming one without the other risks an app that
  cannot spawn a renderer. Everything the user sees comes from `CFBundleName`
  and the icon.

Builds are **ad-hoc signed, not notarized** — there is no Apple Developer
certificate — so macOS quarantines the download. Clear it with
`xattr -dr com.apple.quarantine /Applications/PadLab.app`. Ad-hoc signing is not
optional: Apple Silicon refuses to execute unsigned binaries at all, and editing
the bundle invalidates the signature Electron ships with.

`assets/PadLab.icns` is generated by `scripts/make-icns.py`, which draws the
app's own pad palette. Rerun it if the palette in `src/engine/kits.ts` changes.

## Tests

```bash
npm test            # unit tests
npm run test:watch  # re-run on change
npm run check       # typecheck + build, validate, test — what CI runs
```

Tests live in `tests/`, mirroring the source layout. They cover the scoring
and timing engine, the transport, the player runtime, device profiles and MIDI
handling, saved progress, the XP/streak/rank loop, next-lesson and daily-groove
picks, the difficulty model, the chart authoring helper, both validators, the
computer-keyboard pad map (`usePadKeyboard`), and one React smoke test that
boots the studio, opens Device Setup, and enters a lesson. The WebAudio synth
and the rest of the presentation layer are not covered.

Two things worth knowing when adding tests:

- The engine is driven by a **fake AudioContext clock and fake timers** (see
  `tests/engine/player.test.ts`), so a ten-second run executes in microseconds
  and is exactly reproducible. Never use real timers for engine tests.
- Both validators run against **negative fixtures** — each test breaks exactly
  one rule and asserts that rule fires. If you add a validation rule, add the
  fixture that proves it works; a rule with no failing fixture is untested.

A handful of tests deliberately pin behaviour that is questionable rather than
correct, each with a comment saying so. They exist so that changing the
behaviour shows up as an intentional diff rather than a silent one. Grep for
`rather than endorsing it` in `tests/` to find them.
