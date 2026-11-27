# Release notes - LV24 Brain Desktop 1.8.0

Status: **prepared locally; not tagged, pushed or published.** Owner approval
and the engine pin below are still required.

## Scope

### Ideas

- New `ideas` route with a backlog grouped by overdue / today / this week /
  later (done collapsed), with statuses (`open`, `doing`, `done`, `dropped`,
  `someday`), priorities (`low`, `normal`, `high`), tags, project filter, search
  and due-date filters.
- Draft editor in the idea drawer: title, status, priority, project, due date or
  due time, lead time, tags and body; closing accepts a completion note, and
  reopening returns the idea to `open` with the completion fields cleared.
- Keyboard and focus handling for the list and drawer, with the drawer closed
  before another idea opens.
- Dashboard `Ideas today` widget, app-rail entry with an open count, and tray
  items: `Today · N` and `New idea`.
- Data comes from the engine `localapi-v1` Ideas endpoints; the generated
  client and the vendored OpenAPI file are in sync with the engine contract.

### Reminders

- Rust scheduler for timed and all-day idea dues (`src-tauri/src/reminders.rs`),
  including local-time/DST handling and a restart-safe dedupe key.
- Lead values 0/10/60/180/1440 minutes, quiet hours, hide titles, notification
  sound, missed-reminder digest and a test notification.
- Native OS notifications plus an in-app banner; permission state and delivery
  errors are shown in Settings.
- Reminder preferences persist in the desktop `settings.json`; older settings
  files are read with defaults, no manual migration.

### Calendar

- Month calendar for ideas with due dates, navigation and day selection.
- ICS export from the Ideas page: the engine generates the calendar for the
  current project, search and tag scope; the desktop only downloads the returned
  text (`ExportIcsButton`, file naming and escaping covered by tests).

### Localization

- All new strings are in `en`, `ru` and `zh` with the existing key-parity tests.

## Engine requirement

Desktop 1.8.0 requires **LV24 Brain engine >= 0.28.0** (Ideas and reminders
API). Packaged builds must bundle `0.28.0` or newer; `0.27.2` does not expose
the Ideas endpoints.

The `0.28.0` checksum pin is **not committed yet** because the engine release
is not published. `scripts/engine-checksums.json` still ends at `0.27.2`, so
`fetch-engine.mjs` stops with `No pinned checksum ... in engine 0.28.0`. Adding
the reviewed `0.28.0` hashes is the remaining packaging step before the final
release. Do not ship 1.8.0 with an older engine.

## Upgrade and compatibility

- Desktop settings gain reminder fields with defaults; no migration step.
- No change to the token, port or proxy boundary: the webview still never sees
  the bearer token, the loopback port or raw engine URLs.
- The updater, installer names, signing keys and release overrides are
  unchanged from 1.7.2.

## Verification

Automated (run in this worktree):

- `npm run check` - typecheck, vitest and production build.
- `npm run api:check` - generated client matches `localapi-v1.json`.
- `cargo fmt --all --check`, `cargo clippy --all-targets -- -D warnings`,
  `cargo test --all-targets`.

## Manual checks still pending

- Windows toast delivery with Focus Assist on and off, quiet hours and the
  missed digest after a sleep/resume cycle.
- Reminder timing across a DST boundary and with an all-day due date.
- Calendar month edges (first/last week, month with five weeks) and ICS import
  in a third-party calendar.
- Tray `Today · N` count and `New idea` after the agent restarts.
- Ideas capture from an agent harness and visibility of that idea after sync.
- Two-machine git sync: concurrent idea edits, conflicts and merged state.
- Packaged app on Windows/macOS/Linux after the `0.28.0` pin lands: sidecar
  start, `brain version`, installer upgrade from 1.7.2 and the updater check.
