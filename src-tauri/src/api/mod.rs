mod client;
pub mod path;
pub mod sse;

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use futures_util::StreamExt;
use serde::Serialize;
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Emitter, Manager};

use crate::engine::Supervisor;
use crate::error::{AppError, AppResult};

pub use client::{ApiClient, ApiResponse, HttpClients};

/// Live SSE streams opened by the webview. The map holds abort handles only;
/// stream contents travel to the webview as Tauri events without the token.
#[derive(Default)]
pub struct RunLogState {
    streams: Arc<Mutex<HashMap<String, JoinHandle<()>>>>,
    next_id: AtomicU64,
}

impl RunLogState {
    fn next_id(&self) -> String {
        format!("log-{}", self.next_id.fetch_add(1, Ordering::Relaxed))
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunLogEvent {
    stream_id: String,
    event: String,
    data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunLogEnd {
    stream_id: String,
    error: Option<String>,
}

#[tauri::command]
pub async fn api_request(
    app: AppHandle,
    method: String,
    path: String,
    body: Option<String>,
) -> Result<ApiResponse, String> {
    let method = path::validate_method(&method).map_err(|err| err.to_string())?;
    let path = path::validate_path(&path).map_err(|err| err.to_string())?;
    if body.as_ref().is_some_and(|body| body.len() > 1024 * 1024) {
        return Err("request body exceeds the desktop proxy limit".to_string());
    }
    let supervisor: Arc<Supervisor> = crate::commands::supervisor(&app);
    let client = supervisor.client().await.map_err(|err| err.to_string())?;
    client
        .request(method, &path, body.as_deref())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn run_log_open(
    app: AppHandle,
    state: tauri::State<'_, RunLogState>,
    run_id: String,
) -> Result<String, String> {
    let run_id = path::validate_id(&run_id)
        .map_err(|err| err.to_string())?
        .to_string();
    let supervisor: Arc<Supervisor> = crate::commands::supervisor(&app);
    let client = supervisor.client().await.map_err(|err| err.to_string())?;
    let stream_id = state.next_id();
    let streams = state.streams.clone();
    let app_handle = app.clone();
    let task_stream_id = stream_id.clone();
    let task = tauri::async_runtime::spawn(async move {
        let result =
            stream_run_log(app_handle.clone(), client, run_id, task_stream_id.clone()).await;
        if let Some(state) = app_handle.try_state::<RunLogState>() {
            state.streams.lock().unwrap().remove(&task_stream_id);
        }
        let payload = match result {
            Ok(()) => RunLogEnd {
                stream_id: task_stream_id,
                error: None,
            },
            Err(err) => RunLogEnd {
                stream_id: task_stream_id,
                error: Some(err.to_string()),
            },
        };
        let _ = app_handle.emit("run-log-end", payload);
    });
    streams.lock().unwrap().insert(stream_id.clone(), task);
    Ok(stream_id)
}

#[tauri::command]
pub fn run_log_close(
    state: tauri::State<'_, RunLogState>,
    stream_id: String,
) -> Result<(), String> {
    let handle = state.streams.lock().unwrap().remove(&stream_id);
    if let Some(handle) = handle {
        handle.abort();
    }
    Ok(())
}

async fn stream_run_log(
    app: AppHandle,
    client: ApiClient,
    run_id: String,
    stream_id: String,
) -> AppResult<()> {
    let response = client.open_log(&run_id).await?;
    let mut stream = response.bytes_stream();
    let mut parser = sse::SseParser::default();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|err| AppError::Api(format!("run log stream failed: {err}")))?;
        for frame in parser.push(&chunk)? {
            let event = RunLogEvent {
                stream_id: stream_id.clone(),
                event: frame.event,
                data: frame.data,
            };
            app.emit("run-log", event)
                .map_err(|err| AppError::Message(format!("cannot emit run log: {err}")))?;
        }
    }
    Ok(())
}
