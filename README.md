# LV24 Brain Desktop

[![ci](https://github.com/LevapVeeskela/lv24-brain-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/LevapVeeskela/lv24-brain-desktop/actions/workflows/ci.yml)

The Tauri v2 shell for [LV24 Brain](https://github.com/LevapVeeskela/lv24-brain).
It keeps the local brain agent running, exposes it through a token-safe proxy,
and provides the tray, autostart, updater and OAuth deep-link plumbing the
desktop UI is built on.

**Status: v0.1.0, WP5.1 shell.** The full FSD/MobX UI (WP5.2/5.3) and signed
packaging (WP5.4) are the next packages. The window in this repository is a
working status and controls surface, not the final product UI.

## What works

- **Tray** with a status dot, agent state, Sync all, Pause/Resume, Open and Quit.
- **Agent supervision**: spawns `brain agent --parent-pid <desktop>`, watches
  the runtime record, restarts an unexpected exit with backoff and stops the
  agent gracefully on quit.
- **Single instance**: a second launch focuses the existing window.
- **Autostart**: HKCU Run on Windows, XDG autostart on Linux, and
  `SMAppService.mainApp` on macOS 13+. Starts hidden in the tray with
  `--autostart`.
- **Local API proxy**: the webview calls `api_request` / `run_log_open`; the
  Rust process adds the bearer token. The token never enters JavaScript.
- **Ed25519 updater**: Tauri updater signatures verified against the public key
  in `src-tauri/tauri.conf.json`; check and install commands are implemented.
- **OAuth deep links**: registers `lv24brain://`, validates only
  `lv24brain://oauth/...` and `lv24brain://auth/...`, buffers the URL for the UI
  and emits `oauth-callback`. The engine OAuth wiring is consumed by WP5.3.
- **Persistent pause**: pausing stops the agent and survives desktop restarts.
- **Structured tests** for path allow-listing, config discovery, runtime
  records, SSE parsing, settings persistence and the HTTP proxy.

## Architecture

```
┌──────────────────────────────┐
│ Webview (React + TS)         │
│  invoke("shell_status")      │
│  invoke("api_request", ...)  │──┐  no token, no port
└──────────────────────────────┘  │
                                  ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ Rust shell                   │   │ brain agent (sidecar/PATH)   │
│  supervisor ─────────────────┼──▶│  loopback API + scheduler    │
│  proxy (bearer token) ───────┼──▶│  agent/runtime.json (0600)   │
│  tray / autostart / updater  │   └──────────────────────────────┘
│  deep-link router            │
└──────────────────────────────┘
```

See [docs/architecture.md](docs/architecture.md) and
[docs/security.md](docs/security.md).

## Requirements

- Node.js 22+ (CI uses 24) and npm.
- Rust 1.90+ with the platform toolchain (MSVC on Windows).
- Tauri v2 system prerequisites for your OS.
- The LV24 Brain engine `0.12.0` or newer, initialized with `brain init` and
  selected with `brain config use <path>` (or `BRAIN_CONFIG`).

The engine is not bundled in v0.1.0. The supervisor resolves it in this order:

1. `LV24_BRAIN_BIN`
2. `<resource-dir>/engine/brain[.exe]` or `<resource-dir>/brain[.exe]`
3. `<app-dir>/engine/brain[.exe]` or `<app-dir>/brain[.exe]`
4. `PATH`
5. the npm global platform package (`@lv24/brain-<os>-<arch>`)

WP5.4 will ship an engine sidecar in the installer.

## Development

```bash
npm install
npm run tauri dev
```

Useful environment variables:

| Variable | Meaning |
| --- | --- |
| `LV24_BRAIN_BIN` | Absolute path to the engine executable. |
| `BRAIN_CONFIG` | Explicit `brain.yaml` (the engine's own variable). |
| `LV24_BRAIN_CONFIG` | Desktop override for `BRAIN_CONFIG`. |
| `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` | `--remote-debugging-port=9222` for local CDP smoke tests. |

Checks:

```bash
npm run typecheck
npm run build
cd src-tauri
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test
```

A full desktop build without an installer:

```bash
npm run tauri build -- --debug --no-bundle
```

`npm run tauri build` with bundling requires the updater signing key; see
below.

## Updates and signing

The updater is enabled with Tauri's Ed25519 (minisign-compatible) signatures.
The public key is committed in `src-tauri/tauri.conf.json`. The private key is
**not** in this repository.

The current public key belongs to the v0.1.0 development key generated on the
maintainer machine. Before the first public release:

1. Generate a production key and store the private key in the release secret
   store (`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).
2. Replace `plugins.updater.pubkey` with the new public key.
3. Build installers with `createUpdaterArtifacts: true` and publish a
   `latest.json` at the endpoint in `tauri.conf.json`
   (`https://github.com/LevapVeeskela/lv24-brain-desktop/releases/latest/download/latest.json`).
4. Keep the previous public key available for one release so existing installs
   can migrate, then retire it.

Signing status: macOS signing/notarization waits for Apple Developer Program
approval; Windows signing waits for SignPath Foundation approval. Until then,
release test builds are unsigned and will show SmartScreen/Gatekeeper warnings.

## Known limitations (v0.1.0)

- No full connection/settings screens; WP5.2 adds FSD/MobX and the typed client,
  WP5.3 adds the screens.
- The engine binary is resolved from the environment, not bundled.
- Pause stops the agent. If an agent was started outside the desktop, Pause
  asks it to shut down through the local API; if it refuses, the shell reports
  an error instead of pretending it is paused.
- The local API is single-user and loopback-only; the bearer token grants full
  local control. Same-user malware can read `agent/runtime.json`, as documented
  by the engine's security acceptance.
- macOS autostart requires the signed app bundle and macOS 13+.
- OAuth callbacks are routed to the UI but the engine connection flow is not
  wired into the desktop UI yet.
- Full packaging/CI (NSIS per-user, DMG + zip, AppImage + deb/rpm) is WP5.4.

## License

Apache-2.0. See [LICENSE](LICENSE).
