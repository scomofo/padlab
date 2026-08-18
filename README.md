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

- **Lessons** live in `src/lessons/data/*.json` — 46 original charts across levels 1-6, grouped into courses (`src/lessons/courses.json`): Foundations, Technique Workouts, Hip-Hop Lab, Four to the Floor, Breaks & Bass, and Global Grooves.
- **Guides** live in `src/guides/data/*.json` — hardware walkthroughs rather than playable charts, shown as the **SP-404 MKII Workshop** course. They open in a step-by-step viewer with button-combo keycaps, a pad diagram per step, "you'll know it worked when" checkpoints, and a practice metronome. Covers resampling a first beat, chopping and shaping samples, the pattern sequencer, and Bus FX / printing effects. Your position in each guide is remembered. Each is a chart of `{t, pad, vel}` events plus **steps**: early steps give you one or two pads (the rest of the kit auto-plays as backing) at reduced tempo; the final **Perform** step is the whole kit at full speed and is what saves stars.
- **Modes** — *Listen* (the app plays it), *Practice* (playback waits at each note until you hit the right pad), *Play* (scored: Perfect ±45 ms, Great ±90 ms, Good ±135 ms; extra hits cost you; 3 stars at 90 %).
- **Sound** is a fully synthesized 16-voice drum kit (WebAudio — no samples), scheduled on the AudioContext clock with a lookahead scheduler, so timing doesn't wobble with the UI thread.
- **Devices** — MPK Mini pads map from factory notes 36-43 (bank A) / 44-51 (bank B); SP-404 MKII pads from notes 36-51. If your unit sends anything else, open the device panel (chip in the top-right of the lesson list) and run **MIDI Learn** — tap your pads in order once and the mapping is saved. A learned mapping is authoritative: notes outside it (keybed, knobs, transport buttons) are ignored, so nothing but your pads can trigger a sound. There's also an input-latency slider if hits feel systematically late — it shifts both judging *and* miss detection, so raising it never turns a good hit into a miss.
- **Progress** (best accuracy + stars per lesson) and settings persist in localStorage.

## Add a lesson

Two options. Write a JSON file into `src/lessons/data/` by hand following the shape of the existing ones, or — easier for anything rhythmically dense — describe it as a step grid and let `scripts/lib/chart.mjs` generate it. In a grid, one string is one bar, its length sets the resolution (16 chars = sixteenths), and each character is a velocity: `X` accent, `x` normal, `o` medium, `s` soft, `g` ghost, `.` rest.

```js
grid: {
  1: 'x...x...x...x...',   // kick: four on the floor
  3: '....x.......x...',   // clap: backbeat
  6: '..o...o...o...o.',   // open hat: offbeats
}
```

See `scripts/gen-*.mjs` for the courses authored this way. To add a hardware walkthrough instead, drop a JSON file in `src/guides/data/` following `src/guides/types.ts` — steps take `body` lines, optional `keys` combos (`[["SHIFT","TAP TEMPO"]]`), `pads` to highlight, a `checkpoint`, and a `tip`.

Either route, validate before committing:

```bash
npm run validate
```

The validator enforces pad mappings, event ranges, grid alignment, step sanity, per-pad spacing, and known course ids. It rejects charts with more than three notes on the same instant (unplayable with two hands) and warns when a chart is denser than its difficulty level claims.
