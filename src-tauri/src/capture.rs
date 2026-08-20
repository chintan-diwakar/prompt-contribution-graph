use crate::database::{latest_prompt_id, local_project_name, now_ms, open_database};
use rusqlite::{params, Connection};
use serde_json::Value;
use std::io::{self, Read};
use uuid::Uuid;

const MAX_EVENT_BYTES: u64 = 1024 * 1024;

fn string_value<'a>(event: &'a Value, key: &str) -> Option<&'a str> {
    event.get(key).and_then(Value::as_str)
}

fn safe_tool_target(event: &Value) -> Option<String> {
    let tool_name = string_value(event, "tool_name")?;
    let input = event.get("tool_input")?;
    let key = match tool_name {
        "Read" | "Write" | "Edit" | "MultiEdit" => "file_path",
        "NotebookEdit" => "notebook_path",
        "Glob" | "Grep" => "path",
        "Skill" => "skill",
        "Agent" | "Task" => {
            return input
                .get("subagent_type")
                .and_then(Value::as_str)
                .or_else(|| string_value(event, "agent_type"))
                .map(str::to_string)
        }
        "WebFetch" => {
            return input
                .get("url")
                .and_then(Value::as_str)
                .and_then(|value| url::Url::parse(value).ok())
                .and_then(|url| url.host_str().map(str::to_string))
        }
        _ => return None,
    };
    input.get(key).and_then(Value::as_str).map(str::to_string)
}

pub fn save_hook_event(connection: &Connection, event: &Value) -> Result<(), String> {
    let event_name = string_value(event, "hook_event_name")
        .ok_or("The hook input does not contain an event name.")?;
    let session_id = string_value(event, "session_id").unwrap_or("unknown");
    let created_at = now_ms();

    match event_name {
        "UserPromptSubmit" => {
            let prompt = string_value(event, "prompt")
                .filter(|value| !value.trim().is_empty())
                .ok_or("The hook input does not contain a prompt.")?;
            let project_path = string_value(event, "cwd").unwrap_or("");
            connection
                .execute(
                    "INSERT INTO prompts (
                        id, session_id, prompt, project_path, project_name, transcript_path, created_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![
                        Uuid::new_v4().to_string(), session_id, prompt, project_path,
                        local_project_name(project_path), string_value(event, "transcript_path"), created_at
                    ],
                )
                .map_err(|error| error.to_string())?;
        }
        "Stop" | "StopFailure" => {
            let Some(prompt_id) = latest_prompt_id(connection, session_id)? else {
                return Ok(());
            };
            let failed = event_name == "StopFailure";
            let error = if failed {
                string_value(event, "error_details")
                    .or_else(|| string_value(event, "error"))
                    .unwrap_or("unknown")
                    .into()
            } else {
                None
            };
            connection
                .execute(
                    "UPDATE prompts SET response = ?1, response_status = ?2,
                     response_error = ?3, completed_at = ?4 WHERE id = ?5",
                    params![
                        string_value(event, "last_assistant_message"),
                        if failed { "failed" } else { "completed" },
                        error,
                        created_at,
                        prompt_id
                    ],
                )
                .map_err(|error| error.to_string())?;
        }
        "PostToolUse" | "PostToolUseFailure" => {
            let tool_name = string_value(event, "tool_name")
                .ok_or("The hook input does not contain tool metadata.")?;
            let tool_use_id = string_value(event, "tool_use_id")
                .ok_or("The hook input does not contain tool metadata.")?;
            let Some(prompt_id) = latest_prompt_id(connection, session_id)? else {
                return Ok(());
            };
            connection
                .execute(
                    "INSERT OR IGNORE INTO tool_events (
                        id, prompt_id, session_id, tool_use_id, tool_name, status, duration_ms,
                        target, agent_id, agent_type, created_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                    params![
                        Uuid::new_v4().to_string(),
                        prompt_id,
                        session_id,
                        tool_use_id,
                        tool_name,
                        if event_name == "PostToolUse" {
                            "success"
                        } else {
                            "failed"
                        },
                        event.get("duration_ms").and_then(Value::as_i64),
                        safe_tool_target(event),
                        string_value(event, "agent_id"),
                        string_value(event, "agent_type"),
                        created_at
                    ],
                )
                .map_err(|error| error.to_string())?;
        }
        other => {
            return Err(format!(
                "Prompt Contribution Graph does not support the {other} hook event."
            ))
        }
    }
    Ok(())
}

pub fn capture_from_stdin() -> Result<(), String> {
    let mut bytes = Vec::new();
    io::stdin()
        .take(MAX_EVENT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_EVENT_BYTES {
        return Err("The hook input is larger than 1 MiB.".to_string());
    }
    let event: Value = serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
    let database_path = crate::database::legacy_database_path()?;
    let connection = open_database(&database_path)?;
    save_hook_event(&connection, &event)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::list_prompts;

    #[test]
    fn stores_only_safe_hook_metadata() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(
            "CREATE TABLE prompts (
                id TEXT PRIMARY KEY, session_id TEXT NOT NULL, prompt TEXT NOT NULL,
                project_path TEXT NOT NULL, project_name TEXT NOT NULL, transcript_path TEXT,
                created_at INTEGER NOT NULL, response TEXT,
                response_status TEXT NOT NULL DEFAULT 'pending', response_error TEXT, completed_at INTEGER
            );
            CREATE TABLE tool_events (
                id TEXT PRIMARY KEY, prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
                session_id TEXT NOT NULL, tool_use_id TEXT NOT NULL UNIQUE, tool_name TEXT NOT NULL,
                status TEXT NOT NULL, duration_ms INTEGER, target TEXT, agent_id TEXT,
                agent_type TEXT, created_at INTEGER NOT NULL
            );",
        ).unwrap();
        save_hook_event(
            &connection,
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit", "session_id": "one",
                "prompt": "Update the file", "cwd": "/work/project"
            }),
        )
        .unwrap();
        save_hook_event(
            &connection,
            &serde_json::json!({
                "hook_event_name": "PostToolUse", "session_id": "one", "tool_use_id": "tool-one",
                "tool_name": "Bash", "tool_input": { "command": "echo private-value" },
                "tool_response": { "content": "private-output" }
            }),
        )
        .unwrap();
        let page = list_prompts(&connection, 50, 0, "", "").unwrap();
        let encoded = serde_json::to_string(&page).unwrap();
        assert!(!encoded.contains("private-value"));
        assert!(!encoded.contains("private-output"));
        assert_eq!(page.items[0].tools[0].target, None);
    }
}
