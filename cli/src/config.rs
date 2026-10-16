use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Persisted CLI configuration (url + session token).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct Config {
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub token: String,
}

/// Normalise a user-supplied host/URL into a base URL.
/// Bare hosts get `https://`; trailing slashes are stripped.
/// Returns None for empty or non-http(s) inputs.
pub fn normalize_url(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }
    // Any explicit scheme that isn't http(s) is rejected outright —
    // otherwise `ftp://x` would silently become `https://ftp://x`.
    if let Some(idx) = raw.find("://") {
        let scheme = &raw[..idx];
        if scheme != "http" && scheme != "https" {
            return None;
        }
    }
    let with_scheme = if raw.starts_with("http://") || raw.starts_with("https://") {
        raw.to_string()
    } else {
        format!("https://{raw}")
    };
    let url = urlencoding::decode(&with_scheme).ok()?;
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return None;
    }
    // no second scheme hiding in the host part
    let rest = url.split_once("://").map(|(_, r)| r).unwrap_or("");
    if rest.contains("://") {
        return None;
    }
    Some(url.trim_end_matches('/').to_string())
}

/// Config file location: `$MAIMS_CONFIG`, or `$MAIMS_CONFIG_DIR/config.json`,
/// or `$XDG_CONFIG_HOME/maims/config.json`, or `~/.config/maims/config.json`.
pub fn config_path(flag: Option<&str>) -> Option<PathBuf> {
    if let Some(p) = flag {
        return Some(PathBuf::from(p));
    }
    if let Ok(p) = std::env::var("MAIMS_CONFIG") {
        if !p.is_empty() {
            return Some(PathBuf::from(p));
        }
    }
    let dir = match std::env::var("MAIMS_CONFIG_DIR") {
        Ok(d) if !d.is_empty() => PathBuf::from(d),
        _ => {
            let xdg = match std::env::var("XDG_CONFIG_HOME") {
                Ok(x) if !x.is_empty() => PathBuf::from(x),
                _ => match std::env::var("HOME") {
                    Ok(h) if !h.is_empty() => PathBuf::from(h).join(".config"),
                    _ => return None,
                },
            };
            xdg.join("maims")
        }
    };
    Some(dir.join("config.json"))
}

pub fn load_config(path: &PathBuf) -> Config {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Write the config file with owner-only permissions (best effort on unix).
pub fn save_config(path: &PathBuf, cfg: &Config) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(cfg).unwrap_or_default();
    fs::write(path, json)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// Resolve the effective (url, token) with precedence:
/// flags > MAIMS_URL / MAIMS_TOKEN env > config file.
pub fn resolve(
    flag_url: Option<&str>,
    flag_token: Option<&str>,
    file: &Config,
) -> Result<(String, String), String> {
    let raw_url = flag_url
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string())
        .or_else(|| std::env::var("MAIMS_URL").ok().filter(|s| !s.trim().is_empty()))
        .or_else(|| {
            if file.url.trim().is_empty() {
                None
            } else {
                Some(file.url.clone())
            }
        });
    let token = flag_token
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string())
        .or_else(|| std::env::var("MAIMS_TOKEN").ok().filter(|s| !s.trim().is_empty()))
        .or_else(|| {
            if file.token.trim().is_empty() {
                None
            } else {
                Some(file.token.clone())
            }
        })
        .unwrap_or_default();

    let url = raw_url
        .as_deref()
        .and_then(normalize_url)
        .ok_or_else(|| {
            "no server URL configured — run `maims auth -u <url> -t <token>` or set MAIMS_URL"
                .to_string()
        })?;
    Ok((url, token.trim().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bare_host_gets_https() {
        assert_eq!(
            normalize_url("inventory.monashautomation.com").as_deref(),
            Some("https://inventory.monashautomation.com")
        );
    }

    #[test]
    fn trailing_slashes_stripped() {
        assert_eq!(
            normalize_url("https://x.test/api/").as_deref(),
            Some("https://x.test/api")
        );
    }

    #[test]
    fn http_scheme_preserved() {
        assert_eq!(
            normalize_url("http://localhost:3000").as_deref(),
            Some("http://localhost:3000")
        );
    }

    #[test]
    fn empty_and_garbage_rejected() {
        assert_eq!(normalize_url(""), None);
        assert_eq!(normalize_url("   "), None);
        assert_eq!(normalize_url("ftp://x.test"), None);
    }

    #[test]
    fn whitespace_trimmed() {
        assert_eq!(
            normalize_url("  inventory.test  ").as_deref(),
            Some("https://inventory.test")
        );
    }

    #[test]
    fn config_roundtrip() {
        let dir = std::env::temp_dir().join(format!("maims-cfg-{}", std::process::id()));
        let path = dir.join("config.json");
        let cfg = Config {
            url: "https://inv.test".into(),
            token: "tok123".into(),
        };
        save_config(&path, &cfg).unwrap();
        let loaded = load_config(&path);
        assert_eq!(loaded, cfg);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn missing_config_yields_default() {
        let path = PathBuf::from("/nonexistent/maims/config.json");
        let cfg = load_config(&path);
        assert_eq!(cfg.url, "");
        assert_eq!(cfg.token, "");
    }

    #[test]
    fn flag_precedence_over_file() {
        let file = Config {
            url: "https://file.test".into(),
            token: "filetok".into(),
        };
        let (url, token) = resolve(Some("flag.test"), Some("flagtok"), &file).unwrap();
        assert_eq!(url, "https://flag.test");
        assert_eq!(token, "flagtok");
    }

    #[test]
    fn file_used_when_no_flags_or_env() {
        // Make sure env vars don't leak into this test.
        std::env::remove_var("MAIMS_URL");
        std::env::remove_var("MAIMS_TOKEN");
        let file = Config {
            url: "https://file.test".into(),
            token: "filetok".into(),
        };
        let (url, token) = resolve(None, None, &file).unwrap();
        assert_eq!(url, "https://file.test");
        assert_eq!(token, "filetok");
    }

    #[test]
    fn env_overrides_file_but_not_flags() {
        std::env::set_var("MAIMS_URL", "env.test");
        std::env::set_var("MAIMS_TOKEN", "envtok");
        let file = Config {
            url: "https://file.test".into(),
            token: "filetok".into(),
        };
        let (url, token) = resolve(None, None, &file).unwrap();
        assert_eq!(url, "https://env.test");
        assert_eq!(token, "envtok");
        let (url, token) = resolve(Some("flag.test"), Some("flagtok"), &file).unwrap();
        assert_eq!(url, "https://flag.test");
        assert_eq!(token, "flagtok");
        std::env::remove_var("MAIMS_URL");
        std::env::remove_var("MAIMS_TOKEN");
    }

    #[test]
    fn no_url_anywhere_is_actionable_error() {
        std::env::remove_var("MAIMS_URL");
        let err = resolve(None, None, &Config::default()).unwrap_err();
        assert!(err.contains("maims auth"));
    }

    #[test]
    fn config_path_flag_wins() {
        let p = config_path(Some("/tmp/custom.json")).unwrap();
        assert_eq!(p, PathBuf::from("/tmp/custom.json"));
    }

    #[test]
    fn config_path_env_dir() {
        std::env::set_var("MAIMS_CONFIG_DIR", "/tmp/maims-dir-test");
        let p = config_path(None).unwrap();
        assert_eq!(p, PathBuf::from("/tmp/maims-dir-test/config.json"));
        std::env::remove_var("MAIMS_CONFIG_DIR");
    }
}
