use serde::Serialize;
use sqlx::{FromRow, SqlitePool};
use tauri::State;

use crate::{
    commands::journal_scope::{require_active_account, scope_trade_filter},
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
    account_id: String,
    filter: Option<TradeFilter>,
) -> CommandResult<DashboardResponse> {
    calculate_dashboard_for_pool(&state.db, &account_id, filter).await
}

pub(crate) async fn calculate_dashboard_for_pool(
    db: &SqlitePool,
    account_id: &str,
    filter: Option<TradeFilter>,
) -> CommandResult<DashboardResponse> {
    require_active_account(db, account_id).await?;
    let filter = scope_trade_filter(account_id, filter);
    let metric_trades = trades::metric_trades(db, &filter).await?;
    let metrics = metrics::calculate_dashboard(&metric_trades);
    let calendar = calendar_data(db, &filter).await?;
    let setup_performance = group_performance(db, &filter, "setup").await?;
    let weekday_performance = group_performance(db, &filter, "weekday").await?;
    let session_performance = group_performance(db, &filter, "session").await?;
    let timeframe_performance = group_performance(db, &filter, "timeframe").await?;
    let instrument_performance = group_performance(db, &filter, "instrument").await?;
    let direction_performance = group_performance(db, &filter, "direction").await?;
    let account_performance = group_performance(db, &filter, "account").await?;
    let asset_class_performance = group_performance(db, &filter, "asset_class").await?;
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
    account_id: String,
    filter: Option<TradeFilter>,
) -> CommandResult<Vec<CalendarDay>> {
    calculate_calendar_for_pool(&state.db, &account_id, filter).await
}

pub(crate) async fn calculate_calendar_for_pool(
    db: &SqlitePool,
    account_id: &str,
    filter: Option<TradeFilter>,
) -> CommandResult<Vec<CalendarDay>> {
    require_active_account(db, account_id).await?;
    let filter = scope_trade_filter(account_id, filter);
    calendar_data(db, &filter).await
}

async fn calendar_data(db: &SqlitePool, filter: &TradeFilter) -> CommandResult<Vec<CalendarDay>> {
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
    .fetch_all(db)
    .await
    .map_err(AppError::from)
    .map_err(Into::into)
}

async fn group_performance(
    db: &SqlitePool,
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
        .fetch_all(db)
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

        for (id, archived) in [
            ("account-a", 0_i64),
            ("account-b", 0_i64),
            ("archived", 1_i64),
        ] {
            sqlx::query("INSERT INTO accounts (id, name, created_at, updated_at, is_archived) VALUES (?, ?, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', ?)")
                .bind(id)
                .bind(id)
                .bind(archived)
                .execute(&pool)
                .await
                .unwrap();
        }
        for (id, account_id, net_pnl_minor, closed_at) in [
            ("trade-a", "account-a", 12_500_i64, "2026-02-01T12:00:00Z"),
            ("trade-b", "account-b", -7_500_i64, "2026-02-02T12:00:00Z"),
        ] {
            sqlx::query("INSERT INTO trades (id, account_id, status, instrument, asset_class, direction, closed_at, net_pnl_minor, created_at, updated_at) VALUES (?, ?, 'closed', 'EURUSD', 'forex', 'long', ?, ?, ?, ?)")
                .bind(id)
                .bind(account_id)
                .bind(closed_at)
                .bind(net_pnl_minor)
                .bind(closed_at)
                .bind(closed_at)
                .execute(&pool)
                .await
                .unwrap();
        }
        pool
    }

    #[tokio::test]
    async fn account_scope_dashboard_and_calendar_exclude_other_accounts() {
        let pool = account_scope_database().await;

        let response = calculate_dashboard_for_pool(&pool, "account-a", None)
            .await
            .unwrap();
        assert_eq!(response.metrics.total_trades, 1);
        assert_eq!(response.metrics.net_pnl_minor, 12_500);

        let calendar = calculate_calendar_for_pool(&pool, "account-a", None)
            .await
            .unwrap();
        assert_eq!(calendar.len(), 1);
        assert_eq!(calendar[0].date, "2026-02-01");
        assert_eq!(calendar[0].net_pnl_minor, 12_500);
    }

    #[tokio::test]
    async fn account_scope_rejects_missing_archived_and_unknown_accounts() {
        let pool = account_scope_database().await;

        let error = calculate_dashboard_for_pool(&pool, "", None)
            .await
            .unwrap_err();
        assert_eq!(error.code, "ACCOUNT_REQUIRED");
        for account_id in ["archived", "missing"] {
            let error = calculate_dashboard_for_pool(&pool, account_id, None)
                .await
                .unwrap_err();
            assert_eq!(error.code, "ACCOUNT_NOT_FOUND");
        }
    }
}
