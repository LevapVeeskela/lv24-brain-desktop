//! Owner-local exit diagnostics. No command arguments, paths, URLs or secrets
//! enter the records. Closing a window is a breadcrumb, never a clean exit.
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const MAX_MARKER_BYTES: u64 = 4096;
const MAX_BREADCRUMB_BYTES: u64 = 128 * 1024;
const RESTART_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum Disposition {
    Active,
    Clean,
    UpdaterRestart,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Event {
    SessionStarted,
    CloseRequested,
    ExitRequested,
    AppQuit,
    TrayQuit,
    ShutdownRequested,
    ShutdownCompleted,
    UpdaterInstall,
    UpdaterInstallFailed,
    UpdaterRestart,
    UpdaterRestartTimedOut,
    Exit,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Marker {
    format_version: u8,
    session_id: String,
    pid: u32,
    desktop_version: String,
    started_at_unix_ms: u64,
    updated_at_unix_ms: u64,
    disposition: Disposition,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Breadcrumb<'a> {
    session_id: &'a str,
    pid: u32,
    at_unix_ms: u64,
    event: Event,
    exit_code: Option<i32>,
}

struct Session {
    marker: Marker,
    shutdown_completed: bool,
    requested_exit_code: Option<i32>,
    restart_generation: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Recovery {
    pub previous_unclean: bool,
    pub diagnostics_available: bool,
}

pub struct SessionTracker {
    marker_path: PathBuf,
    breadcrumb_path: PathBuf,
    previous_unclean: bool,
    available: AtomicBool,
    session: Mutex<Session>,
}

impl SessionTracker {
    pub fn start(config_dir: &Path, log_dir: &Path) -> Self {
        let marker_path = config_dir.join("desktop-session.json");
        let (previous_unclean, readable) = match previous_unclean(&marker_path) {
            Ok(unclean) => (unclean, true),
            Err(err) => {
                log::warn!("desktop session marker could not be read: {err}");
                (false, false)
            }
        };
        let now = unix_ms();
        let tracker = Self {
            marker_path,
            breadcrumb_path: log_dir.join("desktop-exit.jsonl"),
            previous_unclean,
            available: AtomicBool::new(readable),
            session: Mutex::new(Session {
                marker: Marker {
                    format_version: 1,
                    session_id: format!("{}-{now}", std::process::id()),
                    pid: std::process::id(),
                    desktop_version: env!("CARGO_PKG_VERSION").to_string(),
                    started_at_unix_ms: now,
                    updated_at_unix_ms: now,
                    disposition: Disposition::Active,
                },
                shutdown_completed: false,
                requested_exit_code: None,
                restart_generation: 0,
            }),
        };
        tracker.record(Event::SessionStarted, None);
        if previous_unclean {
            log::warn!("the previous desktop session did not close cleanly");
        }
        tracker
    }

    pub fn recovery(&self) -> Recovery {
        Recovery {
            previous_unclean: self.previous_unclean,
            diagnostics_available: self.available.load(Ordering::Relaxed),
        }
    }

    pub fn record(&self, event: Event, exit_code: Option<i32>) {
        if let Err(err) = self.try_record(event, exit_code) {
            self.available.store(false, Ordering::Relaxed);
            log::warn!("desktop exit diagnostic could not be persisted: {err}");
        }
    }

    fn try_record(&self, event: Event, exit_code: Option<i32>) -> io::Result<()> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| io::Error::other("desktop session state lock poisoned"))?;
        self.persist_event(&mut session, event, exit_code)
    }

    fn persist_event(
        &self,
        session: &mut Session,
        event: Event,
        exit_code: Option<i32>,
    ) -> io::Result<()> {
        session.marker.updated_at_unix_ms = unix_ms();
        match event {
            Event::SessionStarted | Event::UpdaterInstallFailed | Event::UpdaterRestartTimedOut => {
                session.marker.disposition = Disposition::Active;
                session.restart_generation += 1;
            }
            Event::ShutdownCompleted => session.shutdown_completed = true,
            Event::ExitRequested => {
                session.requested_exit_code = exit_code;
                if exit_code.is_some_and(|code| code != 0 && code != tauri::RESTART_EXIT_CODE) {
                    session.marker.disposition = Disposition::Active;
                    session.restart_generation += 1;
                }
            }
            Event::UpdaterInstall | Event::UpdaterRestart => {
                session.marker.disposition = Disposition::UpdaterRestart;
                session.restart_generation += 1;
            }
            Event::Exit => {
                let explicitly_failed = session
                    .requested_exit_code
                    .is_some_and(|code| code != 0 && code != tauri::RESTART_EXIT_CODE);
                let expected = session.shutdown_completed
                    || session.requested_exit_code == Some(0)
                    || session.marker.disposition == Disposition::UpdaterRestart;
                session.marker.disposition = if expected && !explicitly_failed {
                    Disposition::Clean
                } else {
                    Disposition::Active
                };
            }
            _ => {}
        }
        log::info!(
            "desktop lifecycle: event={event:?} session={} pid={} exit_code={exit_code:?}",
            session.marker.session_id,
            session.marker.pid
        );
        persist_marker(&self.marker_path, &session.marker)?;
        let breadcrumb = Breadcrumb {
            session_id: &session.marker.session_id,
            pid: session.marker.pid,
            at_unix_ms: session.marker.updated_at_unix_ms,
            event,
            exit_code,
        };
        append_breadcrumb(&self.breadcrumb_path, &breadcrumb)
    }

    fn restart_generation(&self) -> Option<u64> {
        let session = self.session.lock().ok()?;
        (session.marker.disposition == Disposition::UpdaterRestart)
            .then_some(session.restart_generation)
    }

    fn restart_timed_out(&self, generation: u64) {
        let Ok(mut session) = self.session.lock() else {
            self.available.store(false, Ordering::Relaxed);
            return;
        };
        if session.marker.disposition == Disposition::UpdaterRestart
            && session.restart_generation == generation
        {
            if let Err(err) = self.persist_event(&mut session, Event::UpdaterRestartTimedOut, None)
            {
                self.available.store(false, Ordering::Relaxed);
                log::warn!("desktop updater timeout diagnostic could not be persisted: {err}");
            }
        }
    }
}

pub fn recovery(app: &AppHandle) -> Recovery {
    app.try_state::<SessionTracker>()
        .map(|tracker| tracker.recovery())
        .unwrap_or(Recovery {
            previous_unclean: false,
            diagnostics_available: false,
        })
}

pub fn record(app: &AppHandle, event: Event, exit_code: Option<i32>) {
    if let Some(tracker) = app.try_state::<SessionTracker>() {
        tracker.record(event, exit_code);
    }
}

/// Windows update.install exits internally and does not emit RunEvent::Exit.
/// A watchdog restores Active if this process remains alive after that boundary.
pub fn expect_updater_restart(app: &AppHandle, event: Event) {
    record(app, event, None);
    let generation = app
        .try_state::<SessionTracker>()
        .and_then(|tracker| tracker.restart_generation());
    if let Some(generation) = generation {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(RESTART_TIMEOUT).await;
            if let Some(tracker) = app.try_state::<SessionTracker>() {
                tracker.restart_timed_out(generation);
            }
        });
    }
}

fn previous_unclean(path: &Path) -> io::Result<bool> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(err) => return Err(err),
    };
    let mut bytes = Vec::new();
    file.take(MAX_MARKER_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_MARKER_BYTES {
        log::warn!("previous desktop session marker exceeds its size limit");
        return Ok(true);
    }
    match serde_json::from_slice::<Marker>(&bytes) {
        Ok(marker) if marker.format_version == 1 => Ok(marker.disposition == Disposition::Active),
        _ => {
            log::warn!("previous desktop session marker is invalid");
            Ok(true)
        }
    }
}

fn persist_marker(path: &Path, marker: &Marker) -> io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::other("desktop session marker has no parent"))?;
    fs::create_dir_all(parent)?;
    let temporary = parent.join(format!("desktop-session.{}.tmp", marker.pid));
    let bytes = serde_json::to_vec(marker).map_err(io::Error::other)?;
    let mut file = File::create(&temporary)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    drop(file);
    replace_file(&temporary, path)?;
    #[cfg(unix)]
    File::open(parent)?.sync_all()?;
    Ok(())
}

fn append_breadcrumb(path: &Path, breadcrumb: &Breadcrumb<'_>) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut line = serde_json::to_vec(breadcrumb).map_err(io::Error::other)?;
    line.push(b'\n');
    let length = match fs::metadata(path) {
        Ok(metadata) => metadata.len(),
        Err(err) if err.kind() == io::ErrorKind::NotFound => 0,
        Err(err) => return Err(err),
    };
    if length.saturating_add(line.len() as u64) > MAX_BREADCRUMB_BYTES {
        replace_file(path, &path.with_file_name("desktop-exit.previous.jsonl"))?;
    }
    let mut file = OpenOptions::new().append(true).create(true).open(path)?;
    file.write_all(&line)?;
    file.sync_data()
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    // Both UTF-16 buffers are NUL-terminated and live through this call.
    let moved = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn recorded_events(dir: &Path) -> Vec<String> {
        fs::read_to_string(dir.join("desktop-exit.jsonl"))
            .unwrap()
            .lines()
            .map(|line| {
                serde_json::from_str::<serde_json::Value>(line).unwrap()["event"]
                    .as_str()
                    .unwrap()
                    .to_string()
            })
            .collect()
    }

    #[test]
    fn first_start_and_clean_exit_do_not_report_a_crash() {
        let dir = tempfile::tempdir().unwrap();
        let session = SessionTracker::start(dir.path(), dir.path());
        assert_eq!(
            session.recovery(),
            Recovery {
                previous_unclean: false,
                diagnostics_available: true
            }
        );
        session.record(Event::ShutdownCompleted, None);
        session.record(Event::ExitRequested, Some(0));
        session.record(Event::Exit, None);
        assert!(
            !SessionTracker::start(dir.path(), dir.path())
                .recovery()
                .previous_unclean
        );
    }

    #[test]
    fn close_or_requested_shutdown_is_not_a_clean_exit() {
        for event in [
            Event::CloseRequested,
            Event::ExitRequested,
            Event::AppQuit,
            Event::TrayQuit,
            Event::ShutdownCompleted,
        ] {
            let dir = tempfile::tempdir().unwrap();
            let session = SessionTracker::start(dir.path(), dir.path());
            session.record(event, None);
            assert!(
                SessionTracker::start(dir.path(), dir.path())
                    .recovery()
                    .previous_unclean,
                "{event:?}"
            );
        }
    }

    #[test]
    fn nonzero_exit_is_unclean_even_after_shutdown() {
        let dir = tempfile::tempdir().unwrap();
        let session = SessionTracker::start(dir.path(), dir.path());
        session.record(Event::ShutdownCompleted, None);
        session.record(Event::ExitRequested, Some(1));
        session.record(Event::Exit, None);
        assert!(
            SessionTracker::start(dir.path(), dir.path())
                .recovery()
                .previous_unclean
        );
    }

    #[test]
    fn updater_exit_is_expected_but_failure_and_timeout_restore_detection() {
        let dir = tempfile::tempdir().unwrap();
        let session = SessionTracker::start(dir.path(), dir.path());
        session.record(Event::UpdaterInstall, None);
        assert!(!previous_unclean(&dir.path().join("desktop-session.json")).unwrap());
        let old_generation = session.restart_generation().unwrap();
        session.record(Event::UpdaterInstallFailed, None);
        assert!(previous_unclean(&dir.path().join("desktop-session.json")).unwrap());
        session.record(Event::UpdaterRestart, None);
        session.restart_timed_out(old_generation);
        assert!(!previous_unclean(&dir.path().join("desktop-session.json")).unwrap());
        session.restart_timed_out(session.restart_generation().unwrap());
        assert!(previous_unclean(&dir.path().join("desktop-session.json")).unwrap());
    }

    #[test]
    fn every_lifecycle_event_is_written_once_with_a_stable_name() {
        let dir = tempfile::tempdir().unwrap();
        let session = SessionTracker::start(dir.path(), dir.path());
        for event in [
            Event::CloseRequested,
            Event::ExitRequested,
            Event::AppQuit,
            Event::TrayQuit,
            Event::ShutdownRequested,
            Event::ShutdownCompleted,
            Event::UpdaterInstall,
            Event::UpdaterInstallFailed,
            Event::UpdaterRestart,
            Event::UpdaterRestartTimedOut,
            Event::Exit,
        ] {
            session.record(event, None);
        }
        assert_eq!(
            recorded_events(dir.path()),
            [
                "session_started",
                "close_requested",
                "exit_requested",
                "app_quit",
                "tray_quit",
                "shutdown_requested",
                "shutdown_completed",
                "updater_install",
                "updater_install_failed",
                "updater_restart",
                "updater_restart_timed_out",
                "exit",
            ]
        );
    }

    #[test]
    fn normal_quit_paths_record_each_event_once_and_stay_clean() {
        for source in [Event::AppQuit, Event::TrayQuit] {
            let dir = tempfile::tempdir().unwrap();
            let session = SessionTracker::start(dir.path(), dir.path());
            session.record(source, None);
            session.record(Event::ShutdownRequested, None);
            session.record(Event::ShutdownCompleted, None);
            session.record(Event::ExitRequested, Some(0));
            session.record(Event::Exit, None);

            let source_name = if source == Event::AppQuit {
                "app_quit"
            } else {
                "tray_quit"
            };
            assert_eq!(
                recorded_events(dir.path()),
                [
                    "session_started",
                    source_name,
                    "shutdown_requested",
                    "shutdown_completed",
                    "exit_requested",
                    "exit",
                ],
                "{source:?}"
            );
            assert!(
                !SessionTracker::start(dir.path(), dir.path())
                    .recovery()
                    .previous_unclean,
                "{source:?}"
            );
        }
    }

    #[test]
    fn updater_restart_sequence_is_not_reported_as_abrupt() {
        // Unix-style restart: real exit events follow the install.
        let dir = tempfile::tempdir().unwrap();
        let session = SessionTracker::start(dir.path(), dir.path());
        session.record(Event::UpdaterInstall, None);
        session.record(Event::UpdaterRestart, None);
        session.record(Event::ExitRequested, Some(tauri::RESTART_EXIT_CODE));
        session.record(Event::Exit, None);
        assert_eq!(
            recorded_events(dir.path()),
            [
                "session_started",
                "updater_install",
                "updater_restart",
                "exit_requested",
                "exit",
            ]
        );
        assert!(
            !SessionTracker::start(dir.path(), dir.path())
                .recovery()
                .previous_unclean
        );

        // Windows-style install: the installer ends the process before the
        // event loop emits ExitRequested/Exit; the marker alone is enough.
        let dir = tempfile::tempdir().unwrap();
        let session = SessionTracker::start(dir.path(), dir.path());
        session.record(Event::UpdaterInstall, None);
        assert!(
            !SessionTracker::start(dir.path(), dir.path())
                .recovery()
                .previous_unclean
        );
    }

    #[test]
    fn exit_request_without_exit_event_is_still_abrupt() {
        let dir = tempfile::tempdir().unwrap();
        let session = SessionTracker::start(dir.path(), dir.path());
        session.record(Event::ExitRequested, Some(0));
        assert!(
            SessionTracker::start(dir.path(), dir.path())
                .recovery()
                .previous_unclean
        );
    }

    #[test]
    fn corrupt_marker_is_unknown_unclean_and_io_failure_is_visible() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("desktop-session.json"), "{partial").unwrap();
        assert!(
            SessionTracker::start(dir.path(), dir.path())
                .recovery()
                .previous_unclean
        );
        let blocker = dir.path().join("not-a-directory");
        fs::write(&blocker, "blocker").unwrap();
        let failed = SessionTracker::start(&blocker, dir.path());
        assert!(!failed.recovery().diagnostics_available);
        assert!(failed.try_record(Event::Exit, None).is_err());
    }

    #[test]
    fn breadcrumbs_are_bounded_and_only_record_static_event_data() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("desktop-exit.jsonl");
        fs::write(&path, vec![b'x'; MAX_BREADCRUMB_BYTES as usize]).unwrap();
        let session = SessionTracker::start(dir.path(), dir.path());
        session.record(Event::CloseRequested, None);
        assert!(fs::metadata(&path).unwrap().len() < MAX_BREADCRUMB_BYTES);
        assert!(dir.path().join("desktop-exit.previous.jsonl").is_file());
        let contents = fs::read_to_string(&path).unwrap();
        // Breadcrumbs are owner-local telemetry: no paths, command arguments,
        // URLs or secrets may leak into them.
        assert!(!contents.contains(dir.path().to_str().unwrap()));
        for line in contents.lines() {
            let entry: serde_json::Value = serde_json::from_str(line).unwrap();
            assert_eq!(entry.as_object().unwrap().len(), 5);
            assert!(entry.get("event").is_some());
            assert!(entry.get("exitCode").is_some());
        }
    }

    #[test]
    fn failed_clean_marker_replace_preserves_active_marker_and_reports_failure() {
        let dir = tempfile::tempdir().unwrap();
        let session = SessionTracker::start(dir.path(), dir.path());
        fs::create_dir(
            dir.path()
                .join(format!("desktop-session.{}.tmp", std::process::id())),
        )
        .unwrap();
        session.record(Event::ShutdownCompleted, None);
        session.record(Event::ExitRequested, Some(0));
        session.record(Event::Exit, None);
        assert!(!session.recovery().diagnostics_available);
        assert!(previous_unclean(&dir.path().join("desktop-session.json")).unwrap());
    }
}
