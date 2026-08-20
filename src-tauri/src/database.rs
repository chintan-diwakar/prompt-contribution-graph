use crate::models::{
    DailyCount, ProjectCount, Prompt, PromptPage, Summary, ToolEvent, ToolSummary,
};
use chrono::{Local, NaiveDate, Utc};
use rusqlite::{params_from_iter, types::Value as SqlValue, Connection, OptionalExtension};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

pub fn legacy_data_directory() -> Result<PathBuf, String> {
    if let Some(directory) = std::env::var_os("PROMPTTRAIL_HOME") {
        return Ok(PathBuf::from(directory));
    }

    #[cfg(target_os = "windows")]
    {
        let base = std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .or_else(dirs::data_dir)
            .ok_or("Could not find the application data directory.")?;
        Ok(base.join("PromptTrail"))
    }

    #[cfg(target_os = "macos")]
    {
        dirs::home_dir()
            .map(|home| home.join("Library/Application Support/PromptTrail"))
            .ok_or_else(|| "Could not find the home directory.".to_string())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let base = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| dirs::home_dir().map(|home| home.join(".local/share")))
            .ok_or("Could not find the application data directory.")?;
        Ok(base.join("prompttrail"))
    }
}

pub fn legacy_database_path() -> Result<PathBuf, String> {
    Ok(legacy_data_directory()?.join("prompts.sqlite"))
}

fn create_private_directory(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| error.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn table_exists(connection: &Connection, table: &str) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
            [table],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())
}

fn columns(connection: &Connection, table: &str) -> Result<HashSet<String>, String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|error| error.to_string())?;
    let values = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?;
    values
        .collect::<Result<HashSet<_>, _>>()
        .map_err(|error| error.to_string())
}

fn backup_before_migration(connection: &Connection, database_path: &Path) -> Result<(), String> {
    let timestamp = Utc::now().format("%Y%m%dT%H%M%S%.3fZ");
    let backup_path = database_path.with_file_name(format!("prompts.sqlite.backup-{timestamp}"));
    connection
        .execute("VACUUM INTO ?1", [backup_path.to_string_lossy().as_ref()])
        .map_err(|error| format!("Could not back up the prompt database: {error}"))?;
    Ok(())
}

pub fn open_database(database_path: &Path) -> Result<Connection, String> {
    let parent = database_path
        .parent()
        .ok_or("The database path does not have a parent directory.")?;
    create_private_directory(parent)?;
    let existed = database_path.exists();
    let connection = Connection::open(database_path).map_err(|error| error.to_string())?;
    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;",
        )
        .map_err(|error| error.to_string())?;

    let had_prompts = table_exists(&connection, "prompts")?;
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS prompts (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                prompt TEXT NOT NULL,
                project_path TEXT NOT NULL,
                project_name TEXT NOT NULL,
                transcript_path TEXT,
                created_at INTEGER NOT NULL,
                response TEXT,
                response_status TEXT NOT NULL DEFAULT 'pending',
                response_error TEXT,
                completed_at INTEGER
            );",
        )
        .map_err(|error| error.to_string())?;

    let prompt_columns = columns(&connection, "prompts")?;
    let additions = [
        ("response", "TEXT"),
        ("response_status", "TEXT NOT NULL DEFAULT 'pending'"),
        ("response_error", "TEXT"),
        ("completed_at", "INTEGER"),
    ];
    let missing: Vec<_> = additions
        .iter()
        .filter(|(name, _)| !prompt_columns.contains(*name))
        .collect();
    if existed && had_prompts && !missing.is_empty() {
        backup_before_migration(&connection, database_path)?;
    }
    for (name, definition) in missing {
        connection
            .execute_batch(&format!(
                "ALTER TABLE prompts ADD COLUMN {name} {definition};"
            ))
            .map_err(|error| error.to_string())?;
    }

    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS tool_events (
                id TEXT PRIMARY KEY,
                prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
                session_id TEXT NOT NULL,
                tool_use_id TEXT NOT NULL UNIQUE,
                tool_name TEXT NOT NULL,
                status TEXT NOT NULL,
                duration_ms INTEGER,
                target TEXT,
                agent_id TEXT,
                agent_type TEXT,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_prompts_created_at ON prompts(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_prompts_project_name ON prompts(project_name);
            CREATE INDEX IF NOT EXISTS idx_tool_events_prompt_id ON tool_events(prompt_id, created_at ASC);
            CREATE INDEX IF NOT EXISTS idx_tool_events_session_id ON tool_events(session_id);",
        )
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

fn add_local_days(date: NaiveDate, amount: i64) -> NaiveDate {
    date.checked_add_signed(chrono::Duration::days(amount))
        .unwrap_or(date)
}

pub fn get_summary(connection: &Connection, days: i64) -> Result<Summary, String> {
    get_summary_for_date(connection, days, Local::now().date_naive())
}

fn get_summary_for_date(
    connection: &Connection,
    days: i64,
    today_date: NaiveDate,
) -> Result<Summary, String> {
    let mut statement = connection
        .prepare(
            "SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') AS date,
                    COUNT(*) AS count
             FROM prompts GROUP BY date ORDER BY date ASC",
        )
        .map_err(|error| error.to_string())?;
    let all_daily = statement
        .query_map([], |row| {
            Ok(DailyCount {
                date: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    let today_key = today_date.format("%Y-%m-%d").to_string();
    let start_key = add_local_days(today_date, -(days.max(1) - 1))
        .format("%Y-%m-%d")
        .to_string();
    let total = connection
        .query_row("SELECT COUNT(*) FROM prompts", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    let today = all_daily
        .iter()
        .find(|item| item.date == today_key)
        .map_or(0, |item| item.count);
    let active: HashSet<&str> = all_daily.iter().map(|item| item.date.as_str()).collect();
    let mut cursor = if active.contains(today_key.as_str()) {
        today_date
    } else {
        add_local_days(today_date, -1)
    };
    let mut current_streak = 0;
    while active.contains(cursor.format("%Y-%m-%d").to_string().as_str()) {
        current_streak += 1;
        cursor = add_local_days(cursor, -1);
    }
    let mut longest_streak = 0;
    let mut run = 0;
    let mut previous: Option<NaiveDate> = None;
    for item in &all_daily {
        let date =
            NaiveDate::parse_from_str(&item.date, "%Y-%m-%d").map_err(|error| error.to_string())?;
        run = if previous.is_some_and(|value| add_local_days(value, 1) == date) {
            run + 1
        } else {
            1
        };
        longest_streak = longest_streak.max(run);
        previous = Some(date);
    }
    let daily = all_daily
        .into_iter()
        .filter(|item| item.date >= start_key && item.date <= today_key)
        .collect();
    Ok(Summary {
        total,
        today,
        current_streak,
        longest_streak,
        daily,
    })
}

pub fn list_projects(connection: &Connection) -> Result<Vec<ProjectCount>, String> {
    let mut statement = connection
        .prepare(
            "SELECT project_name, COUNT(*) FROM prompts
             GROUP BY project_name ORDER BY COUNT(*) DESC, project_name ASC",
        )
        .map_err(|error| error.to_string())?;
    let projects = statement
        .query_map([], |row| {
            Ok(ProjectCount {
                name: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(projects)
}

fn escaped_search(value: &str) -> String {
    format!(
        "%{}%",
        value
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_")
    )
}

fn list_tools(connection: &Connection, prompt_id: &str) -> Result<Vec<ToolEvent>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, prompt_id, session_id, tool_use_id, tool_name, status, duration_ms,
                    target, agent_id, agent_type, created_at
             FROM tool_events WHERE prompt_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|error| error.to_string())?;
    let tools = statement
        .query_map([prompt_id], |row| {
            Ok(ToolEvent {
                id: row.get(0)?,
                prompt_id: row.get(1)?,
                session_id: row.get(2)?,
                tool_use_id: row.get(3)?,
                tool_name: row.get(4)?,
                status: row.get(5)?,
                duration_ms: row.get(6)?,
                target: row.get(7)?,
                agent_id: row.get(8)?,
                agent_type: row.get(9)?,
                created_at: row.get(10)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(tools)
}

pub fn list_prompts(
    connection: &Connection,
    limit: i64,
    offset: i64,
    query: &str,
    project: &str,
) -> Result<PromptPage, String> {
    let mut conditions = Vec::new();
    let mut values: Vec<SqlValue> = Vec::new();
    if !query.is_empty() {
        conditions.push("(prompt LIKE ? ESCAPE '\\' OR response LIKE ? ESCAPE '\\' OR project_name LIKE ? ESCAPE '\\')");
        let pattern = escaped_search(query);
        values.extend([
            pattern.clone().into(),
            pattern.clone().into(),
            pattern.into(),
        ]);
    }
    if !project.is_empty() {
        conditions.push("project_name = ?");
        values.push(project.to_string().into());
    }
    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };
    let count_sql = format!("SELECT COUNT(*) FROM prompts {where_clause}");
    let total = connection
        .query_row(&count_sql, params_from_iter(values.iter()), |row| {
            row.get(0)
        })
        .map_err(|error| error.to_string())?;
    let safe_limit = limit.clamp(1, 200);
    let safe_offset = offset.max(0);
    let sql = format!(
        "SELECT id, session_id, prompt, project_path, project_name, transcript_path, created_at,
                response, response_status, response_error, completed_at
         FROM prompts {where_clause} ORDER BY created_at DESC LIMIT ? OFFSET ?"
    );
    let mut page_values = values;
    page_values.push(safe_limit.into());
    page_values.push(safe_offset.into());
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params_from_iter(page_values.iter()), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, Option<String>>(9)?,
                row.get::<_, Option<i64>>(10)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    let changed_tools: HashSet<&str> = ["Edit", "Write", "MultiEdit", "NotebookEdit"]
        .into_iter()
        .collect();
    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let tools = list_tools(connection, &row.0)?;
        let changed_files: HashSet<&str> = tools
            .iter()
            .filter(|tool| {
                tool.status == "success" && changed_tools.contains(tool.tool_name.as_str())
            })
            .filter_map(|tool| tool.target.as_deref())
            .collect();
        let tool_summary = ToolSummary {
            count: tools.len(),
            failed: tools.iter().filter(|tool| tool.status == "failed").count(),
            duration_ms: tools.iter().filter_map(|tool| tool.duration_ms).sum(),
            files_changed: changed_files.len(),
        };
        items.push(Prompt {
            id: row.0,
            session_id: row.1,
            prompt: row.2,
            project_path: row.3,
            project_name: row.4,
            transcript_path: row.5,
            created_at: row.6,
            response: row.7,
            response_status: row.8,
            response_error: row.9,
            completed_at: row.10,
            duration_ms: row.10.map(|completed| (completed - row.6).max(0)),
            tools,
            tool_summary,
        });
    }
    Ok(PromptPage { total, items })
}

pub fn delete_prompt(connection: &Connection, id: &str) -> Result<bool, String> {
    connection
        .execute("DELETE FROM prompts WHERE id = ?1", [id])
        .map(|changes| changes > 0)
        .map_err(|error| error.to_string())
}

pub fn latest_prompt_id(
    connection: &Connection,
    session_id: &str,
) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT id FROM prompts WHERE session_id = ?1 ORDER BY created_at DESC LIMIT 1",
            [session_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())
}

pub fn local_project_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("Unknown project")
        .to_string()
}

pub fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Local, TimeZone};
    use uuid::Uuid;

    fn temporary_database() -> (PathBuf, Connection) {
        let directory = std::env::temp_dir().join(format!("prompttrail-rust-{}", Uuid::new_v4()));
        let path = directory.join("test.sqlite");
        let connection = open_database(&path).unwrap();
        (directory, connection)
    }

    #[test]
    fn calculates_summary_and_lists_prompt_details() {
        let (directory, connection) = temporary_database();
        let today = Local.with_ymd_and_hms(2026, 8, 13, 12, 0, 0).unwrap();
        let yesterday = Local.with_ymd_and_hms(2026, 8, 12, 12, 0, 0).unwrap();
        connection.execute(
            "INSERT INTO prompts VALUES (?1, 'session', 'Today', '/work/alpha', 'alpha', NULL, ?2, NULL, 'pending', NULL, NULL)",
            rusqlite::params!["today", today.timestamp_millis()],
        ).unwrap();
        connection.execute(
            "INSERT INTO prompts VALUES (?1, 'session', 'Yesterday', '/work/alpha', 'alpha', NULL, ?2, 'Done', 'completed', NULL, ?3)",
            rusqlite::params!["yesterday", yesterday.timestamp_millis(), yesterday.timestamp_millis() + 500],
        ).unwrap();
        connection.execute(
            "INSERT INTO tool_events VALUES ('tool', 'yesterday', 'session', 'tool-use', 'Write', 'success', 25, '/work/alpha/a.rs', NULL, NULL, ?1)",
            [yesterday.timestamp_millis() + 100],
        ).unwrap();

        let summary = get_summary_for_date(&connection, 371, today.date_naive()).unwrap();
        assert_eq!(summary.total, 2);
        assert_eq!(summary.today, 1);
        assert_eq!(summary.current_streak, 2);
        assert_eq!(summary.longest_streak, 2);
        let prompts = list_prompts(&connection, 50, 0, "Done", "alpha").unwrap();
        assert_eq!(prompts.total, 1);
        assert_eq!(prompts.items[0].tools.len(), 1);
        assert_eq!(prompts.items[0].tool_summary.files_changed, 1);

        drop(connection);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn backs_up_and_migrates_a_legacy_database() {
        let directory = std::env::temp_dir().join(format!("prompttrail-legacy-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("prompts.sqlite");
        let legacy = Connection::open(&path).unwrap();
        legacy.execute_batch(
            "CREATE TABLE prompts (
                id TEXT PRIMARY KEY, session_id TEXT NOT NULL, prompt TEXT NOT NULL,
                project_path TEXT NOT NULL, project_name TEXT NOT NULL,
                transcript_path TEXT, created_at INTEGER NOT NULL
            );
            INSERT INTO prompts VALUES ('old', 'session', 'Legacy', '/work/old', 'old', NULL, 100);",
        ).unwrap();
        drop(legacy);

        let migrated = open_database(&path).unwrap();
        let page = list_prompts(&migrated, 50, 0, "", "").unwrap();
        assert_eq!(page.items[0].id, "old");
        assert_eq!(page.items[0].response_status, "pending");
        drop(migrated);
        let backups = fs::read_dir(&directory)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("prompts.sqlite.backup-")
            })
            .count();
        assert_eq!(backups, 1);
        fs::remove_dir_all(directory).unwrap();
    }
}
