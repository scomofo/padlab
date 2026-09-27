# PadLab v0.1.1 release acceptance

Branch `scout/release-prep` is based on `main` @ `2538427e` with `package.json`
bumped to `0.1.1` (validated: tests/lint/build green — see below). Everything
below needs real hardware and cannot be done in CI.

Full operator procedure: [docs/HARDWARE_ACCEPTANCE.md](docs/HARDWARE_ACCEPTANCE.md).
The app has a built-in capture flow at **Device & settings → Hardware acceptance
& MIDI diagnostics** — enter controller/build/output metadata there first,
export one report per controller, and never promote an unperformed check.

## 0. Prep (5 min)

1. Back up existing PadLab progress/settings (localStorage `padlab-profile-v1`).
2. Disconnect all MIDI controllers except the one under test.
3. Note per run: macOS version, controller model + firmware (or "unknown"),
   audio output device, tested commit/DMG.

## 1. Cut the release (GitHub, no local build needed)

1. Merge this branch to `main` (scott merges).
2. Actions tab → **Release (macOS)** → Run workflow → tag **`v0.1.1`**
   (package.json is 0.1.1; the workflow refuses a mismatched tag).
3. Confirm the workflow publishes a GitHub release with **both**
   `PadLab-*-arm64.dmg`, `PadLab-*-x64.dmg`, and `SHA256SUMS.txt`.
4. `shasum -a 256 -c SHA256SUMS.txt` on the downloads.

**Pass:** release exists, all three artifacts present, checksums verify.

## 2. Packaged macOS acceptance (arm64 DMG on your Mac)

1. Open the DMG — it contains `PadLab.app`.
2. Copy to `/Applications`, double-click to launch.
3. Expected Gatekeeper flow (ad-hoc signed, **not notarized**):
   `xattr -dr com.apple.quarantine /Applications/PadLab.app`
   — or System Settings → Privacy & Security → "Open Anyway" after the first
   blocked launch. No unexplained blank window or silent failure is acceptable.
4. Main window renders the studio (Continue / Daily groove / deck pads); a
   lesson opens normally.
5. Web MIDI permission succeeds in the Electron shell; the connected physical
   controller appears in Device Setup.
6. Play a lesson count-in → results with real MIDI input.
7. Quit and relaunch — progress, settings, streak, XP preserved.

**Pass:** every step above works. (x64 DMG needs an Intel Mac — test separately
before claiming it.)

## 3. Controller acceptance (repeat per controller: Akai MPK Mini MK4, Roland SP-404 MKII)

In the app's Hardware acceptance panel, enter controller/build/output metadata
**before** starting; export the report when done.

| # | Check | Procedure | Pass |
|---|-------|-----------|------|
| 1 | Factory mapping | Clear custom mapping; strike every pad. MPK: both banks (notes 36–43 / 44–51). SP-404: all 16 pads (36–51). | Pads trigger the expected PadLab sounds with no MIDI Learn |
| 2 | MIDI Learn | Remap ≥2 pads; confirm used immediately; quit/reopen app. | Learned mapping persists and works after relaunch |
| 3 | Input isolation | After Learn, play keybed notes, move knobs, use transport. | Unlearned controls never trigger pads or score hits |
| 4 | Latency compensation | Same short chart at −50 ms, 20 ms, 150 ms. | Judgement shifts predictably; ordinary on-time hits stay scoreable |
| 5 | Retrigger debounce | `amen-chop-science` (level 6), fast repeated same-pad strokes. | Intentional rolls not swallowed; pad bounce creates no phantom hits |
| 6 | Hot-plug | Disconnect/reconnect while the app is open (repeat after Learn). | Input resumes with no restart; one strike = one input |
| 7 | Daily loop | Scored Perform with real hits. | Continue auto-starts Play; streak grows, XP awarded; "Cleared today" only after the Perform step |

## 4. RC decision

**RC PASS** iff every check in §2 and §3 passes with no P0/P1 defect and no
recurring P2 defect compromising scoring, input, startup, persistence, or
lesson completion. Attach both controller exports to the release discussion.

## Validation already done (no hardware)

- `npm test`: 926/926 pass
- `eslint .`: clean
- `npm run build` (tsc + vite): green
- `npm run validate` (lesson/guide validators + difficulty analysis): green
