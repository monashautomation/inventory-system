use std::fmt;

use serde_json::Value;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum TrpcError {
    #[error("not authenticated (server said: {0}) — run `maims auth -u <url> -t <token>`")]
    Unauthorized(String),
    #[error("server error [{code}]: {message}")]
    Server { code: String, message: String },
    #[error("network error: {0}")]
    Network(String),
    #[error("bad response from server: {0}")]
    Malformed(String),
}

/// Build the GET URL for a tRPC v11 query with a superjson input envelope.
/// `path` is dotted, e.g. `item.list`. Returns None when the path is empty.
pub fn query_url(base: &str, path: &str, input: Option<&Value>) -> Option<String> {
    if path.is_empty() {
        return None;
    }
    let url = format!("{}/api/trpc/{}", base.trim_end_matches('/'), path);
    match input {
        None => Some(url),
        Some(v) => {
            let envelope = serde_json::json!({ "json": v });
            let envelope_str = envelope.to_string();
            let encoded = urlencoding::encode(&envelope_str);
            Some(format!("{url}?input={encoded}"))
        }
    }
}

/// Parse a tRPC batch response body into the procedure's JSON output.
pub fn parse_response(body: &str) -> Result<Value, TrpcError> {
    let parsed: Value = serde_json::from_str(body)
        .map_err(|e| TrpcError::Malformed(format!("{e}: {}", truncate(body, 200))))?;
    let first = match parsed {
        Value::Array(ref arr) => arr.first().cloned().unwrap_or(Value::Null),
        ref v @ Value::Object(_) => v.clone(),
        _ => {
            return Err(TrpcError::Malformed(format!(
                "unexpected response: {}",
                truncate(body, 200)
            )))
        }
    };

    if let Some(err) = first.get("error") {
        let message = err
            .pointer("/json/message")
            .or_else(|| err.pointer("/message"))
            .and_then(|m| m.as_str())
            .unwrap_or("unknown error")
            .to_string();
        let code = err
            .pointer("/json/data/code")
            .and_then(|c| c.as_str())
            .unwrap_or(if message.to_lowercase().contains("unauthorized") {
                "UNAUTHORIZED"
            } else {
                "ERROR"
            })
            .to_string();
        if code == "UNAUTHORIZED" {
            return Err(TrpcError::Unauthorized(message));
        }
        return Err(TrpcError::Server { code, message });
    }

    let data = first
        .pointer("/result/data/json")
        .or_else(|| first.pointer("/result/data"))
        .cloned()
        .ok_or_else(|| {
            TrpcError::Malformed(format!("no result in response: {}", truncate(body, 200)))
        })?;
    Ok(data)
}

fn truncate(s: &str, n: usize) -> String {
    if s.len() <= n {
        s.to_string()
    } else {
        format!("{}…", &s[..n])
    }
}

/// Minimal tRPC v11 client. Read-only: only GET (queries) are issued —
/// mutations are POST-only on the server, so this transport cannot write.
pub struct Client {
    base: String,
    token: String,
    agent: ureq::Agent,
}

impl Client {
    pub fn new(base: String, token: String) -> Self {
        Self {
            base,
            token,
            agent: ureq::AgentBuilder::new()
                .timeout(std::time::Duration::from_secs(30))
                .build(),
        }
    }

    /// Call a query procedure. `input` is the plain procedure input (the
    /// superjson envelope is added automatically).
    pub fn query(&self, path: &str, input: Option<&Value>) -> Result<Value, TrpcError> {
        let url = query_url(&self.base, path, input)
            .ok_or_else(|| TrpcError::Malformed("empty procedure path".into()))?;
        let mut req = self.agent.get(&url);
        req = self.auth(req);
        match req.call() {
            Ok(resp) => {
                let body = resp
                    .into_string()
                    .map_err(|e| TrpcError::Network(e.to_string()))?;
                parse_response(&body)
            }
            Err(ureq::Error::Status(code, resp)) => {
                let body = resp.into_string().unwrap_or_default();
                Err(self.status_error(code, &body))
            }
            Err(e) => Err(TrpcError::Network(e.to_string())),
        }
    }

    /// Call a mutation procedure via POST. Used only for API-token management
    /// (`tokens create` / `tokens revoke`) — the server rejects these for
    /// read-only tokens, so inventory data stays read-only regardless.
    pub fn mutate(&self, path: &str, input: Option<&Value>) -> Result<Value, TrpcError> {
        if path.is_empty() {
            return Err(TrpcError::Malformed("empty procedure path".into()));
        }
        let url = format!("{}/api/trpc/{}", self.base.trim_end_matches('/'), path);
        let body = match input {
            None => serde_json::json!({ "json": null }),
            Some(v) => serde_json::json!({ "json": v }),
        }
        .to_string();
        let mut req = self
            .agent
            .post(&url)
            .set("content-type", "application/json");
        req = self.auth(req);
        match req.send_string(&body) {
            Ok(resp) => {
                let text = resp
                    .into_string()
                    .map_err(|e| TrpcError::Network(e.to_string()))?;
                parse_response(&text)
            }
            Err(ureq::Error::Status(code, resp)) => {
                let text = resp.into_string().unwrap_or_default();
                Err(self.status_error(code, &text))
            }
            Err(e) => Err(TrpcError::Network(e.to_string())),
        }
    }

    fn auth(&self, req: ureq::Request) -> ureq::Request {
        if self.token.is_empty() {
            return req;
        }
        // better-auth session cookie (what the web UI uses), plus a bearer
        // header for API tokens (mai_…) created in Settings → API tokens.
        req.set("cookie", &format!("better-session={}", self.token))
            .set("authorization", &format!("Bearer {}", self.token))
    }

    fn status_error(&self, code: u16, body: &str) -> TrpcError {
        if code == 401 || code == 403 {
            return TrpcError::Unauthorized(
                parse_response(body)
                    .err()
                    .map(|e| e.to_string())
                    .unwrap_or_else(|| format!("HTTP {code}")),
            );
        }
        parse_response(body).err().unwrap_or_else(|| TrpcError::Server {
            code: format!("HTTP_{code}"),
            message: truncate(body, 300),
        })
    }
}

impl fmt::Display for Client {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "maims->{}", self.base)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_no_input() {
        assert_eq!(
            query_url("https://inv.test", "item.list", None).as_deref(),
            Some("https://inv.test/api/trpc/item.list")
        );
    }

    #[test]
    fn url_trailing_slash_base() {
        assert_eq!(
            query_url("https://inv.test/", "tag.list", None).as_deref(),
            Some("https://inv.test/api/trpc/tag.list")
        );
    }

    #[test]
    fn url_with_input_is_encoded_superjson() {
        let url = query_url(
            "https://inv.test",
            "item.list",
            Some(&serde_json::json!({ "consumable": false, "page": 0 })),
        )
        .unwrap();
        assert!(url.starts_with("https://inv.test/api/trpc/item.list?input="));
        let encoded = url.split("input=").nth(1).unwrap();
        let decoded = urlencoding::decode(encoded).unwrap();
        let v: Value = serde_json::from_str(&decoded).unwrap();
        assert_eq!(v["json"]["consumable"], serde_json::json!(false));
        assert_eq!(v["json"]["page"], serde_json::json!(0));
    }

    #[test]
    fn empty_path_rejected() {
        assert_eq!(query_url("https://inv.test", "", None), None);
    }

    #[test]
    fn parses_v11_success() {
        let body = r#"[{"id":0,"result":{"type":"data","data":{"json":{"ok":true}}}}]"#;
        assert_eq!(parse_response(body).unwrap()["ok"], serde_json::json!(true));
    }

    #[test]
    fn parses_v10_success() {
        let body = r#"[{"result":{"type":"data","data":{"json":[1,2]}}}]"#;
        assert_eq!(parse_response(body).unwrap().as_array().unwrap().len(), 2);
    }

    #[test]
    fn parses_unauthorized_error() {
        let body = r#"[{"error":{"json":{"message":"not authed","code":-32001,"data":{"code":"UNAUTHORIZED"}}}}]"#;
        match parse_response(body) {
            Err(TrpcError::Unauthorized(m)) => assert_eq!(m, "not authed"),
            other => panic!("expected Unauthorized, got {other:?}"),
        }
    }

    #[test]
    fn parses_server_error_with_code() {
        let body = r#"[{"error":{"json":{"message":"Printer not found.","code":-32004,"data":{"code":"NOT_FOUND"}}}}]"#;
        match parse_response(body) {
            Err(TrpcError::Server { code, message }) => {
                assert_eq!(code, "NOT_FOUND");
                assert_eq!(message, "Printer not found.");
            }
            other => panic!("expected Server error, got {other:?}"),
        }
    }

    #[test]
    fn malformed_body_errors() {
        assert!(matches!(
            parse_response("not json at all"),
            Err(TrpcError::Malformed(_))
        ));
        assert!(matches!(
            parse_response(r#"[{"weird":true}]"#),
            Err(TrpcError::Malformed(_))
        ));
    }

    #[test]
    fn error_without_data_code_falls_back() {
        let body = r#"[{"error":{"message":"UNAUTHORIZED"}}]"#;
        match parse_response(body) {
            Err(TrpcError::Unauthorized(_)) => {}
            other => panic!("expected Unauthorized, got {other:?}"),
        }
    }
}
