use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime};

/// Watches the first IPC handshake after the webview loads. A WebView2/Tauri
/// startup race can leave the custom-protocol channel without an Origin header;
/// the page then cannot call any command and a JavaScript reload alone does not
/// recreate the channel. If the UI does not report ready in time, restart the
/// process once. The marker prevents a restart loop when the race persists.
pub struct UiWatchdog {
    ready: AtomicBool,
    marker: PathBuf,
}

impl UiWatchdog {
    pub fn new(marker: PathBuf) -> Arc<Self> {
        Arc::new(Self {
            ready: AtomicBool::new(false),
            marker,
        })
    }

    pub fn mark_ready(&self) {
        self.ready.store(true, Ordering::SeqCst);
        let _ = std::fs::remove_file(&self.marker);
    }

    fn recently_restarted(&self) -> bool {
        std::fs::metadata(&self.marker)
            .and_then(|metadata| metadata.modified())
            .ok()
            .and_then(|modified| SystemTime::now().duration_since(modified).ok())
            .is_some_and(|age| age < Duration::from_secs(300))
    }

    fn mark_restart(&self) {
        let _ = std::fs::write(&self.marker, b"1");
    }
}

/// Start the one-shot readiness watchdog. It runs for the lifetime of the
/// process: a healthy UI marks ready in well under a second and the task exits
/// after the grace period.
pub fn spawn(app: tauri::AppHandle, watchdog: Arc<UiWatchdog>) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(10)).await;
        if watchdog.ready.load(Ordering::SeqCst) {
            return;
        }
        if watchdog.recently_restarted() {
            log::warn!(
                "UI did not report ready after a previous restart; leaving the error visible so the user can retry from the tray"
            );
            return;
        }
        watchdog.mark_restart();
        log::warn!(
            "UI did not report ready within 10s; restarting once to recover the Tauri IPC channel"
        );
        app.restart();
    });
}
