use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::Command;

use super::paths::{EngineBinary, EngineConfig};
use crate::error::{AppError, AppResult};

const CLI_TIMEOUT: Duration = Duration::from_secs(20);
const AUTH_TIMEOUT: Duration = Duration::from_secs(300);
const MAX_CAPTURE: usize = 64 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthLine {
    pub connection_id: String,
    pub stream: String,
    pub line: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthOutcome {
    pub exit_code: Option<i32>,
    pub output: String,
}

/// Read-only provider descriptors from `brain connection providers --json`.
pub async fn providers(
    binary: &EngineBinary,
    config: &EngineConfig,
) -> AppResult<serde_json::Value> {
    let mut command = base_command(binary, config);
    command
        .arg("connection")
        .arg("providers")
        .arg("--json")
        .arg("--config")
        .arg(&config.path);
    let output = tokio::time::timeout(CLI_TIMEOUT, command.output())
        .await
        .map_err(|_| AppError::Message("engine providers timed out".to_string()))?
        .map_err(|err| AppError::Message(format!("cannot run engine providers: {err}")))?;
    if !output.status.success() {
        return Err(AppError::Message(cli_error("providers", &output.stderr)));
    }
    let value: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|err| AppError::Message(format!("invalid providers JSON: {err}")))?;
    Ok(value.get("data").cloned().unwrap_or(value))
}

/// Secret names from the OS store; values are never requested or printed.
pub async fn secret_names(binary: &EngineBinary, config: &EngineConfig) -> AppResult<Vec<String>> {
    let mut command = base_command(binary, config);
    command.arg("secret").arg("list");
    let output = tokio::time::timeout(CLI_TIMEOUT, command.output())
        .await
        .map_err(|_| AppError::Message("engine secret list timed out".to_string()))?
        .map_err(|err| AppError::Message(format!("cannot run engine secret list: {err}")))?;
    if !output.status.success() {
        return Err(AppError::Message(cli_error("secret list", &output.stderr)));
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect())
}

/// Runs the engine's OAuth command and streams its output as `connection-auth`
/// events. Device codes and URLs are safe to show; the engine never prints
/// tokens.
pub async fn connection_auth(
    app: &AppHandle,
    binary: &EngineBinary,
    config: &EngineConfig,
    connection_id: &str,
    client_id: Option<&str>,
) -> AppResult<AuthOutcome> {
    let connection_id = crate::api::path::validate_id(connection_id)?.to_string();
    let mut command = base_command(binary, config);
    command
        .arg("connection")
        .arg("auth")
        .arg(&connection_id)
        .arg("--config")
        .arg(&config.path);
    if let Some(client_id) = client_id.map(str::trim).filter(|value| !value.is_empty()) {
        command.arg("--client-id").arg(client_id);
    }
    let mut child = command
        .spawn()
        .map_err(|err| AppError::Message(format!("cannot start engine OAuth: {err}")))?;

    let captured = Arc::new(Mutex::new(String::new()));
    let mut readers = Vec::new();
    if let Some(stdout) = child.stdout.take() {
        readers.push(spawn_reader(
            app.clone(),
            connection_id.clone(),
            "stdout",
            stdout,
            captured.clone(),
        ));
    }
    if let Some(stderr) = child.stderr.take() {
        readers.push(spawn_reader(
            app.clone(),
            connection_id.clone(),
            "stderr",
            stderr,
            captured.clone(),
        ));
    }

    let status = match tokio::time::timeout(AUTH_TIMEOUT, child.wait()).await {
        Ok(result) => result
            .map_err(|err| AppError::Message(format!("engine OAuth process failed: {err}")))?,
        Err(_) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            return Err(AppError::Message(
                "engine OAuth timed out after five minutes".to_string(),
            ));
        }
    };
    for reader in readers {
        let _ = reader.await;
    }
    let output = captured.lock().unwrap().clone();
    Ok(AuthOutcome {
        exit_code: status.code(),
        output,
    })
}

fn spawn_reader<R>(
    app: AppHandle,
    connection_id: String,
    stream: &'static str,
    reader: R,
    captured: Arc<Mutex<String>>,
) -> tokio::task::JoinHandle<()>
where
    R: AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            {
                let mut buffer = captured.lock().unwrap();
                if buffer.len() < MAX_CAPTURE {
                    buffer.push_str(&line);
                    buffer.push('\n');
                }
            }
            let _ = app.emit(
                "connection-auth",
                AuthLine {
                    connection_id: connection_id.clone(),
                    stream: stream.to_string(),
                    line,
                },
            );
        }
    })
}

fn base_command(binary: &EngineBinary, config: &EngineConfig) -> Command {
    let mut command = Command::new(&binary.path);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("BRAIN_CONFIG", &config.path);
    if let Some(parent) = config.path.parent() {
        command.current_dir(parent);
    }
    #[cfg(windows)]
    {
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    command
}

fn cli_error(command: &str, stderr: &[u8]) -> String {
    let text = String::from_utf8_lossy(stderr);
    let compact = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut message: String = compact.chars().take(500).collect();
    if compact.chars().count() > 500 {
        message.push('…');
    }
    if message.is_empty() {
        format!("engine {command} failed")
    } else {
        format!("engine {command} failed: {message}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cli_error_is_compact_and_bounded() {
        let message = cli_error("providers", b"line one\nline two\nand a very long tail");
        assert_eq!(
            message,
            "engine providers failed: line one line two and a very long tail"
        );
        let long = cli_error("providers", "x".repeat(1000).as_bytes());
        assert!(long.chars().count() <= 530);
    }

    #[test]
    fn capture_is_bounded() {
        let mut buffer = String::new();
        for _ in 0..1000 {
            if buffer.len() < MAX_CAPTURE {
                buffer.push_str(&"y".repeat(100));
                buffer.push('\n');
            }
        }
        assert!(buffer.len() <= MAX_CAPTURE + 101);
    }
}
