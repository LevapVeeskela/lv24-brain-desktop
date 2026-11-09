use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_deep_link::DeepLinkExt;

use crate::error::AppResult;

pub const SCHEME: &str = "lv24brain";

#[derive(Default)]
pub struct DeepLinkState {
    pending: Mutex<Vec<String>>,
}

pub fn register(app: &AppHandle) -> AppResult<()> {
    // The installer registers the scheme on packaged builds. Runtime
    // registration makes development on Windows and AppImage builds usable.
    #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
    {
        if let Err(err) = app.deep_link().register_all() {
            log::warn!("cannot register {SCHEME} scheme at runtime: {err}");
        }
    }

    if let Ok(Some(urls)) = app.deep_link().get_current() {
        remember(
            app,
            urls.iter()
                .filter_map(|url| validate(url.as_str()))
                .collect(),
        );
    }

    let handle = app.clone();
    app.deep_link().on_open_url(move |event| {
        let urls = event
            .urls()
            .iter()
            .filter_map(|url| validate(url.as_str()))
            .collect();
        remember(&handle, urls);
    });
    Ok(())
}

fn remember(app: &AppHandle, urls: Vec<String>) {
    if urls.is_empty() {
        return;
    }
    app.state::<DeepLinkState>()
        .pending
        .lock()
        .unwrap()
        .extend(urls.clone());
    let _ = app.emit("oauth-callback", &urls);
    crate::tray::show_main_window(app);
}

#[tauri::command]
pub fn deep_link_take(state: State<'_, DeepLinkState>) -> Option<String> {
    let mut pending = state.pending.lock().unwrap();
    if pending.is_empty() {
        None
    } else {
        Some(pending.remove(0))
    }
}

/// Only our own OAuth callbacks cross the IPC boundary. Rejecting other hosts
/// matters because an attacker can launch the executable with an arbitrary
/// argument and ask the single-instance callback to show the window.
fn validate(raw: &str) -> Option<String> {
    if raw.len() > 4096 {
        return None;
    }
    let url = url::Url::parse(raw).ok()?;
    if url.scheme() != SCHEME {
        return None;
    }
    match url.host_str() {
        Some("oauth") | Some("auth") => Some(url.to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_brain_oauth_callbacks() {
        assert!(validate("lv24brain://oauth/callback?code=abc").is_some());
        assert!(validate("lv24brain://auth/gitlab?state=1").is_some());
        assert!(validate("lv24brain://evil/callback").is_none());
        assert!(validate("https://oauth/callback").is_none());
        assert!(validate("not a url").is_none());
    }
}
