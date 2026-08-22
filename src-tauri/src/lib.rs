mod capture;
mod database;
mod hooks;
mod models;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::Utc;
use models::{ProjectCount, PromptPage, Summary};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

const PROJECT_URL: &str = "https://github.com/chintan-diwakar/prompt-contribution-graph";

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        return app
            .path()
            .app_data_dir()
            .map(|path| path.join("prompts.sqlite"))
            .map_err(|error| error.to_string());
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let _ = app;
        database::legacy_database_path()
    }
}

fn hook_executable_path() -> Result<PathBuf, String> {
    #[cfg(target_os = "linux")]
    if let Some(appimage) = std::env::var_os("APPIMAGE") {
        return Ok(PathBuf::from(appimage));
    }
    std::env::current_exe().map_err(|error| error.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PromptRequest {
    limit: Option<i64>,
    offset: Option<i64>,
    query: Option<String>,
    project: Option<String>,
}

#[derive(Debug, Serialize)]
struct DeleteResult {
    deleted: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShareResult {
    mode: &'static str,
    file_path: String,
}

#[tauri::command]
fn get_summary(app: AppHandle, days: Option<i64>) -> Result<Summary, String> {
    let connection = database::open_database(&database_path(&app)?)?;
    database::get_summary(&connection, days.unwrap_or(371))
}

#[tauri::command]
fn list_projects(app: AppHandle) -> Result<Vec<ProjectCount>, String> {
    let connection = database::open_database(&database_path(&app)?)?;
    database::list_projects(&connection)
}

#[tauri::command]
fn list_prompts(app: AppHandle, request: PromptRequest) -> Result<PromptPage, String> {
    let connection = database::open_database(&database_path(&app)?)?;
    database::list_prompts(
        &connection,
        request.limit.unwrap_or(50),
        request.offset.unwrap_or(0),
        request.query.as_deref().unwrap_or(""),
        request.project.as_deref().unwrap_or(""),
    )
}

#[tauri::command]
fn delete_prompt(app: AppHandle, id: String) -> Result<DeleteResult, String> {
    let connection = database::open_database(&database_path(&app)?)?;
    let deleted = database::delete_prompt(&connection, &id)?;
    if !deleted {
        return Err("Prompt not found.".to_string());
    }
    Ok(DeleteResult { deleted })
}

#[tauri::command]
fn get_hook_status() -> Result<hooks::HookStatus, String> {
    hooks::status()
}

#[tauri::command]
fn install_hooks() -> Result<hooks::HookInstallResult, String> {
    let executable = hook_executable_path()?;
    hooks::install(&executable)
}

#[tauri::command]
fn share_activity(
    app: AppHandle,
    text: String,
    image_data_url: String,
) -> Result<ShareResult, String> {
    if image_data_url.len() > 14_000_000 {
        return Err("The activity image is too large.".to_string());
    }
    let encoded = image_data_url
        .strip_prefix("data:image/png;base64,")
        .ok_or("The activity image is not a PNG data URL.")?;
    let image = BASE64.decode(encoded).map_err(|error| error.to_string())?;
    if !image.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("The activity image does not contain valid PNG data.".to_string());
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let directory = app
        .path()
        .picture_dir()
        .map_err(|error| error.to_string())?
        .join("Prompt Contribution Graph");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let file_path = directory.join(format!(
        "Prompt-Contribution-Graph-activity-{}.png",
        Utc::now().format("%Y%m%dT%H%M%SZ")
    ));
    fs::write(&file_path, image).map_err(|error| error.to_string())?;

    let mut url =
        url::Url::parse("https://x.com/intent/tweet").map_err(|error| error.to_string())?;
    url.query_pairs_mut()
        .append_pair("text", &text.chars().take(240).collect::<String>())
        .append_pair("url", PROJECT_URL);
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|error| error.to_string())?;
    Ok(ShareResult {
        mode: "x",
        file_path: file_path.to_string_lossy().into_owned(),
    })
}

pub fn capture_mode_from_args() -> bool {
    let arguments: Vec<String> = std::env::args().collect();
    if !arguments
        .iter()
        .any(|argument| argument == "--capture-hook")
    {
        return false;
    }
    let source = arguments
        .windows(2)
        .find(|pair| pair[0] == "--source")
        .map(|pair| pair[1].as_str())
        .unwrap_or("claude");
    if let Err(error) = capture::capture_from_stdin(source) {
        eprintln!("Prompt Contribution Graph capture error: {error}");
    }
    print!("{{}}");
    true
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));

    builder
        .setup(|app| {
            let path = database_path(app.handle())?;
            database::open_database(&path).map_err(std::io::Error::other)?;
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            if !cfg!(debug_assertions) {
                if let Ok(executable) = hook_executable_path() {
                    if let Err(error) = hooks::install(&executable) {
                        eprintln!(
                            "Prompt Contribution Graph coding-agent hook install error: {error}"
                        );
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_summary,
            list_projects,
            list_prompts,
            delete_prompt,
            get_hook_status,
            install_hooks,
            share_activity
        ])
        .run(tauri::generate_context!())
        .expect("error while running Prompt Contribution Graph");
}
