use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use tauri::State;
use uuid::Uuid;

use crate::{
    database::AppState,
    errors::{AppError, CommandResult},
};

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRecord {
    pub id: String,
    pub review_type: String,
    pub period_start: String,
    pub period_end: String,
    pub status: String,
    pub metric_snapshot_json: String,
    pub wins_html: Option<String>,
    pub challenges_html: Option<String>,
    pub lessons_html: Option<String>,
    pub actions_html: Option<String>,
    pub process_rating: Option<i64>,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewInput {
    pub id: Option<String>,
    pub review_type: String,
    pub period_start: String,
    pub period_end: String,
    pub status: String,
    #[serde(default)]
    pub metric_snapshot: Value,
    pub wins_html: Option<String>,
    pub challenges_html: Option<String>,
    pub lessons_html: Option<String>,
    pub actions_html: Option<String>,
    pub process_rating: Option<i64>,
}

#[tauri::command]
pub async fn list_reviews(state: State<'_, AppState>) -> CommandResult<Vec<ReviewRecord>> {
    sqlx::query_as::<_, ReviewRecord>("SELECT id, review_type, period_start, period_end, status, metric_snapshot_json, wins_html, challenges_html, lessons_html, actions_html, process_rating, completed_at, created_at, updated_at FROM reviews ORDER BY period_start DESC")
        .fetch_all(&state.db).await.map_err(AppError::from).map_err(Into::into)
}

#[tauri::command]
pub async fn save_review(
    state: State<'_, AppState>,
    input: ReviewInput,
) -> CommandResult<ReviewRecord> {
    if !matches!(input.review_type.as_str(), "daily" | "weekly" | "monthly") {
        return Err(crate::errors::CommandError::validation(
            "Ungültiger Review-Typ.",
        ));
    }
    if input.period_start.is_empty() || input.period_end.is_empty() {
        return Err(crate::errors::CommandError::validation(
            "Review-Zeitraum fehlt.",
        ));
    }
    if input
        .process_rating
        .is_some_and(|value| !(1..=10).contains(&value))
    {
        return Err(crate::errors::CommandError::validation(
            "Prozessbewertung muss zwischen 1 und 10 liegen.",
        ));
    }
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();
    let completed_at = (input.status == "completed").then(|| now.clone());
    sqlx::query(r#"INSERT INTO reviews (id, review_type, period_start, period_end, status, metric_snapshot_json, wins_html, challenges_html, lessons_html, actions_html, process_rating, completed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET review_type=excluded.review_type, period_start=excluded.period_start, period_end=excluded.period_end, status=excluded.status, metric_snapshot_json=excluded.metric_snapshot_json, wins_html=excluded.wins_html, challenges_html=excluded.challenges_html, lessons_html=excluded.lessons_html, actions_html=excluded.actions_html, process_rating=excluded.process_rating, completed_at=excluded.completed_at, updated_at=excluded.updated_at"#)
        .bind(&id).bind(&input.review_type).bind(&input.period_start).bind(&input.period_end).bind(&input.status)
        .bind(input.metric_snapshot.to_string()).bind(&input.wins_html).bind(&input.challenges_html).bind(&input.lessons_html)
        .bind(&input.actions_html).bind(input.process_rating).bind(&completed_at).bind(&now).bind(&now)
        .execute(&state.db).await.map_err(AppError::from)?;
    sqlx::query_as::<_, ReviewRecord>("SELECT id, review_type, period_start, period_end, status, metric_snapshot_json, wins_html, challenges_html, lessons_html, actions_html, process_rating, completed_at, created_at, updated_at FROM reviews WHERE id = ?")
        .bind(id).fetch_one(&state.db).await.map_err(AppError::from).map_err(Into::into)
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GoalRecord {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub metric_key: String,
    pub target_value: String,
    pub unit: String,
    pub direction: String,
    pub starts_at: String,
    pub ends_at: Option<String>,
    pub status: String,
    pub latest_value: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalInput {
    pub id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub metric_key: String,
    pub target_value: String,
    pub unit: String,
    pub direction: String,
    pub starts_at: String,
    pub ends_at: Option<String>,
    pub status: String,
}

#[tauri::command]
pub async fn list_goals(state: State<'_, AppState>) -> CommandResult<Vec<GoalRecord>> {
    sqlx::query_as::<_, GoalRecord>(r#"SELECT g.id, g.name, g.description, g.metric_key, g.target_value, g.unit, g.direction, g.starts_at, g.ends_at, g.status,
        (SELECT gp.value FROM goal_progress gp WHERE gp.goal_id = g.id ORDER BY gp.recorded_at DESC LIMIT 1) AS latest_value, g.updated_at
        FROM goals g WHERE g.status != 'archived' ORDER BY CASE g.status WHEN 'active' THEN 0 ELSE 1 END, g.ends_at, g.created_at DESC"#)
        .fetch_all(&state.db).await.map_err(AppError::from).map_err(Into::into)
}

#[tauri::command]
pub async fn save_goal(state: State<'_, AppState>, input: GoalInput) -> CommandResult<GoalRecord> {
    if input.name.trim().is_empty() || input.metric_key.trim().is_empty() {
        return Err(crate::errors::CommandError::validation(
            "Zielname und Messgröße sind erforderlich.",
        ));
    }
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();
    sqlx::query(r#"INSERT INTO goals (id, name, description, metric_key, target_value, unit, direction, starts_at, ends_at, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, metric_key=excluded.metric_key, target_value=excluded.target_value, unit=excluded.unit, direction=excluded.direction, starts_at=excluded.starts_at, ends_at=excluded.ends_at, status=excluded.status, updated_at=excluded.updated_at"#)
        .bind(&id).bind(input.name.trim()).bind(&input.description).bind(&input.metric_key).bind(&input.target_value)
        .bind(&input.unit).bind(&input.direction).bind(&input.starts_at).bind(&input.ends_at).bind(&input.status).bind(&now).bind(&now)
        .execute(&state.db).await.map_err(AppError::from)?;
    sqlx::query_as::<_, GoalRecord>(r#"SELECT g.id, g.name, g.description, g.metric_key, g.target_value, g.unit, g.direction, g.starts_at, g.ends_at, g.status,
        (SELECT gp.value FROM goal_progress gp WHERE gp.goal_id = g.id ORDER BY gp.recorded_at DESC LIMIT 1) AS latest_value, g.updated_at FROM goals g WHERE g.id = ?"#)
        .bind(id).fetch_one(&state.db).await.map_err(AppError::from).map_err(Into::into)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalProgressInput {
    pub goal_id: String,
    pub value: String,
    pub note: Option<String>,
}

#[tauri::command]
pub async fn record_goal_progress(
    state: State<'_, AppState>,
    input: GoalProgressInput,
) -> CommandResult<()> {
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO goal_progress (id, goal_id, recorded_at, value, source, note, created_at) VALUES (?, ?, ?, ?, 'manual', ?, ?)")
        .bind(Uuid::new_v4().to_string()).bind(input.goal_id).bind(&now).bind(input.value).bind(input.note).bind(&now)
        .execute(&state.db).await.map_err(AppError::from)?;
    Ok(())
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PlaybookSetup {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: String,
    pub strategy_name: Option<String>,
    pub version_id: Option<String>,
    pub version: Option<i64>,
    pub rules_json: Option<String>,
    pub checklist_json: Option<String>,
    pub examples_json: Option<String>,
    pub notes_html: Option<String>,
    pub trade_count: i64,
}

#[tauri::command]
pub async fn list_playbook(state: State<'_, AppState>) -> CommandResult<Vec<PlaybookSetup>> {
    sqlx::query_as::<_, PlaybookSetup>(r#"SELECT s.id, s.name, s.description, s.color, st.name AS strategy_name,
        sv.id AS version_id, sv.version, sv.rules_json, sv.checklist_json, sv.examples_json, sv.notes_html,
        (SELECT COUNT(*) FROM trades t WHERE t.setup_id = s.id AND t.is_deleted = 0) AS trade_count
        FROM setups s LEFT JOIN strategies st ON st.id = s.strategy_id
        LEFT JOIN setup_versions sv ON sv.id = (SELECT id FROM setup_versions WHERE setup_id = s.id ORDER BY version DESC LIMIT 1)
        WHERE s.is_archived = 0 ORDER BY s.name"#)
        .fetch_all(&state.db).await.map_err(AppError::from).map_err(Into::into)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupVersionInput {
    pub setup_id: String,
    pub rules: Value,
    pub checklist: Value,
    pub examples: Value,
    pub notes_html: Option<String>,
}

#[tauri::command]
pub async fn create_setup_version(
    state: State<'_, AppState>,
    input: SetupVersionInput,
) -> CommandResult<()> {
    let version: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(version), 0) + 1 FROM setup_versions WHERE setup_id = ?",
    )
    .bind(&input.setup_id)
    .fetch_one(&state.db)
    .await
    .map_err(AppError::from)?;
    sqlx::query("INSERT INTO setup_versions (id, setup_id, version, rules_json, checklist_json, examples_json, notes_html, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string()).bind(input.setup_id).bind(version).bind(input.rules.to_string())
        .bind(input.checklist.to_string()).bind(input.examples.to_string()).bind(input.notes_html).bind(Utc::now().to_rfc3339())
        .execute(&state.db).await.map_err(AppError::from)?;
    Ok(())
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MistakeAnalytics {
    pub id: String,
    pub name: String,
    pub category: String,
    pub description: Option<String>,
    pub countermeasure: Option<String>,
    pub color: String,
    pub occurrences: i64,
    pub estimated_cost_minor: i64,
    pub average_severity: Option<f64>,
}

#[tauri::command]
pub async fn get_mistake_analytics(
    state: State<'_, AppState>,
) -> CommandResult<Vec<MistakeAnalytics>> {
    sqlx::query_as::<_, MistakeAnalytics>(r#"SELECT m.id, m.name, m.category, m.description, m.countermeasure, m.color,
        COUNT(tm.trade_id) AS occurrences, COALESCE(SUM(tm.estimated_cost_minor), 0) AS estimated_cost_minor,
        AVG(CAST(tm.severity AS REAL)) AS average_severity
        FROM mistakes m LEFT JOIN trade_mistakes tm ON tm.mistake_id = m.id
        WHERE m.is_archived = 0 GROUP BY m.id ORDER BY estimated_cost_minor DESC, occurrences DESC, m.name"#)
        .fetch_all(&state.db).await.map_err(AppError::from).map_err(Into::into)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeMistakeInput {
    pub trade_id: String,
    pub mistake_id: String,
    pub severity: i64,
    pub estimated_cost_minor: Option<i64>,
    pub note: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TradeMistakeRecord {
    pub mistake_id: String,
    pub name: String,
    pub severity: i64,
    pub estimated_cost_minor: Option<i64>,
    pub note: Option<String>,
}

#[tauri::command]
pub async fn list_trade_mistakes(
    state: State<'_, AppState>,
    trade_id: String,
) -> CommandResult<Vec<TradeMistakeRecord>> {
    sqlx::query_as::<_, TradeMistakeRecord>(
        "SELECT tm.mistake_id, m.name, tm.severity, tm.estimated_cost_minor, tm.note FROM trade_mistakes tm JOIN mistakes m ON m.id = tm.mistake_id WHERE tm.trade_id = ? ORDER BY tm.severity DESC, m.name",
    )
    .bind(trade_id)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)
    .map_err(Into::into)
}

#[tauri::command]
pub async fn assign_trade_mistake(
    state: State<'_, AppState>,
    input: TradeMistakeInput,
) -> CommandResult<()> {
    if !(1..=5).contains(&input.severity) {
        return Err(crate::errors::CommandError::validation(
            "Schweregrad muss zwischen 1 und 5 liegen.",
        ));
    }
    sqlx::query("INSERT INTO trade_mistakes (trade_id, mistake_id, severity, estimated_cost_minor, note) VALUES (?, ?, ?, ?, ?) ON CONFLICT(trade_id, mistake_id) DO UPDATE SET severity=excluded.severity, estimated_cost_minor=excluded.estimated_cost_minor, note=excluded.note")
        .bind(input.trade_id).bind(input.mistake_id).bind(input.severity).bind(input.estimated_cost_minor).bind(input.note)
        .execute(&state.db).await.map_err(AppError::from)?;
    Ok(())
}
