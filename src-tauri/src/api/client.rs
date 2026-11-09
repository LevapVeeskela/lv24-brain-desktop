use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::engine::runtime::RuntimeRecord;
use crate::error::{AppError, AppResult};

const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;

/// Shared HTTP clients. Loopback requests must never use a system proxy, and
/// redirects are disabled so a compromised local service cannot bounce the
/// bearer token to another host.
#[derive(Clone)]
pub struct HttpClients {
    pub normal: reqwest::Client,
    pub stream: reqwest::Client,
}

impl HttpClients {
    pub fn build() -> AppResult<Self> {
        let user_agent = format!("lv24-brain-desktop/{}", env!("CARGO_PKG_VERSION"));
        let normal = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(30))
            .user_agent(&user_agent)
            .build()
            .map_err(|err| AppError::Message(format!("cannot build HTTP client: {err}")))?;
        let stream = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(3))
            .user_agent(&user_agent)
            .build()
            .map_err(|err| {
                AppError::Message(format!("cannot build streaming HTTP client: {err}"))
            })?;
        Ok(Self { normal, stream })
    }
}

#[derive(Clone)]
pub struct ApiClient {
    clients: Arc<HttpClients>,
    base: String,
    token: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse {
    pub status: u16,
    pub content_type: String,
    pub body: String,
}

#[derive(Debug, Deserialize)]
struct ErrorEnvelope {
    error: ErrorBody,
}

#[derive(Debug, Deserialize)]
struct ErrorBody {
    #[serde(default)]
    code: String,
    #[serde(default)]
    message: String,
}

impl ApiClient {
    #[cfg(test)]
    pub fn new(record: &RuntimeRecord) -> AppResult<Self> {
        let clients = Arc::new(HttpClients::build()?);
        Ok(Self::with_clients(record, clients))
    }

    pub fn with_clients(record: &RuntimeRecord, clients: Arc<HttpClients>) -> Self {
        Self {
            clients,
            base: record.base_url(),
            token: record.token.clone(),
        }
    }

    pub async fn request(
        &self,
        method: &str,
        path: &str,
        body: Option<&str>,
    ) -> AppResult<ApiResponse> {
        if let Some(body) = body {
            if body.len() > 1024 * 1024 {
                return Err(AppError::Message(
                    "request body exceeds the desktop proxy limit".to_string(),
                ));
            }
        }
        let url = format!("{}{}", self.base, path);
        let mut request = self
            .clients
            .normal
            .request(
                method
                    .parse::<reqwest::Method>()
                    .map_err(|err| AppError::Message(format!("invalid HTTP method: {err}")))?,
                &url,
            )
            .bearer_auth(&self.token)
            .header(reqwest::header::ACCEPT, "application/json");
        if let Some(body) = body {
            request = request
                .header(reqwest::header::CONTENT_TYPE, "application/json")
                .body(body.to_string());
        }

        let response = request
            .send()
            .await
            .map_err(|err| AppError::Api(format!("local API is unreachable: {err}")))?;
        let status = response.status().as_u16();
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("application/json")
            .to_string();
        if response
            .content_length()
            .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
        {
            return Err(AppError::Api(
                "local API response exceeded the desktop limit".to_string(),
            ));
        }
        let bytes = response
            .bytes()
            .await
            .map_err(|err| AppError::Api(format!("cannot read local API response: {err}")))?;
        if bytes.len() > MAX_RESPONSE_BYTES {
            return Err(AppError::Api(
                "local API response exceeded the desktop limit".to_string(),
            ));
        }
        Ok(ApiResponse {
            status,
            content_type,
            body: String::from_utf8_lossy(&bytes).to_string(),
        })
    }

    pub async fn get_json(&self, path: &str) -> AppResult<serde_json::Value> {
        let response = self.request("GET", path, None).await?;
        if !(200..300).contains(&response.status) {
            return Err(AppError::Api(error_message(&response)));
        }
        serde_json::from_str(&response.body)
            .map_err(|err| AppError::Api(format!("invalid local API JSON: {err}")))
    }

    pub async fn health(&self) -> AppResult<()> {
        let response = self.request("GET", "/v1/health", None).await?;
        if response.status == 200 {
            Ok(())
        } else {
            Err(AppError::Api(error_message(&response)))
        }
    }

    pub async fn shutdown(&self) -> AppResult<()> {
        let response = self.request("POST", "/v1/shutdown", Some("{}")).await?;
        if response.status == 200 || response.status == 202 {
            Ok(())
        } else {
            Err(AppError::Api(error_message(&response)))
        }
    }

    pub async fn open_log(&self, run_id: &str) -> AppResult<reqwest::Response> {
        let url = format!("{}/v1/runs/{run_id}/log", self.base);
        let response = self
            .clients
            .stream
            .get(&url)
            .bearer_auth(&self.token)
            .header(reqwest::header::ACCEPT, "text/event-stream")
            .send()
            .await
            .map_err(|err| AppError::Api(format!("cannot open run log: {err}")))?;
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Api(format!(
                "run log returned status {status}: {}",
                sanitize_excerpt(&body)
            )));
        }
        Ok(response)
    }
}

fn error_message(response: &ApiResponse) -> String {
    if let Ok(envelope) = serde_json::from_str::<ErrorEnvelope>(&response.body) {
        let code = envelope.error.code.trim();
        let message = sanitize_excerpt(&envelope.error.message);
        if !code.is_empty() && !message.is_empty() {
            return format!("{code}: {message}");
        }
        if !message.is_empty() {
            return message;
        }
    }
    format!(
        "local API returned status {}: {}",
        response.status,
        sanitize_excerpt(&response.body)
    )
}

fn sanitize_excerpt(body: &str) -> String {
    let compact = body.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut excerpt: String = compact.chars().take(300).collect();
    if compact.chars().count() > 300 {
        excerpt.push('…');
    }
    excerpt
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio::sync::oneshot;

    async fn serve_once(response: String) -> (u16, oneshot::Receiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let (tx, rx) = oneshot::channel();
        tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut buffer = Vec::new();
            let mut chunk = [0_u8; 1024];
            loop {
                let read = stream.read(&mut chunk).await.unwrap();
                if read == 0 {
                    break;
                }
                buffer.extend_from_slice(&chunk[..read]);
                if buffer.windows(4).any(|window| window == b"\r\n\r\n") {
                    break;
                }
            }
            let _ = tx.send(String::from_utf8_lossy(&buffer).to_string());
            stream.write_all(response.as_bytes()).await.unwrap();
        });
        (port, rx)
    }

    fn record(port: u16) -> RuntimeRecord {
        RuntimeRecord {
            port,
            token: "0123456789abcdef0123456789abcdef".to_string(),
            pid: 1,
            version: "0.12.0".to_string(),
            started_at: None,
        }
    }

    #[tokio::test]
    async fn sends_bearer_token_and_reads_json() {
        let body = r#"{"version":"0.12.0","pid":7,"uptimeSeconds":3,"status":"running"}"#;
        let (port, request) = serve_once(format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        ))
        .await;
        let client = ApiClient::new(&record(port)).unwrap();
        let response = client.request("GET", "/v1/health", None).await.unwrap();
        assert_eq!(response.status, 200);
        assert!(response.body.contains("0.12.0"));
        let request = request.await.unwrap().to_ascii_lowercase();
        assert!(request.starts_with("get /v1/health"));
        assert!(request.contains("authorization: bearer 0123456789abcdef"));
        assert!(request.contains("accept: application/json"));
    }

    #[tokio::test]
    async fn returns_non_2xx_as_response_but_json_helper_errors() {
        let body = r#"{"error":{"code":"conflict","message":"run already active"}}"#;
        let (port, _request) = serve_once(format!(
            "HTTP/1.1 409 Conflict\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        ))
        .await;
        let client = ApiClient::new(&record(port)).unwrap();
        let response = client
            .request("POST", "/v1/connections/main/run", Some("{}"))
            .await
            .unwrap();
        assert_eq!(response.status, 409);
        assert!(response.body.contains("already active"));

        let (port, _request) = serve_once(format!(
            "HTTP/1.1 409 Conflict\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        ))
        .await;
        let client = ApiClient::new(&record(port)).unwrap();
        let error = client.get_json("/v1/connections").await.unwrap_err();
        assert!(error.to_string().contains("conflict"));
    }
}
