# Hardware and packaged-app acceptance

## Current decision

**Physical-controller acceptance is NOT complete.** During this change the connected Mac reported zero CoreMIDI input sources. Automated MIDI fixtures are not a substitute for playing the MPK Mini MK4 and SP-404 MKII. Do not mark the release-candidate gate passed or reuse the existing v0.1.0 tag.

See [validation evidence](validation/README.md) for the automated and local Apple Silicon checks performed. Intel, installation from a downloaded release, audible monitoring latency and real-pad behaviour still require an operator.

## Prepare one report per controller and build

Use wired audio for the initial comparison. Record the tested commit or DMG, controller model, firmware (or unknown), audio output and macOS version. Disconnect other MIDI controllers so a global learned mapping cannot conceal which device produced a hit.

Start from the packaged release candidate, not only the development server. Keep any existing installation and progress backed up before replacing an app. Follow the repository's documented signing/Gatekeeper procedure; this build is ad-hoc signed, not notarized.

In **Device & settings → Hardware acceptance & MIDI diagnostics**, enter controller/build/output metadata before starting a capture. Changing the controller clears its evidence and checkmarks. Changing the build or output clears checkmarks.

Capture is optional and keeps only the latest 200 messages in memory. Export before closing Device Setup or the app: the draft is deliberately not persisted. Perform the gameplay/relaunch checks first, then enter the final checklist observations and export one report per device. Never promote an unperformed check from **Not run** to **Pass**.

## Controller checks

| Check | Procedure and required evidence |
| --- | --- |
| Factory mapping | With the custom mapping cleared, test every pad. On MPK Mini MK4 test both banks; on SP-404 MKII test all 16 pads. Compare raw note/channel data and resulting PadLab pad/sound. Record discrepancies, not assumed factory correctness. |
| MIDI Learn | Learn the intended 8- or 16-pad layout, including at least two remapped pads. Close/reopen the app and verify that those assignments persist. MPK Bank B factory support is separate from the 8-pad learning flow. |
| Input isolation | After learning, play keybed notes, move knobs and use transport buttons. The raw log may show messages, but unlearned controls must not map to pads or score a hit. |
| Compensation | Run the same short chart at -50, 20 and 150 ms. Positive compensation subtracts from judged hit time; results should shift predictably. A genuinely on-time hit must not be swept as a miss while waiting for a callback. Restore the comfortable setting afterwards. |
| Repeated strokes | Use `amen-chop-science`, including unlocked faster tempos when available. Intentional fast strokes must remain distinct; duplicated/bouncing note-ons must not create phantom scored hits. Check audible behaviour separately from scoring. |
| Hot plug | Unplug and reconnect each controller while the app stays open. Its row should disappear/reappear, and one strike must produce one input without restarting. Repeat after MIDI Learn. |
| Progress | Complete a full-tempo Perform with real hits. Check results, stars, streak/XP and daily eligibility. A stopped or empty run must not receive completion credit. |

## Packaged macOS checks

Mount the DMG from the release workflow, copy PadLab.app to Applications, and launch it normally. Record the actual Gatekeeper flow rather than treating a local command-line launch as equivalent. Verify the studio, lesson navigation, MIDI permission, a count-in-to-results performance with real pads, and persistence after a complete quit/relaunch. Test both arm64 and x64 release artifacts on appropriate Macs before claiming both are accepted.

The packager includes a `.padlab-bundle` marker under Resources/app before signing. The shell uses that marker, or Electron's `app.isPackaged`, to select release mode: development tools are disabled and the development menu is removed. The original Electron executable/helper names remain unchanged.

## Timing contract and limitations

MIDI, keyboard and pointer events carry their original monotonic event timestamp. The scorer converts that timestamp to the existing audio-render-clock timeline before synthesis or DOM flashes. Missing, non-finite, future and legacy epoch timestamps fall back to receipt time; valid old timestamps are not silently made current.

The input-delivery budget is **250 ms**. Valid events older than that budget or originating before the current run are not scored. Final miss detection and run completion allow the same bounded backlog so a timer delivered ahead of an input callback cannot prematurely close its note window. This adds a deliberate delay to final miss feedback; it does not change hit grades.

The hit windows remain **Perfect ±45 ms, Great ±90 ms, Good ±135 ms**. Compensation still uses the existing -50 to 150 ms setting. Retrigger handling uses the original event spacing, not how tightly callbacks happened to be dispatched. Combo outcomes likewise use hit timestamps and original miss-window expiry, so a delayed miss cannot erase a newer valid streak or inflate the recorded peak.

These changes protect judging from bounded delivery jitter. They do not reconstruct audio lost to a long main-thread stall, remove device/output latency, guarantee uninterrupted audio scheduling, or reduce the time between a physical strike and audible monitoring. MIDI timestamps reflect system receipt, not the pad sensor's physical strike time.

## Interpret and retain evidence

The export distinguishes mapped note-ons, unmapped note-ons and other MIDI messages. Delivery median/p95/max measure event-to-callback delay for valid event timestamps only. They are **not audio round-trip latency measurements**; missing measurements display as unknown, not zero.

An export is `incomplete` until all checks are explicitly passed and build/controller/audio-output fields are filled. Any failed check makes the report `failed`; a complete report is only `operator-reported-pass`, never an automated hardware certification. Review the notes and correct build/device context before using it as release evidence.

Attach the two completed controller reports and packaged-app observations to the candidate PR/release discussion. A recurring defect compromising startup, input, scoring, persistence or completion keeps the RC gate open. Do not cut a new release until the outstanding gates pass and its version/tag are reconciled.
