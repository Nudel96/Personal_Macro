use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, SqlitePool};
use tauri::State;
use uuid::Uuid;

use crate::{
    commands::journal_scope::{require_active_account, require_trade_in_account},
    database::AppState,
    errors::{AppError, CommandResult},
};

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRecord {
    pub id: String,
    pub account_id: String,
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
    pub account_id: String,
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
pub async fn list_reviews(
    state: State<'_, AppState>,
    account_id: String,
) -> CommandResult<Vec<ReviewRecord>> {
    list_reviews_for_pool(&state.db, &account_id).await
}

pub(crate) async fn list_reviews_for_pool(
    db: &SqlitePool,
    account_id: &str,
) -> CommandResult<Vec<ReviewRecord>> {
    require_active_account(db, account_id).await?;
    sqlx::query_as::<_, ReviewRecord>("SELECT id, account_id, review_type, period_start, period_end, status, metric_snapshot_json, wins_html, challenges_html, lessons_html, actions_html, process_rating, completed_at, created_at, updated_at FROM reviews WHERE account_id = ? ORDER BY period_start DESC")
        .bind(account_id.trim())
        .fetch_all(db).await.map_err(AppError::from).map_err(Into::into)
}

#[tauri::command]
pub async fn save_review(
    state: State<'_, AppState>,
    input: ReviewInput,
) -> CommandResult<ReviewRecord> {
    save_review_for_pool(&state.db, input).await
}

pub(crate) async fn save_review_for_pool(
    db: &SqlitePool,
    input: ReviewInput,
) -> CommandResult<ReviewRecord> {
    require_active_account(db, &input.account_id).await?;
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
    let result = sqlx::query(r#"INSERT INTO reviews (id, account_id, review_type, period_start, period_end, status, metric_snapshot_json, wins_html, challenges_html, lessons_html, actions_html, process_rating, completed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET review_type=excluded.review_type, period_start=excluded.period_start, period_end=excluded.period_end, status=excluded.status, metric_snapshot_json=excluded.metric_snapshot_json, wins_html=excluded.wins_html, challenges_html=excluded.challenges_html, lessons_html=excluded.lessons_html, actions_html=excluded.actions_html, process_rating=excluded.process_rating, completed_at=excluded.completed_at, updated_at=excluded.updated_at
        WHERE reviews.account_id = excluded.account_id"#)
        .bind(&id).bind(input.account_id.trim()).bind(&input.review_type).bind(&input.period_start).bind(&input.period_end).bind(&input.status)
        .bind(input.metric_snapshot.to_string()).bind(&input.wins_html).bind(&input.challenges_html).bind(&input.lessons_html)
        .bind(&input.actions_html).bind(input.process_rating).bind(&completed_at).bind(&now).bind(&now)
        .execute(db).await.map_err(AppError::from)?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Review {id}")).into());
    }
    sqlx::query_as::<_, ReviewRecord>("SELECT id, account_id, review_type, period_start, period_end, status, metric_snapshot_json, wins_html, challenges_html, lessons_html, actions_html, process_rating, completed_at, created_at, updated_at FROM reviews WHERE id = ? AND account_id = ?")
        .bind(id).bind(input.account_id.trim()).fetch_one(db).await.map_err(AppError::from).map_err(Into::into)
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
    pub trade_count: Option<i64>,
}

#[tauri::command]
pub async fn list_playbook(
    state: State<'_, AppState>,
    account_id: Option<String>,
) -> CommandResult<Vec<PlaybookSetup>> {
    list_playbook_for_pool(&state.db, account_id.as_deref()).await
}

pub(crate) async fn list_playbook_for_pool(
    db: &SqlitePool,
    account_id: Option<&str>,
) -> CommandResult<Vec<PlaybookSetup>> {
    if let Some(account_id) = account_id {
        require_active_account(db, account_id).await?;
        return sqlx::query_as::<_, PlaybookSetup>(r#"SELECT s.id, s.name, s.description, s.color, st.name AS strategy_name,
            sv.id AS version_id, sv.version, sv.rules_json, sv.checklist_json, sv.examples_json, sv.notes_html,
            (SELECT COUNT(*) FROM trades t WHERE t.setup_id = s.id AND t.account_id = ? AND t.is_deleted = 0) AS trade_count
            FROM setups s LEFT JOIN strategies st ON st.id = s.strategy_id
            LEFT JOIN setup_versions sv ON sv.id = (SELECT id FROM setup_versions WHERE setup_id = s.id ORDER BY version DESC LIMIT 1)
            WHERE s.is_archived = 0 ORDER BY s.name"#)
            .bind(account_id.trim())
            .fetch_all(db)
            .await
            .map_err(AppError::from)
            .map_err(Into::into);
    }

    sqlx::query_as::<_, PlaybookSetup>(r#"SELECT s.id, s.name, s.description, s.color, st.name AS strategy_name,
        sv.id AS version_id, sv.version, sv.rules_json, sv.checklist_json, sv.examples_json, sv.notes_html,
        CAST(NULL AS INTEGER) AS trade_count
        FROM setups s LEFT JOIN strategies st ON st.id = s.strategy_id
        LEFT JOIN setup_versions sv ON sv.id = (SELECT id FROM setup_versions WHERE setup_id = s.id ORDER BY version DESC LIMIT 1)
        WHERE s.is_archived = 0 ORDER BY s.name"#)
        .fetch_all(db)
        .await
        .map_err(AppError::from)
        .map_err(Into::into)
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
    account_id: String,
) -> CommandResult<Vec<MistakeAnalytics>> {
    mistake_analytics_for_pool(&state.db, &account_id).await
}

pub(crate) async fn mistake_analytics_for_pool(
    db: &SqlitePool,
    account_id: &str,
) -> CommandResult<Vec<MistakeAnalytics>> {
    require_active_account(db, account_id).await?;
    sqlx::query_as::<_, MistakeAnalytics>(
        r#"SELECT m.id, m.name, m.category, m.description, m.countermeasure, m.color,
        COALESCE(scoped.occurrences, 0) AS occurrences,
        COALESCE(scoped.estimated_cost_minor, 0) AS estimated_cost_minor,
        scoped.average_severity
        FROM mistakes m
        LEFT JOIN (
            SELECT tm.mistake_id,
                COUNT(*) AS occurrences,
                COALESCE(SUM(tm.estimated_cost_minor), 0) AS estimated_cost_minor,
                AVG(CAST(tm.severity AS REAL)) AS average_severity
            FROM trade_mistakes tm
            JOIN trades t ON t.id = tm.trade_id
            WHERE t.account_id = ? AND t.is_deleted = 0
            GROUP BY tm.mistake_id
        ) scoped ON scoped.mistake_id = m.id
        WHERE m.is_archived = 0
        ORDER BY estimated_cost_minor DESC, occurrences DESC, m.name"#,
    )
    .bind(account_id.trim())
    .fetch_all(db)
    .await
    .map_err(AppError::from)
    .map_err(Into::into)
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
    account_id: String,
    trade_id: String,
) -> CommandResult<Vec<TradeMistakeRecord>> {
    list_trade_mistakes_for_pool(&state.db, &account_id, &trade_id).await
}

pub(crate) async fn list_trade_mistakes_for_pool(
    db: &SqlitePool,
    account_id: &str,
    trade_id: &str,
) -> CommandResult<Vec<TradeMistakeRecord>> {
    require_trade_in_account(db, account_id, trade_id).await?;
    sqlx::query_as::<_, TradeMistakeRecord>(
        "SELECT tm.mistake_id, m.name, tm.severity, tm.estimated_cost_minor, tm.note FROM trade_mistakes tm JOIN mistakes m ON m.id = tm.mistake_id WHERE tm.trade_id = ? ORDER BY tm.severity DESC, m.name",
    )
    .bind(trade_id.trim())
    .fetch_all(db)
    .await
    .map_err(AppError::from)
    .map_err(Into::into)
}

#[tauri::command]
pub async fn assign_trade_mistake(
    state: State<'_, AppState>,
    account_id: String,
    input: TradeMistakeInput,
) -> CommandResult<()> {
    assign_trade_mistake_for_pool(&state.db, &account_id, input).await
}

pub(crate) async fn assign_trade_mistake_for_pool(
    db: &SqlitePool,
    account_id: &str,
    input: TradeMistakeInput,
) -> CommandResult<()> {
    if !(1..=5).contains(&input.severity) {
        return Err(crate::errors::CommandError::validation(
            "Schweregrad muss zwischen 1 und 5 liegen.",
        ));
    }
    require_trade_in_account(db, account_id, &input.trade_id).await?;
    let result = sqlx::query("INSERT INTO trade_mistakes (trade_id, mistake_id, severity, estimated_cost_minor, note) SELECT ?, ?, ?, ?, ? FROM trades WHERE id = ? AND account_id = ? AND is_deleted = 0 ON CONFLICT(trade_id, mistake_id) DO UPDATE SET severity=excluded.severity, estimated_cost_minor=excluded.estimated_cost_minor, note=excluded.note")
        .bind(input.trade_id.trim()).bind(input.mistake_id).bind(input.severity).bind(input.estimated_cost_minor).bind(input.note)
        .bind(input.trade_id.trim()).bind(account_id.trim())
        .execute(db).await.map_err(AppError::from)?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Trade".into()).into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::{
        SqlitePool,
        sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    };
    use std::str::FromStr;

    async fn account_scope_database() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::from_str("sqlite::memory:")
                    .unwrap()
                    .foreign_keys(true),
            )
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        for id in ["account-a", "account-b"] {
            sqlx::query("INSERT INTO accounts (id, name, created_at, updated_at) VALUES (?, ?, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')")
                .bind(id)
                .bind(id)
                .execute(&pool)
                .await
                .unwrap();
        }
        pool
    }

    fn review(account_id: &str, id: Option<&str>) -> ReviewInput {
        ReviewInput {
            id: id.map(str::to_owned),
            account_id: account_id.into(),
            review_type: "weekly".into(),
            period_start: "2026-02-01".into(),
            period_end: "2026-02-07".into(),
            status: "draft".into(),
            metric_snapshot: serde_json::json!({}),
            wins_html: None,
            challenges_html: None,
            lessons_html: None,
            actions_html: None,
            process_rating: None,
        }
    }

    #[tokio::test]
    async fn workspace_account_scope_keeps_reviews_separate_and_blocks_cross_account_updates() {
        let pool = account_scope_database().await;
        sqlx::query("INSERT INTO reviews (id, account_id, review_type, period_start, period_end, status, metric_snapshot_json, created_at, updated_at) VALUES ('legacy-review', NULL, 'weekly', '2026-01-01', '2026-01-07', 'draft', '{}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')")
            .execute(&pool)
            .await
            .unwrap();
        let review_a = save_review_for_pool(&pool, review("account-a", Some("review-a")))
            .await
            .unwrap();
        let review_b = save_review_for_pool(&pool, review("account-b", Some("review-b")))
            .await
            .unwrap();

        let reviews_a = list_reviews_for_pool(&pool, "account-a").await.unwrap();
        assert_eq!(reviews_a.len(), 1);
        assert_eq!(reviews_a[0].id, review_a.id);
        assert_eq!(reviews_a[0].account_id, "account-a");
        let reviews_b = list_reviews_for_pool(&pool, "account-b").await.unwrap();
        assert_eq!(reviews_b.len(), 1);
        assert_eq!(reviews_b[0].id, review_b.id);

        let error = save_review_for_pool(&pool, review("account-b", Some("review-a")))
            .await
            .unwrap_err();
        assert_eq!(error.code, "NOT_FOUND");
        let unchanged = list_reviews_for_pool(&pool, "account-a").await.unwrap();
        assert_eq!(unchanged[0].account_id, "account-a");
    }

    #[tokio::test]
    async fn workspace_account_scope_filters_playbook_and_mistake_aggregates() {
        let pool = account_scope_database().await;
        let now = "2026-08-01T00:00:00Z";
        sqlx::query("INSERT INTO setups (id, name, created_at, updated_at) VALUES ('scope-setup', 'Scope Setup', ?, ?)")
            .bind(now)
            .bind(now)
            .execute(&pool)
            .await
            .unwrap();
        for (id, name) in [
            ("scope-mistake-used", "Scope Used"),
            ("scope-mistake-unused", "Scope Unused"),
        ] {
            sqlx::query(
                "INSERT INTO mistakes (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
            )
            .bind(id)
            .bind(name)
            .bind(now)
            .bind(now)
            .execute(&pool)
            .await
            .unwrap();
        }
        for (id, account_id, is_deleted) in [
            ("trade-a", "account-a", 0_i64),
            ("trade-b", "account-b", 0_i64),
            ("trade-a-deleted", "account-a", 1_i64),
        ] {
            sqlx::query("INSERT INTO trades (id, account_id, setup_id, status, instrument, asset_class, direction, display_timezone, is_deleted, created_at, updated_at) VALUES (?, ?, 'scope-setup', 'closed', 'EURUSD', 'forex', 'long', 'Europe/Berlin', ?, ?, ?)")
                .bind(id)
                .bind(account_id)
                .bind(is_deleted)
                .bind(now)
                .bind(now)
                .execute(&pool)
                .await
                .unwrap();
        }
        for (trade_id, severity, cost) in [
            ("trade-a", 2_i64, 100_i64),
            ("trade-b", 4_i64, 900_i64),
            ("trade-a-deleted", 5_i64, 500_i64),
        ] {
            sqlx::query("INSERT INTO trade_mistakes (trade_id, mistake_id, severity, estimated_cost_minor) VALUES (?, 'scope-mistake-used', ?, ?)")
                .bind(trade_id)
                .bind(severity)
                .bind(cost)
                .execute(&pool)
                .await
                .unwrap();
        }

        let playbook_without_account = list_playbook_for_pool(&pool, None).await.unwrap();
        let playbook_a = list_playbook_for_pool(&pool, Some("account-a"))
            .await
            .unwrap();
        let playbook_b = list_playbook_for_pool(&pool, Some("account-b"))
            .await
            .unwrap();
        let count = |rows: &[PlaybookSetup]| {
            rows.iter()
                .find(|row| row.id == "scope-setup")
                .and_then(|row| row.trade_count)
        };
        assert_eq!(count(&playbook_without_account), None);
        assert_eq!(count(&playbook_a), Some(1));
        assert_eq!(count(&playbook_b), Some(1));

        let mistakes_a = mistake_analytics_for_pool(&pool, "account-a")
            .await
            .unwrap();
        let mistakes_b = mistake_analytics_for_pool(&pool, "account-b")
            .await
            .unwrap();
        fn mistake<'a>(rows: &'a [MistakeAnalytics], id: &str) -> &'a MistakeAnalytics {
            rows.iter().find(|row| row.id == id).unwrap()
        }
        let used_a = mistake(&mistakes_a, "scope-mistake-used");
        assert_eq!(used_a.occurrences, 1);
        assert_eq!(used_a.estimated_cost_minor, 100);
        assert_eq!(used_a.average_severity, Some(2.0));
        let used_b = mistake(&mistakes_b, "scope-mistake-used");
        assert_eq!(used_b.occurrences, 1);
        assert_eq!(used_b.estimated_cost_minor, 900);
        assert_eq!(used_b.average_severity, Some(4.0));
        let unused_a = mistake(&mistakes_a, "scope-mistake-unused");
        assert_eq!(unused_a.occurrences, 0);
        assert_eq!(unused_a.estimated_cost_minor, 0);
        assert_eq!(unused_a.average_severity, None);

        let missing = mistake_analytics_for_pool(&pool, "missing")
            .await
            .unwrap_err();
        assert_eq!(missing.code, "ACCOUNT_NOT_FOUND");
        let blank = list_playbook_for_pool(&pool, Some(" ")).await.unwrap_err();
        assert_eq!(blank.code, "ACCOUNT_REQUIRED");
    }

    #[tokio::test]
    async fn trade_child_account_scope_blocks_foreign_mistake_reads_and_writes() {
        let pool = account_scope_database().await;
        let now = "2026-08-01T00:00:00Z";
        for (trade_id, account_id) in [("trade-a", "account-a"), ("trade-b", "account-b")] {
            sqlx::query("INSERT INTO trades (id, account_id, status, instrument, asset_class, direction, display_timezone, created_at, updated_at) VALUES (?, ?, 'closed', 'EURUSD', 'forex', 'long', 'Europe/Berlin', ?, ?)")
                .bind(trade_id)
                .bind(account_id)
                .bind(now)
                .bind(now)
                .execute(&pool)
                .await
                .unwrap();
        }
        sqlx::query("INSERT INTO mistakes (id, name, created_at, updated_at) VALUES ('mistake-b', 'Mistake B', ?, ?)")
            .bind(now)
            .bind(now)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO trade_mistakes (trade_id, mistake_id, severity, estimated_cost_minor, note) VALUES ('trade-b', 'mistake-b', 4, 900, 'original')")
            .execute(&pool)
            .await
            .unwrap();

        let read_error = list_trade_mistakes_for_pool(&pool, "account-a", "trade-b")
            .await
            .unwrap_err();
        assert_eq!(read_error.code, "NOT_FOUND");

        let write_error = assign_trade_mistake_for_pool(
            &pool,
            "account-a",
            TradeMistakeInput {
                trade_id: "trade-b".into(),
                mistake_id: "mistake-b".into(),
                severity: 1,
                estimated_cost_minor: Some(1),
                note: Some("foreign overwrite".into()),
            },
        )
        .await
        .unwrap_err();
        assert_eq!(write_error.code, "NOT_FOUND");

        let unchanged: (i64, Option<i64>, Option<String>) = sqlx::query_as(
            "SELECT severity, estimated_cost_minor, note FROM trade_mistakes WHERE trade_id = 'trade-b' AND mistake_id = 'mistake-b'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(unchanged, (4, Some(900), Some("original".into())));

        let owned = list_trade_mistakes_for_pool(&pool, "account-b", "trade-b")
            .await
            .unwrap();
        assert_eq!(owned.len(), 1);
        assert_eq!(owned[0].mistake_id, "mistake-b");
        assert_eq!(owned[0].severity, 4);

        assign_trade_mistake_for_pool(
            &pool,
            "account-b",
            TradeMistakeInput {
                trade_id: "trade-b".into(),
                mistake_id: "mistake-b".into(),
                severity: 3,
                estimated_cost_minor: Some(300),
                note: Some("owned update".into()),
            },
        )
        .await
        .unwrap();
        let updated = list_trade_mistakes_for_pool(&pool, "account-b", "trade-b")
            .await
            .unwrap();
        assert_eq!(updated[0].severity, 3);
        assert_eq!(updated[0].note.as_deref(), Some("owned update"));
    }
}
