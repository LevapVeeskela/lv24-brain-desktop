# LV24 Brain Desktop

Tauri v2 desktop client for LV24 Brain: a local memory engine, connection
runner and background agent that you can inspect and control from one window.

**Docs:** [Architecture](docs/ARCHITECTURE.md) · [Agent entry](AGENTS.md) · [Docs index](docs/README.md)

## What it is / What it is not

- A native shell (Rust) plus a React webview for a **local-first** Brain instance.
- The place to see engine health, connections, schedules, runs, credentials
  (provider names and status only), projects, records, the idea backlog with
  reminders and calendar export, review queues and activity.
- A supervisor for `brain agent`: it spawns the agent, watches its runtime
  record, restarts an unexpected exit and stops it on quit or pause.
- Not a hosted service. It has no remote API, no multi-user model and no
  server mode.
- Not a token broker for the webview. The local API bearer token never enters
  JavaScript.
- Not an engine installer: packaged builds bundle a checksum-pinned engine
  sidecar, while development resolves `brain` from the environment.

## Status

| Item | Value |
|---|---|
| Version | 1.8.0 (`package.json`, `src-tauri/Cargo.toml`; tag `v1.8.0` after owner approval) |
| Ship state | Release prepared locally, not tagged or published. Packaged builds target engine 0.28.0; the 0.28.0 checksum pin is still pending |
| Visibility | Public |
| Repo | <https://github.com/LevapVeeskela/lv24-brain-desktop> |
| Prod | Desktop installers from GitHub Releases (owner-gated); no web deployment |
| License | Apache-2.0 |

## At a glance

| Stack | Entry point | Ports | Data | Deploy |
|---|---|---|---|---|
| React 19 + TypeScript + Vite, MobX; Rust + Tauri 2 | `src/main.tsx`, `src-tauri/src/lib.rs` | Vite dev `1420`; local API port comes from the engine runtime record | Engine data dir (`brain.yaml`), `agent/runtime.json` (0600), desktop settings in the Tauri config dir | GitHub Actions `desktop.yml` (manual, owner-gated) + Ed25519 updater |

## Requirements

- Node.js 22+ and npm (CI uses Node 24).
- Rust 1.90+ with the platform toolchain (MSVC on Windows).
- [Tauri v2 system prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.
- An initialized LV24 Brain instance (`brain init`, then `brain config use <path>`)
  or an explicit engine path.
- LV24 Brain engine **>= 0.28.0** (the Ideas and reminders API); packaged builds
  bundle the checksum-pinned sidecar.

## Quick start

```bash
npm install
brain init                       # once per machine, if no instance exists
npm run tauri dev                # builds the Rust shell and starts Vite on :1420
npm run typecheck                # tsc for the app and Node configs
npm test                         # vitest run
```

The engine is resolved in this order: `LV24_BRAIN_BIN` → `<resource-dir>/engine/`
or `<resource-dir>/` → `<app-dir>/engine/` or `<app-dir>/` → `PATH` → npm global
platform package (`@lv24/brain-<os>-<arch>`). Set `LV24_BRAIN_BIN` to an absolute
path when developing against a custom engine build.

## Architecture

- **Rust shell is the only token holder.** It reads the loopback port and bearer
  token from `agent/runtime.json`, adds the header and returns only data to the
  webview.
- **Allowlisted proxy.** `api_request` accepts `GET/POST/PUT/PATCH/DELETE` on
  `/v1/` paths only; traversal, absolute URLs, fragments, control characters and
  oversized bodies are rejected.
- **Engine supervisor.** Spawns `brain agent --parent-pid <desktop>`, polls the
  runtime record and `/v1/health`, and restarts with capped backoff.
- **Typed client.** `openapi-fetch` over a custom Tauri transport, generated from
  the vendored `localapi-v1` OpenAPI file.
- **FSD renderer.** `app / pages / widgets / features / entities / shared`, with
  MobX stores composed once by `RootStoreProvider`.
- **Packaging.** `scripts/fetch-engine.mjs` verifies the engine checksum against
  the release and the reviewed pin, then Tauri bundles it as a sidecar.

Full design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repository map

| Path | Purpose |
|---|---|
| `src/app/` | Composition root: RootStore, providers, router, layout, global styles |
| `src/pages/` | Dashboard, ideas, memory, inbox, quarantine, search, projects, activity, connections, git sync, settings |
| `src/widgets/`, `src/features/`, `src/entities/` | FSD slices for shell chrome, user actions and domain models |
| `src/shared/` | API transport/client, generated schema, i18n, UI primitives, helpers |
| `src-tauri/src/` | Rust shell: supervisor, allowlisted proxy, SSE, tray, autostart, deep links, updater, settings |
| `src-tauri/capabilities/`, `src-tauri/tauri*.json` | Window capabilities and Tauri configuration overrides |
| `scripts/` | Engine fetch/verification, updater manifest, icons, crash-dump helper |
| `docs/` | Architecture, security, release, operations and design records |
| `.github/workflows/` | `ci.yml` checks and the manual `desktop.yml` packaging matrix |

## Documentation & links

| Doc / surface | Link |
|---|---|
| System design | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Shell deep dive (historical detail) | [docs/architecture-deep-dive.md](docs/architecture-deep-dive.md) |
| Security model | [docs/security.md](docs/security.md) |
| Packaging and release | [docs/release.md](docs/release.md) |
| 1.8.0 release notes | [docs/release-1.8.0.md](docs/release-1.8.0.md) |
| Windows crash dumps | [docs/operations.md](docs/operations.md) |
| Design refresh and screenshots | [docs/design-refresh.md](docs/design-refresh.md) |
| Brand assets | [docs/neuro-brand.md](docs/neuro-brand.md) |
| Agent entry | [AGENTS.md](AGENTS.md) |
| Engine repository | <https://github.com/LevapVeeskela/lv24-brain> |

## For AI agents

Read order: `AGENTS.md` → `docs/ARCHITECTURE.md` → `docs/README.md` → the code
entry points above.

Hard invariants: no token, port or raw URL in the webview; no new proxy path
outside the `/v1/` allowlist; regenerate the typed client with
`npm run api:generate` after any `localapi-v1` change and keep `npm run api:check`
green; keep FSD imports pointing down; no inline `style` attributes (styles live
in `global.css` and slice style files); do not bundle an engine older than the
pin floor in `scripts/engine-checksums.json`; 1.8.0 requires engine >= 0.28.0.

## Known limitations (1.8.0)

- Local `cargo`/Vite runs resolve the engine from the environment; only packaged
  builds include the sidecar.
- Pause stops the agent. If the agent was started outside the desktop, Pause
  asks it to shut down and reports an error if it refuses.
- The local API is single-user and loopback-only; the bearer token grants full
  local control, and same-user malware can read `agent/runtime.json`.
- macOS autostart requires a signed app bundle and macOS 13+.
- Settings shows the data directory and update channel but does not edit
  `brain.yaml`.
- `review --fix` applies only the safe repairs; semantic fixes stay manual.
- Provider config labels/help come from the engine and are English; desktop
  chrome is localized.
- The release matrix builds Windows x64, Linux x64 and macOS arm64/x64 only.
- OS code signing/notarization is deferred to Apple/SignPath approvals.

## License

Apache-2.0. See [LICENSE](LICENSE).
