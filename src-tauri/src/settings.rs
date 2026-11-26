use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::jsonfile::write_json_atomic;

/// Lead values offered by the settings screen (minutes before the due time).
pub const LEAD_OPTIONS: [u32; 5] = [0, 10, 60, 180, 1440];

/// Reminder preferences. They are also projected to the WebView, so the shape
/// is camelCase JSON like the rest of the desktop settings.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct ReminderSettings {
    /// Persisted as `remindersEnabled` next to the older desktop settings.
    #[serde(rename = "remindersEnabled")]
    pub enabled: bool,
    pub default_lead_minutes: u32,
    /// Local wall-clock `HH:MM`; quiet hours may wrap midnight.
    pub quiet_hours_start: String,
    pub quiet_hours_end: String,
    pub hide_titles: bool,
    pub notify_sound: bool,
}

impl Default for ReminderSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            default_lead_minutes: 10,
            quiet_hours_start: "22:00".to_string(),
            quiet_hours_end: "08:00".to_string(),
            hide_titles: false,
            notify_sound: true,
        }
    }
}

impl ReminderSettings {
    /// Rejects values the scheduler cannot represent. Called on every write so
    /// a hand-edited settings file cannot wedge the loop.
    pub fn validate(&self) -> AppResult<()> {
        if !LEAD_OPTIONS.contains(&self.default_lead_minutes) {
            return Err(AppError::Message(format!(
                "defaultLeadMinutes must be one of {LEAD_OPTIONS:?}"
            )));
        }
        parse_hhmm(&self.quiet_hours_start)
            .ok_or_else(|| AppError::Message("quietHoursStart must be HH:MM".to_string()))?;
        parse_hhmm(&self.quiet_hours_end)
            .ok_or_else(|| AppError::Message("quietHoursEnd must be HH:MM".to_string()))?;
        Ok(())
    }

    /// Repairs a hand-edited file on load: snap the lead to the nearest offered
    /// value and fall back to the default quiet window for unparsable times.
    /// Values are persisted as-is only after the next settings write.
    pub fn sanitized(mut self) -> Self {
        if !LEAD_OPTIONS.contains(&self.default_lead_minutes) {
            self.default_lead_minutes = nearest_lead(self.default_lead_minutes);
        }
        if parse_hhmm(&self.quiet_hours_start).is_none() {
            self.quiet_hours_start = "22:00".to_string();
        }
        if parse_hhmm(&self.quiet_hours_end).is_none() {
            self.quiet_hours_end = "08:00".to_string();
        }
        self
    }

    pub fn quiet_start_minutes(&self) -> u32 {
        parse_hhmm(&self.quiet_hours_start).unwrap_or(22 * 60)
    }

    pub fn quiet_end_minutes(&self) -> u32 {
        parse_hhmm(&self.quiet_hours_end).unwrap_or(8 * 60)
    }

    /// True when `minute_of_day` is inside the quiet window. Equal endpoints
    /// disable quiet hours instead of silencing an entire day.
    pub fn is_quiet(&self, minute_of_day: u32) -> bool {
        let start = self.quiet_start_minutes();
        let end = self.quiet_end_minutes();
        if start == end {
            return false;
        }
        if start < end {
            (start..end).contains(&minute_of_day)
        } else {
            minute_of_day >= start || minute_of_day < end
        }
    }
}

/// Parses a strict `HH:MM` 24-hour clock into minutes after midnight.
pub fn parse_hhmm(value: &str) -> Option<u32> {
    let value = value.trim();
    let (hours, minutes) = value.split_once(':')?;
    if hours.len() != 2 || minutes.len() != 2 {
        return None;
    }
    let hours: u32 = hours.parse().ok()?;
    let minutes: u32 = minutes.parse().ok()?;
    if hours > 23 || minutes > 59 {
        return None;
    }
    Some(hours * 60 + minutes)
}

fn nearest_lead(value: u32) -> u32 {
    LEAD_OPTIONS
        .iter()
        .copied()
        .min_by_key(|option| option.abs_diff(value))
        .unwrap_or(10)
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// Persisted user intent: a paused desktop does not restart the agent.
    pub paused: bool,
    /// Optional explicit brain.yaml, set by the settings screen in WP5.3.
    pub config_path: Option<String>,
    /// Reminder fields stay flat in the JSON so older files keep loading.
    #[serde(flatten)]
    pub reminders: ReminderSettings,
}

/// Cheap to clone: every clone shares the same file path and mutex, so the
/// supervisor and the reminder scheduler never overwrite each other's fields.
#[derive(Clone)]
pub struct SettingsStore {
    path: Arc<PathBuf>,
    settings: Arc<Mutex<Settings>>,
}

impl SettingsStore {
    pub fn load(path: PathBuf) -> AppResult<Self> {
        let mut settings = match fs::read_to_string(&path) {
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
        settings.reminders = settings.reminders.sanitized();
        Ok(Self {
            path: Arc::new(path),
            settings: Arc::new(Mutex::new(settings)),
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

    pub fn set_reminders(&self, next: ReminderSettings) -> AppResult<ReminderSettings> {
        next.validate()?;
        let mut settings = self.settings.lock().unwrap();
        if settings.reminders == next {
            return Ok(next);
        }
        settings.reminders = next.clone();
        self.persist(&settings)?;
        Ok(next)
    }

    fn persist(&self, settings: &Settings) -> AppResult<()> {
        write_json_atomic(&self.path, settings)
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

    #[test]
    fn old_settings_files_keep_loading_and_gain_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, r#"{"paused":true,"configPath":"C:/brain.yaml"}"#).unwrap();
        let settings = SettingsStore::load(path).unwrap().get();
        assert!(settings.paused);
        assert_eq!(settings.config_path.as_deref(), Some("C:/brain.yaml"));
        assert_eq!(settings.reminders, ReminderSettings::default());
    }

    #[test]
    fn reminder_settings_round_trip_flat_and_shared() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let store = SettingsStore::load(path.clone()).unwrap();
        let other = store.clone();
        let next = ReminderSettings {
            enabled: false,
            default_lead_minutes: 60,
            quiet_hours_start: "23:30".to_string(),
            quiet_hours_end: "07:15".to_string(),
            hide_titles: true,
            notify_sound: false,
        };
        store.set_reminders(next.clone()).unwrap();
        // The clone observes the write immediately.
        assert_eq!(other.get().reminders, next);
        other.set_paused(true).unwrap();
        assert!(store.get().paused);

        let raw = fs::read_to_string(&path).unwrap();
        assert!(raw.contains("\"remindersEnabled\": false"), "{raw}");
        assert!(raw.contains("\"defaultLeadMinutes\": 60"), "{raw}");
        let reloaded = SettingsStore::load(path).unwrap().get();
        assert_eq!(reloaded.reminders, next);
        assert!(reloaded.paused);
    }

    #[test]
    fn rejects_unknown_leads_and_bad_quiet_times() {
        let dir = tempfile::tempdir().unwrap();
        let store = SettingsStore::load(dir.path().join("settings.json")).unwrap();
        let bad_lead = ReminderSettings {
            default_lead_minutes: 15,
            ..ReminderSettings::default()
        };
        assert!(store.set_reminders(bad_lead).is_err());

        let short_start = ReminderSettings {
            quiet_hours_start: "22:0".to_string(),
            ..ReminderSettings::default()
        };
        assert!(store.set_reminders(short_start).is_err());
        let bad_end = ReminderSettings {
            quiet_hours_end: "24:00".to_string(),
            ..ReminderSettings::default()
        };
        assert!(store.set_reminders(bad_end).is_err());
    }

    #[test]
    fn loading_clamps_out_of_range_reminders_instead_of_failing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(
            &path,
            r#"{"defaultLeadMinutes":200,"quietHoursStart":"25:00","quietHoursEnd":"7:0"}"#,
        )
        .unwrap();

        let settings = SettingsStore::load(path).unwrap().get().reminders;
        assert_eq!(settings.default_lead_minutes, 180);
        assert_eq!(settings.quiet_hours_start, "22:00");
        assert_eq!(settings.quiet_hours_end, "08:00");

        let nearest = ReminderSettings {
            default_lead_minutes: 15,
            ..ReminderSettings::default()
        }
        .sanitized();
        assert_eq!(nearest.default_lead_minutes, 10);
        let nearest = ReminderSettings {
            default_lead_minutes: 5000,
            ..ReminderSettings::default()
        }
        .sanitized();
        assert_eq!(nearest.default_lead_minutes, 1440);
    }

    #[test]
    fn quiet_hours_wrap_midnight_and_disabled_when_equal() {
        let settings = ReminderSettings::default();
        assert!(settings.is_quiet(22 * 60));
        assert!(settings.is_quiet(23 * 60 + 59));
        assert!(settings.is_quiet(0));
        assert!(settings.is_quiet(7 * 60 + 59));
        assert!(!settings.is_quiet(8 * 60));
        assert!(!settings.is_quiet(12 * 60));

        let day = ReminderSettings {
            quiet_hours_start: "09:00".to_string(),
            quiet_hours_end: "17:00".to_string(),
            ..ReminderSettings::default()
        };
        assert!(day.is_quiet(12 * 60));
        assert!(!day.is_quiet(18 * 60));

        let off = ReminderSettings {
            quiet_hours_end: "22:00".to_string(),
            ..ReminderSettings::default()
        };
        assert!(!off.is_quiet(22 * 60));
    }

    #[test]
    fn parses_strict_clock_values() {
        assert_eq!(parse_hhmm("00:00"), Some(0));
        assert_eq!(parse_hhmm("07:05"), Some(7 * 60 + 5));
        assert_eq!(parse_hhmm("23:59"), Some(23 * 60 + 59));
        assert_eq!(parse_hhmm("7:05"), None);
        assert_eq!(parse_hhmm("24:00"), None);
        assert_eq!(parse_hhmm("12:60"), None);
        assert_eq!(parse_hhmm("noon"), None);
    }
}
