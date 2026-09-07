# Optional macOS acceptance probes

These Playwright probes are separate from the deterministic unit suite. They use an isolated browser/profile and muted audio. They do not certify real MIDI hardware or audio latency. The browser probes require the Vite development server because they import test instrumentation from source modules; that instrumentation is not added to the shipped application.

Use a supported Node version. Install optional QA tools without changing the lockfile:

```sh
npm ci
npm install --no-save --package-lock=false playwright@1.58.2 electron@33.2.1
npm run dev -- --host 127.0.0.1 --port 8757 --strictPort
```

In a second terminal in the checkout, with Google Chrome installed at its standard macOS path:

```sh
node scripts/qa/browser.mjs
node scripts/qa/device-ui.mjs
npm run package:mac -- arm64
node scripts/qa/native-macos.mjs
```

`PADLAB_BASE_URL` can override the development-server URL for the two browser probes. The native probe uses the locally built `release/PadLab.app`, verifies its test profile path before writing settings, and never installs over an existing app. It creates a temporary profile rather than using normal PadLab data.

Each probe writes explicitly scoped JSON evidence and screenshots to `docs/validation/`. Review new output before committing it; it replaces the recorded evidence from an earlier run. A native local launch is not equivalent to installing a quarantined download through Gatekeeper. The scripts close their own browser/app on completion and set a nonzero exit code if an assertion fails.

The broader physical-controller checklist is in [HARDWARE_ACCEPTANCE.md](../../docs/HARDWARE_ACCEPTANCE.md). Do not interpret injected MIDI messages as a successful physical device test.
