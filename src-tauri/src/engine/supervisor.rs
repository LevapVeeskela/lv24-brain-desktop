use std::process::{ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{Mutex as AsyncMutex, Notify};

use super::paths::{self, AppPaths, EngineBinary, EngineConfig};
use super::runtime::{self, RuntimeRecord};
use crate::api::{path as api_path, ApiClient, HttpClients};
use crate::error::{AppError, AppResult};
use crate::settings::SettingsStore;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EnginePhase {
    Starting,
    Running,
    Paused,
    Error,
    Stopped,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    pub phase: EnginePhase,
    pub running: bool,
    pub owned: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_dir: Option<std::path::PathBuf>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config_path: Option<std::path::PathBuf>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub engine_bin: Option<std::path::PathBuf>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub engine_source: Option<String>,
    pub restarts: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncFailure {
    pub connection_id: String,
    pub error: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSummary {
    pub total: usize,
    pub queued: usize,
    pub failures: Vec<SyncFailure>,
}

struct Inner {
    app: AppHandle,
    settings: SettingsStore,
    paths: AppPaths,
    clients: Arc<HttpClients>,
    status: Mutex<EngineStatus>,
    child: AsyncMutex<Option<Child>>,
    lifecycle: AsyncMutex<()>,
    paused: AtomicBool,
    quitting: AtomicBool,
    restarts: AtomicU32,
    wake: Notify,
    quit_wake: Notify,
}

pub struct Supervisor {
    inner: Arc<Inner>,
}

enum Probe {
    Running(RuntimeRecord),
    Unhealthy(RuntimeRecord, String),
    NoRuntime,
}

impl Supervisor {
    pub fn new(app: AppHandle, paths: AppPaths, settings: SettingsStore) -> AppResult<Self> {
        let clients = Arc::new(HttpClients::build()?);
        let paused = settings.get().paused;
        let mut status = EngineStatus {
            phase: if paused {
                EnginePhase::Paused
            } else {
                EnginePhase::Starting
            },
            running: false,
            owned: false,
            pid: None,
            port: None,
            version: None,
            started_at: None,
            last_error: None,
            data_dir: None,
            config_path: None,
            engine_bin: None,
            engine_source: None,
            restarts: 0,
        };
        fill_paths(&app, &settings, &mut status);
        Ok(Self {
            inner: Arc::new(Inner {
                app,
                settings,
                paths,
                clients,
                status: Mutex::new(status),
                child: AsyncMutex::new(None),
                lifecycle: AsyncMutex::new(()),
                paused: AtomicBool::new(paused),
                quitting: AtomicBool::new(false),
                restarts: AtomicU32::new(0),
                wake: Notify::new(),
                quit_wake: Notify::new(),
            }),
        })
    }

    pub fn status(&self) -> EngineStatus {
        self.inner.status.lock().unwrap().clone()
    }

    pub fn is_paused(&self) -> bool {
        self.inner.paused.load(Ordering::SeqCst)
    }

    pub fn is_quitting(&self) -> bool {
        self.inner.quitting.load(Ordering::SeqCst)
    }

    pub fn log_dir(&self) -> &std::path::Path {
        &self.inner.paths.log_dir
    }

    /// Background reconciler: keeps one agent healthy unless the user paused it.
    pub async fn run(self: Arc<Self>) {
        let mut ticker = tokio::time::interval(Duration::from_secs(2));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        let mut retry_at = Instant::now();
        let mut backoff = Duration::from_secs(2);

        loop {
            tokio::select! {
                _ = ticker.tick() => {}
                _ = self.inner.wake.notified() => {}
                _ = self.inner.quit_wake.notified() => break,
            }
            if self.inner.quitting.load(Ordering::SeqCst) {
                break;
            }

            let lifecycle = self.inner.lifecycle.lock().await;
            if self.inner.quitting.load(Ordering::SeqCst) {
                break;
            }
            if self.inner.paused.load(Ordering::SeqCst) {
                self.set_paused().await;
                continue;
            }

            if let Some(exit) = self.reap_child().await {
                let message = exit_message(exit);
                self.inner.restarts.fetch_add(1, Ordering::Relaxed);
                self.set_error(message).await;
                retry_at = Instant::now() + backoff;
                backoff = (backoff * 2).min(Duration::from_secs(30));
                continue;
            }

            match self.probe().await {
                Ok(Probe::Running(record)) => {
                    backoff = Duration::from_secs(2);
                    retry_at = Instant::now();
                    self.set_running(record).await;
                }
                Ok(Probe::Unhealthy(record, error)) => {
                    if self.has_child().await {
                        self.set_starting(Some(record.pid)).await;
                    } else if Instant::now() >= retry_at {
                        let message = format!(
                            "control API did not answer for pid {} ({}); attempting a fresh agent",
                            record.pid, error
                        );
                        self.set_error(message).await;
                        if let Err(err) = self.spawn().await {
                            self.inner.restarts.fetch_add(1, Ordering::Relaxed);
                            self.set_error(err.to_string()).await;
                            retry_at = Instant::now() + backoff;
                            backoff = (backoff * 2).min(Duration::from_secs(30));
                        } else {
                            retry_at = Instant::now() + Duration::from_secs(15);
                        }
                    } else {
                        // Keep the previous error visible until the retry time;
                        // repeatedly overwriting it with "starting" would hide
                        // the actionable message.
                    }
                }
                Ok(Probe::NoRuntime) => {
                    if self.has_child().await {
                        self.set_starting(None).await;
                    } else if Instant::now() >= retry_at {
                        self.set_starting(None).await;
                        if let Err(err) = self.spawn().await {
                            self.inner.restarts.fetch_add(1, Ordering::Relaxed);
                            self.set_error(err.to_string()).await;
                            retry_at = Instant::now() + backoff;
                            backoff = (backoff * 2).min(Duration::from_secs(30));
                        } else {
                            retry_at = Instant::now() + Duration::from_secs(15);
                        }
                    }
                }
                Err(err) => {
                    self.set_error(err.to_string()).await;
                    retry_at = Instant::now() + Duration::from_secs(10);
                }
            }
            drop(lifecycle);
        }
    }

    pub async fn resume(&self) -> AppResult<EngineStatus> {
        {
            let _lifecycle = self.inner.lifecycle.lock().await;
            self.inner.paused.store(false, Ordering::SeqCst);
            self.inner.settings.set_paused(false)?;
        }
        self.inner.wake.notify_waiters();

        let deadline = Instant::now() + Duration::from_secs(15);
        loop {
            let status = self.status();
            if status.running {
                return Ok(status);
            }
            if Instant::now() >= deadline {
                return Ok(status);
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    }

    pub async fn pause(&self) -> AppResult<EngineStatus> {
        let _lifecycle = self.inner.lifecycle.lock().await;
        self.inner.paused.store(true, Ordering::SeqCst);
        self.inner.settings.set_paused(true)?;
        self.set_paused().await;
        self.stop_engine().await;
        if matches!(self.probe().await, Ok(Probe::Running(_))) {
            self.inner.paused.store(false, Ordering::SeqCst);
            self.inner.settings.set_paused(false)?;
            let message =
                "the brain agent did not stop; it may be supervised by another process".to_string();
            self.set_error(message.clone()).await;
            return Err(AppError::Message(message));
        }
        self.set_paused().await;
        Ok(self.status())
    }

    pub async fn client(&self) -> AppResult<ApiClient> {
        let record = self
            .current_runtime()
            .await?
            .ok_or_else(|| AppError::Message("the brain agent is not running".to_string()))?;
        let client = ApiClient::with_clients(&record, self.inner.clients.clone());
        client.health().await?;
        Ok(client)
    }

    pub async fn sync_all(&self) -> AppResult<SyncSummary> {
        self.resume().await?;
        let client = self.wait_client().await?;
        let connections = client.get_json("/v1/connections").await?;
        let connections = connections
            .as_array()
            .ok_or_else(|| AppError::Api("connections response is not an array".to_string()))?;

        let total = connections.len();
        let mut queued = 0;
        let mut failures = Vec::new();
        for connection in connections {
            let id = connection
                .get("id")
                .and_then(|value| value.as_str())
                .unwrap_or_default();
            let id = match api_path::validate_id(id) {
                Ok(id) => id.to_string(),
                Err(_) => {
                    failures.push(SyncFailure {
                        connection_id: id.to_string(),
                        error: "invalid connection id".to_string(),
                    });
                    continue;
                }
            };
            let path = format!("/v1/connections/{id}/run");
            match client.request("POST", &path, Some("{}")).await {
                Ok(response) if response.status == 202 || response.status == 200 => queued += 1,
                Ok(response) => failures.push(SyncFailure {
                    connection_id: id,
                    error: format!("local API returned status {}", response.status),
                }),
                Err(err) => failures.push(SyncFailure {
                    connection_id: id,
                    error: err.to_string(),
                }),
            }
        }
        Ok(SyncSummary {
            total,
            queued,
            failures,
        })
    }

    /// Graceful shutdown used by Quit and by the platform exit request.
    /// Returns true only for the caller that actually performed the shutdown,
    /// so duplicate quit requests cannot exit the process early.
    pub async fn shutdown(&self) -> bool {
        if self.inner.quitting.swap(true, Ordering::SeqCst) {
            return false;
        }
        self.inner.quit_wake.notify_waiters();
        let _lifecycle = self.inner.lifecycle.lock().await;
        self.stop_engine().await;
        self.set_stopped().await;
        true
    }

    async fn wait_client(&self) -> AppResult<ApiClient> {
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            match self.client().await {
                Ok(client) => return Ok(client),
                Err(err) => {
                    if Instant::now() >= deadline {
                        return Err(err);
                    }
                    tokio::time::sleep(Duration::from_millis(300)).await;
                }
            }
        }
    }

    async fn current_runtime(&self) -> AppResult<Option<RuntimeRecord>> {
        let settings = self.inner.settings.get();
        let config = paths::resolve_config(&self.inner.app, settings.config_path.as_deref())?;
        runtime::read(&config.data_dir)
    }

    async fn probe(&self) -> AppResult<Probe> {
        let settings = self.inner.settings.get();
        let config = paths::resolve_config(&self.inner.app, settings.config_path.as_deref())?;
        let Some(record) = runtime::read(&config.data_dir)? else {
            return Ok(Probe::NoRuntime);
        };
        let client = ApiClient::with_clients(&record, self.inner.clients.clone());
        match tokio::time::timeout(Duration::from_secs(3), client.health()).await {
            Ok(Ok(())) => Ok(Probe::Running(record)),
            Ok(Err(err)) => Ok(Probe::Unhealthy(record, err.to_string())),
            Err(_) => Ok(Probe::Unhealthy(
                record,
                "health check timed out".to_string(),
            )),
        }
    }

    async fn spawn(&self) -> AppResult<()> {
        let settings = self.inner.settings.get();
        let config = paths::resolve_config(&self.inner.app, settings.config_path.as_deref())?;
        let binary = paths::locate_engine(&self.inner.app)?;
        let mut command = Command::new(&binary.path);
        command
            .arg("agent")
            .arg("--parent-pid")
            .arg(std::process::id().to_string())
            .arg("--config")
            .arg(&config.path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        if let Some(parent) = config.path.parent() {
            command.current_dir(parent);
        }
        #[cfg(windows)]
        {
            command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }

        let mut child = command.spawn().map_err(|err| {
            AppError::Message(format!("cannot start {}: {err}", binary.path.display()))
        })?;
        let pid = child.id();
        if let Some(stderr) = child.stderr.take() {
            tauri::async_runtime::spawn(async move {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    log::warn!("brain agent: {line}");
                }
            });
        }
        log::info!(
            "started brain agent pid={pid:?} binary={} config={}",
            binary.path.display(),
            config.path.display()
        );
        *self.inner.child.lock().await = Some(child);
        self.set_starting(pid).await;
        Ok(())
    }

    async fn reap_child(&self) -> Option<ExitStatus> {
        let mut guard = self.inner.child.lock().await;
        let child = guard.as_mut()?;
        match child.try_wait() {
            Ok(Some(status)) => {
                *guard = None;
                Some(status)
            }
            Ok(None) => None,
            Err(err) => {
                log::warn!("cannot poll brain agent status: {err}");
                *guard = None;
                None
            }
        }
    }

    async fn has_child(&self) -> bool {
        self.inner.child.lock().await.is_some()
    }

    async fn stop_engine(&self) {
        if let Ok(Some(record)) = self.current_runtime().await {
            let client = ApiClient::with_clients(&record, self.inner.clients.clone());
            let _ = tokio::time::timeout(Duration::from_secs(3), client.shutdown()).await;
        }

        let child = self.inner.child.lock().await.take();
        if let Some(mut child) = child {
            let mut exited = false;
            for _ in 0..40 {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        log::info!("brain agent exited after shutdown: {status}");
                        exited = true;
                        break;
                    }
                    Ok(None) => {}
                    Err(err) => {
                        log::warn!("cannot poll brain agent during shutdown: {err}");
                        break;
                    }
                }
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
            if !exited {
                let _ = child.kill().await;
                let _ = child.wait().await;
            }
        } else {
            // The agent may have been started by the CLI. Give the graceful
            // request time to remove its runtime record.
            for _ in 0..20 {
                match self.probe().await {
                    Ok(Probe::NoRuntime) => break,
                    Ok(Probe::Unhealthy(_, _)) | Ok(Probe::Running(_)) => {}
                    Err(_) => break,
                }
                tokio::time::sleep(Duration::from_millis(250)).await;
            }
        }
    }

    async fn set_running(&self, record: RuntimeRecord) {
        let owned_pid = self.inner.child.lock().await.as_ref().and_then(Child::id);
        let mut next = EngineStatus {
            phase: EnginePhase::Running,
            running: true,
            owned: owned_pid == Some(record.pid),
            pid: Some(record.pid),
            port: Some(record.port),
            version: non_empty(record.version),
            started_at: record.started_at,
            last_error: None,
            data_dir: None,
            config_path: None,
            engine_bin: None,
            engine_source: None,
            restarts: self.inner.restarts.load(Ordering::Relaxed),
        };
        fill_paths(&self.inner.app, &self.inner.settings, &mut next);
        self.set_status(next).await;
    }

    async fn set_starting(&self, pid: Option<u32>) {
        let mut next = EngineStatus {
            phase: EnginePhase::Starting,
            running: false,
            owned: pid.is_some(),
            pid,
            port: None,
            version: None,
            started_at: None,
            last_error: None,
            data_dir: None,
            config_path: None,
            engine_bin: None,
            engine_source: None,
            restarts: self.inner.restarts.load(Ordering::Relaxed),
        };
        fill_paths(&self.inner.app, &self.inner.settings, &mut next);
        self.set_status(next).await;
    }

    async fn set_paused(&self) {
        let mut next = EngineStatus {
            phase: EnginePhase::Paused,
            running: false,
            owned: false,
            pid: None,
            port: None,
            version: None,
            started_at: None,
            last_error: None,
            data_dir: None,
            config_path: None,
            engine_bin: None,
            engine_source: None,
            restarts: self.inner.restarts.load(Ordering::Relaxed),
        };
        fill_paths(&self.inner.app, &self.inner.settings, &mut next);
        self.set_status(next).await;
    }

    async fn set_error(&self, message: String) {
        log::warn!("supervisor: {message}");
        let mut next = EngineStatus {
            phase: EnginePhase::Error,
            running: false,
            owned: false,
            pid: None,
            port: None,
            version: None,
            started_at: None,
            last_error: Some(message),
            data_dir: None,
            config_path: None,
            engine_bin: None,
            engine_source: None,
            restarts: self.inner.restarts.load(Ordering::Relaxed),
        };
        fill_paths(&self.inner.app, &self.inner.settings, &mut next);
        self.set_status(next).await;
    }

    async fn set_stopped(&self) {
        let mut next = EngineStatus {
            phase: EnginePhase::Stopped,
            running: false,
            owned: false,
            pid: None,
            port: None,
            version: None,
            started_at: None,
            last_error: None,
            data_dir: None,
            config_path: None,
            engine_bin: None,
            engine_source: None,
            restarts: self.inner.restarts.load(Ordering::Relaxed),
        };
        fill_paths(&self.inner.app, &self.inner.settings, &mut next);
        self.set_status(next).await;
    }

    async fn set_status(&self, next: EngineStatus) {
        let changed = {
            let mut guard = self.inner.status.lock().unwrap();
            if *guard == next {
                false
            } else {
                *guard = next.clone();
                true
            }
        };
        if changed {
            crate::tray::refresh(&self.inner.app, &next);
            let _ = self.inner.app.emit("engine-status", &next);
        }
    }
}

fn fill_paths(app: &AppHandle, settings: &SettingsStore, status: &mut EngineStatus) {
    let snapshot = settings.get();
    if let Ok(EngineConfig {
        path,
        data_dir,
        mode: _,
    }) = paths::resolve_config(app, snapshot.config_path.as_deref())
    {
        status.config_path = Some(path);
        status.data_dir = Some(data_dir);
    }
    if let Ok(EngineBinary { path, source }) = paths::locate_engine(app) {
        status.engine_bin = Some(path);
        status.engine_source = Some(source);
    }
}

fn non_empty(value: String) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

fn exit_message(exit: ExitStatus) -> String {
    match exit.code() {
        Some(code) => format!("brain agent exited with code {code}"),
        None => "brain agent was terminated by a signal".to_string(),
    }
}
