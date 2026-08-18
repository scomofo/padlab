PadLab for macOS, built from this commit.

| File | For |
|---|---|
| `PadLab-*-arm64.dmg` | Apple Silicon (M1 and later) |
| `PadLab-*-x64.dmg` | Intel Macs |

Open the DMG, drag **PadLab** onto the Applications shortcut, then run:

```
xattr -dr com.apple.quarantine /Applications/PadLab.app
```

The app is **ad-hoc signed but not notarized** — there is no Apple Developer
certificate behind it — so macOS blocks it until that attribute is cleared. The
alternative is System Settings → Privacy & Security → "Open Anyway" after the
first blocked launch.

Verify what you downloaded against `SHA256SUMS.txt`:

```
shasum -a 256 -c SHA256SUMS.txt
```

Web MIDI works the same as in the browser build: plug the controller in before
launching, and use the device chip in the top-right to run MIDI Learn if your
unit sends notes outside the factory ranges.
