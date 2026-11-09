use std::sync::Arc;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime};

use crate::engine::{EnginePhase, EngineStatus, Supervisor};

const TRAY_ID: &str = "main";

pub fn create(app: &AppHandle, supervisor: Arc<Supervisor>) -> tauri::Result<()> {
    let status = supervisor.status();
    let menu = build_menu(app, &status)?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(tray_icon(&status))
        .tooltip(tooltip(&status))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main_window(app),
            "quit" => crate::commands::request_quit(app.clone()),
            "sync" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let supervisor = crate::commands::supervisor(&app);
                    if let Err(err) = supervisor.sync_all().await {
                        crate::commands::report_error(&app, err.to_string());
                    }
                });
            }
            "pause" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let supervisor = crate::commands::supervisor(&app);
                    if let Err(err) = supervisor.pause().await {
                        crate::commands::report_error(&app, err.to_string());
                    }
                });
            }
            "resume" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let supervisor = crate::commands::supervisor(&app);
                    if let Err(err) = supervisor.resume().await {
                        crate::commands::report_error(&app, err.to_string());
                    }
                });
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

/// Rebuilds the menu and swaps the status icon. Called by the supervisor when
/// the engine state actually changes.
pub fn refresh(app: &AppHandle, status: &EngineStatus) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    match build_menu(app, status) {
        Ok(menu) => {
            if let Err(err) = tray.set_menu(Some(menu)) {
                log::warn!("cannot update tray menu: {err}");
            }
        }
        Err(err) => log::warn!("cannot build tray menu: {err}"),
    }
    if let Err(err) = tray.set_icon(Some(tray_icon(status))) {
        log::warn!("cannot update tray icon: {err}");
    }
    if let Err(err) = tray.set_tooltip(Some(tooltip(status))) {
        log::warn!("cannot update tray tooltip: {err}");
    }
}

pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn build_menu(app: &AppHandle, status: &EngineStatus) -> tauri::Result<Menu<tauri::Wry>> {
    let status_item = MenuItem::with_id(app, "status", status_line(status), false, None::<&str>)?;
    let sync = MenuItem::with_id(app, "sync", "Sync all", true, None::<&str>)?;
    let pause_id = if status.phase == EnginePhase::Paused {
        "resume"
    } else {
        "pause"
    };
    let pause_label = if status.phase == EnginePhase::Paused {
        "Resume sync"
    } else {
        "Pause sync"
    };
    let pause = MenuItem::with_id(app, pause_id, pause_label, true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let open = MenuItem::with_id(app, "open", "Open LV24 Brain", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    Menu::with_items(
        app,
        &[&status_item, &sync, &pause, &separator, &open, &quit],
    )
}

fn status_line(status: &EngineStatus) -> String {
    match status.phase {
        EnginePhase::Running => match status.pid {
            Some(pid) => format!("Agent: running (pid {pid})"),
            None => "Agent: running".to_string(),
        },
        EnginePhase::Starting => "Agent: starting…".to_string(),
        EnginePhase::Paused => "Agent: paused".to_string(),
        EnginePhase::Error => "Agent: needs attention".to_string(),
        EnginePhase::Stopped => "Agent: stopped".to_string(),
    }
}

fn tooltip(status: &EngineStatus) -> String {
    match status.phase {
        EnginePhase::Running => {
            let version = status.version.as_deref().unwrap_or("unknown");
            format!("LV24 Brain — running · engine {version}")
        }
        EnginePhase::Starting => "LV24 Brain — starting agent…".to_string(),
        EnginePhase::Paused => "LV24 Brain — sync paused".to_string(),
        EnginePhase::Error => "LV24 Brain — agent needs attention".to_string(),
        EnginePhase::Stopped => "LV24 Brain — agent stopped".to_string(),
    }
}

fn tray_icon(status: &EngineStatus) -> tauri::image::Image<'static> {
    let bytes: &'static [u8] = match status.phase {
        EnginePhase::Running => include_bytes!("../icons/tray-running.png"),
        EnginePhase::Starting => include_bytes!("../icons/tray-starting.png"),
        EnginePhase::Paused => include_bytes!("../icons/tray-paused.png"),
        EnginePhase::Error => include_bytes!("../icons/tray-error.png"),
        EnginePhase::Stopped => include_bytes!("../icons/tray-stopped.png"),
    };
    tauri::image::Image::from_bytes(bytes)
        .unwrap_or_else(|_| tauri::image::Image::new_owned(vec![0_u8; 32 * 32 * 4], 32, 32))
}
