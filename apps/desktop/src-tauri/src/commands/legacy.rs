use std::path::PathBuf;

use chrono::Utc;
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{
    FromRow,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};
use std::str::FromStr;
use tauri::State;
use uuid::Uuid;

use crate::{
    database::AppState,
    errors::{AppError, CommandResult},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyPreview {
    pub valid: bool,
    pub path: String,
    pub trade_count: i64,
    pub issues: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyImportResult {
    pub imported: usize,
    pub skipped: usize,
}

#[derive(Debug, FromRow)]
struct LegacyTrade {
    id: i64,
    instrument: String,
    direction: String,
    status: String,
    trade_date: String,
    entry_price: Option<f64>,
    exit_price: Option<f64>,
    result_r: Option<f64>,
    pnl_amount: Option<f64>,
    strategy: Option<String>,
    setup: Option<String>,
    thesis: Option<String>,
    emotion: Option<String>,
    macro_context: Option<String>,
    seasonality_context: Option<String>,
    notes: Option<String>,
    created_at: String,
}

#[tauri::command]
pub async fn preview_legacy_database(path: String) -> CommandResult<LegacyPreview> {
    let (pool, canonical) = open_legacy(&path).await?;
    let table_exists: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='journal_trade'",
    )
    .fetch_one(&pool)
    .await
    .map_err(AppError::from)?;
    let mut issues = Vec::new();
    let count = if table_exists > 0 {
        sqlx::query_scalar("SELECT COUNT(*) FROM journal_trade")
            .fetch_one(&pool)
            .await
            .map_err(AppError::from)?
    } else {
        issues.push("Tabelle journal_trade fehlt".into());
        0
    };
    pool.close().await;
    Ok(LegacyPreview {
        valid: issues.is_empty(),
        path: canonical.to_string_lossy().into_owned(),
        trade_count: count,
        issues,
    })
}

#[tauri::command]
pub async fn import_legacy_database(
    state: State<'_, AppState>,
    path: String,
) -> CommandResult<LegacyImportResult> {
    let (pool, canonical) = open_legacy(&path).await?;
    let rows = sqlx::query_as::<_, LegacyTrade>("SELECT id, instrument, direction, status, trade_date, entry_price, exit_price, result_r, pnl_amount, strategy, setup, thesis, emotion, macro_context, seasonality_context, notes, created_at FROM journal_trade ORDER BY id")
        .fetch_all(&pool).await.map_err(AppError::from)?;
    pool.close().await;
    let account_id: String = sqlx::query_scalar(
        "SELECT id FROM accounts WHERE is_archived = 0 ORDER BY created_at LIMIT 1",
    )
    .fetch_one(&state.db)
    .await
    .map_err(AppError::from)?;
    let source_hash = Sha256::digest(canonical.to_string_lossy().as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let now = Utc::now().to_rfc3339();
    let mut imported = 0;
    let mut skipped = 0;
    let mut transaction = state.db.begin().await.map_err(AppError::from)?;
    for row in rows {
        let trade_id = format!("legacy-{}-{}", &source_hash[..12], row.id);
        let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM trades WHERE id = ?")
            .bind(&trade_id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(AppError::from)?;
        if exists > 0 {
            skipped += 1;
            continue;
        }
        let strategy_id = if let Some(name) = row
            .strategy
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            let existing: Option<String> =
                sqlx::query_scalar("SELECT id FROM strategies WHERE name = ? COLLATE NOCASE")
                    .bind(name)
                    .fetch_optional(&mut *transaction)
                    .await
                    .map_err(AppError::from)?;
            match existing {
                Some(id) => Some(id),
                None => {
                    let id = Uuid::new_v4().to_string();
                    sqlx::query("INSERT INTO strategies (id, name, color, created_at, updated_at) VALUES (?, ?, '#3b82f6', ?, ?)").bind(&id).bind(name).bind(&now).bind(&now).execute(&mut *transaction).await.map_err(AppError::from)?;
                    Some(id)
                }
            }
        } else {
            None
        };
        let setup_id = if let Some(name) = row
            .setup
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            let existing: Option<String> =
                sqlx::query_scalar("SELECT id FROM setups WHERE name = ? COLLATE NOCASE")
                    .bind(name)
                    .fetch_optional(&mut *transaction)
                    .await
                    .map_err(AppError::from)?;
            match existing {
                Some(id) => Some(id),
                None => {
                    let id = Uuid::new_v4().to_string();
                    sqlx::query("INSERT INTO setups (id, strategy_id, name, color, created_at, updated_at) VALUES (?, ?, ?, '#8b5cf6', ?, ?)").bind(&id).bind(&strategy_id).bind(name).bind(&now).bind(&now).execute(&mut *transaction).await.map_err(AppError::from)?;
                    Some(id)
                }
            }
        } else {
            None
        };
        let net_pnl_minor = row.pnl_amount.map(|value| (value * 100.0).round() as i64);
        let planned_risk_minor = match (row.pnl_amount, row.result_r) {
            (Some(pnl), Some(r)) if r.abs() > 1e-9 => {
                Some(((pnl / r).abs() * 100.0).round() as i64)
            }
            _ => None,
        };
        let opened_at = format!("{}T00:00:00Z", row.trade_date);
        let closed_at = (row.status == "closed").then(|| opened_at.clone());
        let thesis = combine_notes(&row);
        sqlx::query("INSERT INTO trades (id, account_id, strategy_id, setup_id, status, instrument, asset_class, direction, opened_at, closed_at, actual_entry, actual_exit, planned_risk_minor, gross_pnl_minor, net_pnl_minor, r_override, r_override_reason, thesis_html, review_notes_html, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'forex', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Legacy-Import', ?, ?, ?, ?)")
            .bind(&trade_id).bind(&account_id).bind(&strategy_id).bind(&setup_id).bind(if row.status == "open" { "open" } else { "closed" })
            .bind(row.instrument.trim().to_uppercase()).bind(if row.direction == "short" { "short" } else { "long" }).bind(&opened_at).bind(&closed_at)
            .bind(row.entry_price.map(|value| value.to_string())).bind(row.exit_price.map(|value| value.to_string())).bind(planned_risk_minor)
            .bind(net_pnl_minor).bind(net_pnl_minor).bind(row.result_r.map(|value| value.to_string())).bind(thesis).bind(row.notes)
            .bind(if row.created_at.is_empty() { &now } else { &row.created_at }).bind(&now)
            .execute(&mut *transaction).await.map_err(AppError::from)?;
        imported += 1;
    }
    transaction.commit().await.map_err(AppError::from)?;
    Ok(LegacyImportResult { imported, skipped })
}

async fn open_legacy(path: &str) -> CommandResult<(sqlx::SqlitePool, PathBuf)> {
    let canonical = PathBuf::from(path).canonicalize().map_err(|_| {
        crate::errors::CommandError::validation("Legacy-Datenbank wurde nicht gefunden.")
    })?;
    if !canonical.is_file() {
        return Err(crate::errors::CommandError::validation(
            "Auswahl ist keine Datei.",
        ));
    }
    let url = format!(
        "sqlite://{}",
        canonical.to_string_lossy().replace('\\', "/")
    );
    let options = SqliteConnectOptions::from_str(&url)
        .map_err(AppError::from)?
        .read_only(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(AppError::from)?;
    Ok((pool, canonical))
}

fn combine_notes(row: &LegacyTrade) -> Option<String> {
    let fields = [
        ("These", row.thesis.as_deref()),
        ("Emotion", row.emotion.as_deref()),
        ("Macro-Kontext", row.macro_context.as_deref()),
        ("Seasonality", row.seasonality_context.as_deref()),
    ];
    let value = fields
        .into_iter()
        .filter_map(|(label, value)| {
            value
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| format!("{label}: {value}"))
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    (!value.is_empty()).then_some(value)
}
