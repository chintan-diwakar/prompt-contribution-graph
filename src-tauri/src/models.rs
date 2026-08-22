use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyCount {
    pub date: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub total: i64,
    pub today: i64,
    pub current_streak: i64,
    pub longest_streak: i64,
    pub daily: Vec<DailyCount>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCount {
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolEvent {
    pub id: String,
    pub prompt_id: String,
    pub session_id: String,
    pub tool_use_id: String,
    pub tool_name: String,
    pub status: String,
    pub duration_ms: Option<i64>,
    pub target: Option<String>,
    pub agent_id: Option<String>,
    pub agent_type: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolSummary {
    pub count: usize,
    pub failed: usize,
    pub duration_ms: i64,
    pub files_changed: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Prompt {
    pub id: String,
    pub session_id: String,
    pub agent: String,
    pub prompt: String,
    pub project_path: String,
    pub project_name: String,
    pub transcript_path: Option<String>,
    pub created_at: i64,
    pub response: Option<String>,
    pub response_status: String,
    pub response_error: Option<String>,
    pub completed_at: Option<i64>,
    pub duration_ms: Option<i64>,
    pub tools: Vec<ToolEvent>,
    pub tool_summary: ToolSummary,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptPage {
    pub total: i64,
    pub items: Vec<Prompt>,
}
