use crate::error::{AppError, AppResult};

const MAX_PATH_LEN: usize = 2048;
const MAX_QUERY_LEN: usize = 1024;

/// Only the local control API is reachable from the webview proxy. Absolute
/// URLs, traversal, alternate schemes and path-cleaning tricks are rejected
/// before a request leaves the process.
pub fn validate_path(raw: &str) -> AppResult<String> {
    let path = raw.trim();
    if path.len() > MAX_PATH_LEN {
        return Err(AppError::Message("local API path is too long".to_string()));
    }
    if !path.starts_with("/v1/") {
        return Err(AppError::Message(
            "local API path must start with /v1/".to_string(),
        ));
    }
    if !path.is_ascii() {
        return Err(AppError::Message(
            "local API path must be ASCII".to_string(),
        ));
    }
    if path.bytes().any(|byte| byte < 0x20 || byte == 0x7f) {
        return Err(AppError::Message(
            "local API path contains control characters".to_string(),
        ));
    }
    let lower = path.to_ascii_lowercase();
    for forbidden in ["..", "\\", "//", "%2e", "%2f", "%5c", "#"] {
        if lower.contains(forbidden) {
            return Err(AppError::Message(format!(
                "local API path contains forbidden sequence {forbidden:?}"
            )));
        }
    }

    let (route, query) = path.split_once('?').unwrap_or((path, ""));
    if query.len() > MAX_QUERY_LEN {
        return Err(AppError::Message("local API query is too long".to_string()));
    }
    let segments: Vec<&str> = route.split('/').collect();
    if segments.len() < 3 || segments[1] != "v1" {
        return Err(AppError::Message(
            "local API route must be /v1/<resource>".to_string(),
        ));
    }
    for segment in &segments[2..] {
        let segment = *segment;
        if segment.is_empty() || segment == "." || segment == ".." {
            return Err(AppError::Message(
                "local API path has an empty or relative segment".to_string(),
            ));
        }
        if !segment.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~' | b'%')
        }) {
            return Err(AppError::Message(
                "local API path segment contains unsupported characters".to_string(),
            ));
        }
    }
    Ok(path.to_string())
}

pub fn validate_method(raw: &str) -> AppResult<&'static str> {
    match raw.trim().to_ascii_uppercase().as_str() {
        "GET" => Ok("GET"),
        "POST" => Ok("POST"),
        "PUT" => Ok("PUT"),
        "PATCH" => Ok("PATCH"),
        "DELETE" => Ok("DELETE"),
        _ => Err(AppError::Message(format!(
            "HTTP method {raw:?} is not allowed by the desktop proxy"
        ))),
    }
}

pub fn validate_id(raw: &str) -> AppResult<&str> {
    let value = raw.trim();
    if value.is_empty() || value.len() > 128 {
        return Err(AppError::Message("invalid identifier".to_string()));
    }
    if !value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err(AppError::Message(
            "identifier contains unsupported characters".to_string(),
        ));
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_control_api_paths() {
        for path in [
            "/v1/health",
            "/v1/connections",
            "/v1/connections/github-main/run",
            "/v1/runs?limit=50",
            "/v1/connections/gitlab%20one",
        ] {
            assert!(validate_path(path).is_ok(), "{path}");
        }
    }

    #[test]
    fn rejects_host_switching_and_traversal() {
        for path in [
            "",
            "/v2/health",
            "/v1/../secrets",
            "/v1/%2e%2e/secrets",
            "/v1//connections",
            "/v1/connections\\..\\secrets",
            "/v1/http://evil.example",
            "/v1/health#fragment",
            "/v1/health\nX-Injected: 1",
            "http://127.0.0.1:1/v1/health",
        ] {
            assert!(validate_path(path).is_err(), "{path}");
        }
    }

    #[test]
    fn validates_methods_and_ids() {
        assert_eq!(validate_method("post").unwrap(), "POST");
        assert!(validate_method("OPTIONS").is_err());
        assert!(validate_id("run-01").is_ok());
        assert!(validate_id("../run").is_err());
        assert!(validate_id("run/1").is_err());
    }
}
