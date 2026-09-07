# Validation evidence: timestamped input and focused gameplay

Validated on 2026-09-06 Edmonton time (2026-09-07 UTC), against a working tree based on `20f1176e4ee3e9f8979868c3c4e3b4a15b83a77d`. This evidence belongs to the accompanying implementation, not the older v0.1.0 release.

## Automated gates

| Gate | Observed result |
| --- | --- |
| Baseline | 797 tests / 28 files passed on Node 22 before implementation. |
| Final `npm run check` | TypeScript and production build passed; lesson/guide validation passed; **837 tests / 35 files passed**. |
| Runtime used | Node **22.23.2**, macOS arm64. Default Node 20 failed existing jsdom requirements, so an isolated Node 22 runtime was used without changing the machine's default. |
| Timestamp regressions | Correct grading at 0/80/200/250 ms delayed dispatch, sweep-before-input ordering, -50/20/150 ms compensation, batched fast rolls, bounce, stale/prior-run events and suspended clocks. Combo regressions cover deferred misses and out-of-order hit/stray delivery. |
| Integration regressions | Existing rewards, daily rules, focus drills, practice sessions, history and resume tests remain passing. |
| MIDI lifecycle | Synthetic timestamp forwarding, disconnected-port cleanup, replacement-object reconnection and single-flight initialization pass. |
| Report correctness | Bounded capture, fallback exclusion from delivery statistics, explicit manual status and no automatic hardware passes are tested. |
| Display correctness | Live accuracy excludes future notes and agrees with final scoring once judging is complete. Release-mode marker detection is tested. |

## Browser checks

Chrome **152.0.7977.77**, isolated headless profile, muted audio. A synthetic keyboard-driven First Taps Perform completed with **16 Perfect, 0 misses, 0 extra hits, 100% accuracy**. Desktop live status correctly showed 100% after its first successful hit. No page errors were observed.

Layouts were checked at 1280×900, 1366×768 and 390×844; no horizontal overflow was detected. A 16-pad Practice lesson rendered all 16 pads and reached the expected waiting state. The reduced-motion preference was exercised; the mobile 16-pad screenshot uses it. Essential note motion is intentionally retained.

The diagnostics UI was tested with injected MIDI events, **not a physical controller**. One mapped pad hit and one control message were distinguished, and exporting the unfinished checklist correctly produced `incomplete`. Browser MIDI permission was not established by this synthetic fixture; native permission was checked separately.

Machine-readable evidence: [browser run](browser-acceptance.json), [diagnostics and 16-pad UI](device-ui-acceptance.json), and [synthetic diagnostic export](diagnostic-export-synthetic.json).

Screenshots: [desktop gameplay](gameplay-desktop.png), [mobile gameplay](gameplay-mobile.png), [16-pad gameplay](gameplay-16-pads.png), [16-pad mobile](gameplay-16-pads-mobile.png), [results](gameplay-results.png), [diagnostics](hardware-diagnostics.png).

## Local Apple Silicon bundle

The existing packaging script, with the new bundle marker, produced an ad-hoc-signed app and DMG using **Electron 33.2.1**. The image mounted, its payload and marker were present, and `codesign --verify --deep --strict` passed. This local artifact retains package version 0.1.0; it is a QA build, **not a replacement release/tag**.

SHA-256 of the locally tested `PadLab-0.1.0-arm64.dmg`:

```text
e2001c58ec212de9f9713b2a37c8bdc15b8e5d0937b3e0ccb9ccc5692931231c
```

The bundled app was launched twice with a dedicated temporary user-data directory. It loaded `padlab://app`, opened a lesson, advanced through the count-in, granted MIDI permission and retained a volume change across quit/relaunch. No page errors were observed. The user's installed app and normal profile were not used or modified.

Native testing found that preserving the executable name `Electron` leaves Electron's raw `isPackaged` flag false. The signed `.padlab-bundle` marker now selects release behaviour independently. The final native check explicitly verifies that development tools are disabled and the development menu is removed; it does not pretend that the raw flag changed.

Evidence: [native checks](native-arm64-acceptance.json), [native gameplay](native-arm64-gameplay.png), [automated check output](automated-checks.txt), [local package output](package-checks.txt).

## Not accepted by these results

**CoreMIDI input sources detected: 0.** Neither the MPK Mini MK4 nor SP-404 MKII was physically tested. Native permission success without a controller is not a hardware pass. No audio round-trip latency, listening quality or actual pad responsiveness measurement was performed.

A downloaded release's Gatekeeper/Applications installation path, Intel x64 build, physical Learn persistence, unplug/replug during performance, controller bounce/roll behaviour and real-controller daily/progress acceptance remain unverified. Existing software tests do not close those gates.

Follow [the operator acceptance procedure](../HARDWARE_ACCEPTANCE.md), export one real report per controller/build, and keep the RC checklist open until those checks pass.

Repeatable probes and commands: [scripts/qa](../../scripts/qa/README.md).
