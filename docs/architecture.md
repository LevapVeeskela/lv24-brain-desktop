# Shell architecture (WP5.1)

This document describes the v0.1.0 desktop shell. The UI foundation and screens
land in WP5.2/5.3; the shell contracts below are intended to stay stable.

## Modules

| Rust module | Responsibility |
| --- | --- |
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

## Deliberate non-goals in v0.1.0

- No direct webview access to `127.0.0.1` or the token.
- No remote content in the webview, no `dangerousRemoteDomainIpcAccess`.
- No write-back or engine update from the desktop yet; the engine's own
  `/v1/engine/update` remains behind explicit CLI confirmation.
- No bundled engine binary (WP5.4 sidecar work).
