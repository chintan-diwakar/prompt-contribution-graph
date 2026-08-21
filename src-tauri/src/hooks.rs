use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

pub const HOOK_ID: &str = "prompttrail-local-v1";
pub const HOOK_EVENTS: [&str; 5] = [
    "UserPromptSubmit",
    "Stop",
    "StopFailure",
    "PostToolUse",
    "PostToolUseFailure",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookStatus {
    pub supported: bool,
    pub installed: bool,
    pub installed_events: Vec<String>,
    pub missing_events: Vec<String>,
    pub settings_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookInstallResult {
    pub supported: bool,
    pub changed: bool,
    pub settings_path: Option<String>,
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn settings_path() -> Result<PathBuf, String> {
    let directory = std::env::var_os("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|home| home.join(".claude")))
        .ok_or("Could not find the Claude configuration directory.")?;
    Ok(directory.join("settings.json"))
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn quote_command_part(path: &Path) -> String {
    #[cfg(target_os = "windows")]
    return format!("\"{}\"", path.to_string_lossy().replace('"', "\\\""));
    #[cfg(not(target_os = "windows"))]
    return format!("'{}'", path.to_string_lossy().replace('\'', "'\\''"));
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn hook_command(executable: &Path) -> String {
    format!(
        "{} --capture-hook --hook-id {HOOK_ID}",
        quote_command_part(executable)
    )
}

fn is_prompttrail_hook(value: &Value) -> bool {
    value.get("type").and_then(Value::as_str) == Some("command")
        && value
            .get("command")
            .and_then(Value::as_str)
            .is_some_and(|command| command.contains(&format!("--hook-id {HOOK_ID}")))
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn read_settings(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(json!({}));
    }
    let source = fs::read_to_string(path).map_err(|error| error.to_string())?;
    if source.trim().is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_str(&source).map_err(|error| error.to_string())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn write_settings(path: &Path, settings: &Value) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or("The settings path does not have a parent directory.")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    if path.exists() {
        fs::copy(path, format!("{}.prompttrail.bak", path.to_string_lossy()))
            .map_err(|error| error.to_string())?;
    }
    let temporary = PathBuf::from(format!("{}.prompttrail.tmp", path.to_string_lossy()));
    let mut source = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    source.push('\n');
    fs::write(&temporary, source).map_err(|error| error.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temporary, fs::Permissions::from_mode(0o600))
            .map_err(|error| error.to_string())?;
    }
    fs::rename(temporary, path).map_err(|error| error.to_string())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn install(executable: &Path) -> Result<HookInstallResult, String> {
    let path = settings_path()?;
    let mut settings = read_settings(&path)?;
    if !settings.is_object() {
        return Err("Claude settings must contain a JSON object.".to_string());
    }
    let hooks = settings
        .as_object_mut()
        .unwrap()
        .entry("hooks")
        .or_insert_with(|| json!({}));
    if !hooks.is_object() {
        return Err("The hooks field in Claude settings must contain an object.".to_string());
    }
    let command = hook_command(executable);
    let mut changed = false;
    for event in HOOK_EVENTS {
        let groups = hooks
            .as_object_mut()
            .unwrap()
            .entry(event)
            .or_insert_with(|| json!([]));
        let array = groups
            .as_array_mut()
            .ok_or_else(|| format!("The {event} hook setting must be an array."))?;
        let mut found = false;
        for group in array.iter_mut() {
            let Some(entries) = group.get_mut("hooks").and_then(Value::as_array_mut) else {
                continue;
            };
            for hook in entries {
                if !is_prompttrail_hook(hook) {
                    continue;
                }
                found = true;
                if hook.get("command").and_then(Value::as_str) != Some(command.as_str()) {
                    hook["command"] = Value::String(command.clone());
                    changed = true;
                }
            }
        }
        if !found {
            array.push(json!({
                "matcher": "",
                "hooks": [{ "type": "command", "command": command, "timeout": 5 }]
            }));
            changed = true;
        }
    }
    if changed {
        write_settings(&path, &settings)?;
    }
    Ok(HookInstallResult {
        supported: true,
        changed,
        settings_path: Some(path.to_string_lossy().into_owned()),
    })
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn install(_executable: &Path) -> Result<HookInstallResult, String> {
    Ok(HookInstallResult {
        supported: false,
        changed: false,
        settings_path: None,
    })
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn status() -> Result<HookStatus, String> {
    let path = settings_path()?;
    let settings = read_settings(&path)?;
    let installed_events: Vec<String> = HOOK_EVENTS
        .iter()
        .filter(|event| {
            settings["hooks"][**event].as_array().is_some_and(|groups| {
                groups.iter().any(|group| {
                    group["hooks"]
                        .as_array()
                        .is_some_and(|hooks| hooks.iter().any(is_prompttrail_hook))
                })
            })
        })
        .map(|event| (*event).to_string())
        .collect();
    let missing_events = HOOK_EVENTS
        .iter()
        .filter(|event| {
            !installed_events
                .iter()
                .any(|installed| installed == **event)
        })
        .map(|event| (*event).to_string())
        .collect();
    Ok(HookStatus {
        supported: true,
        installed: installed_events.len() == HOOK_EVENTS.len(),
        installed_events,
        missing_events,
        settings_path: Some(path.to_string_lossy().into_owned()),
    })
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn status() -> Result<HookStatus, String> {
    Ok(HookStatus {
        supported: false,
        installed: false,
        installed_events: Vec::new(),
        missing_events: Vec::new(),
        settings_path: None,
    })
}
