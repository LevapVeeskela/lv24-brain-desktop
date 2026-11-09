use std::fmt;
use std::fs;
use std::path::Path;

use serde::Deserialize;

use crate::error::{AppError, AppResult};

/// The owner-only `agent/runtime.json` written by `brain agent`.
///
/// The token is never serialized to the webview or written to logs; a custom
/// Debug implementation keeps accidental formatting redacted.
#[derive(Clone, Deserialize)]
pub struct RuntimeRecord {
    pub port: u16,
    pub token: String,
    pub pid: u32,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub started_at: Option<String>,
}

impl fmt::Debug for RuntimeRecord {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("RuntimeRecord")
            .field("port", &self.port)
            .field("token", &"[redacted]")
            .field("pid", &self.pid)
            .field("version", &self.version)
            .field("started_at", &self.started_at)
            .finish()
    }
}

impl RuntimeRecord {
    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }
}

pub fn read(data_dir: &Path) -> AppResult<Option<RuntimeRecord>> {
    let path = data_dir.join("agent").join("runtime.json");
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(err) => {
            return Err(AppError::Message(format!(
                "cannot inspect {}: {err}",
                path.display()
            )))
        }
    };
    if metadata.file_type().is_symlink() {
        return Err(AppError::Message(format!(
            "refusing symlinked agent runtime file {}",
            path.display()
        )));
    }
    if !metadata.is_file() {
        return Err(AppError::Message(format!(
            "agent runtime path {} is not a file",
            path.display()
        )));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o077 != 0 {
            log::warn!(
                "agent runtime file {} is readable by other users; expected owner-only permissions",
                path.display()
            );
        }
    }

    let raw = fs::read_to_string(&path)?;
    let record: RuntimeRecord = serde_json::from_str(&raw).map_err(|err| {
        AppError::Message(format!(
            "invalid agent runtime file {}: {err}",
            path.display()
        ))
    })?;
    if record.port == 0 {
        return Err(AppError::Message("agent runtime has port 0".to_string()));
    }
    if record.pid == 0 {
        return Err(AppError::Message("agent runtime has pid 0".to_string()));
    }
    if record.token.len() < 32 {
        return Err(AppError::Message(
            "agent runtime token is unexpectedly short".to_string(),
        ));
    }
    Ok(Some(record))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn write_runtime(dir: &Path, body: &str) {
        let agent = dir.join("agent");
        fs::create_dir_all(&agent).unwrap();
        fs::write(agent.join("runtime.json"), body).unwrap();
    }

    #[test]
    fn reads_and_redacts_runtime() {
        let dir = tempfile::tempdir().unwrap();
        write_runtime(
            dir.path(),
            r#"{"port":49152,"token":"0123456789abcdef0123456789abcdef","pid":42,"version":"0.12.0","started_at":"2026-11-09T18:00:00Z"}"#,
        );
        let record = read(dir.path()).unwrap().unwrap();
        assert_eq!(record.port, 49152);
        assert_eq!(record.version, "0.12.0");
        assert!(!format!("{record:?}").contains("0123456789abcdef"));
    }

    #[test]
    fn missing_runtime_is_not_an_error() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read(dir.path()).unwrap().is_none());
    }

    #[test]
    fn rejects_short_tokens_and_bad_ports() {
        let dir = tempfile::tempdir().unwrap();
        write_runtime(dir.path(), r#"{"port":1,"token":"short","pid":1}"#);
        assert!(read(dir.path()).is_err());

        write_runtime(
            dir.path(),
            r#"{"port":0,"token":"0123456789abcdef0123456789abcdef","pid":1}"#,
        );
        assert!(read(dir.path()).is_err());
    }
}
