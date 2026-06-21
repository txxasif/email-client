use std::env;
use std::fs;
use std::path::Path;

fn main() {
    tauri_build::build();

    let client_id = env::var("GOOGLE_CLIENT_ID")
        .unwrap_or_else(|_| {
            read_env_file_var("GOOGLE_CLIENT_ID").unwrap_or_default()
        });
    let client_secret = env::var("GOOGLE_CLIENT_SECRET")
        .unwrap_or_else(|_| {
            read_env_file_var("GOOGLE_CLIENT_SECRET").unwrap_or_default()
        });

    let out_dir = env::var_os("OUT_DIR").unwrap();
    let dest_path = Path::new(&out_dir).join("secrets.rs");
    fs::write(
        &dest_path,
        format!(
            "pub const GOOGLE_CLIENT_ID: &str = {:?};\npub const GOOGLE_CLIENT_SECRET: &str = {:?};\n",
            client_id, client_secret
        ),
    ).unwrap();
}

fn read_env_file_var(var_name: &str) -> Option<String> {
    if let Ok(content) = fs::read_to_string("../.env") {
        for line in content.lines() {
            let line = line.trim();
            if line.starts_with('#') || !line.contains('=') {
                continue;
            }
            let mut parts = line.splitn(2, '=');
            let name = parts.next()?.trim();
            let val = parts.next()?.trim().trim_matches('"').trim_matches('\'');
            if name == var_name {
                return Some(val.to_string());
            }
        }
    }
    None
}
