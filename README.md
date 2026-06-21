# AeroMail

AeroMail is a premium, multi-account Gmail desktop client built with **Tauri 2.x**, **Rust**, and **React/TypeScript**. It features a modern, slate-dark aesthetic with a cache-first architecture that delivers instant account switching and near-zero cold start times.

## Key Features
- **Multi-Account OAuth2 PKCE**: Secure Google OAuth authentication in the system browser with automatic redirect capture on local ports.
- **Secure Storage**: Refresh tokens are stored encrypted using the system keyring (GNOME Keyring / Secret Service on Linux). If a keyring is unavailable, a secure DB fallback encrypted via machine-id XOR is used.
- **Cache-First Local DB**: SQLite caching of messages (subject, sender, snippet, metadata, and body) for instant loading (<100ms account switching).
- **Background Sync**: Runs incremental synchronization in the background using the Gmail History API on focus or account toggle.
- **Safe Sandboxing**: Renders complex HTML emails securely in an isolated, sandboxed `iframe` with custom typography styling.
- **Interactive Actions**: Support for archiving, trashing, starring, marking read/unread, and composing threaded replies.

---

## 🛠️ Prerequisites & Setup

### 1. Google Cloud Console Configuration
Since this is for personal use, you must configure a Google Cloud Platform (GCP) project to access the Gmail API.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `AeroMail Client`).
3. Search for the **Gmail API** in the API Library and click **Enable**.
4. Go to **APIs & Services** > **OAuth consent screen**:
   - Select **External** (this allows you to authorize accounts under testing).
   - Fill in the App Name (e.g., `AeroMail`) and User Support Email.
   - Under **Scopes**, add `https://www.googleapis.com/auth/gmail.modify` (which permits read, write, label, archive, and trash permissions).
   - Under **Test users**, click **Add Users** and enter the Gmail addresses of the accounts you plan to use in the app. **CRITICAL: Only added test users will be able to log in.**
5. Go to **APIs & Services** > **Credentials**:
   - Click **Create Credentials** > **OAuth client ID**.
   - Select application type **Desktop app**.
   - Name it (e.g., `AeroMail Desktop`).
   - Click **Create** and copy the **Client ID** and **Client Secret**.

### 2. Configure Environment Variables
Create a `.env` file at the root of this project (already initialized for you as a template) and add your GCP credentials:

```env
GOOGLE_CLIENT_ID="your-client-id-here.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret-here"
```

During build or dev mode, Tauri's `build.rs` script reads this file at compile-time and safely injects the secrets into the binary.

---

## 🚀 Running the Application

### Install Frontend Dependencies
Ensure you have `pnpm` installed, then run:
```bash
pnpm install
```

### Run in Development Mode
To compile the Rust backend, compile frontend assets, and launch the Tauri window:
```bash
pnpm tauri dev
```

### Build for Production
To bundle a production-ready standalone executable:
```bash
pnpm tauri build
```
The compiled binaries will be generated inside `src-tauri/target/release/`.

---

## 📂 Project Architecture

```
├── .env                  <- Local Google OAuth secrets (ignored by git)
├── index.html            <- React mounting HTML
├── package.json          <- Node package manager configuration
├── src/
│   ├── App.tsx           <- React frontend main client UI
│   ├── main.tsx          <- React entry mount bootstrapping
│   └── styles.css        <- Premium slate-dark CSS stylesheet
└── src-tauri/
    ├── Cargo.toml        <- Rust crate dependencies
    ├── build.rs          <- Compile-time environment secrets injector
    └── src/
        ├── main.rs       <- Rust main entry point
        ├── lib.rs        <- Tauri command bindings & state management
        ├── auth.rs       <- OAuth PKCE logic & key/redirect capture server
        ├── db.rs         <- rusqlite schema and local query caching
        └── gmail.rs      <- reqwest HTTP requests & MIME RFC 2822 parsing
```

---

## 🔒 Security
- **No plaintext storage**: Your Google Refresh Tokens are never written to disk in plain text. They are saved in your OS Secure Keyring.
- **Sandboxed Content**: Emails are rendered inside a sandboxed `iframe` to prevent arbitrary JavaScript execution and ensure styling isolation from the shell application.
- **OAuth Loopback**: The OAuth callback server binds locally to `127.0.0.1` and opens a dynamic, random port. It terminates automatically upon receiving the auth token or after 5 minutes.
