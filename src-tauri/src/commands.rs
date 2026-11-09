use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::autostart::{self, AutostartStatus};
use crate::deep_link;
use crate::engine::{EngineStatus, Supervisor};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellStatus {
    pub engine: EngineStatus,
    pub paused: bool,
    pub autostart: AutostartStatus,
    pub desktop_version: String,
    pub deep_link_scheme: String,
    pub log_dir: String,
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
    ShellStatus {
        engine: supervisor.status(),
        paused: supervisor.is_paused(),
        autostart: autostart::status(app),
        desktop_version: env!("CARGO_PKG_VERSION").to_string(),
        deep_link_scheme: deep_link::SCHEME.to_string(),
        log_dir: supervisor.log_dir().display().to_string(),
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
pub fn autostart_set(app: AppHandle, enabled: bool) -> Result<ShellStatus, String> {
    autostart::set(&app, enabled).map_err(|err| err.to_string())?;
    Ok(make_status(&app))
}

#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<UpdateInfo, String> {
    let updater = app.updater().map_err(|err| err.to_string())?;
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
    let updater = app.updater().map_err(|err| err.to_string())?;
    let Some(update) = updater.check().await.map_err(|err| err.to_string())? else {
        return Ok(());
    };
    let handle = app.clone();
    let mut downloaded = 0_u64;
    update
        .download_and_install(
            move |chunk, total| {
                downloaded = downloaded.saturating_add(chunk as u64);
                let _ = handle.emit("update-progress", UpdateProgress { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|err| err.to_string())?;
    app.restart();
}

#[tauri::command]
pub fn app_quit(app: AppHandle) {
    request_quit(app);
}

pub fn request_quit(app: AppHandle) {
    let supervisor = supervisor(&app);
    tauri::async_runtime::spawn(async move {
        if supervisor.shutdown().await {
            app.exit(0);
        }
    });
}
