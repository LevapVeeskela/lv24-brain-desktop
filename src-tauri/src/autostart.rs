use serde::Serialize;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutostartStatus {
    pub enabled: bool,
    pub supported: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

pub fn status(app: &AppHandle) -> AutostartStatus {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        return macos::status();
    }
    #[cfg(not(target_os = "macos"))]
    {
        use tauri_plugin_autostart::ManagerExt;
        match app.autolaunch().is_enabled() {
            Ok(enabled) => AutostartStatus {
                enabled,
                supported: true,
                detail: None,
            },
            Err(err) => AutostartStatus {
                enabled: false,
                supported: true,
                detail: Some(format!("cannot read autostart state: {err}")),
            },
        }
    }
}

pub fn set(app: &AppHandle, enabled: bool) -> AppResult<AutostartStatus> {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        return macos::set(enabled);
    }
    #[cfg(not(target_os = "macos"))]
    {
        use tauri_plugin_autostart::ManagerExt;
        let manager = app.autolaunch();
        if enabled {
            manager
                .enable()
                .map_err(|err| AppError::Message(format!("cannot enable autostart: {err}")))?;
        } else {
            manager
                .disable()
                .map_err(|err| AppError::Message(format!("cannot disable autostart: {err}")))?;
        }
        Ok(status(app))
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use smappservice_rs::{AppService, ServiceManagementError, ServiceStatus, ServiceType};

    use super::*;

    fn service() -> AppService {
        AppService::new(ServiceType::MainApp)
    }

    pub fn status() -> AutostartStatus {
        let status = service().status();
        match status {
            ServiceStatus::Enabled => AutostartStatus {
                enabled: true,
                supported: true,
                detail: None,
            },
            ServiceStatus::RequiresApproval => AutostartStatus {
                enabled: false,
                supported: true,
                detail: Some(
                    "Approve LV24 Brain in System Settings → General → Login Items.".to_string(),
                ),
            },
            ServiceStatus::NotRegistered | ServiceStatus::NotFound => AutostartStatus {
                enabled: false,
                supported: true,
                detail: None,
            },
        }
    }

    pub fn set(enabled: bool) -> AppResult<AutostartStatus> {
        let service = service();
        if enabled {
            if service.status() != ServiceStatus::Enabled {
                service.register().map_err(|err| {
                    AppError::Message(format!("cannot register login item: {err}"))
                })?;
            }
            return Ok(status());
        }
        if matches!(
            service.status(),
            ServiceStatus::NotRegistered | ServiceStatus::NotFound
        ) {
            return Ok(status());
        }
        match service.unregister() {
            Ok(()) | Err(ServiceManagementError::JobNotFound) => Ok(status()),
            Err(err) => Err(AppError::Message(format!(
                "cannot unregister login item: {err}"
            ))),
        }
    }
}
