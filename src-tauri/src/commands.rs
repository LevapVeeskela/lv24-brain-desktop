use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::autostart::{self, AutostartStatus};
use crate::deep_link;
use crate::engine::cli::AuthOutcome;
use crate::engine::{EngineStatus, Supervisor};
use crate::lifecycle::{self, Event};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellStatus {
    pub engine: EngineStatus,
    pub paused: bool,
    pub updating: bool,
    pub autostart: AutostartStatus,
    pub desktop_version: String,
    pub deep_link_scheme: String,
    pub log_dir: String,
    pub previous_session_unclean: bool,
    pub session_diagnostics_available: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
}

pub fn supervisor(app: &AppHandle) -> Arc<Supervisor> {
    app.state::<Arc<Supervisor>>().inner().clone()
}

pub fn report_error(app: &AppHandle, message: String) {
    log::warn!("{message}");
    let _ = app.emit("shell-error", message);
}

fn make_status(app: &AppHandle) -> ShellStatus {
    let supervisor = supervisor(app);
    let recovery = lifecycle::recovery(app);
    ShellStatus {
        engine: supervisor.status(),
        paused: supervisor.is_paused(),
        updating: supervisor.is_updating(),
        autostart: autostart::status(app),
        desktop_version: env!("CARGO_PKG_VERSION").to_string(),
        deep_link_scheme: deep_link::SCHEME.to_string(),
        log_dir: supervisor.log_dir().display().to_string(),
        previous_session_unclean: recovery.previous_unclean,
        session_diagnostics_available: recovery.diagnostics_available,
    }
}

#[tauri::command]
pub fn shell_status(app: AppHandle) -> Result<ShellStatus, String> {
    Ok(make_status(&app))
}

#[tauri::command]
pub async fn engine_start(app: AppHandle) -> Result<ShellStatus, String> {
    supervisor(&app)
        .resume()
        .await
        .map_err(|err| err.to_string())?;
    Ok(make_status(&app))
}

#[tauri::command]
pub async fn engine_pause(app: AppHandle) -> Result<ShellStatus, String> {
    supervisor(&app)
        .pause()
        .await
        .map_err(|err| err.to_string())?;
    Ok(make_status(&app))
}

#[tauri::command]
pub async fn engine_sync_all(app: AppHandle) -> Result<crate::engine::SyncSummary, String> {
    supervisor(&app)
        .sync_all()
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn engine_providers(app: AppHandle) -> Result<serde_json::Value, String> {
    let supervisor = supervisor(&app);
    let binary = supervisor.engine_binary().map_err(|err| err.to_string())?;
    let config = supervisor.engine_config().map_err(|err| err.to_string())?;
    crate::engine::cli::providers(&binary, &config)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn engine_secrets(app: AppHandle) -> Result<Vec<String>, String> {
    let supervisor = supervisor(&app);
    let binary = supervisor.engine_binary().map_err(|err| err.to_string())?;
    let config = supervisor.engine_config().map_err(|err| err.to_string())?;
    crate::engine::cli::secret_names(&binary, &config)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn engine_connection_auth(
    app: AppHandle,
    connection_id: String,
    client_id: Option<String>,
) -> Result<AuthOutcome, String> {
    let supervisor = supervisor(&app);
    let binary = supervisor.engine_binary().map_err(|err| err.to_string())?;
    let config = supervisor.engine_config().map_err(|err| err.to_string())?;
    crate::engine::cli::connection_auth(
        &app,
        &binary,
        &config,
        &connection_id,
        client_id.as_deref(),
    )
    .await
    .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn autostart_set(app: AppHandle, enabled: bool) -> Result<ShellStatus, String> {
    autostart::set(&app, enabled).map_err(|err| err.to_string())?;
    Ok(make_status(&app))
}

#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<UpdateInfo, String> {
    let updater = updater(&app, Duration::from_secs(120))?;
    let update = updater.check().await.map_err(|err| err.to_string())?;
    Ok(match update {
        Some(update) => UpdateInfo {
            available: true,
            version: Some(update.version),
            notes: update.body,
            date: update.date.map(|date| date.to_string()),
        },
        None => UpdateInfo {
            available: false,
            version: None,
            notes: None,
            date: None,
        },
    })
}

#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    let updater = updater(&app, Duration::from_secs(15 * 60))?;
    let Some(update) = updater.check().await.map_err(|err| err.to_string())? else {
        return Ok(());
    };

    // Download and verify first: the agent keeps running during the network
    // transfer. It is stopped only immediately before the installer runs.
    let handle = app.clone();
    let mut downloaded = 0_u64;
    let bytes = update
        .download(
            move |chunk, total| {
                downloaded = downloaded.saturating_add(chunk as u64);
                let _ = handle.emit("update-progress", UpdateProgress { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|err| err.to_string())?;

    let supervisor = supervisor(&app);
    let was_paused = supervisor
        .suspend_for_update()
        .await
        .map_err(|err| err.to_string())?;
    lifecycle::expect_updater_restart(&app, Event::UpdaterInstall);
    if let Err(err) = update.install(&bytes) {
        lifecycle::record(&app, Event::UpdaterInstallFailed, None);
        supervisor.resume_after_update_failure(was_paused).await;
        return Err(err.to_string());
    }
    lifecycle::expect_updater_restart(&app, Event::UpdaterRestart);
    app.restart();
}

fn updater(app: &AppHandle, timeout: Duration) -> Result<tauri_plugin_updater::Updater, String> {
    app.updater_builder()
        .timeout(timeout)
        .build()
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn app_quit(app: AppHandle) {
    lifecycle::record(&app, Event::AppQuit, None);
    request_quit(app);
}

pub fn request_quit(app: AppHandle) {
    lifecycle::record(&app, Event::ShutdownRequested, None);
    let supervisor = supervisor(&app);
    tauri::async_runtime::spawn(async move {
        if supervisor.shutdown().await {
            lifecycle::record(&app, Event::ShutdownCompleted, None);
            app.exit(0);
        }
    });
}
