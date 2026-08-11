use serde::Serialize;
use sqlx::FromRow;
use tauri::State;

use crate::{
    database::AppState,
    domain::models::{CalendarDay, TradeFilter},
    errors::{AppError, CommandResult},
    metrics::{self, DashboardMetrics},
    repositories::trades,
};

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GroupPerformance {
    pub key: String,
    pub label: String,
    pub trades: i64,
    pub wins: i64,
    pub net_pnl_minor: i64,
    pub total_r: f64,
    pub average_r: Option<f64>,
    pub win_rate: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardResponse {
    pub metrics: DashboardMetrics,
    pub calendar: Vec<CalendarDay>,
    pub setup_performance: Vec<GroupPerformance>,
    pub weekday_performance: Vec<GroupPerformance>,
    pub session_performance: Vec<GroupPerformance>,
    pub timeframe_performance: Vec<GroupPerformance>,
    pub instrument_performance: Vec<GroupPerformance>,
    pub direction_performance: Vec<GroupPerformance>,
    pub account_performance: Vec<GroupPerformance>,
    pub asset_class_performance: Vec<GroupPerformance>,
    pub generated_at: String,
    pub filter: TradeFilter,
}

#[tauri::command]
pub async fn calculate_dashboard(
    state: State<'_, AppState>,
    filter: Option<TradeFilter>,
) -> CommandResult<DashboardResponse> {
    let filter = filter.unwrap_or_default();
    let metric_trades = trades::metric_trades(&state.db, &filter).await?;
    let metrics = metrics::calculate_dashboard(&metric_trades);
    let calendar = calendar_data(&state, &filter).await?;
    let setup_performance = group_performance(&state, &filter, "setup").await?;
    let weekday_performance = group_performance(&state, &filter, "weekday").await?;
    let session_performance = group_performance(&state, &filter, "session").await?;
    let timeframe_performance = group_performance(&state, &filter, "timeframe").await?;
    let instrument_performance = group_performance(&state, &filter, "instrument").await?;
    let direction_performance = group_performance(&state, &filter, "direction").await?;
    let account_performance = group_performance(&state, &filter, "account").await?;
    let asset_class_performance = group_performance(&state, &filter, "asset_class").await?;
    Ok(DashboardResponse {
        metrics,
        calendar,
        setup_performance,
        weekday_performance,
        session_performance,
        timeframe_performance,
        instrument_performance,
        direction_performance,
        account_performance,
        asset_class_performance,
        generated_at: chrono::Utc::now().to_rfc3339(),
        filter,
    })
}

#[tauri::command]
pub async fn calculate_calendar(
    state: State<'_, AppState>,
    filter: Option<TradeFilter>,
) -> CommandResult<Vec<CalendarDay>> {
    calendar_data(&state, &filter.unwrap_or_default()).await
}

async fn calendar_data(state: &AppState, filter: &TradeFilter) -> CommandResult<Vec<CalendarDay>> {
    sqlx::query_as::<_, CalendarDay>(
        r#"SELECT substr(closed_at, 1, 10) AS date,
          COALESCE(SUM(net_pnl_minor), 0) AS net_pnl_minor,
          COALESCE(SUM(CAST(calculated_r AS REAL)), 0.0) AS total_r,
          COUNT(*) AS trades,
          SUM(CASE WHEN net_pnl_minor > 0 THEN 1 ELSE 0 END) AS wins,
          SUM(CASE WHEN net_pnl_minor < 0 THEN 1 ELSE 0 END) AS losses
        FROM trades
        WHERE is_deleted = 0 AND status = 'closed' AND closed_at IS NOT NULL AND net_pnl_minor IS NOT NULL
          AND (? IS NULL OR closed_at >= ?)
          AND (? IS NULL OR closed_at <= ?)
          AND (? IS NULL OR account_id IN (SELECT value FROM json_each(?)))
          AND (? IS NULL OR setup_id IN (SELECT value FROM json_each(?)))
          AND (? IS NULL OR instrument IN (SELECT value FROM json_each(?)))
          AND (? IS NULL OR direction IN (SELECT value FROM json_each(?)))
        GROUP BY substr(closed_at, 1, 10)
        ORDER BY date"#,
    )
    .bind(&filter.date_from).bind(&filter.date_from)
    .bind(&filter.date_to).bind(&filter.date_to)
    .bind(serialized(&filter.account_ids)).bind(serialized(&filter.account_ids))
    .bind(serialized(&filter.setup_ids)).bind(serialized(&filter.setup_ids))
    .bind(serialized(&filter.instruments)).bind(serialized(&filter.instruments))
    .bind(serialized(&filter.directions)).bind(serialized(&filter.directions))
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)
    .map_err(Into::into)
}

async fn group_performance(
    state: &AppState,
    filter: &TradeFilter,
    group: &str,
) -> CommandResult<Vec<GroupPerformance>> {
    let (key_expression, label_expression, join_clause) = match group {
        "setup" => (
            "COALESCE(t.setup_id, 'unassigned')",
            "COALESCE(s.name, 'Ohne Setup')",
            "LEFT JOIN setups s ON s.id = t.setup_id",
        ),
        "weekday" => (
            "strftime('%w', t.closed_at)",
            "CASE strftime('%w', t.closed_at) WHEN '0' THEN 'So' WHEN '1' THEN 'Mo' WHEN '2' THEN 'Di' WHEN '3' THEN 'Mi' WHEN '4' THEN 'Do' WHEN '5' THEN 'Fr' ELSE 'Sa' END",
            "",
        ),
        "session" => (
            "COALESCE(t.session, 'unknown')",
            "COALESCE(t.session, 'Unbekannt')",
            "",
        ),
        "timeframe" => (
            "COALESCE(t.timeframe, 'unknown')",
            "COALESCE(t.timeframe, 'Unbekannt')",
            "",
        ),
        "instrument" => ("t.instrument", "t.instrument", ""),
        "direction" => (
            "t.direction",
            "CASE t.direction WHEN 'long' THEN 'Long' ELSE 'Short' END",
            "",
        ),
        "asset_class" => ("t.asset_class", "t.asset_class", ""),
        "account" => (
            "COALESCE(t.account_id, 'unassigned')",
            "COALESCE(a.name, 'Ohne Konto')",
            "LEFT JOIN accounts a ON a.id = t.account_id",
        ),
        _ => return Err(AppError::Validation("Unbekannte Gruppierung.".into()).into()),
    };
    let query = format!(
        r#"SELECT {key_expression} AS key, {label_expression} AS label,
          COUNT(*) AS trades,
          SUM(CASE WHEN t.net_pnl_minor > 0 THEN 1 ELSE 0 END) AS wins,
          COALESCE(SUM(t.net_pnl_minor), 0) AS net_pnl_minor,
          COALESCE(SUM(CAST(t.calculated_r AS REAL)), 0.0) AS total_r,
          AVG(CAST(t.calculated_r AS REAL)) AS average_r,
          CAST(SUM(CASE WHEN t.net_pnl_minor > 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) AS win_rate
        FROM trades t {join_clause}
        WHERE t.is_deleted = 0 AND t.status = 'closed' AND t.closed_at IS NOT NULL AND t.net_pnl_minor IS NOT NULL
          AND (? IS NULL OR t.closed_at >= ?)
          AND (? IS NULL OR t.closed_at <= ?)
          AND (? IS NULL OR t.account_id IN (SELECT value FROM json_each(?)))
          AND (? IS NULL OR t.setup_id IN (SELECT value FROM json_each(?)))
          AND (? IS NULL OR t.instrument IN (SELECT value FROM json_each(?)))
          AND (? IS NULL OR t.direction IN (SELECT value FROM json_each(?)))
        GROUP BY {key_expression}, {label_expression}
        ORDER BY net_pnl_minor DESC"#
    );
    sqlx::query_as::<_, GroupPerformance>(&query)
        .bind(&filter.date_from)
        .bind(&filter.date_from)
        .bind(&filter.date_to)
        .bind(&filter.date_to)
        .bind(serialized(&filter.account_ids))
        .bind(serialized(&filter.account_ids))
        .bind(serialized(&filter.setup_ids))
        .bind(serialized(&filter.setup_ids))
        .bind(serialized(&filter.instruments))
        .bind(serialized(&filter.instruments))
        .bind(serialized(&filter.directions))
        .bind(serialized(&filter.directions))
        .fetch_all(&state.db)
        .await
        .map_err(AppError::from)
        .map_err(Into::into)
}

fn serialized(values: &Option<Vec<String>>) -> Option<String> {
    values.as_ref().and_then(|items| {
        if items.is_empty() {
            None
        } else {
            serde_json::to_string(items).ok()
        }
    })
}
