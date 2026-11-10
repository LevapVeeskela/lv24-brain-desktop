# Security model (v1.1.0)

The shell is the only component that ever holds the local API bearer token.
This document records the boundary and the accepted residual risks.

## Assets and boundaries

| Asset | Location | Exposure |
| --- | --- | --- |
| Local API bearer token | `data_dir/agent/runtime.json`, engine writes 0600 | Read only by the Rust process. Never returned by a command. |
| Agent port | same runtime record | Used only by the Rust HTTP client. |
| Connection credentials | OS secret store, engine-owned | Never read by the desktop. |
| Desktop settings | Tauri app config dir | Non-secret (`paused`, optional config path). |
| OAuth callback URL | Deep-link plugin | Validated scheme/host before buffering or emitting. |
| Updater private key | CI secret / maintainer machine | Not in the repository. |

## Controls

- **No token in the webview.** The frontend calls `api_request` and
  `run_log_open`. The Rust side reads the runtime record, adds
  `Authorization: Bearer …`, and returns only the status/body or SSE frames.
- **SSRF-resistant proxy.** Only `/v1/` paths, no absolute URL, no redirects, no
  system proxy, no traversal or encoded traversal, no control characters. The
  port always comes from the runtime record, never from the request.
- **CSP.** Production uses `default-src 'self'`, no remote script, no remote
  connect. Development CSP is relaxed only for the Vite dev server.
- **No remote content / no remote IPC.** The window loads the bundled frontend;
  no `dangerousRemoteDomainIpcAccess` or remote URL capability is configured.
- **Token redaction.** `RuntimeRecord` has a custom `Debug` implementation that
  prints `[redacted]`; errors from the HTTP client contain the URL, which has no
  token. Engine stderr is logged as-is (the engine redacts secrets) and is not
  forwarded to the webview.
- **Runtime file checks.** Symlinked runtime files are rejected; Unix
  world/group-readable permissions produce a warning. The token must be at
  least 32 characters and the port/PID must be non-zero.
- **Deep-link validation.** Only `lv24brain://oauth/...` and
  `lv24brain://auth/...` are accepted. A manually crafted executable argument
  cannot inject an arbitrary URL into the UI.
- **Engine CLI bridge.** The shell runs fixed engine subcommands with the
  resolved binary/config. Provider and secret output is parsed; the keychain
  command lists names only, never values. OAuth output is streamed as bounded
  text and the process times out after five minutes. The bridge shares the
  desktop's filesystem permissions and is not a privilege boundary.
- **Bundled engine.** Packaging downloads the engine release asset and verifies
  its SHA-256 against the release `checksums.txt` and the reviewed pin in
  `scripts/engine-checksums.json` before Tauri embeds it as a sidecar. GitHub
  release transport is HTTPS; engine upgrades require updating the pin.
- **Update while running.** Before installing a desktop update, the supervisor
  stops the agent (without persisting a pause), waits for shutdown and aborts
  the install if an external agent is still running. The app exits and the
  installer can replace the sidecar without a file lock.
- **Updater verification.** Tauri's updater checks an Ed25519 signature against
  the public key compiled into the app before installing. HTTPS endpoints are
  required in production.
- **Single instance.** One shell per user session; agent duplication is also
  prevented by the engine's per-data-dir OS lock.

## Process cleanup on Windows

When a restart needs a clean slate, stop only the exact `lv24-brain-desktop.exe`
and its exact `brain.exe` sidecar child, preferably by PID or full path. Never
use wildcard cleanup such as `Get-Process *lv24* | Stop-Process` or
`taskkill /IM lv24*`: several LV24 apps (the brain engine, LV24 WiFi Explorer,
and others) can run at the same time and would be killed too. If the target is
unclear, list processes first and stop only the intended one.

## Residual risks (accepted for the local-first MVP)

- Same-user malware can read `agent/runtime.json` and control the agent. The
  engine security review accepted this for a single-user local tool; there is
  no per-connection authorization.
- Loopback traffic is plain HTTP. It never leaves the machine, but a local
  process with the token can impersonate the desktop.
- The desktop app is a trusted local app: custom Tauri commands are available to
  any script running in its webview. The strict CSP and bundled-only content are
  what keep that boundary meaningful.
- Unsigned Windows/macOS test builds can be replaced by a malicious binary until
  SignPath/Apple signing is available. Automatic updates still require the
  Ed25519 signature.
- Pausing an agent that was started outside the desktop depends on the engine's
  `POST /v1/shutdown`; if that process refuses, the shell reports an error rather
  than claiming the sync is paused.
- No TLS, no multi-user separation, no remote API. Server mode is not managed by
  this shell.

## Reporting

Security issues should go through the LV24 Brain repository's security policy
rather than a public issue.

## Design refresh and local visual fixtures

The refresh keeps CSP, IPC allow-lists, updater key, deep-link scheme and
credential boundaries unchanged. Notifications are in-memory UI state, not
telemetry or persisted history. Credential presence still reads names only;
unknown status is distinguished from an absent credential.

Log Copy and Save export only received lines currently displayed, through an
explicit user action. They do not fetch more history or send data to a service.

`scripts/design-preview.html` is a development-only entry, excluded from the
production Vite entry. It restricts execution to a local development server and
uses existing Tauri mocks, fictional records and fictional secret names. No
provider, real keychain or engine is contacted. Fixtures must not be described
as production observations. See [verification](design-refresh/report.md).
