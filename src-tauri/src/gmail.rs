use crate::db::MessageDetail;
use base64::prelude::*;
use serde_json::Value;
use std::collections::HashSet;

// Helper to decode Gmail's base64url body data
fn decode_body_data(s: &str) -> String {
    let clean = s.trim().replace('-', "+").replace('_', "/");
    // Add manual padding if needed
    let padded = match clean.len() % 4 {
        2 => format!("{}==", clean),
        3 => format!("{}=", clean),
        _ => clean,
    };
    
    if let Ok(bytes) = BASE64_STANDARD.decode(padded.as_bytes()) {
        String::from_utf8_lossy(&bytes).into_owned()
    } else {
        "".to_string()
    }
}

// Recursively traverse MIME parts to extract HTML and plain text bodies
fn extract_body(part: &Value, body_html: &mut String, body_text: &mut String) {
    if let Some(mime_type) = part.get("mimeType").and_then(|m| m.as_str()) {
        if mime_type == "text/html" {
            if let Some(data) = part.get("body").and_then(|b| b.get("data")).and_then(|d| d.as_str()) {
                *body_html = decode_body_data(data);
            }
        } else if mime_type == "text/plain" {
            if let Some(data) = part.get("body").and_then(|b| b.get("data")).and_then(|d| d.as_str()) {
                *body_text = decode_body_data(data);
            }
        }
    }

    if let Some(parts) = part.get("parts").and_then(|p| p.as_array()) {
        for sub_part in parts {
            extract_body(sub_part, body_html, body_text);
        }
    }
}

// Get specific header value case-insensitively
fn get_header(payload: &Value, name: &str) -> String {
    if let Some(headers) = payload.get("headers").and_then(|h| h.as_array()) {
        for header in headers {
            if let Some(h_name) = header.get("name").and_then(|n| n.as_str()) {
                if h_name.eq_ignore_ascii_case(name) {
                    return header.get("value").and_then(|v| v.as_str()).unwrap_or("").to_string();
                }
            }
        }
    }
    "".to_string()
}

#[derive(serde::Deserialize, Clone)]
pub struct Attachment {
    pub filename: String,
    pub mime_type: String,
    pub content_b64: String,
}

#[derive(Clone)]
pub struct GmailClient {
    client: reqwest::Client,
    access_token: String,
}

impl GmailClient {
    pub fn new(access_token: String) -> Self {
        Self {
            client: reqwest::Client::new(),
            access_token,
        }
    }

    // Call user profile to fetch email address and current history ID
    pub async fn get_profile(&self) -> Result<(String, String), String> {
        let res = self
            .client
            .get("https://gmail.googleapis.com/gmail/v1/users/me/profile")
            .bearer_auth(&self.access_token)
            .send()
            .await
            .map_err(|e| format!("Profile request failed: {}", e))?;

        if !res.status().is_success() {
            let err = res.text().await.unwrap_or_default();
            if err.contains("insufficientPermissions") || err.contains("ACCESS_TOKEN_SCOPE_INSUFFICIENT") {
                return Err("Insufficient permissions. When signing in on Google's Consent Page, you MUST check the checkbox 'Read, compose, send, and permanently delete all your email from Gmail' to grant access. Please remove this account, go to Google Connections (https://myaccount.google.com/connections) and remove 'AeroMail', then link it again checking the permissions checkbox.".to_string());
            }
            return Err(format!("Profile API error: {}", err));
        }

        let json: Value = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse profile response: {}", e))?;

        let email = json
            .get("emailAddress")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "No emailAddress in profile".to_string())?
            .to_string();

        let history_id = json
            .get("historyId")
            .and_then(|v| v.as_str())
            .unwrap_or("0")
            .to_string();

        Ok((email, history_id))
    }

    // Call userinfo to fetch email address, name, and profile picture URL
    pub async fn get_user_info(&self) -> Result<(String, Option<String>, Option<String>), String> {
        let res = self
            .client
            .get("https://www.googleapis.com/oauth2/v3/userinfo")
            .bearer_auth(&self.access_token)
            .send()
            .await
            .map_err(|e| format!("Userinfo request failed: {}", e))?;

        if !res.status().is_success() {
            let err = res.text().await.unwrap_or_default();
            return Err(format!("Userinfo API error: {}", err));
        }

        let json: Value = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse userinfo: {}", e))?;

        let email = json
            .get("email")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "No email in userinfo".to_string())?
            .to_string();

        let name = json.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());
        let picture = json.get("picture").and_then(|v| v.as_str()).map(|s| s.to_string());

        Ok((email, name, picture))
    }

    // Fetch details for a specific message
    pub async fn fetch_message_detail(
        &self,
        account_id: &str,
        message_id: &str,
        full_format: bool,
    ) -> Result<MessageDetail, String> {
        let format_param = if full_format { "full" } else { "metadata" };
        let url = format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}?format={}",
            message_id, format_param
        );

        let res = self
            .client
            .get(&url)
            .bearer_auth(&self.access_token)
            .send()
            .await
            .map_err(|e| format!("Message get request failed: {}", e))?;

        if !res.status().is_success() {
            let err = res.text().await.unwrap_or_default();
            return Err(format!("Message API error: {}", err));
        }

        let json: Value = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse message response: {}", e))?;

        let id = json.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let thread_id = json.get("threadId").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let snippet = json.get("snippet").and_then(|v| v.as_str()).map(|s| s.to_string());
        
        // Date timestamp
        let internal_date_str = json.get("internalDate").and_then(|v| v.as_str()).unwrap_or("0");
        let timestamp_ms: i64 = internal_date_str.parse().unwrap_or(0);
        let timestamp_secs = timestamp_ms / 1000;

        let payload = json.get("payload");
        let sender = payload.map(|p| get_header(p, "From")).unwrap_or_default();
        let subject = payload.map(|p| get_header(p, "Subject")).unwrap_or_default();

        // Extract body
        let mut body_html = String::new();
        let mut body_text = String::new();
        if let Some(p) = payload {
            // Check top level body first
            if let Some(mime_type) = p.get("mimeType").and_then(|m| m.as_str()) {
                if mime_type == "text/html" {
                    if let Some(data) = p.get("body").and_then(|b| b.get("data")).and_then(|d| d.as_str()) {
                        body_html = decode_body_data(data);
                    }
                } else if mime_type == "text/plain" {
                    if let Some(data) = p.get("body").and_then(|b| b.get("data")).and_then(|d| d.as_str()) {
                        body_text = decode_body_data(data);
                    }
                }
            }
            // Extract recursively from parts
            extract_body(p, &mut body_html, &mut body_text);
        }

        // Parse labels list
        let mut labels = Vec::new();
        if let Some(label_ids) = json.get("labelIds").and_then(|v| v.as_array()) {
            for lid in label_ids {
                if let Some(s) = lid.as_str() {
                    labels.push(s.to_string());
                }
            }
        }
        let is_read = !labels.iter().any(|l| l.to_uppercase() == "UNREAD");

        Ok(MessageDetail {
            id,
            thread_id,
            account_id: account_id.to_string(),
            sender,
            subject,
            snippet,
            body_html: if body_html.is_empty() { None } else { Some(body_html) },
            body_text: if body_text.is_empty() { None } else { Some(body_text) },
            labels,
            is_read,
            timestamp: timestamp_secs,
            attachments_meta: None, // Stretch goal
        })
    }

    // Sync latest messages (Full Sync fallback)
    pub async fn full_sync(
        &self,
        account_id: &str,
        db_path: &std::path::Path,
    ) -> Result<(String, Vec<MessageDetail>), String> {
        // Fetch profile to get the latest history ID
        let (_, latest_history_id) = self.get_profile().await?;
 
        let res = self
            .client
            .get("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=250&includeSpamTrash=true")
            .bearer_auth(&self.access_token)
            .send()
            .await
            .map_err(|e| format!("List messages failed: {}", e))?;
 
        if !res.status().is_success() {
            let err = res.text().await.unwrap_or_default();
            return Err(format!("List messages API error: {}", err));
        }
 
        let json: Value = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse message list: {}", e))?;
 
        let next_page_token = json.get("nextPageToken").and_then(|v| v.as_str()).map(|s| s.to_string());
        let mut fetched_ids = Vec::new();
        if let Some(messages) = json.get("messages").and_then(|m| m.as_array()) {
            for msg in messages {
                if let Some(id) = msg.get("id").and_then(|v| v.as_str()) {
                    fetched_ids.push(id.to_string());
                }
            }
        }
 
        // Filter out existing messages first to optimize API calls
        let mut to_fetch = Vec::new();
        {
            let conn = crate::db::open_connection(db_path)?;
            let mut stmt = conn
                .prepare("SELECT EXISTS(SELECT 1 FROM messages WHERE account_id = ?1 AND id = ?2)")
                .map_err(|e| e.to_string())?;
            for msg_id in fetched_ids {
                let exists: bool = stmt
                    .query_row([account_id, &msg_id], |row| row.get(0))
                    .unwrap_or(false);
                if !exists {
                    to_fetch.push(msg_id);
                }
            }
        }
 
        let mut new_messages = Vec::new();
        // Fetch details concurrently in chunks of 20 to respect API rate limits
        let chunk_size = 20;
        for chunk in to_fetch.chunks(chunk_size) {
            let mut join_set = tokio::task::JoinSet::new();
            for msg_id in chunk {
                let client_clone = self.clone();
                let account_id_clone = account_id.to_string();
                let msg_id_clone = msg_id.clone();
                join_set.spawn(async move {
                    client_clone.fetch_message_detail(&account_id_clone, &msg_id_clone, false).await
                });
            }
 
            let mut details = Vec::new();
            while let Some(res) = join_set.join_next().await {
                if let Ok(Ok(detail)) = res {
                    details.push(detail);
                }
            }
 
            if !details.is_empty() {
                let conn = crate::db::open_connection(db_path)?;
                for detail in details {
                    crate::db::upsert_message_detail(&conn, &detail)?;
                    new_messages.push(detail);
                }
            }
        }
 
        // Update history id and next_page_token in database (open temporary connection)
        {
            let conn = crate::db::open_connection(db_path)?;
            crate::db::update_history_id(&conn, account_id, &latest_history_id)?;
            conn.execute(
                "UPDATE accounts SET next_page_token = ? WHERE id = ?",
                rusqlite::params![next_page_token, account_id],
            ).ok();
        }
 
        Ok((latest_history_id, new_messages))
    }

    // Fetch messages for a specific label using an optional page token and cache them in DB
    pub async fn fetch_and_cache_messages_for_label(
        &self,
        account_id: &str,
        label: &str,
        page_token: Option<&str>,
        db_path: &std::path::Path,
    ) -> Result<Option<String>, String> {
        let mut url = if label.to_uppercase() == "ALL" {
            "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&includeSpamTrash=true".to_string()
        } else {
            format!(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&includeSpamTrash=true&labelIds={}",
                label.to_uppercase()
            )
        };

        if let Some(token) = page_token {
            if !token.is_empty() {
                url = format!("{}&pageToken={}", url, token);
            }
        }

        let res = self
            .client
            .get(&url)
            .bearer_auth(&self.access_token)
            .send()
            .await
            .map_err(|e| format!("List messages for label {} failed: {}", label, e))?;

        if !res.status().is_success() {
            let err = res.text().await.unwrap_or_default();
            return Err(format!("List messages for label {} API error: {}", label, err));
        }

        let json: Value = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse message list for label {}: {}", label, e))?;

        let mut fetched_ids = Vec::new();
        if let Some(messages) = json.get("messages").and_then(|m| m.as_array()) {
            for msg in messages {
                if let Some(id) = msg.get("id").and_then(|v| v.as_str()) {
                    fetched_ids.push(id.to_string());
                }
            }
        }

        let next_page_token = json.get("nextPageToken").and_then(|v| v.as_str()).map(|s| s.to_string());

        // For folder-specific syncing, we should ALWAYS fetch details to ensure we have up-to-date
        // metadata (unread status, labels, snippets, etc.). Since maxResults is 50, it is very fast.
        let chunk_size = 20;
        for chunk in fetched_ids.chunks(chunk_size) {
            let mut join_set = tokio::task::JoinSet::new();
            for msg_id in chunk {
                let client_clone = self.clone();
                let account_id_clone = account_id.to_string();
                let msg_id_clone = msg_id.clone();
                join_set.spawn(async move {
                    client_clone.fetch_message_detail(&account_id_clone, &msg_id_clone, false).await
                });
            }

            let mut details = Vec::new();
            while let Some(res) = join_set.join_next().await {
                if let Ok(Ok(detail)) = res {
                    details.push(detail);
                }
            }

            if !details.is_empty() {
                let conn = crate::db::open_connection(db_path)?;
                for detail in details {
                    crate::db::upsert_message_detail(&conn, &detail)?;
                }
            }
        }

        // Save new next_page_token to label_pagination table
        {
            let conn = crate::db::open_connection(db_path)?;
            crate::db::update_label_page_token(&conn, account_id, label, next_page_token.as_deref())?;
        }

        Ok(next_page_token)
    }

    // Sync incrementally using start_history_id
    pub async fn incremental_sync(
        &self,
        account_id: &str,
        start_history_id: &str,
        db_path: &std::path::Path,
    ) -> Result<(String, Vec<MessageDetail>), String> {
        let url = format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId={}&maxResults=100",
            start_history_id
        );
 
        let res = self
            .client
            .get(&url)
            .bearer_auth(&self.access_token)
            .send()
            .await
            .map_err(|e| format!("History API failed: {}", e))?;
 
        // If history has expired (404/400), trigger full sync fallback
        if res.status().as_u16() == 404 || res.status().as_u16() == 400 || res.status().as_u16() == 412 {
            println!("History ID {} expired. Executing full sync fallback.", start_history_id);
            return self.full_sync(account_id, db_path).await;
        }
 
        if !res.status().is_success() {
            let err = res.text().await.unwrap_or_default();
            return Err(format!("History API error: {}", err));
        }
 
        let json: Value = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse history: {}", e))?;
 
        // Retrieve latest history ID from response
        let next_history_id = json
            .get("historyId")
            .and_then(|v| v.as_str())
            .unwrap_or(start_history_id)
            .to_string();
 
        let mut to_fetch = HashSet::new();
        let mut to_delete = Vec::new();
 
        if let Some(history_records) = json.get("history").and_then(|h| h.as_array()) {
            for record in history_records {
                // 1. Messages Added
                if let Some(added) = record.get("messagesAdded").and_then(|a| a.as_array()) {
                    for add_record in added {
                        if let Some(id) = add_record.get("message").and_then(|m| m.get("id")).and_then(|i| i.as_str()) {
                            to_fetch.insert(id.to_string());
                        }
                    }
                }
 
                // 2. Labels Added/Removed (means we need to refresh the message metadata)
                if let Some(labels_added) = record.get("labelsAdded").and_then(|l| l.as_array()) {
                    for label_rec in labels_added {
                        if let Some(id) = label_rec.get("message").and_then(|m| m.get("id")).and_then(|i| i.as_str()) {
                            to_fetch.insert(id.to_string());
                        }
                    }
                }
                if let Some(labels_removed) = record.get("labelsRemoved").and_then(|l| l.as_array()) {
                    for label_rec in labels_removed {
                        if let Some(id) = label_rec.get("message").and_then(|m| m.get("id")).and_then(|i| i.as_str()) {
                            to_fetch.insert(id.to_string());
                        }
                    }
                }
 
                // 3. Messages Deleted
                if let Some(deleted) = record.get("messagesDeleted").and_then(|d| d.as_array()) {
                    for del_record in deleted {
                        if let Some(id) = del_record.get("message").and_then(|m| m.get("id")).and_then(|i| i.as_str()) {
                            to_delete.push(id.to_string());
                        }
                    }
                }
            }
        }
 
        // Apply deletions
        {
            let conn = crate::db::open_connection(db_path)?;
            for msg_id in to_delete {
                crate::db::delete_message(&conn, account_id, &msg_id)?;
            }
        }
 
        // Apply additions/updates
        let mut new_messages = Vec::new();
        for msg_id in to_fetch {
            match self.fetch_message_detail(account_id, &msg_id, false).await {
                Ok(detail) => {
                    let conn = crate::db::open_connection(db_path)?;
                    crate::db::upsert_message_detail(&conn, &detail)?;
                    new_messages.push(detail);
                }
                Err(e) => {
                    eprintln!("Failed to refresh message in sync: {}. Error: {}", msg_id, e);
                }
            }
        }
 
        // Update active history ID
        {
            let conn = crate::db::open_connection(db_path)?;
            crate::db::update_history_id(&conn, account_id, &next_history_id)?;
        }
 
        Ok((next_history_id, new_messages))
    }

    // Modify Labels (Gmail modify API)
    // We removed the database connection parameter here to keep the function free from holding !Send references across await points
    pub async fn modify_message_labels(
        &self,
        message_id: &str,
        add_labels: &[String],
        remove_labels: &[String],
    ) -> Result<Vec<String>, String> {
        let url = format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}/modify",
            message_id
        );

        let body = serde_json::json!({
            "addLabelIds": add_labels,
            "removeLabelIds": remove_labels
        });

        let res = self
            .client
            .post(&url)
            .bearer_auth(&self.access_token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Modify request failed: {}", e))?;

        if !res.status().is_success() {
            let err = res.text().await.unwrap_or_default();
            return Err(format!("Modify label API failed: {}", err));
        }

        let json: Value = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse modify response: {}", e))?;

        // Update local SQLite cache
        let mut labels = Vec::new();
        if let Some(label_ids) = json.get("labelIds").and_then(|v| v.as_array()) {
            for lid in label_ids {
                if let Some(s) = lid.as_str() {
                    labels.push(s.to_string());
                }
            }
        }

        Ok(labels)
    }

    // Batch Modify Labels (Gmail batchModify API)
    pub async fn batch_modify_messages(
        &self,
        ids: &[String],
        add_labels: &[String],
        remove_labels: &[String],
    ) -> Result<(), String> {
        if ids.is_empty() {
            return Ok(());
        }

        let url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify";

        let body = serde_json::json!({
            "ids": ids,
            "addLabelIds": add_labels,
            "removeLabelIds": remove_labels
        });

        let res = self
            .client
            .post(url)
            .bearer_auth(&self.access_token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Batch modify request failed: {}", e))?;

        if !res.status().is_success() {
            let err = res.text().await.unwrap_or_default();
            return Err(format!("Batch modify API failed: {}", err));
        }

        Ok(())
    }

    // Send MIME RFC 2822 email
    pub async fn send_email(
        &self,
        sender_email: &str,
        to: &str,
        subject: &str,
        body: &str,
        thread_id: Option<String>,
        attachments: Option<Vec<Attachment>>,
    ) -> Result<(), String> {
        let mut mime = String::new();
        
        // Headers
        mime.push_str(&format!("From: <{}>\r\n", sender_email));
        mime.push_str(&format!("To: <{}>\r\n", to));
        mime.push_str(&format!("Subject: {}\r\n", subject));
        mime.push_str("MIME-Version: 1.0\r\n");

        if let Some(ref tid) = thread_id {
            // Group email replies under the thread correctly
            mime.push_str(&format!("Thread-Topic: {}\r\n", subject));
            // Standard email reply headers (ideal, though threadId is key for Google)
            mime.push_str(&format!("References: {}\r\n", tid));
            mime.push_str(&format!("In-Reply-To: {}\r\n", tid));
        }

        let has_attachments = attachments.as_ref().map(|a| !a.is_empty()).unwrap_or(false);

        if has_attachments {
            let boundary = format!("----=_Part_{}", rand::random::<u64>());
            mime.push_str(&format!("Content-Type: multipart/mixed; boundary=\"{}\"\r\n\r\n", boundary));
            
            // First body part (HTML content)
            mime.push_str(&format!("--{}\r\n", boundary));
            mime.push_str("Content-Type: text/html; charset=utf-8\r\n");
            mime.push_str("Content-Transfer-Encoding: base64\r\n\r\n");
            
            let body_b64 = BASE64_STANDARD.encode(body.as_bytes());
            mime.push_str(&body_b64);
            mime.push_str("\r\n");

            // Attachments
            if let Some(atts) = attachments {
                for att in atts {
                    mime.push_str(&format!("--{}\r\n", boundary));
                    mime.push_str(&format!("Content-Type: {}; name=\"{}\"\r\n", att.mime_type, att.filename));
                    mime.push_str(&format!("Content-Disposition: attachment; filename=\"{}\"\r\n", att.filename));
                    mime.push_str("Content-Transfer-Encoding: base64\r\n\r\n");
                    mime.push_str(&att.content_b64);
                    mime.push_str("\r\n");
                }
            }
            
            mime.push_str(&format!("--{}--\r\n", boundary));
        } else {
            mime.push_str("Content-Type: text/html; charset=utf-8\r\n");
            mime.push_str("Content-Transfer-Encoding: base64\r\n\r\n");
            
            // Encode HTML body in base64
            let body_b64 = BASE64_STANDARD.encode(body.as_bytes());
            mime.push_str(&body_b64);
        }

        // Encode MIME message in Base64URL safe no padding
        let raw_b64url = BASE64_URL_SAFE_NO_PAD.encode(mime.as_bytes());

        // Send to Gmail API
        let url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
        
        let mut payload = serde_json::json!({
            "raw": raw_b64url
        });

        if let Some(tid) = thread_id {
            payload["threadId"] = serde_json::json!(tid);
        }

        let res = self
            .client
            .post(url)
            .bearer_auth(&self.access_token)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Send request failed: {}", e))?;

        if !res.status().is_success() {
            let err = res.text().await.unwrap_or_default();
            return Err(format!("Send API failed: {}", err));
        }

        Ok(())
    }
}
