# Agent entry — LV24 Brain Desktop

## Start here

1. `README.md` — product, requirements, quick start, status.
2. `docs/ARCHITECTURE.md` — components, flows, invariants (current design).
3. `docs/README.md` — documentation map and diagram index.
4. Code: `src/main.tsx` → `src/app/App.tsx` → `src/app/model/RootStore.ts`;
   Rust: `src-tauri/src/lib.rs` → `src-tauri/src/engine/supervisor.rs` →
   `src-tauri/src/api/mod.rs`.

Read `docs/architecture-deep-dive.md`, `docs/security.md` and `docs/release.md` only when
the task touches their historical detail, the trust model or packaging.

## What this repo is / is not

- A Tauri v2 desktop client for one local LV24 Brain data directory.
- The only component that reads the local API bearer token.
- Not a server, hosted service, multi-user app or remote API.
- Not the engine: `brain`, the contract and the data schema live in
  <https://github.com/LevapVeeskela/lv24-brain>.
- Not a place to edit `brain.yaml`, credential values or engine data files.

## Commands (verified)

```bash
npm install                 # Node 22+, npm
npm run tauri dev           # Vite on :1420 + Rust shell
npm run typecheck           # tsc app + node configs
npm test                    # vitest run
npm run build               # typecheck + vite build
npm run api:check           # regenerate schema and fail on drift
npm run api:generate        # openapi-typescript from localapi-v1.json

cd src-tauri
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
```

Packaging smoke test (unsigned, Windows example):

```bash
node scripts/fetch-engine.mjs --version 0.27.2 --target x86_64-pc-windows-msvc
npm run tauri build -- --debug --bundles nsis \
  --config src-tauri/tauri.bundle.conf.json \
  --config src-tauri/tauri.unsigned.conf.json
```

Do not add a build step that writes release artifacts unless the task asks for
packaging.

## Repository map

| Path | What lives there |
|---|---|
| `src/app/` | RootStore, providers, HashRouter, layout, `styles/global.css` |
| `src/pages/` | One slice per route (dashboard, memory, inbox, projects, activity, …) |
| `src/widgets/`, `src/features/`, `src/entities/` | FSD slices; each exposes `index.ts` |
| `src/shared/` | API transport/client, generated schema, i18n, UI primitives |
| `src-tauri/src/` | Rust modules: `engine/`, `api/`, `tray`, `autostart`, `deep_link`, `settings`, `watchdog` |
| `src-tauri/tauri*.json`, `capabilities/` | Window, bundle and capability configuration |
| `scripts/` | Engine fetch/checksums, updater manifest, icons, crash dumps |
| `.github/workflows/` | `ci.yml` (push/PR), `desktop.yml` (manual packaging) |
| `docs/` | Architecture, security, release, operations, design records |

## Invariants (never break)

1. **The webview never sees the token, port or raw engine URL.** All calls go
   through `api_request` / `run_log_open`; the Rust side reads
   `agent/runtime.json` per request.
2. **Proxy allowlist stays narrow.** `/v1/` only, fixed methods, no absolute
   URLs, redirects, system proxies, traversal/encoded traversal, fragments,
   control characters or oversized bodies/responses.
3. **Contract gate.** `src/shared/api/openapi/localapi-v1.json` is a copy of the
   engine's `internal/adapters/localapi/openapi.json`. Copy it, run
   `npm run api:generate`, commit the regenerated `schema.d.ts`, and keep
   `npm run api:check` green. Never hand-edit the generated file.
4. **Engine pin.** `scripts/engine-checksums.json` is the reviewed pin.
   `desktop.yml` refuses an engine below the highest pinned version; add
   checksums before raising `engine_version`. Current bundle: `0.27.2`.
5. **FSD direction.** `app → pages → widgets → features → entities → shared`.
   Import slices through `index.ts`; `shared` holds no product logic.
6. **No inline styles.** Styles live in `src/app/styles/global.css` or a slice
   style file. Do not add `style={{…}}` attributes in TSX.
7. **Process cleanup by exact identity.** Stop only the intended
   `lv24-brain-desktop.exe` / `brain.exe` PID or path. Never wildcard-kill
   `lv24*`.
8. **Secrets stay out.** Never read or print credential values, tokens,
   `agent/runtime.json` contents or updater private keys. Log only status/names.

## Gotchas

- `npm run tauri dev` needs a working engine or `LV24_BRAIN_BIN`; otherwise the
  shell starts but reports the engine as unavailable.
- The packaged sidecar exists only in bundled builds; local `cargo` runs use the
  resolution order in `README.md`.
- Windows builds are unsigned until SignPath approval; macOS until Apple
  Developer Program approval. Updater signatures are separate and required.
- Dev port `1420` is fixed by `src-tauri/tauri.conf.json`.
- `cargo test` may build large artifacts; avoid running it when the task only
  touches docs.
- Keep `README.md` status in sync only when a release actually changes it.

## Where to record decisions

Company Brain project `lv24-brain-desktop`:

```bash
brain open lv24-brain-desktop
brain note "…"
brain decision "…" --context "…" --alternatives "…" --consequences "…"
brain attempt "…" --hypothesis "…" --result "…" --reason "…"
brain handoff "…" --next "…"
```

Never store tokens, `.env` values or personal data in brain records.

## Links

- Engine: <https://github.com/LevapVeeskela/lv24-brain>
- Docs portal: <https://brain.lv24.by>
- Repository docs standard: `lv24-brain-data/global/REPOSITORY-DOCS.md`
