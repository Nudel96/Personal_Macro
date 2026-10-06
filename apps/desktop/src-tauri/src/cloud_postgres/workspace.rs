use chrono::Utc;
use serde_json::Value;
use sqlx::PgConnection;
use uuid::Uuid;

use super::common::{argument, encoded, require_active_account, require_trade_in_account};
use super::{CloudError, CloudResult};
use crate::commands::{
    GoalInput, GoalProgressInput, GoalRecord, MistakeAnalytics, PlaybookSetup, ReviewInput,
    ReviewRecord, SetupVersionInput, TradeMistakeInput, TradeMistakeRecord,
};
use crate::errors::AppError;

pub(super) const COMMANDS: &[(&str, bool)] = &[
    ("list_reviews", false),
    ("save_review", true),
    ("list_goals", false),
    ("save_goal", true),
    ("record_goal_progress", true),
    ("list_playbook", false),
    ("create_setup_version", true),
    ("get_mistake_analytics", false),
    ("list_trade_mistakes", false),
    ("assign_trade_mistake", true),
];

/// Uses only the caller's connection so domain writes share the receipt transaction.
pub(super) async fn dispatch(
    db: &mut PgConnection,
    name: &str,
    args: &Value,
) -> CloudResult<Value> {
    match name {
        "list_reviews" => encoded(list_reviews(db, &argument::<String>(args, "accountId")?).await?),
        "save_review" => encoded(save_review(db, argument(args, "input")?).await?),
        "list_goals" => encoded(list_goals(db).await?),
        "save_goal" => encoded(save_goal(db, argument(args, "input")?).await?),
        "record_goal_progress" => {
            encoded(record_goal_progress(db, argument(args, "input")?).await?)
        }
        "list_playbook" => encoded(
            list_playbook(
                db,
                argument::<Option<String>>(args, "accountId")?.as_deref(),
            )
            .await?,
        ),
        "create_setup_version" => {
            encoded(create_setup_version(db, argument(args, "input")?).await?)
        }
        "get_mistake_analytics" => {
            encoded(get_mistake_analytics(db, &argument::<String>(args, "accountId")?).await?)
        }
        "list_trade_mistakes" => encoded(
            list_trade_mistakes(
                db,
                &argument::<String>(args, "accountId")?,
                &argument::<String>(args, "tradeId")?,
            )
            .await?,
        ),
        "assign_trade_mistake" => encoded(
            assign_trade_mistake(
                db,
                &argument::<String>(args, "accountId")?,
                argument(args, "input")?,
            )
            .await?,
        ),
        _ => Err(CloudError {
            code: "WEB_COMMAND_NOT_ALLOWED".into(),
            message: "Diese Funktion ist im privaten Webzugriff nicht verfügbar.".into(),
        }),
    }
}

pub(super) async fn list_reviews(
    db: &mut PgConnection,
    account_id: &str,
) -> CloudResult<Vec<ReviewRecord>> {
    require_active_account(db, account_id).await?;
    sqlx::query_as::<_, ReviewRecord>("SELECT id, account_id, review_type, period_start, period_end, status, metric_snapshot_json, wins_html, challenges_html, lessons_html, actions_html, process_rating, completed_at, created_at, updated_at FROM reviews WHERE account_id = $1 ORDER BY period_start DESC")
        .bind(account_id.trim())
        .fetch_all(&mut *db).await.map_err(CloudError::from)
}

pub(super) async fn save_review(
    db: &mut PgConnection,
    input: ReviewInput,
) -> CloudResult<ReviewRecord> {
    require_active_account(db, &input.account_id).await?;
    if !matches!(input.review_type.as_str(), "daily" | "weekly" | "monthly") {
        return Err(CloudError::validation("Ungültiger Review-Typ."));
    }
    if input.period_start.is_empty() || input.period_end.is_empty() {
        return Err(CloudError::validation("Review-Zeitraum fehlt."));
    }
    if input
        .process_rating
        .is_some_and(|value| !(1..=10).contains(&value))
    {
        return Err(CloudError::validation(
            "Prozessbewertung muss zwischen 1 und 10 liegen.",
        ));
    }
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();
    let completed_at = (input.status == "completed").then(|| now.clone());
    let result = sqlx::query(r#"INSERT INTO reviews (id, account_id, review_type, period_start, period_end, status, metric_snapshot_json, wins_html, challenges_html, lessons_html, actions_html, process_rating, completed_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT(id) DO UPDATE SET review_type=excluded.review_type, period_start=excluded.period_start, period_end=excluded.period_end, status=excluded.status, metric_snapshot_json=excluded.metric_snapshot_json, wins_html=excluded.wins_html, challenges_html=excluded.challenges_html, lessons_html=excluded.lessons_html, actions_html=excluded.actions_html, process_rating=excluded.process_rating, completed_at=excluded.completed_at, updated_at=excluded.updated_at
        WHERE reviews.account_id = excluded.account_id"#)
        .bind(&id).bind(input.account_id.trim()).bind(&input.review_type).bind(&input.period_start).bind(&input.period_end).bind(&input.status)
        .bind(input.metric_snapshot.to_string()).bind(&input.wins_html).bind(&input.challenges_html).bind(&input.lessons_html)
        .bind(&input.actions_html).bind(input.process_rating).bind(&completed_at).bind(&now).bind(&now)
        .execute(&mut *db).await.map_err(CloudError::from)?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Review {id}")).into());
    }
    sqlx::query_as::<_, ReviewRecord>("SELECT id, account_id, review_type, period_start, period_end, status, metric_snapshot_json, wins_html, challenges_html, lessons_html, actions_html, process_rating, completed_at, created_at, updated_at FROM reviews WHERE id = $1 AND account_id = $2")
        .bind(id).bind(input.account_id.trim()).fetch_one(&mut *db).await.map_err(CloudError::from)
}

pub(super) async fn list_goals(db: &mut PgConnection) -> CloudResult<Vec<GoalRecord>> {
    sqlx::query_as::<_, GoalRecord>(r#"SELECT g.id, g.name, g.description, g.metric_key, g.target_value, g.unit, g.direction, g.starts_at, g.ends_at, g.status,
        (SELECT gp.value FROM goal_progress gp WHERE gp.goal_id = g.id ORDER BY gp.recorded_at DESC LIMIT 1) AS latest_value, g.updated_at
        FROM goals g WHERE g.status != 'archived' ORDER BY CASE g.status WHEN 'active' THEN 0 ELSE 1 END, g.ends_at NULLS FIRST, g.created_at DESC"#)
        .fetch_all(&mut *db).await.map_err(CloudError::from)
}

pub(super) async fn save_goal(db: &mut PgConnection, input: GoalInput) -> CloudResult<GoalRecord> {
    if input.name.trim().is_empty() || input.metric_key.trim().is_empty() {
        return Err(CloudError::validation(
            "Zielname und Messgröße sind erforderlich.",
        ));
    }
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();
    sqlx::query(r#"INSERT INTO goals (id, name, description, metric_key, target_value, unit, direction, starts_at, ends_at, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, metric_key=excluded.metric_key, target_value=excluded.target_value, unit=excluded.unit, direction=excluded.direction, starts_at=excluded.starts_at, ends_at=excluded.ends_at, status=excluded.status, updated_at=excluded.updated_at"#)
        .bind(&id).bind(input.name.trim()).bind(&input.description).bind(&input.metric_key).bind(&input.target_value)
        .bind(&input.unit).bind(&input.direction).bind(&input.starts_at).bind(&input.ends_at).bind(&input.status).bind(&now).bind(&now)
        .execute(&mut *db).await.map_err(CloudError::from)?;
    sqlx::query_as::<_, GoalRecord>(r#"SELECT g.id, g.name, g.description, g.metric_key, g.target_value, g.unit, g.direction, g.starts_at, g.ends_at, g.status,
        (SELECT gp.value FROM goal_progress gp WHERE gp.goal_id = g.id ORDER BY gp.recorded_at DESC LIMIT 1) AS latest_value, g.updated_at FROM goals g WHERE g.id = $1"#)
        .bind(id).fetch_one(&mut *db).await.map_err(CloudError::from)
}

pub(super) async fn record_goal_progress(
    db: &mut PgConnection,
    input: GoalProgressInput,
) -> CloudResult<()> {
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO goal_progress (id, goal_id, recorded_at, value, source, note, created_at) VALUES ($1, $2, $3, $4, 'manual', $5, $6)")
        .bind(Uuid::new_v4().to_string()).bind(input.goal_id).bind(&now).bind(input.value).bind(input.note).bind(&now)
        .execute(&mut *db).await.map_err(CloudError::from)?;
    Ok(())
}

pub(super) async fn list_playbook(
    db: &mut PgConnection,
    account_id: Option<&str>,
) -> CloudResult<Vec<PlaybookSetup>> {
    if let Some(account_id) = account_id {
        require_active_account(db, account_id).await?;
        return sqlx::query_as::<_, PlaybookSetup>(r#"SELECT s.id, s.name, s.description, s.color, st.name AS strategy_name,
            sv.id AS version_id, sv.version, sv.rules_json, sv.checklist_json, sv.examples_json, sv.notes_html,
            (SELECT COUNT(*) FROM trades t WHERE t.setup_id = s.id AND t.account_id = $1 AND t.is_deleted = FALSE) AS trade_count
            FROM setups s LEFT JOIN strategies st ON st.id = s.strategy_id
            LEFT JOIN setup_versions sv ON sv.id = (SELECT id FROM setup_versions WHERE setup_id = s.id ORDER BY version DESC LIMIT 1)
            WHERE s.is_archived = FALSE ORDER BY s.name"#)
            .bind(account_id.trim())
            .fetch_all(&mut *db)
            .await
            .map_err(CloudError::from);
    }

    sqlx::query_as::<_, PlaybookSetup>(r#"SELECT s.id, s.name, s.description, s.color, st.name AS strategy_name,
        sv.id AS version_id, sv.version, sv.rules_json, sv.checklist_json, sv.examples_json, sv.notes_html,
        CAST(NULL AS BIGINT) AS trade_count
        FROM setups s LEFT JOIN strategies st ON st.id = s.strategy_id
        LEFT JOIN setup_versions sv ON sv.id = (SELECT id FROM setup_versions WHERE setup_id = s.id ORDER BY version DESC LIMIT 1)
        WHERE s.is_archived = FALSE ORDER BY s.name"#)
        .fetch_all(&mut *db)
        .await
        .map_err(CloudError::from)
}

pub(super) async fn create_setup_version(
    db: &mut PgConnection,
    input: SetupVersionInput,
) -> CloudResult<()> {
    let version: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(version), 0) + 1 FROM setup_versions WHERE setup_id = $1",
    )
    .bind(&input.setup_id)
    .fetch_one(&mut *db)
    .await
    .map_err(CloudError::from)?;
    sqlx::query("INSERT INTO setup_versions (id, setup_id, version, rules_json, checklist_json, examples_json, notes_html, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)")
        .bind(Uuid::new_v4().to_string()).bind(input.setup_id).bind(version).bind(input.rules.to_string())
        .bind(input.checklist.to_string()).bind(input.examples.to_string()).bind(input.notes_html).bind(Utc::now().to_rfc3339())
        .execute(&mut *db).await.map_err(CloudError::from)?;
    Ok(())
}

pub(super) async fn get_mistake_analytics(
    db: &mut PgConnection,
    account_id: &str,
) -> CloudResult<Vec<MistakeAnalytics>> {
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
                CAST(COALESCE(SUM(tm.estimated_cost_minor), 0) AS BIGINT) AS estimated_cost_minor,
                AVG(CAST(tm.severity AS DOUBLE PRECISION)) AS average_severity
            FROM trade_mistakes tm
            JOIN trades t ON t.id = tm.trade_id
            WHERE t.account_id = $1 AND t.is_deleted = FALSE
            GROUP BY tm.mistake_id
        ) scoped ON scoped.mistake_id = m.id
        WHERE m.is_archived = FALSE
        ORDER BY estimated_cost_minor DESC, occurrences DESC, m.name"#,
    )
    .bind(account_id.trim())
    .fetch_all(&mut *db)
    .await
    .map_err(CloudError::from)
}

pub(super) async fn list_trade_mistakes(
    db: &mut PgConnection,
    account_id: &str,
    trade_id: &str,
) -> CloudResult<Vec<TradeMistakeRecord>> {
    require_trade_in_account(db, account_id, trade_id).await?;
    sqlx::query_as::<_, TradeMistakeRecord>(
        "SELECT tm.mistake_id, m.name, tm.severity, tm.estimated_cost_minor, tm.note FROM trade_mistakes tm JOIN mistakes m ON m.id = tm.mistake_id WHERE tm.trade_id = $1 ORDER BY tm.severity DESC, m.name",
    )
    .bind(trade_id.trim())
    .fetch_all(&mut *db)
    .await
    .map_err(CloudError::from)
}

pub(super) async fn assign_trade_mistake(
    db: &mut PgConnection,
    account_id: &str,
    input: TradeMistakeInput,
) -> CloudResult<()> {
    if !(1..=5).contains(&input.severity) {
        return Err(CloudError::validation(
            "Schweregrad muss zwischen 1 und 5 liegen.",
        ));
    }
    require_trade_in_account(db, account_id, &input.trade_id).await?;
    let result = sqlx::query("INSERT INTO trade_mistakes (trade_id, mistake_id, severity, estimated_cost_minor, note) SELECT $1, $2, $3, $4, $5 FROM trades WHERE id = $6 AND account_id = $7 AND is_deleted = FALSE ON CONFLICT(trade_id, mistake_id) DO UPDATE SET severity=excluded.severity, estimated_cost_minor=excluded.estimated_cost_minor, note=excluded.note")
        .bind(input.trade_id.trim()).bind(input.mistake_id).bind(input.severity).bind(input.estimated_cost_minor).bind(input.note)
        .bind(input.trade_id.trim()).bind(account_id.trim())
        .execute(&mut *db).await.map_err(CloudError::from)?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Trade".into()).into());
    }
    Ok(())
}
