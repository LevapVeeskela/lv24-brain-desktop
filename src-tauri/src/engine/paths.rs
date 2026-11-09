use std::env;
use std::fs;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

/// Owner-local directories used by the desktop shell itself.
#[derive(Clone, Debug)]
pub struct AppPaths {
    pub config_dir: PathBuf,
    pub log_dir: PathBuf,
}

impl AppPaths {
    pub fn resolve(app: &AppHandle) -> AppResult<Self> {
        let resolver = app.path();
        let config_dir = resolver
            .app_config_dir()
            .map_err(|err| AppError::Message(format!("cannot resolve app config dir: {err}")))?;
        let log_dir = resolver
            .app_log_dir()
            .map_err(|err| AppError::Message(format!("cannot resolve app log dir: {err}")))?;
        fs::create_dir_all(&config_dir)?;
        fs::create_dir_all(&log_dir)?;
        Ok(Self {
            config_dir,
            log_dir,
        })
    }
}

/// A resolved brain.yaml plus the data directory it points at.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EngineConfig {
    pub path: PathBuf,
    pub data_dir: PathBuf,
    pub mode: String,
    pub update_channel: String,
}

/// The engine executable chosen for this session.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EngineBinary {
    pub path: PathBuf,
    pub source: String,
}

/// Locates the `brain` executable without invoking a shell.
///
/// Order: LV24_BRAIN_BIN, a bundled resource, a sibling `engine/` directory,
/// PATH, and the npm global platform package. WP5.4 will add the sidecar to the
/// bundle; until then a development install can set LV24_BRAIN_BIN.
pub fn locate_engine(app: &AppHandle) -> AppResult<EngineBinary> {
    let exe_name = if cfg!(windows) { "brain.exe" } else { "brain" };

    if let Some(raw) = env_nonempty("LV24_BRAIN_BIN") {
        let path = PathBuf::from(raw);
        if path.is_file() {
            return Ok(EngineBinary {
                path,
                source: "LV24_BRAIN_BIN".to_string(),
            });
        }
        return Err(AppError::Message(format!(
            "LV24_BRAIN_BIN points at {}, but it is not a file",
            path.display()
        )));
    }

    let mut roots: Vec<(PathBuf, &'static str)> = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        roots.push((resource_dir, "bundled resource"));
    }
    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            roots.push((parent.to_path_buf(), "application directory"));
        }
    }

    for (root, source) in &roots {
        for candidate in [root.join("engine").join(exe_name), root.join(exe_name)] {
            if candidate.is_file() {
                return Ok(EngineBinary {
                    path: candidate,
                    source: (*source).to_string(),
                });
            }
        }
    }

    if let Some(path) = find_on_path(exe_name) {
        return Ok(EngineBinary {
            path,
            source: "PATH".to_string(),
        });
    }

    if let Some(path) = npm_global_candidate().filter(|path| path.is_file()) {
        return Ok(EngineBinary {
            path,
            source: "npm global package".to_string(),
        });
    }

    Err(AppError::Message(format!(
        "brain executable not found; install lv24-brain, put {exe_name} next to the desktop app, or set LV24_BRAIN_BIN"
    )))
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    env::split_paths(&path)
        .map(|dir| dir.join(name))
        .find(|candidate| candidate.is_file())
}

fn npm_global_candidate() -> Option<PathBuf> {
    if cfg!(windows) {
        let appdata = env_nonempty("APPDATA")?;
        return Some(
            PathBuf::from(appdata).join("npm/node_modules/@lv24/brain-win32-x64/bin/brain.exe"),
        );
    }
    let home = env_nonempty("HOME")?;
    let arch = if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "x64"
    };
    let os = if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    };
    Some(PathBuf::from(home).join(format!(
        ".npm-global/lib/node_modules/@lv24/brain-{os}-{arch}/bin/brain"
    )))
}

/// Resolves the engine config the same way `brain` does, with an optional
/// desktop setting taking precedence.
pub fn resolve_config(app: &AppHandle, override_path: Option<&str>) -> AppResult<EngineConfig> {
    let _ = app;
    let path = if let Some(raw) = override_path.map(str::trim).filter(|s| !s.is_empty()) {
        PathBuf::from(raw)
    } else if let Some(raw) =
        env_nonempty("LV24_BRAIN_CONFIG").or_else(|| env_nonempty("BRAIN_CONFIG"))
    {
        PathBuf::from(raw)
    } else {
        let cwd_config = PathBuf::from("brain.yaml");
        if cwd_config.is_file() {
            cwd_config
        } else {
            read_pointer().unwrap_or(cwd_config)
        }
    };

    parse_config(&path)
}

fn parse_config(path: &Path) -> AppResult<EngineConfig> {
    let raw = fs::read_to_string(path).map_err(|err| {
        if err.kind() == std::io::ErrorKind::NotFound {
            AppError::Message(format!(
                "brain config not found at {}; run brain init and brain config use",
                path.display()
            ))
        } else {
            AppError::Message(format!("cannot read {}: {err}", path.display()))
        }
    })?;

    let mut data_dir_raw = None;
    let mut mode = None;
    let mut update_channel = None;
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        match key.trim() {
            "data_dir" => data_dir_raw = Some(yaml_scalar(value)),
            "mode" => mode = Some(yaml_scalar(value)),
            "update_channel" => update_channel = Some(yaml_scalar(value)),
            _ => {}
        }
    }

    let data_dir_raw = data_dir_raw
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::Message(format!("{} has no data_dir", path.display())))?;
    let mode = mode.unwrap_or_else(|| "local".to_string());
    if mode != "local" && mode != "git" {
        return Err(AppError::Message(format!(
            "desktop supervision requires local or git mode, but {} uses {mode}",
            path.display()
        )));
    }
    let update_channel = update_channel
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "stable".to_string());

    let config_path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        env::current_dir()?.join(path)
    };
    let parent = config_path
        .parent()
        .ok_or_else(|| AppError::Message("config path has no parent directory".to_string()))?;
    let data_dir = normalize(if Path::new(&data_dir_raw).is_absolute() {
        PathBuf::from(&data_dir_raw)
    } else {
        parent.join(&data_dir_raw)
    });

    if !data_dir.is_dir() {
        return Err(AppError::Message(format!(
            "brain data directory {} does not exist; run brain init first",
            data_dir.display()
        )));
    }

    Ok(EngineConfig {
        path: config_path,
        data_dir,
        mode,
        update_channel,
    })
}

fn yaml_scalar(raw: &str) -> String {
    let value = raw.trim();
    if let Some(first) = value.as_bytes().first().copied() {
        if first == b'"' || first == b'\'' {
            if let Some(end) = value[1..].find(first as char) {
                return value[1..1 + end].to_string();
            }
        }
    }
    value.split(" #").next().unwrap_or(value).trim().to_string()
}

fn normalize(path: PathBuf) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    normalized
}

fn read_pointer() -> Option<PathBuf> {
    for path in pointer_paths() {
        let Ok(raw) = fs::read_to_string(path) else {
            continue;
        };
        let target = raw.trim();
        if !target.is_empty() {
            return Some(PathBuf::from(target));
        }
    }
    None
}

fn pointer_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(dir) = user_config_dir() {
        paths.push(dir.join("lv24-brain").join("config-path"));
    }
    if let Some(home) = env_nonempty("HOME").or_else(|| env_nonempty("USERPROFILE")) {
        let home_copy = PathBuf::from(home)
            .join(".config")
            .join("lv24-brain")
            .join("config-path");
        if !paths.contains(&home_copy) {
            paths.push(home_copy);
        }
    }
    paths
}

fn user_config_dir() -> Option<PathBuf> {
    if cfg!(windows) {
        env_nonempty("APPDATA").map(PathBuf::from).or_else(|| {
            env_nonempty("USERPROFILE")
                .map(|home| PathBuf::from(home).join("AppData").join("Roaming"))
        })
    } else if cfg!(target_os = "macos") {
        env_nonempty("HOME").map(|home| {
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
        })
    } else {
        env_nonempty("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| env_nonempty("HOME").map(|home| PathBuf::from(home).join(".config")))
    }
}

fn env_nonempty(key: &str) -> Option<String> {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_relative_data_dir_beside_config() {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("brain-data");
        fs::create_dir(&data).unwrap();
        let config = dir.path().join("brain.yaml");
        fs::write(
            &config,
            "mode: git\ndata_dir: \"./brain-data\"\nuser: test\n",
        )
        .unwrap();

        let resolved = parse_config(&config).unwrap();
        assert_eq!(resolved.data_dir, normalize(data));
        assert_eq!(resolved.mode, "git");
        assert_eq!(resolved.update_channel, "stable");
    }

    #[test]
    fn parses_quoted_absolute_data_dir() {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("data");
        fs::create_dir(&data).unwrap();
        let config = dir.path().join("brain.yaml");
        fs::write(
            &config,
            format!("mode: local\ndata_dir: '{}' # comment\n", data.display()),
        )
        .unwrap();

        let resolved = parse_config(&config).unwrap();
        assert_eq!(resolved.data_dir, normalize(data));
    }

    #[test]
    fn rejects_server_mode_and_missing_data_dir() {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path().join("brain.yaml");
        fs::write(&config, "mode: server\ndata_dir: .\n").unwrap();
        assert!(parse_config(&config)
            .unwrap_err()
            .to_string()
            .contains("local or git"));

        fs::write(&config, "mode: local\ndata_dir: ./missing\n").unwrap();
        assert!(parse_config(&config)
            .unwrap_err()
            .to_string()
            .contains("does not exist"));
    }

    #[test]
    fn yaml_scalar_handles_comments_and_quotes() {
        assert_eq!(yaml_scalar(" ./data # note"), "./data");
        assert_eq!(yaml_scalar("\"./data\""), "./data");
        assert_eq!(yaml_scalar("'./data'"), "./data");
    }
}
