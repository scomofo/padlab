#!/usr/bin/env bash
# Package PadLab as a macOS .app and .dmg. Run on macOS.
#
#   scripts/package-macos.sh arm64
#   scripts/package-macos.sh x64
#
# Expects `electron` to be installed for the target architecture, e.g.
#   npm_config_arch=x64 npm install --no-save electron@<version>
#
# The result is ad-hoc signed, not notarized: it runs locally, but anyone who
# downloads it has to clear the quarantine flag. See the README.
set -euo pipefail

ARCH="${1:-arm64}"
case "$ARCH" in
  arm64|x64) ;;
  *) echo "usage: $0 <arm64|x64>" >&2; exit 2 ;;
esac

[ "$(uname)" = "Darwin" ] || { echo "This script needs macOS (codesign, hdiutil)." >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
ELECTRON_APP="node_modules/electron/dist/Electron.app"
OUT="release"
APP="$OUT/PadLab.app"
STAGE="$OUT/stage"
DMG="$OUT/PadLab-$VERSION-$ARCH.dmg"

[ -d "$ELECTRON_APP" ] || { echo "Missing $ELECTRON_APP — install electron first." >&2; exit 1; }

echo "==> building the web app (relative base, so it loads off disk)"
npx vite build --base=./ --outDir "$OUT/web" --emptyOutDir

echo "==> assembling PadLab.app"
rm -rf "$APP" "$STAGE"
mkdir -p "$STAGE"
cp -a "$ELECTRON_APP" "$APP"
mkdir -p "$APP/Contents/Resources/app"
cp electron/main.cjs electron/package.json "$APP/Contents/Resources/app/"
cp -a "$OUT/web" "$APP/Contents/Resources/app/web"
rm -rf "$APP/Contents/Resources/default_app.asar" "$APP/Contents/Resources/electron.icns"
cp assets/PadLab.icns "$APP/Contents/Resources/PadLab.icns"

echo "==> patching Info.plists"
python3 scripts/patch-macos-plists.py "$APP" "$VERSION"

# Apple Silicon refuses to execute unsigned code, and editing the bundle
# invalidates the signature Electron ships with, so everything gets re-signed.
#
# Order matters, and so does reach. codesign refuses to seal a bundle that
# still contains unsigned code, and the darwin-x64 build of Electron ships
# *nothing* signed — not just the bundle executables but the crashpad handler,
# four dylibs under Versions/A/Libraries, and Squirrel's ShipIt. (The arm64
# build arrives fully pre-signed, because Apple Silicon will not run otherwise,
# which is why an x64-only failure here is easy to miss.) So: every loose
# Mach-O first, then the nested bundles, then the outer app.
echo "==> ad-hoc signing"

# 1. Nested binaries that are not any bundle's own main executable: the crashpad
#    handler, the dylibs under Versions/A/Libraries, and Squirrel's ShipIt.
#    Nothing else reaches these, and they are exactly what the x64 build leaves
#    unsigned. Only these — a bundle's main executable must NOT be signed here,
#    because codesign resolves such a path to its enclosing bundle and would try
#    to seal that bundle before its own contents are signed.
sign_count=0
while IFS= read -r -d '' bin; do
  case "$(file -b "$bin")" in
    *Mach-O*) codesign --force --sign - --timestamp=none "$bin"; sign_count=$((sign_count + 1)) ;;
  esac
done < <(find "$APP/Contents/Frameworks" -type f ! -type l \
  \( -path '*/Helpers/*' -o -path '*/Libraries/*' -o -path '*/Resources/*' \) -print0)
echo "    signed $sign_count nested binaries"

# 2. The nested bundles. Signing a bundle seals its own main executable too.
while IFS= read -r -d '' nested; do
  codesign --force --sign - --timestamp=none "$nested"
done < <(find "$APP/Contents/Frameworks" -maxdepth 1 \( -name '*.framework' -o -name '*.app' \) -print0)

# 3. Finally the outer bundle, over contents that are now fully signed.
codesign --force --sign - --timestamp=none "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

echo "==> building $DMG"
cp -a "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
rm -f "$DMG"
hdiutil create -volname "PadLab" -srcfolder "$STAGE" -fs HFS+ -format UDZO -ov "$DMG"

echo "==> verifying the image mounts and the app inside it is intact"
MNT="$(mktemp -d)"
hdiutil attach "$DMG" -mountpoint "$MNT" -nobrowse -quiet
trap 'hdiutil detach "$MNT" -quiet -force || true' EXIT
[ -x "$MNT/PadLab.app/Contents/MacOS/Electron" ] || { echo "main executable missing or not executable" >&2; exit 1; }
[ -f "$MNT/PadLab.app/Contents/Resources/app/web/index.html" ] || { echo "web payload missing" >&2; exit 1; }
codesign --verify --deep --strict "$MNT/PadLab.app"
echo "    mounted, signature verifies, payload present"

shasum -a 256 "$DMG"
echo "==> done: $DMG"
