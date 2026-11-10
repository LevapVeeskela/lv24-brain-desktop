# Shell architecture (WP5.1–WP5.5)

This document describes the v1.0.1 desktop shell. WP5.2 added the UI foundation,
WP5.3 the screens, WP5.4 packaging and WP5.5 the UX/accessibility pass.

## Frontend layers (FSD)

```
src/
  app/        RootStore composition, providers, router, layout, global styles
  pages/      dashboard, connections, connection detail/wizard, activity,
              projects, settings
  widgets/    app header/nav, engine overview/card, paths, connections,
              run log panel
  features/   engine controls, autostart, update check, locale, OAuth callback
  entities/   engine, connection, run, project, provider, sync, settings
  shared/     API transport/client, i18n, UI primitives, error/format helpers
```

- `RootStore` owns the Engine, Connections, Sync, Settings, Runs, Projects and
  Providers stores. It is created once by `RootStoreProvider`; the provider
  starts polling/event subscriptions and disposes them on unmount
  (StrictMode-safe).
- `EngineStore` polls `shell_status` every 4 seconds, listens for
  `engine-status`, `shell-error` and `oauth-callback`, and exposes start, pause,
  autostart and quit actions. An `engine-status` event refreshes the full shell
  snapshot so a tray pause/resume also updates the persisted pause flag.
- `ConnectionsStore` reacts to the engine running state: it loads the catalogue
  through the typed client, resets on stop and guards stale async results.
- `SyncStore` ensures the agent is running, loads the catalogue and queues every
  connection through the typed client, collecting per-connection failures.
- `RunsStore` lists recent runs and owns the SSE log stream. Events are matched
  by stream id; lines that arrive while `run_log_open` is still resolving are
  buffered. A finished stream reloads the run list.
- `ProjectsStore` and `ProvidersStore` load on demand; provider descriptors come
  from the engine CLI bridge.
- `SettingsStore` owns the UI locale (persisted in WebView local storage) and
  the desktop update check/install flow.
- Router: `HashRouter`, so a packaged webview never needs server-side routes.

### Typed client

`src/shared/api/openapi/localapi-v1.json` is a copy of the engine's
`internal/adapters/localapi/openapi.json`. `npm run api:generate` produces
`src/shared/api/generated/schema.d.ts` with `openapi-typescript`. The runtime
client is `openapi-fetch` with a custom fetch implementation that converts
`Request` to `api_request` and `ApiResponse` back to `Response`. Entity API
adapters validate response shapes and strip unknown fields; the token never
enters this layer. JSON request bodies are marked `additionalProperties: true`
to mirror the engine's open decode shapes.

### Packaging (WP5.4)

Packaged builds fetch the matching engine release binary with
`scripts/fetch-engine.mjs`, verify its checksum against both the release
`checksums.txt` and the reviewed `scripts/engine-checksums.json` pin, and place
it at `src-tauri/binaries/brain-<target>[.exe]`. Engine upgrades require updating
the pin. `tauri.bundle.conf.json` adds it as `externalBin`; the supervisor finds
it next to the desktop executable. Unsigned CI jobs add
`tauri.unsigned.conf.json` to disable updater artifacts. Signed jobs use the
committed updater public key and repository signing secrets;
`scripts/build-latest-json.mjs` creates the updater manifest for a release.
See [release.md](release.md).

### Engine CLI bridge

Three Tauri commands call the engine executable without exposing a token:
`engine_providers` (`connection providers --json`), `engine_secrets`
(`secret list`, names only) and `engine_connection_auth`
(`connection auth`, stdout/stderr streamed as `connection-auth` events).
They use the same resolved binary/config as the supervisor. Auth output is
bounded and the process has a five-minute timeout.

### i18n

`src/shared/i18n/messages/{en,ru,zh}.ts` are flat, typed dictionaries.
`translate(locale, key, params)` interpolates `{name}` placeholders. The locale
is detected from `localStorage` first, then the system language, and defaults to
English; the header switcher persists it and updates `document.lang`. The
key-parity test fails if a translation is missing.

## Rust modules

| Rust module | Responsibility |
| --- | --- |
| `engine/cli.rs` | Read-only provider/secret commands and streaming OAuth command. |
| `engine/paths.rs` | Resolves `brain.yaml` and `data_dir` like the engine; locates the engine executable. |
| `engine/runtime.rs` | Reads owner-only `agent/runtime.json` and redacts the token from `Debug`. |
| `engine/supervisor.rs` | Reconciles the agent process, probes health, pauses/resumes, syncs all and shuts down. |
| `api/client.rs` | Loopback HTTP client with bearer auth, no proxy, no redirects and response size caps. |
| `api/path.rs` | Allow-list for proxy paths and methods; rejects traversal, host switching and control characters. |
| `api/sse.rs` | Byte-level Server-Sent Events parser used for run logs. |
| `api/mod.rs` | Tauri commands `api_request`, `run_log_open`, `run_log_close`; emits `run-log` events. |
| `tray.rs` | Tray icon, status menu and menu actions. |
| `autostart.rs` | Windows/Linux plugin path and macOS `SMAppService.mainApp`. |
| `deep_link.rs` | `lv24brain://` registration, validation, pending buffer and `oauth-callback` event. |
| `commands.rs` | `shell_status`, start/pause, sync all, autostart, update check/install, quit. |
| `settings.rs` | Desktop settings (`paused`, optional `config_path`) in the app config dir. |

## Agent lifecycle

1. On startup the supervisor resolves the config, data dir and engine binary.
2. If `paused` is false, it probes `agent/runtime.json` and `GET /v1/health`.
3. If no healthy agent exists and no child is running, it spawns
   `brain agent --parent-pid <desktop-pid> --config <brain.yaml>`.
4. Every two seconds it polls child exit and health. An unexpected exit is
   reported, followed by a 2 s/4 s/8 s/... restart backoff capped at 30 s.
5. A runtime record from another process is treated as an external agent. The
   desktop proxies it without spawning a duplicate. If it becomes unhealthy and
   the supervisor has no child, a fresh agent is attempted; the engine's OS lock
   prevents two live agents for one data directory.
6. Quit, pause and an OS exit request send `POST /v1/shutdown`, wait up to 8 s,
   then kill the child if necessary. If the agent was external and did not stop,
   Pause reports an error and stays running.
7. The engine also watches the desktop PID (`--parent-pid`) and exits within a
   second if the desktop crashes.

## Status and events

`shell_status` returns the full shell snapshot. `engine-status` carries only the
`EngineStatus` and is merged into the existing snapshot by the UI. Keeping these
shapes separate avoids a partial status replacing the whole object. Events:

- `engine-status` — engine phase/PID/port/error changes.
- `shell-error` — tray or background action failures for the UI notice.
- `oauth-callback` — validated `lv24brain://` URLs.
- `run-log` / `run-log-end` — proxied SSE frames and stream completion.
- `update-progress` — updater download progress.

## Proxy contract

The webview can call only the app's own Tauri commands. `api_request` accepts a
method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) and a path beginning with
`/v1/`; it rejects:

- absolute URLs and host switching,
- `..`, `%2e`, `%2f`, `%5c`, backslash and double-slash sequences,
- fragments and control characters,
- path segments outside `[A-Za-z0-9._~%]`,
- bodies or responses above 1 MiB / 2 MiB.

The Rust client reads the port and bearer token from `agent/runtime.json` for
each request, verifies `/v1/health`, and never includes the token in an error,
log or event. Local requests disable system proxies and redirects.

Run logs are opened by the Rust process and delivered as parsed SSE frames; the
webview never receives a URL, port or token it could use directly.

## Deep links

`lv24brain://oauth/<provider>` and `lv24brain://auth/<provider>` are accepted.
The single-instance plugin is registered first with its `deep-link` feature, so
a second launch forwards the URL to the running instance. URLs are buffered and
also emitted; the frontend calls `deep_link_take` on mount to recover a URL
received before the listener existed.

## Autostart

- Windows: the `tauri-plugin-autostart` HKCU Run entry, with `--autostart`.
- Linux: the plugin's XDG autostart entry.
- macOS: `SMAppService.mainApp` through `smappservice-rs`; a signed app bundle
  is required and the user may need to approve the login item in System
  Settings. The app requires macOS 13+ for this API.

## Deliberate non-goals in v0.3.0

- No direct webview access to `127.0.0.1` or the token.
- No remote content in the webview, no `dangerousRemoteDomainIpcAccess`.
- No write-back or desktop-triggered engine update yet; the engine's own
  `/v1/engine/update` remains behind explicit CLI confirmation.
- No bundled engine binary (WP5.4 sidecar work).
- Settings displays `brain.yaml` values but does not edit the file.
