use keyring::Entry;
use oauth2::basic::BasicClient;
use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge,
    RedirectUrl, Scope, TokenResponse, TokenUrl,
};
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::net::TcpListener;
use tokio::time::{timeout, Duration};

// Include the compile-time client secrets
include!(concat!(env!("OUT_DIR"), "/secrets.rs"));

pub struct AppState {
    pub db_path: std::path::PathBuf,
    // In-memory cache of access tokens: email -> (token, expiry_secs)
    pub tokens: Mutex<HashMap<String, (String, u64)>>,
}

// Keyring service name
const KEYRING_SERVICE: &str = "email-client-gmail-client";

// Get machine-id for encryption key fallback
pub fn get_machine_id() -> String {
    std::fs::read_to_string("/etc/machine-id")
        .or_else(|_| std::fs::read_to_string("/var/lib/dbus/machine-id"))
        .unwrap_or_else(|_| "default-fallback-key-for-email-client-secure-storage-12345".to_string())
        .trim()
        .to_string()
}

// Simple XOR encryption for local file/SQLite DB fallback when Keyring is unavailable
fn encrypt_decrypt_xor(data: &[u8], key: &[u8]) -> Vec<u8> {
    data.iter()
        .zip(key.iter().cycle())
        .map(|(&x, &y)| x ^ y)
        .collect()
}

pub fn encrypt_token(email: &str, refresh_token: &str) -> Result<String, String> {
    let key = get_machine_id() + email;
    let data = refresh_token.as_bytes();
    let encrypted = encrypt_decrypt_xor(data, key.as_bytes());
    use base64::prelude::*;
    Ok(BASE64_STANDARD.encode(&encrypted))
}

pub fn decrypt_token(email: &str, encrypted_b64: &str) -> Result<String, String> {
    let key = get_machine_id() + email;
    use base64::prelude::*;
    let encrypted = BASE64_STANDARD.decode(encrypted_b64).map_err(|e| e.to_string())?;
    let decrypted = encrypt_decrypt_xor(&encrypted, key.as_bytes());
    String::from_utf8(decrypted).map_err(|e| e.to_string())
}

pub fn store_refresh_token(email: &str, refresh_token: &str) -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, email).map_err(|e| e.to_string())?;
    entry.set_password(refresh_token).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_refresh_token(email: &str) -> Result<String, String> {
    let entry = Entry::new(KEYRING_SERVICE, email).map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}

pub fn delete_refresh_token(email: &str) -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, email).map_err(|e| e.to_string())?;
    entry.delete_password().map_err(|e| e.to_string())?;
    Ok(())
}

fn create_oauth_client(port: u16) -> BasicClient {
    BasicClient::new(
        ClientId::new(GOOGLE_CLIENT_ID.to_string()),
        Some(ClientSecret::new(GOOGLE_CLIENT_SECRET.to_string())),
        AuthUrl::new("https://accounts.google.com/o/oauth2/v2/auth".to_string()).unwrap(),
        Some(TokenUrl::new("https://oauth2.googleapis.com/token".to_string()).unwrap()),
    )
    .set_redirect_uri(RedirectUrl::new(format!("http://127.0.0.1:{}", port)).unwrap())
}

async fn listen_for_code(listener: TcpListener, expected_state: String) -> Result<String, String> {
    // Wait for connection with a 5-minute timeout
    let accept_result = timeout(Duration::from_secs(300), listener.accept()).await;
    match accept_result {
        Ok(Ok((mut stream, _))) => {
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            let mut buffer = [0; 1024];
            let read_result = timeout(Duration::from_secs(10), stream.read(&mut buffer)).await;
            
            if let Ok(Ok(size)) = read_result {
                let request = String::from_utf8_lossy(&buffer[..size]);
                if let Some(path) = request.split_whitespace().nth(1) {
                    let url = format!("http://localhost{}", path);
                    if let Ok(parsed_url) = url::Url::parse(&url) {
                        let mut code = None;
                        let mut state = None;
                        for (k, v) in parsed_url.query_pairs() {
                            if k == "code" {
                                code = Some(v.into_owned());
                            } else if k == "state" {
                                state = Some(v.into_owned());
                            }
                        }
                        
                        if state.as_deref() == Some(&expected_state) {
                            if let Some(code_val) = code {
                                let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n\
                                <html>\
                                <head><style>\
                                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #0f172a; color: #f1f5f9; }\
                                .card { background: #1e293b; padding: 2.5rem; border-radius: 16px; border: 1px solid #334155; text-align: center; max-width: 420px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3); }\
                                h1 { color: #38bdf8; margin-top: 0; font-size: 24px; font-weight: 600; }\
                                p { line-height: 1.6; color: #94a3b8; font-size: 15px; margin-bottom: 0; }\
                                </style></head>\
                                <body>\
                                <div class='card'>\
                                <h1>AeroMail Authorized</h1>\
                                <p>Google account linked successfully. You may close this browser tab and return to AeroMail.</p>\
                                </div>\
                                </body>\
                                </html>";
                                stream.write_all(response.as_bytes()).await.ok();
                                stream.flush().await.ok();
                                return Ok(code_val);
                            }
                        }
                    }
                }
            }
            let err_response = "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html\r\n\r\n\
            <html><body><h1>Authentication Failed</h1><p>Invalid request or CSRF state mismatch.</p></body></html>";
            stream.write_all(err_response.as_bytes()).await.ok();
            stream.flush().await.ok();
            Err("Invalid request or state mismatch".to_string())
        }
        Ok(Err(e)) => Err(format!("Socket accept error: {}", e)),
        Err(_) => Err("Authentication timed out (5 minutes)".to_string()),
    }
}

pub async fn run_oauth_flow() -> Result<(String, String, u64), String> {
    // Bind callback server to a random free port
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind callback port: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();

    let client = create_oauth_client(port);

    // Create PKCE verifier and challenge
    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

    // Generate state token
    let csrf_token = CsrfToken::new_random();

    // Request permissions: gmail.modify (full read/write/label/trash)
    // We add userinfo scopes to retrieve the account name and profile picture
    let (auth_url, state) = client
        .authorize_url(|| csrf_token)
        .add_scope(Scope::new("https://www.googleapis.com/auth/gmail.modify".to_string()))
        .add_scope(Scope::new("https://www.googleapis.com/auth/userinfo.profile".to_string()))
        .add_scope(Scope::new("https://www.googleapis.com/auth/userinfo.email".to_string()))
        .add_extra_param("access_type", "offline")
        .add_extra_param("prompt", "consent")
        .set_pkce_challenge(pkce_challenge)
        .url();

    // Open user's default browser
    open::that(auth_url.as_str())
        .map_err(|e| format!("Failed to open system browser: {}", e))?;

    // Wait for redirect callback
    let code_str = listen_for_code(listener, state.secret().clone()).await?;

    // Exchange authorization code for tokens
    let token_result = client
        .exchange_code(AuthorizationCode::new(code_str))
        .set_pkce_verifier(pkce_verifier)
        .request_async(oauth2::reqwest::async_http_client)
        .await
        .map_err(|e| format!("Failed to exchange oauth code: {}", e))?;

    let access_token = token_result.access_token().secret().to_string();
    let refresh_token = token_result
        .refresh_token()
        .ok_or_else(|| "No refresh token returned by Google OAuth. Verify consent screen scopes.".to_string())?
        .secret()
        .to_string();
    let expires_in = token_result.expires_in().map(|d| d.as_secs()).unwrap_or(3600);

    Ok((access_token, refresh_token, expires_in))
}

pub async fn get_valid_access_token(
    account_id: &str,
    state: &tauri::State<'_, AppState>,
) -> Result<String, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // 1. Try memory cache
    {
        let tokens = state.tokens.lock().unwrap();
        if let Some((token, expiry)) = tokens.get(account_id) {
            if now + 300 < *expiry {
                return Ok(token.clone());
            }
        }
    }

    // 2. Retrieve refresh token (Keyring with local DB fallback)
    let refresh_token = match get_refresh_token(account_id) {
        Ok(t) => t,
        Err(e) => {
            // Check fallback in SQLite DB
            let conn = rusqlite::Connection::open(&state.db_path).map_err(|err| err.to_string())?;
            let encrypted: Option<String> = conn
                .query_row(
                    "SELECT encrypted_refresh_token FROM accounts WHERE id = ?",
                    [account_id],
                    |row| row.get(0),
                )
                .ok();
            
            if let Some(enc_token) = encrypted {
                decrypt_token(account_id, &enc_token)?
            } else {
                return Err(format!(
                    "No refresh token found for account: {}. Keyring error: {}",
                    account_id, e
                ));
            }
        }
    };

    // 3. Make refresh token request to Google OAuth
    let client = reqwest::Client::new();
    let res = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", GOOGLE_CLIENT_ID),
            ("client_secret", GOOGLE_CLIENT_SECRET),
            ("grant_type", "refresh_token"),
            ("refresh_token", &refresh_token),
        ])
        .send()
        .await
        .map_err(|e| format!("Failed to send refresh request: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Token refresh failed: {}", err_text));
    }

    let token_resp: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    let access_token = token_resp
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "No access_token in response".to_string())?
        .to_string();

    let expires_in = token_resp
        .get("expires_in")
        .and_then(|v| v.as_u64())
        .unwrap_or(3600);

    let expiry_time = now + expires_in;

    // Cache access token in memory
    {
        let mut tokens = state.tokens.lock().unwrap();
        tokens.insert(account_id.to_string(), (access_token.clone(), expiry_time));
    }

    // If Google returned a new refresh token, update it!
    if let Some(new_refresh) = token_resp.get("refresh_token").and_then(|v| v.as_str()) {
        if let Err(e) = store_refresh_token(account_id, new_refresh) {
            eprintln!("Keyring update failed: {}. Updating DB fallback.", e);
            if let Ok(enc) = encrypt_token(account_id, new_refresh) {
                let conn = rusqlite::Connection::open(&state.db_path).map_err(|err| err.to_string())?;
                conn.execute(
                    "UPDATE accounts SET encrypted_refresh_token = ? WHERE id = ?",
                    [enc, account_id.to_string()],
                )
                .ok();
            }
        }
    }

    Ok(access_token)
}
