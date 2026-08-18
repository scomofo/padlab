"""Rewrite the Info.plists inside a copied Electron.app so it presents as PadLab.

Usage: patch-macos-plists.py <path/to/PadLab.app> <version>

Deliberately does NOT rename Contents/MacOS/Electron. Electron locates its
helper processes from that name, and the shipped helpers are called
"Electron Helper*"; renaming one without the other risks an app that cannot
spawn a renderer. What the user sees comes from CFBundleName and the icon,
both of which are set here, so the executable name costs nothing visible.
"""
import plistlib
import sys
from pathlib import Path

app = Path(sys.argv[1])
version = sys.argv[2]

info = app / 'Contents/Info.plist'
d = plistlib.loads(info.read_bytes())
d.update({
    'CFBundleName': 'PadLab',
    'CFBundleDisplayName': 'PadLab',
    'CFBundleIdentifier': 'com.scomofo.padlab',
    'CFBundleIconFile': 'PadLab.icns',
    'CFBundleShortVersionString': version,
    'CFBundleVersion': version,
    'NSHighResolutionCapable': True,
})
info.write_bytes(plistlib.dumps(d))
print(f'  {app.name}: {d["CFBundleName"]} {version} ({d["CFBundleIdentifier"]})')

# Electron ships helper plists without CFBundleExecutable. macOS infers it from
# the bundle name, but codesign cannot, and signing every nested binary is
# mandatory on Apple Silicon.
for helper in sorted((app / 'Contents/Frameworks').glob('*Helper*.app')):
    hp = helper / 'Contents/Info.plist'
    hd = plistlib.loads(hp.read_bytes())
    exe = next(f.name for f in (helper / 'Contents/MacOS').iterdir() if f.is_file())
    hd['CFBundleExecutable'] = exe
    hp.write_bytes(plistlib.dumps(hd))
    print(f'  helper: {helper.name} -> {exe}')
