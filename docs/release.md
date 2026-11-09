# Packaging and release (WP5.4)

The desktop app downloads the matching engine release binary at build time and
bundles it as a Tauri sidecar. The supervisor finds it next to the desktop
executable, so installs do not depend on a separately installed `brain` binary.

## Build workflow

`.github/workflows/desktop.yml` is manual (`workflow_dispatch`) and uses free
standard GitHub-hosted runners only.

Inputs:

| Input | Default | Meaning |
| --- | --- | --- |
| `engine_version` | `0.12.0` | LV24 Brain engine release to bundle. |
| `signed` | `false` | Create updater artifacts and signatures. Requires repo secrets. |
| `publish_release` | `false` | Publish a GitHub release and `latest.json`. Requires `signed=true` and a tag. |
| `tag` | empty | Release tag, for example `v0.3.0`. Required only for publishing. |
| `prerelease` | `true` | Mark the published release as a prerelease. |

Matrix:

| Runner | Rust target | Bundles |
| --- | --- | --- |
| `windows-latest` | `x86_64-pc-windows-msvc` | NSIS per-user |
| `ubuntu-latest` | `x86_64-unknown-linux-gnu` | AppImage, deb, rpm |
| `macos-latest` | `aarch64-apple-darwin` | `.app`, DMG, updater tar.gz |
| `macos-latest` | `x86_64-apple-darwin` | `.app`, DMG, updater tar.gz |

The engine binary is fetched by `scripts/fetch-engine.mjs`, verified against
the engine release `checksums.txt` and the reviewed pin in
`scripts/engine-checksums.json`, and written to
`src-tauri/binaries/brain-<target>[.exe]`. Tauri bundles it via the
`src-tauri/tauri.bundle.conf.json` override (`externalBin`). The base config
stays buildable without downloaded sidecars, but bundling still needs the
updater signing key unless the unsigned override is passed. Engine upgrades
require updating the pin file.

Unsigned build jobs add `src-tauri/tauri.unsigned.conf.json`
(`createUpdaterArtifacts: false`) and do not need signing secrets.

Artifacts are uploaded with 7-day retention. A release is created only when the
owner runs the workflow with `publish_release=true`; a signed release also gets
`latest.json` for the updater endpoint. The manifest must contain all six
platform entries: Windows NSIS, macOS arm64/x64 `.app.tar.gz`, Linux AppImage,
Linux deb and Linux rpm. Tauri selects the package-specific deb/rpm entries
before the AppImage fallback. Prerelease test builds are not returned by
GitHub's `releases/latest`, so the updater only sees a non-prerelease
production release.

## Updater signing

Repo secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: private updater key content or path used by Tauri.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: key password, if set.

The public key is committed in `src-tauri/tauri.conf.json`. The current key is
a development key; rotate it before a public release by generating a new key,
replacing the public key, updating the repository secret, and keeping the old
public key for one migration release. The build fails if Tauri reports that the
private key does not match the committed public key. `requireSignedVersion` is
enabled, so the updater verifies the version bound into the signature's trusted
comment.

OS code signing is separate from updater signing:

- macOS signing/notarization waits for Apple Developer Program approval.
- Windows signing waits for SignPath Foundation approval.
- Until then builds are unsigned and may show Gatekeeper/SmartScreen warnings.
  Do not attach `APPLE_*` or SignPath credentials to the workflow until those
  approvals exist.

## Release checklist

1. Merge the desktop change and confirm the normal CI is green.
2. Check the engine release/tag and its `checksums.txt`.
3. Run `desktop.yml` with `signed=false` to verify unsigned packaging.
4. Run with `signed=true` (no release) to verify updater artifacts if secrets
   are configured.
5. Run with `signed=true`, `publish_release=true`, the intended `tag`, and the
   correct prerelease choice.
6. Verify the release contains installers, `.sig` files and `latest.json`, and
   that `latest.json` URLs resolve.
7. Test one install and `brain version`/agent start from the packaged app.
8. Install the previous desktop release and verify the updater check.

## Local packaging smoke test

Windows example (derive the target triple with `rustc -vV` on other hosts):

```bash
node scripts/fetch-engine.mjs --version 0.12.0 --target x86_64-pc-windows-msvc
npm run tauri build -- --debug --bundles nsis \
  --config src-tauri/tauri.bundle.conf.json \
  --config src-tauri/tauri.unsigned.conf.json
```

Then run the built app without `LV24_BRAIN_BIN` and confirm it starts the
bundled `brain.exe` next to the desktop executable.
