//! Ideas reminders: a Rust scheduler that fires while the app or its tray icon
//! is alive. The WebView is intentionally not involved so a hidden window
//! cannot throttle the loop (see docs/spec-0.28-ideas.md §5.7).
//!
//! The engine reads open ideas from the local API every 30 s, computes the
//! effective due instant (timed `due_at`, all-day 09:00 local) and the optional
//! lead, and fires each `{idea_id, due_key, trigger}` once. The watermark lives
//! in the app config directory and is never synced. Quiet hours queue a digest
//! instead of a toast; triggers missed while the app was closed become one
//! launch digest.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::plugin::PermissionState;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;

use crate::engine::Supervisor;
use crate::error::{AppError, AppResult};
use crate::settings::{ReminderSettings, SettingsStore};

pub const EVENT_FOCUS: &str = "ideas-focus";
pub const EVENT_MISSED: &str = "ideas-missed";
pub const EVENT_IN_APP: &str = "ideas-reminder";

/// Scheduler period from the spec.
pub const TICK_SECS: u64 = 30;
/// A trigger this late was not observed live (sleep, network outage); fold it
/// into the digest instead of popping a backdated toast.
pub const MISSED_GRACE_SECS: i64 = 300;
const DIGEST_PREVIEW_ITEMS: usize = 10;
const MAX_LEAD_MINUTES: i64 = 10_080;
const ALL_DAY_DUE_HOUR: u32 = 9;
const SECONDS_PER_DAY: i64 = 86_400;

const TRIGGER_DUE: &str = "due";
const TRIGGER_LEAD: &str = "lead";

// ---------------------------------------------------------------------------
// Clock and local time
// ---------------------------------------------------------------------------

/// Injectable clock and time zone. Production uses the OS; tests use fixed or
/// DST-aware fakes so the trigger math is deterministic.
pub trait Zone: Send + Sync + 'static {
    /// Seconds since the Unix epoch.
    fn now(&self) -> i64;
    /// Local offset east of UTC at `epoch`, in seconds.
    fn offset_at(&self, epoch: i64) -> i32;
}

pub struct SystemZone;

impl Zone for SystemZone {
    fn now(&self) -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs() as i64)
            .unwrap_or(0)
    }

    fn offset_at(&self, epoch: i64) -> i32 {
        system_offset(epoch)
    }
}

#[cfg(windows)]
fn system_offset(epoch: i64) -> i32 {
    use windows_sys::Win32::Foundation::{FILETIME, SYSTEMTIME};
    use windows_sys::Win32::System::Time::{FileTimeToSystemTime, SystemTimeToTzSpecificLocalTime};

    const FILETIME_UNIX_EPOCH_OFFSET: i64 = 11_644_473_600;
    let ticks = (epoch + FILETIME_UNIX_EPOCH_OFFSET).max(0) as u64 * 10_000_000;
    let filetime = FILETIME {
        dwLowDateTime: (ticks & 0xffff_ffff) as u32,
        dwHighDateTime: (ticks >> 32) as u32,
    };
    let mut utc = SYSTEMTIME::default();
    // SAFETY: both pointers reference initialized, correctly sized values.
    if unsafe { FileTimeToSystemTime(&filetime, &mut utc) } == 0 {
        return 0;
    }
    let mut local = SYSTEMTIME::default();
    // SAFETY: a null time zone selects the current one; both structs are valid.
    if unsafe { SystemTimeToTzSpecificLocalTime(std::ptr::null(), &utc, &mut local) } == 0 {
        return 0;
    }
    let local_epoch = days_from_civil(
        i64::from(local.wYear),
        u32::from(local.wMonth),
        u32::from(local.wDay),
    ) * SECONDS_PER_DAY
        + i64::from(local.wHour) * 3600
        + i64::from(local.wMinute) * 60
        + i64::from(local.wSecond);
    (local_epoch - epoch) as i32
}

#[cfg(unix)]
fn system_offset(epoch: i64) -> i32 {
    let time = epoch as libc::time_t;
    let mut tm: libc::tm = unsafe { std::mem::zeroed() };
    // SAFETY: localtime_r writes into the valid `tm` and does not retain pointers.
    let result = unsafe { libc::localtime_r(&time, &mut tm) };
    if result.is_null() {
        0
    } else {
        tm.tm_gmtoff as i32
    }
}

#[cfg(not(any(windows, unix)))]
fn system_offset(_epoch: i64) -> i32 {
    0
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct CivilDate {
    pub year: i64,
    pub month: u32,
    pub day: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LocalTime {
    pub date: CivilDate,
    pub hour: u32,
    pub minute: u32,
    pub second: u32,
    pub offset: i32,
}

impl LocalTime {
    pub fn minute_of_day(&self) -> u32 {
        self.hour * 60 + self.minute
    }
}

/// Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant).
fn days_from_civil(year: i64, month: u32, day: u32) -> i64 {
    let month = i64::from(month);
    let day = i64::from(day);
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let shifted_month = if month > 2 { month - 3 } else { month + 9 };
    let day_of_year = (153 * shifted_month + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

fn civil_from_days(days: i64) -> CivilDate {
    let days = days + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let shifted_month = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * shifted_month + 2) / 5 + 1;
    let month = if shifted_month < 10 {
        shifted_month + 3
    } else {
        shifted_month - 9
    };
    CivilDate {
        year: if month <= 2 { year + 1 } else { year },
        month: month as u32,
        day: day as u32,
    }
}

fn is_leap_year(year: i64) -> bool {
    let divisible = |step: i64| year.rem_euclid(step) == 0;
    (divisible(4) && !divisible(100)) || divisible(400)
}

fn days_in_month(year: i64, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap_year(year) => 29,
        2 => 28,
        _ => 0,
    }
}

/// Parses the contract's `YYYY-MM-DD` all-day date.
pub fn parse_date(value: &str) -> Option<CivilDate> {
    let value = value.trim();
    if value.len() != 10 {
        return None;
    }
    let mut parts = value.split('-');
    let year = parts.next()?.parse::<i64>().ok()?;
    let month = parts.next()?.parse::<u32>().ok()?;
    let day = parts.next()?.parse::<u32>().ok()?;
    if parts.next().is_some() || !(1..=12).contains(&month) || day == 0 {
        return None;
    }
    if day > days_in_month(year, month) {
        return None;
    }
    Some(CivilDate { year, month, day })
}

/// Parses RFC3339 into epoch seconds. Fractional seconds are truncated; the
/// offset is honored exactly (`Z`, `+03:00`, `-0500`).
pub fn parse_rfc3339(value: &str) -> Option<i64> {
    struct Cursor<'a> {
        bytes: &'a [u8],
        position: usize,
    }

    impl Cursor<'_> {
        fn digits(&mut self, count: usize) -> Option<i64> {
            let end = self.position.checked_add(count)?;
            let slice = self.bytes.get(self.position..end)?;
            if !slice.iter().all(u8::is_ascii_digit) {
                return None;
            }
            self.position = end;
            std::str::from_utf8(slice).ok()?.parse::<i64>().ok()
        }

        fn eat(&mut self, expected: u8) -> bool {
            if self.bytes.get(self.position) == Some(&expected) {
                self.position += 1;
                true
            } else {
                false
            }
        }
    }

    let mut cursor = Cursor {
        bytes: value.trim().as_bytes(),
        position: 0,
    };

    let year = cursor.digits(4)?;
    if !cursor.eat(b'-') {
        return None;
    }
    let month = cursor.digits(2)? as u32;
    if !cursor.eat(b'-') {
        return None;
    }
    let day = cursor.digits(2)? as u32;
    if !(cursor.eat(b'T') || cursor.eat(b't') || cursor.eat(b' ')) {
        return None;
    }
    let hour = cursor.digits(2)?;
    if !cursor.eat(b':') {
        return None;
    }
    let minute = cursor.digits(2)?;
    if !cursor.eat(b':') {
        return None;
    }
    let second = cursor.digits(2)?;
    if cursor.eat(b'.') {
        let start = cursor.position;
        while cursor
            .bytes
            .get(cursor.position)
            .is_some_and(u8::is_ascii_digit)
        {
            cursor.position += 1;
        }
        if cursor.position == start || cursor.position - start > 9 {
            return None;
        }
    }
    let offset_seconds = if cursor.eat(b'Z') || cursor.eat(b'z') {
        0
    } else {
        let sign = if cursor.eat(b'+') {
            1
        } else if cursor.eat(b'-') {
            -1
        } else {
            return None;
        };
        let offset_hour = cursor.digits(2)?;
        cursor.eat(b':');
        let offset_minute = cursor.digits(2)?;
        if offset_hour > 23 || offset_minute > 59 {
            return None;
        }
        sign * (offset_hour * 3600 + offset_minute * 60)
    };
    if cursor.position != cursor.bytes.len() {
        return None;
    }
    if !(1..=12).contains(&month) || day == 0 || day > days_in_month(year, month) {
        return None;
    }
    if hour > 23 || minute > 59 || second > 60 {
        return None;
    }
    let seconds = hour * 3600 + minute * 60 + second.min(59) - offset_seconds;
    Some(days_from_civil(year, month, day) * SECONDS_PER_DAY + seconds)
}

fn local_from_epoch(zone: &dyn Zone, epoch: i64) -> LocalTime {
    let offset = zone.offset_at(epoch);
    let local = epoch + i64::from(offset);
    let days = local.div_euclid(SECONDS_PER_DAY);
    let seconds = local.rem_euclid(SECONDS_PER_DAY);
    LocalTime {
        date: civil_from_days(days),
        hour: (seconds / 3600) as u32,
        minute: ((seconds % 3600) / 60) as u32,
        second: (seconds % 60) as u32,
        offset,
    }
}

/// Converts a local wall-clock instant to epoch seconds. Iterates because the
/// UTC offset depends on the instant (DST); three passes cover the transition.
fn epoch_from_local(zone: &dyn Zone, date: CivilDate, hour: u32, minute: u32) -> i64 {
    let naive = days_from_civil(date.year, date.month, date.day) * SECONDS_PER_DAY
        + i64::from(hour) * 3600
        + i64::from(minute) * 60;
    let mut epoch = naive - i64::from(zone.offset_at(naive));
    for _ in 0..3 {
        let next = naive - i64::from(zone.offset_at(epoch));
        if next == epoch {
            break;
        }
        epoch = next;
    }
    epoch
}

// ---------------------------------------------------------------------------
// Trigger math
// ---------------------------------------------------------------------------

/// The API row fields the scheduler needs (snake_case local API JSON).
#[derive(Clone, Debug, Deserialize)]
struct IdeaRow {
    id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    due_at: Option<String>,
    #[serde(default)]
    due_date: Option<String>,
    #[serde(default)]
    remind_before_minutes: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IdeaReminder {
    pub idea_id: String,
    pub title: String,
    pub status: String,
    pub due_at: Option<String>,
    pub due_date: Option<String>,
    pub remind_before_minutes: Option<u32>,
}

impl IdeaReminder {
    fn is_open(&self) -> bool {
        self.status == "open" || self.status == "doing"
    }

    /// Effective due instant and the raw string that keys the watermark.
    fn effective_due(&self, zone: &dyn Zone) -> Option<(i64, String)> {
        if let Some(raw) = self.due_at.as_deref().filter(|value| !value.is_empty()) {
            if let Some(epoch) = parse_rfc3339(raw) {
                return Some((epoch, raw.to_string()));
            }
        }
        let raw = self.due_date.as_deref().filter(|value| !value.is_empty())?;
        let date = parse_date(raw)?;
        Some((
            epoch_from_local(zone, date, ALL_DAY_DUE_HOUR, 0),
            raw.to_string(),
        ))
    }

    fn triggers(&self, zone: &dyn Zone) -> Vec<Trigger> {
        if !self.is_open() {
            return Vec::new();
        }
        let Some((due_at, due_key)) = self.effective_due(zone) else {
            return Vec::new();
        };
        let mut triggers = vec![Trigger {
            kind: TriggerKind::Due,
            due_key: due_key.clone(),
            fire_at: due_at,
        }];
        if let Some(lead) = self.remind_before_minutes.filter(|minutes| *minutes > 0) {
            let lead = i64::from(lead).min(MAX_LEAD_MINUTES);
            triggers.push(Trigger {
                kind: TriggerKind::Lead,
                due_key,
                fire_at: due_at - lead * 60,
            });
        }
        triggers
    }

    fn is_due_on(&self, day: CivilDate, zone: &dyn Zone) -> bool {
        if !self.is_open() {
            return false;
        }
        if let Some(raw) = self.due_at.as_deref() {
            if let Some(epoch) = parse_rfc3339(raw) {
                return local_from_epoch(zone, epoch).date == day;
            }
        }
        if let Some(raw) = self.due_date.as_deref() {
            return parse_date(raw) == Some(day);
        }
        false
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TriggerKind {
    Due,
    Lead,
}

impl TriggerKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Due => TRIGGER_DUE,
            Self::Lead => TRIGGER_LEAD,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Trigger {
    pub kind: TriggerKind,
    pub due_key: String,
    pub fire_at: i64,
}

impl Trigger {
    fn key(&self, idea_id: &str) -> String {
        format!("{idea_id}|{}|{}", self.due_key, self.kind.as_str())
    }
}

pub fn parse_ideas(body: &serde_json::Value) -> AppResult<Vec<IdeaReminder>> {
    let rows = body
        .get("ideas")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| AppError::Api("ideas response has no list".to_string()))?;
    let mut ideas = Vec::with_capacity(rows.len());
    for row in rows {
        match serde_json::from_value::<IdeaRow>(row.clone()) {
            Ok(row) if !row.id.is_empty() => ideas.push(IdeaReminder {
                idea_id: row.id,
                title: row.title,
                status: row.status,
                due_at: row.due_at,
                due_date: row.due_date,
                remind_before_minutes: row.remind_before_minutes.filter(|value| *value > 0),
            }),
            Ok(_) => log::debug!("skipping an idea row without an id"),
            Err(err) => log::debug!("skipping an unreadable idea row: {err}"),
        }
    }
    Ok(ideas)
}

// ---------------------------------------------------------------------------
// Watermark
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingReminder {
    pub idea_id: String,
    pub title: String,
    pub due_key: String,
    pub trigger: String,
    pub fire_at: i64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderFile {
    #[serde(default)]
    pub version: u32,
    /// `{idea_id}|{due_key}|{trigger}` -> notified-at epoch seconds.
    #[serde(default)]
    pub notified: BTreeMap<String, i64>,
    /// Quiet-hours items waiting for the next open digest.
    #[serde(default)]
    pub digest: Vec<PendingReminder>,
}

impl ReminderFile {
    /// Missing or corrupt files start empty: a single repeated reminder after
    /// a damaged watermark is better than a scheduler that never fires.
    pub fn load(path: &Path) -> Self {
        match fs::read_to_string(path) {
            Ok(raw) => match serde_json::from_str::<Self>(&raw) {
                Ok(file) => file,
                Err(err) => {
                    log::warn!(
                        "ignoring invalid reminder watermark at {}: {err}",
                        path.display()
                    );
                    Self::default()
                }
            },
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Self::default(),
            Err(err) => {
                log::warn!(
                    "cannot read reminder watermark at {}: {err}",
                    path.display()
                );
                Self::default()
            }
        }
    }

    pub fn save(&self, path: &Path) -> AppResult<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut file = self.clone();
        file.version = 1;
        let raw = serde_json::to_vec_pretty(&file)?;
        let temporary = path.with_extension("json.tmp");
        fs::write(&temporary, raw)?;
        #[cfg(windows)]
        {
            // Windows rename does not replace an existing destination.
            if path.exists() {
                fs::remove_file(path)?;
            }
        }
        fs::rename(&temporary, path)?;
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Fire {
    pub key: String,
    pub idea_id: String,
    pub title: String,
    pub due_key: String,
    pub trigger: String,
    pub fire_at: i64,
}

pub struct PlanInput<'a> {
    pub now: i64,
    pub launch_at: i64,
    pub quiet: bool,
    pub rows: &'a [IdeaReminder],
    pub notified: &'a BTreeMap<String, i64>,
    pub pending: &'a [PendingReminder],
    pub today: CivilDate,
    pub zone: &'a dyn Zone,
}

#[derive(Debug, Default)]
pub struct Plan {
    pub toasts: Vec<Fire>,
    /// Digest items that are still waiting (quiet hours or not yet shown).
    pub pending: Vec<PendingReminder>,
    /// Digest ready to be shown now; the caller emits one event and clears it.
    pub digest: Option<Vec<PendingReminder>>,
    pub notified: BTreeMap<String, i64>,
    pub today_count: u32,
    pub open_count: u32,
}

/// Pure tick planning: no IO, no clock reads, no event emission.
pub fn plan_tick(input: PlanInput<'_>) -> Plan {
    let mut notified = input.notified.clone();
    let mut active_keys = BTreeSet::new();
    let mut due_now = Vec::new();
    let mut today_count = 0_u32;

    for row in input.rows {
        if row.is_due_on(input.today, input.zone) {
            today_count += 1;
        }
        for trigger in row.triggers(input.zone) {
            let key = trigger.key(&row.idea_id);
            active_keys.insert(key.clone());
            if trigger.fire_at <= input.now {
                due_now.push((row, trigger, key));
            }
        }
    }
    // Oldest first so the digest preview lists the most overdue item first.
    due_now.sort_by_key(|(_, trigger, _)| trigger.fire_at);

    let mut queued = input.pending.to_vec();
    let mut toasts = Vec::new();
    for (row, trigger, key) in due_now {
        if notified.contains_key(&key) {
            continue;
        }
        notified.insert(key.clone(), input.now);
        let late =
            trigger.fire_at < input.launch_at || input.now - trigger.fire_at > MISSED_GRACE_SECS;
        let entry = PendingReminder {
            idea_id: row.idea_id.clone(),
            title: row.title.clone(),
            due_key: trigger.due_key.clone(),
            trigger: trigger.kind.as_str().to_string(),
            fire_at: trigger.fire_at,
        };
        if late || input.quiet {
            queued.push(entry);
        } else {
            toasts.push(Fire {
                key,
                idea_id: row.idea_id.clone(),
                title: row.title.clone(),
                due_key: trigger.due_key,
                trigger: trigger.kind.as_str().to_string(),
                fire_at: trigger.fire_at,
            });
        }
    }

    // Changing the due time resets the key; completing/dropping drops it.
    notified.retain(|key, _| active_keys.contains(key));
    // A file written twice (or a crash between save and emit) must not duplicate.
    queued.sort_by_key(|item| item.fire_at);
    queued.dedup_by(|left, right| {
        left.idea_id == right.idea_id
            && left.due_key == right.due_key
            && left.trigger == right.trigger
    });

    let digest = if !input.quiet && !queued.is_empty() {
        Some(std::mem::take(&mut queued))
    } else {
        None
    };

    Plan {
        toasts,
        pending: queued,
        digest,
        notified,
        today_count,
        open_count: input.rows.iter().filter(|row| row.is_open()).count() as u32,
    }
}

// ---------------------------------------------------------------------------
// Events and notification delivery
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusEvent {
    pub idea_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MissedItem {
    pub id: String,
    pub title: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MissedEvent {
    pub count: u32,
    pub items: Vec<MissedItem>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InAppReminder {
    pub idea_id: Option<String>,
    pub title: Option<String>,
    pub trigger: String,
}

fn missed_event(items: &[PendingReminder]) -> MissedEvent {
    let mut seen = BTreeSet::new();
    let mut preview = Vec::new();
    for item in items {
        if seen.insert(item.idea_id.clone()) && preview.len() < DIGEST_PREVIEW_ITEMS {
            preview.push(MissedItem {
                id: item.idea_id.clone(),
                title: item.title.clone(),
            });
        }
    }
    MissedEvent {
        count: seen.len() as u32,
        items: preview,
    }
}

/// One native toast. `kind` is carried in the plugin payload so a click can
/// tell a reminder from the Settings test button.
pub struct Toast {
    pub id: i32,
    pub title: String,
    pub body: Option<String>,
    pub sound: bool,
    pub idea_id: Option<String>,
    pub trigger: String,
    pub kind: &'static str,
}

pub trait Notifier: Send + Sync + 'static {
    fn permission(&self) -> PermissionState;
    fn notify(&self, toast: &Toast) -> Result<(), String>;
}

#[derive(Debug, PartialEq, Eq)]
pub enum Delivery {
    Native,
    /// Permission denied or the toast failed: keep the in-app banner.
    InApp(String),
}

fn deliver(notifier: &dyn Notifier, toast: &Toast) -> Delivery {
    if notifier.permission() == PermissionState::Denied {
        return Delivery::InApp("notifications are blocked".to_string());
    }
    match notifier.notify(toast) {
        Ok(()) => Delivery::Native,
        Err(err) => Delivery::InApp(err),
    }
}

fn toast_id(key: &str) -> i32 {
    let mut hash: u32 = 2_166_136_261;
    for byte in key.bytes() {
        hash ^= u32::from(byte);
        hash = hash.wrapping_mul(16_777_619);
    }
    (hash & 0x7fff_ffff) as i32
}

struct TauriNotifier {
    app: AppHandle,
}

impl Notifier for TauriNotifier {
    fn permission(&self) -> PermissionState {
        self.app
            .notification()
            .permission_state()
            .unwrap_or(PermissionState::Prompt)
    }

    fn notify(&self, toast: &Toast) -> Result<(), String> {
        let mut builder = self
            .app
            .notification()
            .builder()
            .title(&toast.title)
            .id(toast.id);
        if let Some(body) = toast.body.as_deref().filter(|body| !body.is_empty()) {
            builder = builder.body(body);
        }
        builder = builder
            .extra("kind", toast.kind)
            .extra("trigger", &toast.trigger);
        if let Some(idea_id) = &toast.idea_id {
            builder = builder.extra("ideaId", idea_id);
        }
        if toast.sound {
            // The plugin ignores the name on platforms without a sound picker;
            // Windows toast audio ultimately follows the OS notification setting.
            builder = builder.sound("Default");
        }
        builder.show().map_err(|err| err.to_string())
    }
}

/// Registers the Rust notification-click handler. The plugin reports `tap`
/// actions on desktop while the toast is on screen; the payload carries the
/// idea id, so a click can focus the drawer.
pub fn register_notification_actions(app: &AppHandle) {
    let handle = app.clone();
    if let Err(err) = app.notification().on_action(move |performed| {
        if performed.action_id() != "tap" {
            return;
        }
        let Some(notification) = performed.notification() else {
            return;
        };
        let extra = notification.extra();
        if extra.get("kind").and_then(|value| value.as_str()) != Some("reminder") {
            return;
        }
        let idea_id = extra
            .get("ideaId")
            .and_then(|value| value.as_str())
            .map(str::to_string);
        open_ideas(&handle, idea_id.as_deref());
    }) {
        log::warn!("cannot register notification actions: {err}");
    }
}

fn safe_idea_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

/// Shows the window and navigates the WebView to the Ideas page. The id is
/// validated before it is interpolated into the hash.
pub fn open_ideas(app: &AppHandle, focus: Option<&str>) {
    crate::tray::show_main_window(app);
    let focus = focus.filter(|id| safe_idea_id(id));
    let hash = match focus {
        Some(id) => format!("#/ideas?focus={id}"),
        None => "#/ideas".to_string(),
    };
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(format!("window.location.hash = {hash:?};"));
    }
    let _ = app.emit(
        EVENT_FOCUS,
        FocusEvent {
            idea_id: focus.map(str::to_string),
        },
    );
}

/// Tray "New idea": open the page with the capture hint.
pub fn open_new_idea(app: &AppHandle) {
    crate::tray::show_main_window(app);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval("window.location.hash = '#/ideas?new=1';");
    }
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemindersStatus {
    pub settings: ReminderSettings,
    /// `granted` | `denied` | `prompt` (the desktop plugin never prompts).
    pub permission: String,
    pub today_count: u32,
    pub open_count: u32,
    pub missed: Option<MissedEvent>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestNotificationResult {
    pub delivered: bool,
    pub permission: String,
    pub error: Option<String>,
}

struct Snapshot {
    today_count: u32,
    open_count: u32,
    permission: PermissionState,
    missed: Option<MissedEvent>,
    last_error: Option<String>,
}

impl Default for Snapshot {
    fn default() -> Self {
        Self {
            today_count: 0,
            open_count: 0,
            permission: PermissionState::Prompt,
            missed: None,
            last_error: None,
        }
    }
}

pub struct ReminderEngine {
    app: AppHandle,
    supervisor: Arc<Supervisor>,
    settings: SettingsStore,
    zone: Arc<dyn Zone>,
    notifier: Arc<dyn Notifier>,
    path: PathBuf,
    snapshot: Mutex<Snapshot>,
    wake: tokio::sync::Notify,
}

impl ReminderEngine {
    pub fn start(
        app: AppHandle,
        supervisor: Arc<Supervisor>,
        settings: SettingsStore,
        app_data_dir: PathBuf,
    ) -> Arc<Self> {
        let notifier: Arc<dyn Notifier> = Arc::new(TauriNotifier { app: app.clone() });
        let permission = notifier.permission();
        let engine = Arc::new(Self {
            app,
            supervisor,
            settings,
            zone: Arc::new(SystemZone),
            notifier,
            path: app_data_dir.join("ideas-reminders.json"),
            snapshot: Mutex::new(Snapshot {
                permission,
                ..Snapshot::default()
            }),
            wake: tokio::sync::Notify::new(),
        });
        let runner = Arc::clone(&engine);
        tauri::async_runtime::spawn(async move {
            runner.run().await;
        });
        engine
    }

    async fn run(self: Arc<Self>) {
        let launch_at = self.zone.now();
        loop {
            self.tick(launch_at).await;
            tokio::select! {
                () = tokio::time::sleep(Duration::from_secs(TICK_SECS)) => {}
                () = self.wake.notified() => {}
            }
        }
    }

    async fn tick(&self, launch_at: i64) {
        let settings = self.settings.get();
        if !settings.reminders.enabled {
            self.publish_counts(0, 0);
            return;
        }
        let client = match self.supervisor.client().await {
            Ok(client) => client,
            Err(err) => {
                self.note_error(&err.to_string());
                return;
            }
        };
        let body = match client
            .get_json("/v1/ideas?status=open,doing&limit=1000")
            .await
        {
            Ok(body) => body,
            Err(err) => {
                self.note_error(&err.to_string());
                return;
            }
        };
        let rows = match parse_ideas(&body) {
            Ok(rows) => rows,
            Err(err) => {
                self.note_error(&err.to_string());
                return;
            }
        };

        let now = self.zone.now();
        let local = local_from_epoch(self.zone.as_ref(), now);
        let quiet = settings.reminders.is_quiet(local.minute_of_day());
        let mut file = ReminderFile::load(&self.path);
        let plan = plan_tick(PlanInput {
            now,
            launch_at,
            quiet,
            rows: &rows,
            notified: &file.notified,
            pending: &file.digest,
            today: local.date,
            zone: self.zone.as_ref(),
        });

        file.notified = plan.notified.clone();
        file.digest = plan.pending.clone();
        if let Err(err) = file.save(&self.path) {
            log::warn!("cannot save reminder watermark: {err}");
        }

        self.clear_error();
        self.publish_counts(plan.today_count, plan.open_count);

        for fire in &plan.toasts {
            self.deliver(fire, &settings.reminders);
        }
        if let Some(items) = plan.digest {
            let event = missed_event(&items);
            if event.count > 0 {
                self.remember_missed(event.clone());
                let _ = self.app.emit(EVENT_MISSED, event);
            }
        }
    }

    fn deliver(&self, fire: &Fire, settings: &ReminderSettings) {
        let (title, body) = if settings.hide_titles {
            ("LV24 Brain".to_string(), Some("Idea reminder".to_string()))
        } else {
            (
                fire.title.clone(),
                Some(if fire.trigger == TRIGGER_LEAD {
                    "Upcoming".to_string()
                } else {
                    "Due now".to_string()
                }),
            )
        };
        let toast = Toast {
            id: toast_id(&fire.key),
            title,
            body,
            sound: settings.notify_sound,
            idea_id: Some(fire.idea_id.clone()),
            trigger: fire.trigger.clone(),
            kind: "reminder",
        };
        match deliver(self.notifier.as_ref(), &toast) {
            Delivery::Native => {}
            Delivery::InApp(reason) => {
                self.mark_permission_denied(&reason);
                let _ = self.app.emit(
                    EVENT_IN_APP,
                    InAppReminder {
                        idea_id: Some(fire.idea_id.clone()),
                        title: if settings.hide_titles {
                            None
                        } else {
                            Some(fire.title.clone())
                        },
                        trigger: fire.trigger.clone(),
                    },
                );
            }
        }
    }

    fn status(&self) -> RemindersStatus {
        let snapshot = self.snapshot.lock().unwrap();
        let permission = if snapshot.permission == PermissionState::Denied {
            PermissionState::Denied
        } else {
            self.notifier.permission()
        };
        RemindersStatus {
            settings: self.settings.get().reminders,
            permission: permission.to_string(),
            today_count: snapshot.today_count,
            open_count: snapshot.open_count,
            missed: snapshot.missed.clone(),
        }
    }

    /// Validates and persists new reminder settings, then wakes the scheduler
    /// so enabling reminders does not wait for the next 30 s tick.
    pub fn apply_settings(&self, next: ReminderSettings) -> AppResult<RemindersStatus> {
        self.settings.set_reminders(next)?;
        self.wake.notify_one();
        Ok(self.status())
    }

    pub fn dismiss_digest(&self) {
        self.snapshot.lock().unwrap().missed = None;
    }

    pub fn today_count(&self) -> u32 {
        self.snapshot.lock().unwrap().today_count
    }

    pub fn test_notification(&self) -> TestNotificationResult {
        let settings = self.settings.get().reminders;
        let toast = Toast {
            id: 1,
            title: "LV24 Brain".to_string(),
            body: Some("Reminders are working.".to_string()),
            sound: settings.notify_sound,
            idea_id: None,
            trigger: "test".to_string(),
            kind: "test",
        };
        match deliver(self.notifier.as_ref(), &toast) {
            Delivery::Native => TestNotificationResult {
                delivered: true,
                permission: self.notifier.permission().to_string(),
                error: None,
            },
            Delivery::InApp(reason) => {
                self.mark_permission_denied(&reason);
                TestNotificationResult {
                    delivered: false,
                    permission: PermissionState::Denied.to_string(),
                    error: Some(reason),
                }
            }
        }
    }

    fn publish_counts(&self, today_count: u32, open_count: u32) {
        let changed = {
            let mut snapshot = self.snapshot.lock().unwrap();
            let changed = snapshot.today_count != today_count || snapshot.open_count != open_count;
            snapshot.today_count = today_count;
            snapshot.open_count = open_count;
            changed
        };
        if changed {
            crate::tray::refresh_reminders(&self.app, today_count);
        }
    }

    fn remember_missed(&self, event: MissedEvent) {
        self.snapshot.lock().unwrap().missed = Some(event);
    }

    fn mark_permission_denied(&self, reason: &str) {
        let mut snapshot = self.snapshot.lock().unwrap();
        if snapshot.permission != PermissionState::Denied {
            snapshot.permission = PermissionState::Denied;
            log::warn!("desktop notifications are unavailable: {reason}");
        }
    }

    fn note_error(&self, message: &str) {
        let mut snapshot = self.snapshot.lock().unwrap();
        if snapshot.last_error.as_deref() != Some(message) {
            // A stopped agent is normal during startup and pause; keep it at
            // debug level and remember the last message to avoid log spam.
            log::debug!("reminder tick skipped: {message}");
            snapshot.last_error = Some(message.to_string());
        }
    }

    fn clear_error(&self) {
        self.snapshot.lock().unwrap().last_error = None;
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn reminders_settings_get(engine: State<'_, Arc<ReminderEngine>>) -> RemindersStatus {
    engine.status()
}

#[tauri::command]
pub fn reminders_settings_set(
    engine: State<'_, Arc<ReminderEngine>>,
    settings: ReminderSettings,
) -> Result<RemindersStatus, String> {
    engine
        .apply_settings(settings)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn reminders_dismiss_digest(engine: State<'_, Arc<ReminderEngine>>) {
    engine.dismiss_digest();
}

#[tauri::command]
pub fn ideas_test_notification(engine: State<'_, Arc<ReminderEngine>>) -> TestNotificationResult {
    engine.test_notification()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::ReminderSettings;

    /// Central European time with the 2026 DST window (Mar 29 - Oct 25).
    struct DstZone {
        now: i64,
    }

    impl Zone for DstZone {
        fn now(&self) -> i64 {
            self.now
        }

        fn offset_at(&self, epoch: i64) -> i32 {
            let start = days_from_civil(2026, 3, 29) * SECONDS_PER_DAY + 3600;
            let end = days_from_civil(2026, 10, 25) * SECONDS_PER_DAY + 3600;
            if epoch >= start && epoch < end {
                7200
            } else {
                3600
            }
        }
    }

    struct FixedZone {
        offset: i32,
    }

    impl Zone for FixedZone {
        fn now(&self) -> i64 {
            0
        }

        fn offset_at(&self, _epoch: i64) -> i32 {
            self.offset
        }
    }

    fn epoch(year: i64, month: u32, day: u32, hour: i64, minute: i64) -> i64 {
        days_from_civil(year, month, day) * SECONDS_PER_DAY + hour * 3600 + minute * 60
    }

    fn row(id: &str, due_at: Option<&str>, due_date: Option<&str>) -> IdeaReminder {
        IdeaReminder {
            idea_id: id.to_string(),
            title: format!("Idea {id}"),
            status: "open".to_string(),
            due_at: due_at.map(str::to_string),
            due_date: due_date.map(str::to_string),
            remind_before_minutes: None,
        }
    }

    fn plan_at(now: i64, launch_at: i64, rows: &[IdeaReminder], zone: &dyn Zone) -> Plan {
        let local = local_from_epoch(zone, now);
        plan_tick(PlanInput {
            now,
            launch_at,
            quiet: false,
            rows,
            notified: &BTreeMap::new(),
            pending: &[],
            today: local.date,
            zone,
        })
    }

    #[test]
    fn civil_conversions_round_trip() {
        for date in [
            CivilDate {
                year: 1970,
                month: 1,
                day: 1,
            },
            CivilDate {
                year: 2026,
                month: 11,
                day: 27,
            },
            CivilDate {
                year: 2024,
                month: 2,
                day: 29,
            },
            CivilDate {
                year: 1999,
                month: 12,
                day: 31,
            },
        ] {
            assert_eq!(
                civil_from_days(days_from_civil(date.year, date.month, date.day)),
                date
            );
        }
    }

    #[test]
    fn rfc3339_parses_offsets_fractions_and_rejects_garbage() {
        let utc = epoch(2026, 11, 27, 15, 0);
        assert_eq!(parse_rfc3339("2026-11-27T15:00:00Z"), Some(utc));
        assert_eq!(parse_rfc3339("2026-11-27T18:00:00+03:00"), Some(utc));
        assert_eq!(parse_rfc3339("2026-11-27T10:00:00-05:00"), Some(utc));
        assert_eq!(parse_rfc3339("2026-11-27T15:00:00.123456Z"), Some(utc));
        assert_eq!(parse_rfc3339("2026-02-30T10:00:00Z"), None);
        assert_eq!(parse_rfc3339("2026-11-27 15:00:00Z"), Some(utc));
        assert_eq!(parse_rfc3339("not a date"), None);
        assert_eq!(parse_rfc3339("2026-11-27T15:00:00"), None);
    }

    #[test]
    fn parse_date_accepts_contract_dates_only() {
        assert_eq!(
            parse_date("2026-11-27"),
            Some(CivilDate {
                year: 2026,
                month: 11,
                day: 27,
            })
        );
        assert!(parse_date("2024-02-29").is_some());
        assert_eq!(parse_date("2026-02-29"), None);
        assert_eq!(parse_date("27.11.2026"), None);
        assert_eq!(parse_date("2026-13-01"), None);
    }

    #[test]
    fn timed_due_and_lead_fire_at_the_expected_instants() {
        let zone = FixedZone { offset: 3600 };
        let due = epoch(2026, 11, 27, 18, 0) - 3600; // 18:00 +01:00
        let mut idea = row("idea-a", Some("2026-11-27T18:00:00+01:00"), None);
        idea.remind_before_minutes = Some(120);
        let triggers = idea.triggers(&zone);
        assert_eq!(triggers.len(), 2);
        assert_eq!(triggers[0].kind, TriggerKind::Due);
        assert_eq!(triggers[0].fire_at, due);
        assert_eq!(triggers[0].due_key, "2026-11-27T18:00:00+01:00");
        assert_eq!(triggers[1].kind, TriggerKind::Lead);
        assert_eq!(triggers[1].fire_at, due - 7200);
    }

    #[test]
    fn all_day_due_is_0900_local_across_dst() {
        let spring = DstZone { now: 0 };
        let winter = DstZone { now: 0 };
        // 2026-11-27 is winter time in this fake zone (+01:00): 09:00 -> 08:00Z.
        let winter_due = epoch_from_local(
            &winter,
            CivilDate {
                year: 2026,
                month: 11,
                day: 27,
            },
            9,
            0,
        );
        assert_eq!(winter_due, epoch(2026, 11, 27, 8, 0));
        // 2026-07-01 is summer time (+02:00): 09:00 -> 07:00Z.
        let summer_due = epoch_from_local(
            &winter,
            CivilDate {
                year: 2026,
                month: 7,
                day: 1,
            },
            9,
            0,
        );
        assert_eq!(summer_due, epoch(2026, 7, 1, 7, 0));
        // The transition day itself still lands on 09:00 local.
        let transition = epoch_from_local(
            &spring,
            CivilDate {
                year: 2026,
                month: 3,
                day: 29,
            },
            9,
            0,
        );
        assert_eq!(local_from_epoch(&spring, transition).hour, 9);
        assert_eq!(local_from_epoch(&spring, transition).offset, 7200);

        let idea = row("idea-b", None, Some("2026-11-27"));
        let triggers = idea.triggers(&winter);
        assert_eq!(triggers[0].fire_at, winter_due);
    }

    #[test]
    fn quiet_hours_queue_a_digest_instead_of_a_toast() {
        let zone = FixedZone { offset: 0 };
        let now = epoch(2026, 11, 27, 23, 0);
        let rows = vec![row("idea-c", Some("2026-11-27T23:00:00Z"), None)];
        let local = local_from_epoch(&zone, now);
        let plan = plan_tick(PlanInput {
            now,
            launch_at: now - 3600,
            quiet: true,
            rows: &rows,
            notified: &BTreeMap::new(),
            pending: &[],
            today: local.date,
            zone: &zone,
        });
        assert!(plan.toasts.is_empty());
        assert_eq!(plan.pending.len(), 1);
        assert!(plan.digest.is_none());

        let local = local_from_epoch(&zone, now);
        let open = plan_tick(PlanInput {
            now: now + 60,
            launch_at: now - 3600,
            quiet: false,
            rows: &rows,
            notified: &plan.notified,
            pending: &plan.pending,
            today: local.date,
            zone: &zone,
        });
        assert!(open.toasts.is_empty());
        assert_eq!(open.digest.expect("digest").len(), 1);
        assert!(open.pending.is_empty());
    }

    #[test]
    fn missed_triggers_become_one_digest_counted_per_idea() {
        let zone = FixedZone { offset: 0 };
        let now = epoch(2026, 11, 27, 12, 0);
        let mut idea = row("idea-d", Some("2026-11-27T09:00:00Z"), None);
        idea.remind_before_minutes = Some(60);
        let rows = vec![
            idea,
            row("idea-e", Some("2026-11-27T10:00:00Z"), None),
            row("idea-f", Some("2026-11-27T13:00:00Z"), None),
        ];
        // App launched at noon: both triggers of idea-d and the due of idea-e
        // were missed while it was closed; idea-f is still in the future.
        let plan = plan_at(now, now, &rows, &zone);
        assert!(plan.toasts.is_empty());
        let digest = plan.digest.expect("digest");
        assert_eq!(digest.len(), 3);
        let event = missed_event(&digest);
        assert_eq!(event.count, 2);
        assert_eq!(event.items.len(), 2);
        assert_eq!(event.items[0].id, "idea-d");
        assert_eq!(event.items[1].id, "idea-e");
    }

    #[test]
    fn a_live_trigger_toasts_once_and_is_deduped() {
        let zone = FixedZone { offset: 0 };
        let now = epoch(2026, 11, 27, 12, 0);
        let rows = vec![row("idea-g", Some("2026-11-27T12:00:00Z"), None)];
        let plan = plan_at(now, now - 60, &rows, &zone);
        assert_eq!(plan.toasts.len(), 1);
        assert_eq!(plan.toasts[0].idea_id, "idea-g");
        assert!(plan.toasts[0]
            .key
            .starts_with("idea-g|2026-11-27T12:00:00Z|due"));

        let again = plan_tick(PlanInput {
            now: now + 30,
            launch_at: now - 60,
            quiet: false,
            rows: &rows,
            notified: &plan.notified,
            pending: &plan.pending,
            today: local_from_epoch(&zone, now).date,
            zone: &zone,
        });
        assert!(again.toasts.is_empty());
        assert!(again.digest.is_none());
    }

    #[test]
    fn changing_the_due_resets_the_key_and_done_cancels_it() {
        let zone = FixedZone { offset: 0 };
        let now = epoch(2026, 11, 27, 12, 0);
        let first = plan_at(
            now,
            now - 60,
            &[row("idea-h", Some("2026-11-27T12:00:00Z"), None)],
            &zone,
        );
        assert_eq!(first.toasts.len(), 1);

        let moved = plan_tick(PlanInput {
            now: now + 30,
            launch_at: now - 60,
            quiet: false,
            rows: &[row("idea-h", Some("2026-11-27T12:30:00Z"), None)],
            notified: &first.notified,
            pending: &[],
            today: local_from_epoch(&zone, now).date,
            zone: &zone,
        });
        // The new due is in the future, but the old watermark is gone.
        assert!(moved.toasts.is_empty());
        assert!(!moved.notified.keys().any(|key| key.contains("12:00:00")));

        let done = {
            let mut idea = row("idea-h", Some("2026-11-27T12:00:00Z"), None);
            idea.status = "done".to_string();
            idea
        };
        let closed = plan_tick(PlanInput {
            now: now + 3600,
            launch_at: now - 60,
            quiet: false,
            rows: &[done],
            notified: &first.notified,
            pending: &[],
            today: local_from_epoch(&zone, now).date,
            zone: &zone,
        });
        assert!(closed.notified.is_empty());
        assert!(closed.toasts.is_empty());
    }

    #[test]
    fn a_trigger_that_is_late_while_running_joins_the_digest() {
        let zone = FixedZone { offset: 0 };
        let now = epoch(2026, 11, 27, 12, 0);
        let rows = vec![row("idea-i", Some("2026-11-27T11:00:00Z"), None)];
        // Launch was long ago, but the tick only arrives an hour after the fire.
        let plan = plan_at(now, now - 7200, &rows, &zone);
        assert!(plan.toasts.is_empty());
        assert_eq!(plan.digest.expect("digest").len(), 1);
    }

    #[test]
    fn today_count_uses_the_local_calendar_day() {
        let zone = FixedZone { offset: 3 * 3600 };
        // 22:30Z is already 01:30 next day at +03:00.
        let now = epoch(2026, 11, 27, 22, 30);
        let rows = vec![
            row("idea-j", Some("2026-11-28T01:00:00+03:00"), None),
            row("idea-k", None, Some("2026-11-28")),
            row("idea-l", None, Some("2026-11-27")),
            row("idea-m", None, Some("2026-11-28")),
        ];
        let plan = plan_at(now, now, &rows, &zone);
        assert_eq!(plan.today_count, 3);
    }

    #[test]
    fn parse_ideas_reads_open_rows_and_skips_the_rest() {
        let body = serde_json::json!({
            "ideas": [
                {"id": "idea-a", "title": "A", "status": "open", "due_at": "2026-11-27T18:00:00+03:00"},
                {"id": "idea-b", "title": "B", "status": "doing", "due_date": "2026-11-27", "remind_before_minutes": 0},
                {"id": "", "title": "broken"},
                {"id": "idea-c", "title": "C", "status": "done"}
            ],
            "problems": []
        });
        let ideas = parse_ideas(&body).unwrap();
        assert_eq!(ideas.len(), 3);
        assert!(ideas.iter().any(|idea| idea.idea_id == "idea-b"));
        let b = ideas.iter().find(|idea| idea.idea_id == "idea-b").unwrap();
        assert_eq!(b.remind_before_minutes, None);
        assert!(parse_ideas(&serde_json::json!({})).is_err());
    }

    #[test]
    fn watermark_round_trips_and_corrupt_files_start_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent/ideas-reminders.json");
        let mut file = ReminderFile::default();
        file.notified
            .insert("idea-a|2026-11-27|due".to_string(), 123);
        file.digest.push(PendingReminder {
            idea_id: "idea-a".to_string(),
            title: "A".to_string(),
            due_key: "2026-11-27".to_string(),
            trigger: "due".to_string(),
            fire_at: 123,
        });
        file.save(&path).unwrap();
        let loaded = ReminderFile::load(&path);
        assert_eq!(loaded.version, 1);
        assert_eq!(loaded.notified.get("idea-a|2026-11-27|due"), Some(&123));
        assert_eq!(loaded.digest.len(), 1);

        fs::write(&path, "{broken").unwrap();
        assert_eq!(ReminderFile::load(&path), ReminderFile::default());
    }

    struct FakeNotifier {
        permission: PermissionState,
        result: Result<(), String>,
    }

    impl Notifier for FakeNotifier {
        fn permission(&self) -> PermissionState {
            self.permission
        }

        fn notify(&self, _toast: &Toast) -> Result<(), String> {
            self.result.clone()
        }
    }

    fn toast() -> Toast {
        Toast {
            id: 1,
            title: "Idea".to_string(),
            body: None,
            sound: true,
            idea_id: Some("idea-a".to_string()),
            trigger: "due".to_string(),
            kind: "reminder",
        }
    }

    #[test]
    fn permission_denied_falls_back_to_the_in_app_banner() {
        let denied = FakeNotifier {
            permission: PermissionState::Denied,
            result: Ok(()),
        };
        assert_eq!(
            deliver(&denied, &toast()),
            Delivery::InApp("notifications are blocked".to_string())
        );

        let failed = FakeNotifier {
            permission: PermissionState::Granted,
            result: Err("toast failed".to_string()),
        };
        assert_eq!(
            deliver(&failed, &toast()),
            Delivery::InApp("toast failed".to_string())
        );

        let granted = FakeNotifier {
            permission: PermissionState::Granted,
            result: Ok(()),
        };
        assert_eq!(deliver(&granted, &toast()), Delivery::Native);
    }

    #[test]
    fn toast_ids_are_stable_and_positive() {
        let first = toast_id("idea-a|2026-11-27T18:00:00+03:00|due");
        assert_eq!(first, toast_id("idea-a|2026-11-27T18:00:00+03:00|due"));
        assert!(first >= 0);
        assert_ne!(first, toast_id("idea-a|2026-11-27T18:00:00+03:00|lead"));
    }

    #[test]
    fn only_record_safe_idea_ids_are_used_in_navigation() {
        assert!(safe_idea_id("idea-01J8ZQ4T7X9Y2M3N4P5Q6R7S8T"));
        assert!(!safe_idea_id("idea-a'; alert(1); //"));
        assert!(!safe_idea_id(""));
        assert!(!safe_idea_id("idea with space"));
    }

    #[test]
    fn reminder_settings_defaults_match_the_spec() {
        let settings = ReminderSettings::default();
        assert!(settings.enabled);
        assert_eq!(settings.default_lead_minutes, 10);
        assert_eq!(settings.quiet_hours_start, "22:00");
        assert_eq!(settings.quiet_hours_end, "08:00");
        assert!(!settings.hide_titles);
        assert!(settings.notify_sound);
    }

    #[test]
    fn reminder_settings_json_matches_the_webview_contract() {
        let value = serde_json::to_value(ReminderSettings::default()).unwrap();
        assert_eq!(value["remindersEnabled"], true);
        assert_eq!(value["defaultLeadMinutes"], 10);
        assert_eq!(value["quietHoursStart"], "22:00");
        assert_eq!(value["quietHoursEnd"], "08:00");
        assert_eq!(value["hideTitles"], false);
        assert_eq!(value["notifySound"], true);
    }
}
