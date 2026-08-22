use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

pub const HOOK_ID: &str = "prompttrail-local-v1";
pub const CLAUDE_HOOK_EVENTS: [&str; 5] = [
    "UserPromptSubmit",
    "Stop",
    "StopFailure",
    "PostToolUse",
    "PostToolUseFailure",
];
pub const CODEX_HOOK_EVENTS: [&str; 3] = ["UserPromptSubmit", "Stop", "PostToolUse"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentHookStatus {
    pub installed: bool,
    pub installed_events: Vec<String>,
    pub missing_events: Vec<String>,
    pub settings_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookStatus {
    pub supported: bool,
    pub installed: bool,
    pub claude: AgentHookStatus,
    pub codex: AgentHookStatus,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookInstallResult {
    pub supported: bool,
    pub changed: bool,
    pub claude_changed: bool,
    pub codex_changed: bool,
    pub claude_settings_path: Option<String>,
    pub codex_settings_path: Option<String>,
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn claude_settings_path() -> Result<PathBuf, String> {
    let directory = std::env::var_os("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|home| home.join(".claude")))
        .ok_or("Could not find the Claude configuration directory.")?;
    Ok(directory.join("settings.json"))
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn codex_hooks_path() -> Result<PathBuf, String> {
    let directory = std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|home| home.join(".codex")))
        .ok_or("Could not find the Codex configuration directory.")?;
    Ok(directory.join("hooks.json"))
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn quote_command_part(path: &Path) -> String {
    #[cfg(target_os = "windows")]
    return format!("\"{}\"", path.to_string_lossy().replace('"', "\\\""));
    #[cfg(not(target_os = "windows"))]
    return format!("'{}'", path.to_string_lossy().replace('\'', "'\\''"));
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn hook_command(executable: &Path, source: &str) -> String {
    format!(
        "{} --capture-hook --source {source} --hook-id {HOOK_ID}",
        quote_command_part(executable),
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
fn install_at(
    path: &Path,
    events: &[&str],
    command: &str,
    description: Option<&str>,
) -> Result<bool, String> {
    let mut settings = read_settings(&path)?;
    if !settings.is_object() {
        return Err("The hooks file must contain a JSON object.".to_string());
    }
    if let Some(description) = description {
        settings
            .as_object_mut()
            .unwrap()
            .entry("description")
            .or_insert_with(|| Value::String(description.to_string()));
    }
    let hooks = settings
        .as_object_mut()
        .unwrap()
        .entry("hooks")
        .or_insert_with(|| json!({}));
    if !hooks.is_object() {
        return Err("The hooks field must contain a JSON object.".to_string());
    }
    let mut changed = false;
    for event in events {
        let groups = hooks
            .as_object_mut()
            .unwrap()
            .entry(*event)
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
                if hook.get("command").and_then(Value::as_str) != Some(command) {
                    hook["command"] = Value::String(command.to_string());
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
        write_settings(path, &settings)?;
    }
    Ok(changed)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn install(executable: &Path) -> Result<HookInstallResult, String> {
    let claude_path = claude_settings_path()?;
    let codex_path = codex_hooks_path()?;
    let claude_changed = install_at(
        &claude_path,
        &CLAUDE_HOOK_EVENTS,
        &hook_command(executable, "claude"),
        None,
    )?;
    let codex_changed = install_at(
        &codex_path,
        &CODEX_HOOK_EVENTS,
        &hook_command(executable, "codex"),
        Some("Prompt Contribution Graph activity hooks for Codex."),
    )?;
    Ok(HookInstallResult {
        supported: true,
        changed: claude_changed || codex_changed,
        claude_changed,
        codex_changed,
        claude_settings_path: Some(claude_path.to_string_lossy().into_owned()),
        codex_settings_path: Some(codex_path.to_string_lossy().into_owned()),
    })
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn install(_executable: &Path) -> Result<HookInstallResult, String> {
    Ok(HookInstallResult {
        supported: false,
        changed: false,
        claude_changed: false,
        codex_changed: false,
        claude_settings_path: None,
        codex_settings_path: None,
    })
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn status_at(path: &Path, events: &[&str]) -> Result<AgentHookStatus, String> {
    let settings = read_settings(path)?;
    let installed_events: Vec<String> = events
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
    let missing_events = events
        .iter()
        .filter(|event| {
            !installed_events
                .iter()
                .any(|installed| installed == **event)
        })
        .map(|event| (*event).to_string())
        .collect();
    Ok(AgentHookStatus {
        installed: installed_events.len() == events.len(),
        installed_events,
        missing_events,
        settings_path: Some(path.to_string_lossy().into_owned()),
    })
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn status() -> Result<HookStatus, String> {
    let claude = status_at(&claude_settings_path()?, &CLAUDE_HOOK_EVENTS)?;
    let codex = status_at(&codex_hooks_path()?, &CODEX_HOOK_EVENTS)?;
    Ok(HookStatus {
        supported: true,
        installed: claude.installed && codex.installed,
        claude,
        codex,
    })
}

#[cfg(all(test, not(any(target_os = "android", target_os = "ios"))))]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn installs_codex_hooks_without_replacing_existing_hooks() {
        let directory =
            std::env::temp_dir().join(format!("prompttrail-codex-hooks-{}", Uuid::new_v4()));
        let path = directory.join("hooks.json");
        fs::create_dir_all(&directory).unwrap();
        fs::write(
            &path,
            r#"{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"existing-hook"}]}]}}"#,
        )
        .unwrap();
        let command = "'/Applications/Prompt Contribution Graph.app/Contents/MacOS/Prompt Contribution Graph' --capture-hook --source codex --hook-id prompttrail-local-v1";

        assert!(install_at(
            &path,
            &CODEX_HOOK_EVENTS,
            command,
            Some("Prompt Contribution Graph activity hooks for Codex."),
        )
        .unwrap());
        assert!(!install_at(
            &path,
            &CODEX_HOOK_EVENTS,
            command,
            Some("Prompt Contribution Graph activity hooks for Codex."),
        )
        .unwrap());
        let settings = read_settings(&path).unwrap();
        assert_eq!(settings["hooks"]["Stop"].as_array().unwrap().len(), 2);
        assert!(status_at(&path, &CODEX_HOOK_EVENTS).unwrap().installed);
        assert!(PathBuf::from(format!("{}.prompttrail.bak", path.to_string_lossy())).exists());

        fs::remove_dir_all(directory).unwrap();
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn status() -> Result<HookStatus, String> {
    Ok(HookStatus {
        supported: false,
        installed: false,
        claude: AgentHookStatus {
            installed: false,
            installed_events: Vec::new(),
            missing_events: Vec::new(),
            settings_path: None,
        },
        codex: AgentHookStatus {
            installed: false,
            installed_events: Vec::new(),
            missing_events: Vec::new(),
            settings_path: None,
        },
    })
}
