use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// Persisted user intent: a paused desktop does not restart the agent.
    pub paused: bool,
    /// Optional explicit brain.yaml, set by the settings screen in WP5.3.
    pub config_path: Option<String>,
}

pub struct SettingsStore {
    path: PathBuf,
    settings: Mutex<Settings>,
}

impl SettingsStore {
    pub fn load(path: PathBuf) -> AppResult<Self> {
        let settings = match fs::read_to_string(&path) {
            Ok(raw) => match serde_json::from_str::<Settings>(&raw) {
                Ok(settings) => settings,
                Err(err) => {
                    log::warn!(
                        "ignoring invalid desktop settings at {}: {err}",
                        path.display()
                    );
                    Settings::default()
                }
            },
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Settings::default(),
            Err(err) => {
                return Err(AppError::Message(format!(
                    "cannot read desktop settings {}: {err}",
                    path.display()
                )))
            }
        };
        Ok(Self {
            path,
            settings: Mutex::new(settings),
        })
    }

    pub fn get(&self) -> Settings {
        self.settings.lock().unwrap().clone()
    }

    pub fn set_paused(&self, paused: bool) -> AppResult<()> {
        let mut settings = self.settings.lock().unwrap();
        if settings.paused == paused {
            return Ok(());
        }
        settings.paused = paused;
        self.persist(&settings)
    }

    #[allow(dead_code)]
    pub fn set_config_path(&self, config_path: Option<String>) -> AppResult<()> {
        let mut settings = self.settings.lock().unwrap();
        let normalized = config_path
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        if settings.config_path == normalized {
            return Ok(());
        }
        settings.config_path = normalized;
        self.persist(&settings)
    }

    fn persist(&self, settings: &Settings) -> AppResult<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let raw = serde_json::to_vec_pretty(settings)?;
        let temporary = self.path.with_extension("json.tmp");
        fs::write(&temporary, raw)?;
        #[cfg(windows)]
        {
            // Windows rename does not replace an existing destination.
            if self.path.exists() {
                fs::remove_file(&self.path)?;
            }
        }
        fs::rename(&temporary, &self.path)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loads_missing_as_defaults_and_round_trips_pause() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let store = SettingsStore::load(path.clone()).unwrap();
        assert!(!store.get().paused);

        store.set_paused(true).unwrap();
        let reloaded = SettingsStore::load(path.clone()).unwrap();
        assert!(reloaded.get().paused);

        reloaded.set_paused(false).unwrap();
        assert!(!SettingsStore::load(path).unwrap().get().paused);
    }

    #[test]
    fn corrupt_settings_fall_back_to_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, "{not json").unwrap();
        let store = SettingsStore::load(path).unwrap();
        assert_eq!(store.get(), Settings::default());
    }
}
