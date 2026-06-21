use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::path::Path;
use tauri::{AppHandle, Manager};

/// Open a SQLite connection with performance PRAGMAs (WAL, large cache, etc.)
/// Use this everywhere instead of raw `Connection::open(...)`.
pub fn open_connection(db_path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(db_path).map_err(|e| format!("Failed to open DB: {}", e))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA cache_size = -10000;
         PRAGMA temp_store = MEMORY;
         PRAGMA mmap_size = 268435456;
         PRAGMA foreign_keys = ON;"
    ).map_err(|e| format!("Failed to set PRAGMAs: {}", e))?;
    Ok(conn)
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Account {
    pub id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub active: bool,
    pub history_id: Option<String>,
    pub picture_url: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct MessageHeader {
    pub id: String,
    pub thread_id: String,
    pub account_id: String,
    pub sender: String,
    pub subject: String,
    pub snippet: Option<String>,
    pub labels: Vec<String>,
    pub is_read: bool,
    pub timestamp: i64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct MessageDetail {
    pub id: String,
    pub thread_id: String,
    pub account_id: String,
    pub sender: String,
    pub subject: String,
    pub snippet: Option<String>,
    pub body_html: Option<String>,
    pub body_text: Option<String>,
    pub labels: Vec<String>,
    pub is_read: bool,
    pub timestamp: i64,
    pub attachments_meta: Option<String>,
}

pub fn init_db(app_handle: &AppHandle) -> Result<Connection, String> {
    // Get app data directory path
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    // Create directory if not exists
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;
        
    let db_path = app_dir.join("email_client.db");
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database file: {}", e))?;

    // Performance PRAGMAs — WAL mode for concurrent reads, bigger cache, relaxed sync
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA cache_size = -10000;
         PRAGMA temp_store = MEMORY;
         PRAGMA mmap_size = 268435456;
         PRAGMA foreign_keys = ON;"
    ).map_err(|e| format!("Failed to set PRAGMAs: {}", e))?;

    // Create tables
    conn.execute(
        "CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            display_name TEXT,
            active INTEGER DEFAULT 0,
            history_id TEXT,
            encrypted_refresh_token TEXT,
            picture_url TEXT
        );",
        [],
    ).map_err(|e| format!("Failed to create accounts table: {}", e))?;

    // Run simple migration: alter table to add picture_url and next_page_token if table already existed without them
    conn.execute(
        "ALTER TABLE accounts ADD COLUMN picture_url TEXT;",
        [],
    ).ok(); // ignore error if it already exists

    conn.execute(
        "ALTER TABLE accounts ADD COLUMN next_page_token TEXT;",
        [],
    ).ok(); // ignore error if it already exists

    conn.execute(
        "CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            sender TEXT NOT NULL,
            subject TEXT NOT NULL,
            snippet TEXT,
            body_html TEXT,
            body_text TEXT,
            labels TEXT, -- Store comma-separated e.g. ,INBOX,UNREAD,
            is_read INTEGER DEFAULT 0,
            timestamp INTEGER NOT NULL,
            attachments_meta TEXT,
            FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );",
        [],
    ).map_err(|e| format!("Failed to create messages table: {}", e))?;

    // Create indices for cache query speed
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_account_timestamp ON messages(account_id, timestamp DESC);",
        [],
    ).map_err(|e| format!("Failed to create messages timestamp index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_labels ON messages(labels);",
        [],
    ).map_err(|e| format!("Failed to create messages labels index: {}", e))?;

    // Composite index for the most common query: filter by account + label, sort by timestamp
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_acct_labels_ts ON messages(account_id, labels, timestamp DESC);",
        [],
    ).map_err(|e| format!("Failed to create composite index: {}", e))?;

    // Create table for label-specific page tokens
    conn.execute(
        "CREATE TABLE IF NOT EXISTS label_pagination (
            account_id TEXT NOT NULL,
            label TEXT NOT NULL,
            next_page_token TEXT,
            PRIMARY KEY(account_id, label),
            FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );",
        [],
    ).map_err(|e| format!("Failed to create label_pagination table: {}", e))?;

    Ok(conn)
}

// Convert DB labels string ",INBOX,UNREAD," to Vec<String>
pub fn parse_labels(labels_str: &str) -> Vec<String> {
    labels_str
        .split(',')
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

// Convert Vec<String> to DB labels string ",INBOX,UNREAD,"
pub fn format_labels(labels: &[String]) -> String {
    if labels.is_empty() {
        return ",".to_string();
    }
    format!(",{},", labels.join(","))
}

pub fn list_accounts(conn: &Connection) -> Result<Vec<Account>, String> {
    let mut stmt = conn
        .prepare("SELECT id, email, display_name, active, history_id, picture_url FROM accounts")
        .map_err(|e| e.to_string())?;

    let account_iter = stmt
        .query_map([], |row| {
            let active_int: i32 = row.get(3)?;
            Ok(Account {
                id: row.get(0)?,
                email: row.get(1)?,
                display_name: row.get(2)?,
                active: active_int == 1,
                history_id: row.get(4)?,
                picture_url: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut accounts = Vec::new();
    for acc in account_iter {
        accounts.push(acc.map_err(|e| e.to_string())?);
    }
    Ok(accounts)
}

pub fn get_active_account(conn: &Connection) -> Result<Option<Account>, rusqlite::Error> {
    let mut stmt = conn
        .prepare("SELECT id, email, display_name, active, history_id, picture_url FROM accounts WHERE active = 1 LIMIT 1")?;

    let mut rows = stmt.query([])?;
    if let Some(row) = rows.next()? {
        let active_int: i32 = row.get(3)?;
        Ok(Some(Account {
            id: row.get(0)?,
            email: row.get(1)?,
            display_name: row.get(2)?,
            active: active_int == 1,
            history_id: row.get(4)?,
            picture_url: row.get(5)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn switch_account(conn: &Connection, account_id: &str) -> Result<(), String> {
    // Check if account exists first
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM accounts WHERE id = ?)",
            [account_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if !exists {
        return Err(format!("Account not found: {}", account_id));
    }

    conn.execute("UPDATE accounts SET active = 0", [])
        .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE accounts SET active = 1 WHERE id = ?",
        [account_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn remove_account(conn: &Connection, account_id: &str) -> Result<(), String> {
    // Enable foreign keys explicitly again to guarantee cascade deletes
    conn.execute("PRAGMA foreign_keys = ON;", [])
        .map_err(|e| e.to_string())?;
        
    conn.execute("DELETE FROM accounts WHERE id = ?", [account_id])
        .map_err(|e| e.to_string())?;
        
    Ok(())
}

pub fn list_messages(
    conn: &Connection,
    account_id: &str,
    label: &str,
    page: u32,
    limit: u32,
) -> Result<Vec<MessageHeader>, String> {
    let offset = (page.saturating_sub(1)) * limit;
    
    // Label filtering: we search labels like '%,LABEL,%'
    // If label is "ALL", we list everything for that account
    let query = if label.to_uppercase() == "ALL" {
        "SELECT id, thread_id, account_id, sender, subject, snippet, labels, is_read, timestamp
         FROM messages
         WHERE account_id = ?1
         ORDER BY timestamp DESC
         LIMIT ?2 OFFSET ?3"
    } else {
        "SELECT id, thread_id, account_id, sender, subject, snippet, labels, is_read, timestamp
         FROM messages
         WHERE account_id = ?1 AND labels LIKE ?2
         ORDER BY timestamp DESC
         LIMIT ?3 OFFSET ?4"
    };

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;

    if label.to_uppercase() == "ALL" {
        let account_iter = stmt.query_map(params![account_id, limit, offset], |row| {
            let labels_str: String = row.get(6)?;
            let is_read_int: i32 = row.get(7)?;
            Ok(MessageHeader {
                id: row.get(0)?,
                thread_id: row.get(1)?,
                account_id: row.get(2)?,
                sender: row.get(3)?,
                subject: row.get(4)?,
                snippet: row.get(5)?,
                labels: parse_labels(&labels_str),
                is_read: is_read_int == 1,
                timestamp: row.get(8)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut messages = Vec::new();
        for msg in account_iter {
            messages.push(msg.map_err(|e| e.to_string())?);
        }
        Ok(messages)
    } else {
        let label_match = format!("%,{},%", label);
        let account_iter = stmt.query_map(params![account_id, label_match, limit, offset], |row| {
            let labels_str: String = row.get(6)?;
            let is_read_int: i32 = row.get(7)?;
            Ok(MessageHeader {
                id: row.get(0)?,
                thread_id: row.get(1)?,
                account_id: row.get(2)?,
                sender: row.get(3)?,
                subject: row.get(4)?,
                snippet: row.get(5)?,
                labels: parse_labels(&labels_str),
                is_read: is_read_int == 1,
                timestamp: row.get(8)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut messages = Vec::new();
        for msg in account_iter {
            messages.push(msg.map_err(|e| e.to_string())?);
        }
        Ok(messages)
    }
}

pub fn get_message(
    conn: &Connection,
    account_id: &str,
    message_id: &str,
) -> Result<Option<MessageDetail>, rusqlite::Error> {
    let mut stmt = conn
        .prepare(
            "SELECT id, thread_id, account_id, sender, subject, snippet, body_html, body_text, labels, is_read, timestamp, attachments_meta
             FROM messages
             WHERE account_id = ?1 AND id = ?2
             LIMIT 1"
        )?;

    let mut rows = stmt.query(params![account_id, message_id])?;
    if let Some(row) = rows.next()? {
        let labels_str: String = row.get(8)?;
        let is_read_int: i32 = row.get(9)?;
        Ok(Some(MessageDetail {
            id: row.get(0)?,
            thread_id: row.get(1)?,
            account_id: row.get(2)?,
            sender: row.get(3)?,
            subject: row.get(4)?,
            snippet: row.get(5)?,
            body_html: row.get(6)?,
            body_text: row.get(7)?,
            labels: parse_labels(&labels_str),
            is_read: is_read_int == 1,
            timestamp: row.get(10)?,
            attachments_meta: row.get(11)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn upsert_message_detail(conn: &Connection, msg: &MessageDetail) -> Result<(), String> {
    let labels_str = format_labels(&msg.labels);
    let is_read_int = if msg.is_read { 1 } else { 0 };

    conn.execute(
        "INSERT INTO messages (id, thread_id, account_id, sender, subject, snippet, body_html, body_text, labels, is_read, timestamp, attachments_meta)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(id) DO UPDATE SET
            thread_id = excluded.thread_id,
            sender = excluded.sender,
            subject = excluded.subject,
            snippet = excluded.snippet,
            body_html = COALESCE(excluded.body_html, messages.body_html),
            body_text = COALESCE(excluded.body_text, messages.body_text),
            labels = excluded.labels,
            is_read = excluded.is_read,
            timestamp = excluded.timestamp,
            attachments_meta = COALESCE(excluded.attachments_meta, messages.attachments_meta);",
        params![
            msg.id,
            msg.thread_id,
            msg.account_id,
            msg.sender,
            msg.subject,
            msg.snippet,
            msg.body_html,
            msg.body_text,
            labels_str,
            is_read_int,
            msg.timestamp,
            msg.attachments_meta
        ],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

pub fn update_message_labels(
    conn: &Connection,
    account_id: &str,
    message_id: &str,
    labels: &[String],
) -> Result<(), String> {
    let labels_str = format_labels(labels);
    let is_read = if labels.iter().any(|l| l.to_uppercase() == "UNREAD") { 0 } else { 1 };
    
    conn.execute(
        "UPDATE messages SET labels = ?, is_read = ? WHERE account_id = ? AND id = ?",
        params![labels_str, is_read, account_id, message_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn batch_modify_message_labels_db(
    conn: &mut Connection,
    account_id: &str,
    message_ids: &[String],
    add_labels: &[String],
    remove_labels: &[String],
) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        let mut select_stmt = tx
            .prepare("SELECT labels FROM messages WHERE account_id = ?1 AND id = ?2")
            .map_err(|e| e.to_string())?;
        let mut update_stmt = tx
            .prepare("UPDATE messages SET labels = ?, is_read = ? WHERE account_id = ? AND id = ?")
            .map_err(|e| e.to_string())?;

        for id in message_ids {
            let labels_str: Option<String> = select_stmt
                .query_row(params![account_id, id], |row| row.get(0))
                .ok();

            if let Some(l_str) = labels_str {
                let mut current_labels: HashSet<String> = parse_labels(&l_str).into_iter().collect();
                for add in add_labels {
                    current_labels.insert(add.clone());
                }
                for rem in remove_labels {
                    current_labels.remove(rem);
                }
                let new_labels: Vec<String> = current_labels.into_iter().collect();
                let new_labels_str = format_labels(&new_labels);
                let is_read = if new_labels.iter().any(|l| l.to_uppercase() == "UNREAD") { 0 } else { 1 };

                update_stmt
                    .execute(params![new_labels_str, is_read, account_id, id])
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_message(conn: &Connection, account_id: &str, message_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM messages WHERE account_id = ? AND id = ?",
        [account_id, message_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn update_history_id(conn: &Connection, account_id: &str, history_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE accounts SET history_id = ? WHERE id = ?",
        [history_id, account_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn get_label_page_token(conn: &Connection, account_id: &str, label: &str) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare("SELECT next_page_token FROM label_pagination WHERE account_id = ?1 AND label = ?2 LIMIT 1")
        .map_err(|e| e.to_string())?;
    
    let mut rows = stmt.query(params![account_id, label]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let token: Option<String> = row.get(0).map_err(|e| e.to_string())?;
        Ok(token)
    } else {
        Ok(None)
    }
}

pub fn update_label_page_token(
    conn: &Connection,
    account_id: &str,
    label: &str,
    next_page_token: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO label_pagination (account_id, label, next_page_token)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(account_id, label) DO UPDATE SET next_page_token = excluded.next_page_token;",
        params![account_id, label, next_page_token],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
