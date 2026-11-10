# Desktop design refresh

Branch: `design/ux-refresh`. Scope: visual identity, presentation and interaction
feedback. Engine/API/release versions, public contracts and offline operation stay
unchanged. This is a local implementation, not a release or deployment.

## Audit

- Hierarchy: the app heading, dashboard hero and repeated engine status compete.
  Give the page heading priority; retain a compact shell indicator and one
  actionable engine overview. Remove redundant dashboard engine summary.
- Density: many 9–12px labels, pill shapes and gradient cards reduce scanning
  speed. Use a small legible type scale, flat navy surfaces and a 4/8 grid.
- Feedback: errors are mostly page-local; navigation can lose success messages.
  Add a persistent, dismissible global channel and keep field errors inline.
- Accessibility: existing native confirmation dialogs restore focus, skip link
  and route focus are useful foundations. Add scroll reset, larger targets,
  wrapping navigation/tables, reduced motion and contrast/forced-color rules.
- Forms: wizard/detail duplicate labels and input classes. Introduce small native
  primitives without a component framework. Preserve draft and submit semantics.
- Connections: ID/provider/schedule alone do not explain health. Present existing
  connection/run data honestly; unknown history must not imply success.
- Branding: the radial graph and colored tray blobs lack a shared silhouette.
  Replace them with a connected memory mark and shape-coded status dot.

## Direction

1. Page title is the strongest text; brand and chrome remain compact.
2. Navy establishes structure; emerald identifies action and healthy state.
3. Status always includes text, not color alone.
4. Quiet flat surfaces, useful whitespace, no glow or decorative gradients.
5. Native controls, visible keyboard focus and readable wrapped text.
6. Local data only; explain loading, missing history and recovery explicitly.
7. One reproducible geometric source for header, application and tray identity.

## Tokens

| Existing/ad-hoc values | Semantic family |
| --- | --- |
| `--bg`, deep translucent blacks | canvas, surface, inset |
| `--bg-raised`, gradient cards | surface, surface-hover |
| repeated slate rgba borders | border, border-strong |
| `--text`, `--muted`, pale blue literals | text, text-muted, text-code |
| emerald/blue/amber/red rgba literals | accent/info/warning/danger and subtle/border variants |
| arbitrary 5/7/11/14/18px gaps | space-1 through space-8 (4px base) |
| arbitrary radii | radius-sm/md/lg/pill |
| 9–22px type sizes | text-xs/sm/md/lg/title |
| card glow and several shadows | shadow-dialog only |
| inline timings/z-index | motion-fast, layer-feedback, layer-skip |

Compatibility aliases keep existing widget selectors working. Dark is the only
theme in this change: a correct complete dark theme has priority over a partial
light theme.

## Component inventory

Keep Card, Notice and InlineError; extend Button with ghost/danger/loading/icons.
Retain native ConfirmDialog. Add Input, Field/FormRow, Select, Table, EmptyState,
Loading/Skeleton, Badge, Tabs and Tooltip only where used. Global feedback lives
above routed pages. Navigation remains real links; action controls remain buttons.

## Page plan

| Page | Before → intended result |
| --- | --- |
| Dashboard | repeated engine state → one primary engine overview, health and next action |
| Connections | configuration table → health, latest run/result/error, search/sort and log access |
| Wizard | long monolith/pseudo-stepper → extracted steps, completed-step navigation, inline validation |
| Detail | undifferentiated scroll → overview, schedule, auth, credentials, runs, separate danger zone |
| Activity | dense run list/log → readable status, contextual loading/retry, follow/pause and export |
| Projects | plain list → searchable readable metadata with clear empty/error recovery |
| Settings | equal-weight cards → grouped controls, clear update and startup feedback |
| Not found | dead end → clear route recovery |

## Identity and assets

Concept: a symmetric, connected memory structure with two vertical branches,
three cross-connections and four terminal nodes. Open negative space keeps it
legible at 16px. The wordmark uses the existing system font: restrained LV24,
stronger Brain. No embedded text in the icon and no remote fonts.

Assets: source geometry, monochrome/header SVG, 1024px app-icon, 512px icon,
32/64/128/256px PNG, multi-size ICO, ICNS and five tray PNGs (running, starting,
paused, error, stopped). Tray shares the base mark; status dots include distinct
small glyphs. Document and run the generator; commit generated artifacts.

## Verification and screenshots

Run `npm run check`, `npm run api:check` if API consumption changes,
`cargo fmt --all --check`, `cargo clippy --all-targets -- -D warnings`,
`cargo test --all-targets`, and `npm run tauri build -- --debug --no-bundle`.
Signing is attempted only when the required signing environment is present.

Before/after screenshots belong in `design-refresh/screenshots/`: dashboard,
connections, wizard, detail, activity, projects, settings; each at 980×720 and
760×540 in English and Russian. Also inspect Russian at 200% zoom, keyboard
navigation/dialog focus restore, reduced motion and forced colors. Screenshots
must identify browser fixtures versus the real desktop runtime; never describe a
fixture as live engine data. If capture is unavailable, record a manual checklist
and explicitly leave visual verification pending.

## Risks and deliberate exclusions

- Never change generated API files, engine binaries/checksums, updater public
  key, CSP sources, release configuration, installer names or version numbers.
- No new runtime dependencies, remote assets, analytics, router or store rewrite.
- Run-history coverage may be bounded by the existing endpoint. Expose unknown
  state clearly, and do not invent live streaming where only snapshots exist.
- Preserve OAuth callbacks, engine gating, pause/resume, autostart, close-to-tray,
  idempotent creation, deep links and native dialog focus restoration.
- Validate long translations and narrow/zoomed layouts before claiming success.
- No push/cloud CI without verified zero additional billing. Local commits only.

## Implementation and results

Pending. Update this section with changed-file manifest, command results,
screenshot index and any incomplete verification before delivery.
