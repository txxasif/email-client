mod auth;
mod db;
mod gmail;

use auth::{AppState, get_valid_access_token, run_oauth_flow};
use db::{Account, MessageDetail, MessageHeader};
use gmail::GmailClient;
use std::sync::Mutex;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent,
};

// Background helper to sync an account and emit updates to frontend
async fn sync_account_internal(app: AppHandle, account_id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    
    // Resolve/refresh token
    let access_token = get_valid_access_token(&account_id, &state).await?;
    let gmail = GmailClient::new(access_token);
 
    // Retrieve previous sync history ID and total messages count from DB cache (temporary connection)
    let (start_history_id, total_messages): (Option<String>, u32) = {
        let conn = db::open_connection(&state.db_path)?;
        let history_id: Option<String> = conn.query_row(
            "SELECT history_id FROM accounts WHERE id = ?",
            [&account_id],
            |row| row.get(0),
        ).ok().flatten();
        
        let count: u32 = conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE account_id = ?",
            [&account_id],
            |row| row.get(0),
        ).unwrap_or(0);
        
        (history_id, count)
    };
 
    let is_subsequent_sync = start_history_id.as_ref().map(|s| !s.is_empty() && s != "0").unwrap_or(false) && total_messages > 0;
 
    let (next_history_id, new_messages) = {
        if total_messages < 50 {
            // Force full sync to populate cache if we have very few messages cached
            gmail.full_sync(&account_id, &state.db_path).await?
        } else if let Some(ref shid) = start_history_id {
            if shid.is_empty() || shid == "0" {
                gmail.full_sync(&account_id, &state.db_path).await?
            } else {
                gmail.incremental_sync(&account_id, shid, &state.db_path).await?
            }
        } else {
            gmail.full_sync(&account_id, &state.db_path).await?
        }
    };
 
    println!("Synced account {} successfully. New history_id is: {}", account_id, next_history_id);
 
    // If this is a subsequent sync, notify frontend of any new unread messages
    if is_subsequent_sync && !new_messages.is_empty() {
        #[derive(serde::Serialize, Clone)]
        struct NewMailPayload {
            sender: String,
            subject: String,
            account_id: String,
        }
 
        for msg in new_messages {
            if !msg.is_read {
                app.emit("new-mail", NewMailPayload {
                    sender: msg.sender.clone(),
                    subject: msg.subject.clone(),
                    account_id: account_id.clone(),
                }).ok();
            }
        }
    }
 
    // Notify the React frontend that data is updated
    app.emit("messages-updated", account_id.clone()).map_err(|e| e.to_string())?;
 
    Ok(())
}

#[tauri::command]
async fn add_account(app: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    // 1. Run browser OAuth PKCE callback flow
    let (access_token, refresh_token, expires_in) = run_oauth_flow().await?;

    // 2. Fetch account email, name, and picture URL via Google Userinfo endpoint
    let gmail = GmailClient::new(access_token.clone());
    let (email, name, picture_url) = gmail.get_user_info().await?;

    // 3. Store refresh token (Keyring first, SQLite DB backup second)
    if let Err(e) = auth::store_refresh_token(&email, &refresh_token) {
        eprintln!("Keyring store failed for {}: {}. Saving to DB fallback.", email, e);
        if let Ok(enc_rt) = auth::encrypt_token(&email, &refresh_token) {
            let conn = db::open_connection(&state.db_path)?;
            conn.execute(
                "INSERT INTO accounts (id, email, active, encrypted_refresh_token)
                 VALUES (?1, ?1, 1, ?2)
                 ON CONFLICT(id) DO UPDATE SET encrypted_refresh_token = excluded.encrypted_refresh_token;",
                [email.clone(), enc_rt],
            ).ok();
        }
    }

    // 4. Save account records and set active (temporary connection)
    {
        let conn = db::open_connection(&state.db_path)?;
        conn.execute("UPDATE accounts SET active = 0", []).map_err(|e| e.to_string())?;
        
        conn.execute(
            "INSERT INTO accounts (id, email, display_name, active, history_id, picture_url)
             VALUES (?1, ?1, ?2, 1, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET
                email = excluded.email,
                display_name = excluded.display_name,
                active = 1,
                history_id = COALESCE(accounts.history_id, excluded.history_id),
                picture_url = excluded.picture_url;",
            rusqlite::params![
                email,
                name.unwrap_or_else(|| email.clone()),
                None::<String>,
                picture_url
            ],
        ).map_err(|e| e.to_string())?;
    }

    // Cache the access token
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    {
        let mut tokens = state.tokens.lock().unwrap();
        tokens.insert(email.clone(), (access_token, now + expires_in));
    }

    // 5. Trigger initial background sync
    let app_clone = app.clone();
    let email_clone = email.clone();
    tokio::spawn(async move {
        if let Err(e) = sync_account_internal(app_clone, email_clone).await {
            eprintln!("Background sync error: {}", e);
        }
    });

    Ok(email)
}

#[tauri::command]
async fn list_accounts(state: State<'_, AppState>) -> Result<Vec<Account>, String> {
    let conn = db::open_connection(&state.db_path)?;
    db::list_accounts(&conn)
}

#[tauri::command]
async fn remove_account(account_id: String, state: State<'_, AppState>) -> Result<(), String> {
    // Revoke token from OS Keyring
    auth::delete_refresh_token(&account_id).ok();

    // Delete record in DB (cascades and deletes cached messages)
    let conn = db::open_connection(&state.db_path)?;
    db::remove_account(&conn, &account_id)?;

    // Remove in-memory access tokens
    {
        let mut tokens = state.tokens.lock().unwrap();
        tokens.remove(&account_id);
    }

    Ok(())
}

#[tauri::command]
async fn switch_account(app: AppHandle, account_id: String, state: State<'_, AppState>) -> Result<(), String> {
    {
        let conn = db::open_connection(&state.db_path)?;
        db::switch_account(&conn, &account_id)?;
    }

    // Run incremental background sync after switching
    let app_clone = app.clone();
    let account_id_clone = account_id.clone();
    tokio::spawn(async move {
        if let Err(e) = sync_account_internal(app_clone, account_id_clone).await {
            eprintln!("Background sync error: {}", e);
        }
    });

    Ok(())
}

#[tauri::command]
async fn sync_account(
    app: AppHandle,
    account_id: String,
    active_label: Option<String>,
) -> Result<(), String> {
    // 1. Run general background sync
    sync_account_internal(app.clone(), account_id.clone()).await?;

    // 2. If an active label is specified, force-fetch the latest page for that label to keep it up-to-date
    if let Some(label) = active_label {
        let state = app.state::<AppState>();
        let access_token = get_valid_access_token(&account_id, &state).await?;
        let gmail = GmailClient::new(access_token);
        gmail.fetch_and_cache_messages_for_label(&account_id, &label, None, &state.db_path).await?;
    }

    // Emit messages-updated again to reload list
    app.emit("messages-updated", account_id).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn list_messages(
    account_id: String,
    label: String,
    page_token: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<MessageHeader>, String> {
    let page = page_token
        .and_then(|t| t.parse::<u32>().ok())
        .unwrap_or(1);

    let conn = db::open_connection(&state.db_path)?;

    // Check how many messages we have cached specifically for this label and account
    let total_label_cached: u32 = if label.to_uppercase() == "ALL" {
        conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE account_id = ?",
            [&account_id],
            |row| row.get(0),
        ).unwrap_or(0)
    } else {
        let label_match = format!("%,{},%", label);
        conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE account_id = ?1 AND labels LIKE ?2",
            rusqlite::params![account_id, label_match],
            |row| row.get(0),
        ).unwrap_or(0)
    };

    // If paging exceeds currently cached amount for this folder, fetch next page from Gmail
    if total_label_cached < page * 50 {
        // Query label-specific page token
        let next_token: Option<String> = db::get_label_page_token(&conn, &account_id, &label)?;

        // Fetch if we have a token, or if we have 0 messages cached for this label (to load page 1)
        if next_token.is_some() || total_label_cached == 0 {
            let access_token = get_valid_access_token(&account_id, &state).await?;
            let gmail = GmailClient::new(access_token);
            gmail.fetch_and_cache_messages_for_label(
                &account_id,
                &label,
                next_token.as_deref(),
                &state.db_path,
            ).await?;
        }
    }

    let conn = db::open_connection(&state.db_path)?;
    db::list_messages(&conn, &account_id, &label, page, 50)
}

#[tauri::command]
async fn get_message(
    account_id: String,
    message_id: String,
    state: State<'_, AppState>,
) -> Result<MessageDetail, String> {
    // 1. Read from cache first (temporary connection)
    let cached_msg = {
        let conn = db::open_connection(&state.db_path)?;
        db::get_message(&conn, &account_id, &message_id).map_err(|e| e.to_string())?
    };

    if let Some(msg) = cached_msg {
        // Return if bodies are already cached!
        if msg.body_html.is_some() || msg.body_text.is_some() {
            return Ok(msg);
        }
    }

    // 2. Fetch full body via Gmail API (await point)
    let access_token = get_valid_access_token(&account_id, &state).await?;
    let gmail = GmailClient::new(access_token);
    let full_detail = gmail.fetch_message_detail(&account_id, &message_id, true).await?;

    // 3. Update SQLite database (temporary connection)
    {
        let conn = db::open_connection(&state.db_path)?;
        db::upsert_message_detail(&conn, &full_detail)?;
    }

    Ok(full_detail)
}

#[tauri::command]
async fn send_message(
    account_id: String,
    to: String,
    subject: String,
    body: String,
    thread_id: Option<String>,
    attachments: Option<Vec<crate::gmail::Attachment>>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let access_token = get_valid_access_token(&account_id, &state).await?;
    let gmail = GmailClient::new(access_token);
    gmail.send_email(&account_id, &to, &subject, &body, thread_id, attachments).await
}

#[tauri::command]
async fn mark_read(
    account_id: String,
    message_id: String,
    read: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let access_token = get_valid_access_token(&account_id, &state).await?;
    let gmail = GmailClient::new(access_token);

    let labels = if read {
        gmail.modify_message_labels(&message_id, &[], &["UNREAD".to_string()]).await?
    } else {
        gmail.modify_message_labels(&message_id, &["UNREAD".to_string()], &[]).await?
    };

    // Update SQLite cache (temporary connection)
    let conn = db::open_connection(&state.db_path)?;
    db::update_message_labels(&conn, &account_id, &message_id, &labels)?;

    Ok(())
}

#[tauri::command]
async fn archive_message(
    account_id: String,
    message_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let access_token = get_valid_access_token(&account_id, &state).await?;
    let gmail = GmailClient::new(access_token);

    // Remove INBOX label to archive
    let labels = gmail.modify_message_labels(&message_id, &[], &["INBOX".to_string()]).await?;
    
    // Update SQLite cache (temporary connection)
    let conn = db::open_connection(&state.db_path)?;
    db::update_message_labels(&conn, &account_id, &message_id, &labels)?;

    Ok(())
}

#[tauri::command]
async fn trash_message(
    account_id: String,
    message_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let access_token = get_valid_access_token(&account_id, &state).await?;
    let gmail = GmailClient::new(access_token);

    // Move to TRASH and remove from INBOX
    let labels = gmail.modify_message_labels(
        &message_id,
        &["TRASH".to_string()],
        &["INBOX".to_string()],
    ).await?;
    
    // Update SQLite cache (temporary connection)
    let conn = db::open_connection(&state.db_path)?;
    db::update_message_labels(&conn, &account_id, &message_id, &labels)?;

    Ok(())
}

#[tauri::command]
async fn batch_trash_messages(
    account_id: String,
    message_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let access_token = get_valid_access_token(&account_id, &state).await?;
    let gmail = GmailClient::new(access_token);

    gmail.batch_modify_messages(
        &message_ids,
        &["TRASH".to_string()],
        &["INBOX".to_string()],
    ).await?;

    let mut conn = db::open_connection(&state.db_path)?;
    db::batch_modify_message_labels_db(
        &mut conn,
        &account_id,
        &message_ids,
        &["TRASH".to_string()],
        &["INBOX".to_string()],
    )?;

    Ok(())
}

#[tauri::command]
async fn batch_archive_messages(
    account_id: String,
    message_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let access_token = get_valid_access_token(&account_id, &state).await?;
    let gmail = GmailClient::new(access_token);

    gmail.batch_modify_messages(
        &message_ids,
        &[],
        &["INBOX".to_string()],
    ).await?;

    let mut conn = db::open_connection(&state.db_path)?;
    db::batch_modify_message_labels_db(
        &mut conn,
        &account_id,
        &message_ids,
        &[],
        &["INBOX".to_string()],
    )?;

    Ok(())
}

#[tauri::command]
async fn apply_label(
    account_id: String,
    message_id: String,
    label_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let access_token = get_valid_access_token(&account_id, &state).await?;
    let gmail = GmailClient::new(access_token);

    let labels = gmail.modify_message_labels(&message_id, &[label_id], &[]).await?;
    
    let conn = db::open_connection(&state.db_path)?;
    db::update_message_labels(&conn, &account_id, &message_id, &labels)?;

    Ok(())
}

#[tauri::command]
async fn remove_label(
    account_id: String,
    message_id: String,
    label_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let access_token = get_valid_access_token(&account_id, &state).await?;
    let gmail = GmailClient::new(access_token);

    let labels = gmail.modify_message_labels(&message_id, &[], &[label_id]).await?;
    
    let conn = db::open_connection(&state.db_path)?;
    db::update_message_labels(&conn, &account_id, &message_id, &labels)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Initialize SQLite DB Connection in AppData directory
            let _conn = db::init_db(app.handle())?;
            let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let db_path = app_dir.join("email_client.db");
            
            // Set up state
            app.manage(AppState {
                db_path,
                tokens: Mutex::new(std::collections::HashMap::new()),
            });

            // 1. Create Tray Menu Items
            let show_i = MenuItemBuilder::with_id("show", "Show AeroMail").build(app)?;
            let quit_i = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            // 2. Build Menu
            let menu = MenuBuilder::new(app)
                .item(&show_i)
                .separator()
                .item(&quit_i)
                .build()?;

            // 3. Build Tray Icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Intercept close request to hide the window instead of exiting
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            add_account,
            list_accounts,
            remove_account,
            switch_account,
            sync_account,
            list_messages,
            get_message,
            send_message,
            mark_read,
            archive_message,
            trash_message,
            apply_label,
            remove_label,
            batch_trash_messages,
            batch_archive_messages
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
