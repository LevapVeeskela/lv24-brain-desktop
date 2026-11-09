#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Message(String),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("HTTP client error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("local API error: {0}")]
    Api(String),
    #[error("Tauri error: {0}")]
    Tauri(#[from] tauri::Error),
}

pub type AppResult<T> = Result<T, AppError>;
