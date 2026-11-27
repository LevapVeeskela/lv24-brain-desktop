# Desktop documentation index

Start with `docs/ARCHITECTURE.md` for the current design. The other files are
either deep dives or dated records; keep the status table in `README.md` as the
single source for the release version.

## Read order

1. `../README.md` — what the app is, requirements, quick start, status.
2. `ARCHITECTURE.md` — context, components, flows, deployment, invariants.
3. `architecture/README.md` — generated diagram index (`.mmd` sources + SVGs).
4. `../AGENTS.md` — agent rules and verified commands.

## Documents

| File | Scope | Status |
|---|---|---|
| `ARCHITECTURE.md` | Current system design for 1.8.0 | Current |
| `security.md` | Trust boundary, controls, residual risks | Current |
| `release.md` | Packaging matrix, engine pin, signing, checklist | Current (1.8.0) |
| `release-1.8.0.md` | 1.8.0 scope, engine floor and pending manual checks | Current release record |
| `operations.md` | Windows Error Reporting LocalDumps | Current |
| `architecture-deep-dive.md` | WP5.1–WP5.5 and desktop 1.2 implementation detail | Historical deep dive |
| `design-refresh.md` | 1.1 visual refresh decisions | Historical record |
| `neuro-brand.md` | Neuro mark geometry and generated assets | Current asset record |
| `design-refresh/` | Screenshots, contrast and verification reports | Dated evidence |

## Diagrams

Sources live in `docs/architecture/`; never hand-edit `.svg`/`.png`. Regenerate
with the repository `diagram.config.json` (docs dir `docs/architecture`, brain
project `lv24-brain-desktop`) so the index and manifest stay consistent.

| Diagram | Purpose |
|---|---|
| `01-desktop-engine-sequence` | Startup, spawn, health probe, proxied request |
| `02-desktop-trust-boundary` | Webview / Rust shell / engine / OS boundary |
| `03-release-pipeline` | CI checks, engine pin, packaging, release gate |

## Conventions

- English is the repository language; UI strings are localized through
  `src/shared/i18n`, not in docs.
- Version and ship state live in `README.md` only.
- Commands must exist in `package.json`, `src-tauri/Cargo.toml` or a workflow.
- Do not copy secrets, tokens, personal paths or runtime-record values into any
  document.
