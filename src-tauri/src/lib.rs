mod api;
mod autostart;
mod commands;
mod deep_link;
mod engine;
mod error;
mod lifecycle;
mod settings;
mod tray;

use std::sync::Arc;

use tauri::{Manager, RunEvent, WindowEvent};

use engine::Supervisor;

pub fn run() {
    #[allow(unused_mut)]
    let mut autostart = tauri_plugin_autostart::Builder::new().args(["--autostart"]);
    #[cfg(target_os = "macos")]
    {
        autostart = autostart.macos_launcher(tauri_plugin_autostart::MacosLauncher::LaunchAgent);
    }

    let builder = tauri::Builder::default()
        // The single-instance plugin must be registered first. Its deep-link
        // feature forwards a second-instance URL to the deep-link plugin.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            tray::show_main_window(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(autostart.build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::shell_status,
            commands::engine_start,
            commands::engine_pause,
            commands::engine_sync_all,
            commands::engine_providers,
            commands::engine_secrets,
            commands::engine_connection_auth,
            commands::autostart_set,
            commands::update_check,
            commands::update_install,
            commands::app_quit,
            api::api_request,
            api::run_log_open,
            api::run_log_close,
            deep_link::deep_link_take,
        ])
        .setup(|app| {
            let paths = engine::paths::AppPaths::resolve(app.handle())?;
            app.manage(lifecycle::SessionTracker::start(
                &paths.config_dir,
                &paths.log_dir,
            ));
            let settings = settings::SettingsStore::load(paths.config_dir.join("settings.json"))?;
            let supervisor = Arc::new(Supervisor::new(app.handle().clone(), paths, settings)?);
            app.manage(supervisor.clone());
            app.manage(api::RunLogState::default());
            app.manage(deep_link::DeepLinkState::default());

            tray::create(app.handle(), supervisor.clone())?;
            if let Err(err) = deep_link::register(app.handle()) {
                log::warn!("deep-link setup failed: {err}");
            }

            // Autostart launches stay in the tray; a normal launch opens the
            // window so the user sees the shell.
            let autostart_launch = std::env::args().any(|arg| arg == "--autostart");
            if !autostart_launch {
                tray::show_main_window(app.handle());
            }

            let reconciler = supervisor.clone();
            tauri::async_runtime::spawn(async move {
                reconciler.run().await;
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                lifecycle::record(app, lifecycle::Event::CloseRequested, None);
                let supervisor = commands::supervisor(app);
                if !supervisor.is_quitting() {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        });

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building LV24 Brain desktop");
    app.run(|app_handle, event| match event {
        RunEvent::ExitRequested { api, code, .. } => {
            lifecycle::record(app_handle, lifecycle::Event::ExitRequested, code);
            // An explicit app.exit(code) (for example from the updater) is
            // allowed through. An OS-initiated quit is routed through the
            // graceful agent shutdown first.
            let supervisor = commands::supervisor(app_handle);
            if code.is_none() && !supervisor.is_quitting() {
                api.prevent_exit();
                commands::request_quit(app_handle.clone());
            }
        }
        RunEvent::Exit => lifecycle::record(app_handle, lifecycle::Event::Exit, None),
        #[cfg(target_os = "macos")]
        RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } => {
            tray::show_main_window(app_handle);
        }
        _ => {}
    });
}
