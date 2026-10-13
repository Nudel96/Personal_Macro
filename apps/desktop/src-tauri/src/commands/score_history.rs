//! Recorded observations, bounded carry-forward and exact, cached daily prices.
use chrono::{DateTime, Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, Sqlite, Transaction};
use std::collections::HashMap;

use super::{
    eodhd_fundamentals::{self, MacroFundamentalsDashboard},
    macro_scores::{self, AssetScore, ScoreContribution, ScoreInstrument},
};
use crate::{
    database::AppState,
    errors::{AppError, CommandError, CommandResult},
    runtime::State,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MacroScoreHistoryInput {
    pub instrument_id: String,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MacroScoreHistoryPoint {
    pub observation_key: String,
    pub observed_at: i64,
    pub valid_until: i64,
    pub snapshot_id: String,
    pub model_version: String,
    pub origin: String,
    pub score: Option<i32>,
    pub available_components: i64,
    pub total_components: i64,
    #[serde(skip)]
    pub(crate) evidence_json: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ScoreDailyCandle {
    pub time: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScorePriceSource {
    pub provider: String,
    pub symbol: String,
    pub label: String,
    pub inverted: bool,
    pub data_kind: String,
    pub unit: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub imported_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MacroScoreHistoryResponse {
    pub instrument: ScoreInstrument,
    pub as_of: String,
    pub model_version: String,
    pub points: Vec<MacroScoreHistoryPoint>,
    pub candles: Vec<ScoreDailyCandle>,
    pub price_source: Option<ScorePriceSource>,
    pub latest_contributions: Vec<ScoreContribution>,
    pub earliest_observation_at: Option<i64>,
    pub reason_codes: Vec<String>,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreCaptureResult {
    pub inserted: usize,
    pub archive_completed: bool,
}

fn validation(message: &str) -> CommandError {
    CommandError {
        code: "VALIDATION_ERROR".into(),
        message: message.into(),
        details: None,
    }
}

pub(crate) fn bounds(
    input: &MacroScoreHistoryInput,
    now: DateTime<Utc>,
) -> CommandResult<(ScoreInstrument, i64, i64)> {
    let instrument = macro_scores::instruments()
        .into_iter()
        .find(|v| v.id == input.instrument_id)
        .ok_or_else(|| validation("Bitte einen bekannten Markt wählen."))?;
    let parse = |value: &str| {
        NaiveDate::parse_from_str(value, "%Y-%m-%d")
            .ok()
            .filter(|d| d.format("%Y-%m-%d").to_string() == value)
    };
    let from =
        parse(&input.from).ok_or_else(|| validation("Bitte ein gültiges Startdatum wählen."))?;
    let to = parse(&input.to).ok_or_else(|| validation("Bitte ein gültiges Enddatum wählen."))?;
    if from > to || to > now.date_naive() || (to - from).num_days() > 366 * 5 {
        return Err(validation(
            "Der Zeitraum muss geordnet sein, darf höchstens fünf Jahre umfassen und nicht in der Zukunft liegen.",
        ));
    }
    Ok((
        instrument,
        from.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp(),
        (to + Duration::days(1))
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp(),
    ))
}

fn valid_until(
    asset: &AssetScore,
    dashboard: &MacroFundamentalsDashboard,
    profiles: &HashMap<(String, String), i64>,
    observed: i64,
) -> i64 {
    let mut expiry = observed + 36 * 3600;
    for currency in &dashboard.currencies {
        for indicator in &currency.indicators {
            let used = if asset.instrument.kind == "commodity" {
                asset.contributions.iter().any(|c| {
                    c.score.is_some()
                        && c.source_currency.as_deref() == Some(&currency.currency)
                        && c.key.ends_with(&format!(":{}", indicator.key))
                })
            } else {
                currency.currency == asset.instrument.base
                    || asset.instrument.quote.as_ref() == Some(&currency.currency)
            };
            if used
                && matches!(indicator.status.as_str(), "scored" | "neutral")
                && let Some(release) = indicator
                    .released_at
                    .as_deref()
                    .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
                && let Some(days) =
                    profiles.get(&(currency.currency.clone(), indicator.key.clone()))
            {
                expiry = expiry.min(release.timestamp() + days * 86400);
            }
        }
    }
    for c in &asset.contributions {
        if c.channel == "inventory"
            && c.score.is_some()
            && let Some(release) = c
                .released_at
                .as_deref()
                .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
        {
            expiry = expiry.min(release.timestamp() + 8 * 86400);
        }
    }
    expiry.max(observed)
}

async fn profiles(state: &AppState) -> Result<HashMap<(String, String), i64>, AppError> {
    let rows:Vec<(String,String,i64)>=sqlx::query_as("SELECT currency,canonical_key,freshness_days FROM eodhd_indicator_profiles WHERE enabled=1").fetch_all(&state.db).await?;
    Ok(rows.into_iter().map(|(c, k, d)| ((c, k), d)).collect())
}

/// Pure preparation shared by desktop SQLite and the separate cloud history.
/// Loading a verified snapshot never mutates it or invents earlier observations.
#[cfg(feature = "postgres")]
pub(crate) struct PreparedScoreCapture {
    pub snapshot_id: String,
    pub observed_at: i64,
    pub started_at_ms: i64,
    pub day: String,
    pub fingerprint: String,
    pub observations: Vec<(AssetScore, i64)>,
}

#[cfg(feature = "postgres")]
pub(crate) async fn prepare_score_capture_at(
    state: &AppState,
    now: DateTime<Utc>,
) -> Result<Option<PreparedScoreCapture>, AppError> {
    let dashboard =
        eodhd_fundamentals::load_fundamental_dashboard_snapshot(state, Some(now), None).await?;
    let Some(snapshot_id) = dashboard.snapshot_id.clone() else {
        return Ok(None);
    };
    if DateTime::parse_from_rfc3339(&dashboard.as_of).map_or(true, |built| built > now) {
        return Ok(None);
    }
    let mut assets = macro_scores::fundamental_assets(&dashboard);
    assets.extend(macro_scores::commodity_assets(state, &dashboard, now, false).await?);
    let fingerprint = Sha256::digest(serde_json::to_vec(&assets).map_err(|_| {
        AppError::DataTransfer("Score-Beiträge konnten nicht geprüft werden.".into())
    })?)
    .iter()
    .map(|byte| format!("{byte:02x}"))
    .collect();
    let observed_at = now.timestamp() + i64::from(now.timestamp_subsec_nanos() > 0);
    let profiles = profiles(state).await?;
    Ok(Some(PreparedScoreCapture {
        snapshot_id,
        observed_at,
        started_at_ms: now.timestamp_millis(),
        day: now.date_naive().to_string(),
        fingerprint,
        observations: assets
            .into_iter()
            .map(|asset| {
                let expiry = valid_until(&asset, &dashboard, &profiles, observed_at);
                (asset, expiry)
            })
            .collect(),
    }))
}

async fn store(
    tx: &mut Transaction<'_, Sqlite>,
    asset: &AssetScore,
    dashboard: &MacroFundamentalsDashboard,
    profiles: &HashMap<(String, String), i64>,
    observed: i64,
    key: &str,
    origin: &str,
) -> Result<usize, AppError> {
    let evidence = serde_json::to_string(&asset.contributions).map_err(|_| {
        AppError::DataTransfer("Score-Beiträge konnten nicht gespeichert werden.".into())
    })?;
    Ok(sqlx::query("INSERT OR IGNORE INTO macro_score_history(observation_key,instrument_id,observed_at,valid_until,snapshot_id,model_version,origin,score,available_components,total_components,evidence_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
        .bind(key).bind(&asset.instrument.id).bind(observed).bind(valid_until(asset,dashboard,profiles,observed))
        .bind(dashboard.snapshot_id.as_deref().unwrap_or_default()).bind(macro_scores::MODEL_VERSION).bind(origin).bind(asset.score)
        .bind(asset.available_components as i64).bind(asset.total_components as i64).bind(evidence).execute(&mut **tx).await?.rows_affected() as usize)
}

async fn archive_batch(
    state: &AppState,
    now: DateTime<Utc>,
) -> Result<ScoreCaptureResult, AppError> {
    let completed: bool =
        sqlx::query_scalar("SELECT archive_completed FROM macro_score_history_state WHERE id=1")
            .fetch_one(&state.db)
            .await?;
    if completed {
        return Ok(ScoreCaptureResult {
            inserted: 0,
            archive_completed: true,
        });
    }
    let rows:Vec<(String,String)>=sqlx::query_as("SELECT id,built_at FROM eodhd_fundamental_snapshots s WHERE julianday(built_at)<=julianday(?) AND NOT EXISTS(SELECT 1 FROM macro_score_history h WHERE h.observation_key='archive:'||s.id) ORDER BY julianday(built_at),id LIMIT 100")
        .bind(now.to_rfc3339()).fetch_all(&state.db).await?;
    let profiles = profiles(state).await?;
    let mut inserted = 0;
    for (id, built_at) in &rows {
        let Ok(observed) = DateTime::parse_from_rfc3339(built_at) else {
            continue;
        };
        let observed = observed.with_timezone(&Utc);
        let dashboard = eodhd_fundamentals::load_fundamental_dashboard_snapshot(
            state,
            Some(observed),
            Some(id),
        )
        .await?;
        let mut assets = macro_scores::fundamental_assets(&dashboard);
        // Only archived fundamentals are used; current inventories never enter past observations.
        assets.extend(macro_scores::commodity_assets(state, &dashboard, observed, true).await?);
        let mut tx = state.db.begin().await?;
        for asset in &assets {
            inserted += store(
                &mut tx,
                asset,
                &dashboard,
                &profiles,
                observed.timestamp(),
                &format!("archive:{id}"),
                "archived_snapshot",
            )
            .await?;
        }
        tx.commit().await?;
    }
    let archive_completed = rows.len() < 100;
    if archive_completed {
        sqlx::query("UPDATE macro_score_history_state SET archive_completed=1 WHERE id=1")
            .execute(&state.db)
            .await?;
    }
    Ok(ScoreCaptureResult {
        inserted,
        archive_completed,
    })
}

pub async fn capture_macro_scores_at(
    state: &AppState,
    now: DateTime<Utc>,
) -> Result<ScoreCaptureResult, AppError> {
    let mut result = archive_batch(state, now).await?;
    let dashboard =
        eodhd_fundamentals::load_fundamental_dashboard_snapshot(state, Some(now), None).await?;
    let Some(snapshot_id) = dashboard.snapshot_id.as_ref() else {
        return Ok(result);
    };
    if DateTime::parse_from_rfc3339(&dashboard.as_of).map_or(true, |built| built > now) {
        return Ok(result);
    }
    let mut assets = macro_scores::fundamental_assets(&dashboard);
    assets.extend(macro_scores::commodity_assets(state, &dashboard, now, false).await?);
    let fingerprint = Sha256::digest(serde_json::to_vec(&assets).map_err(|_| {
        AppError::DataTransfer("Score-Beiträge konnten nicht geprüft werden.".into())
    })?)
    .iter()
    .map(|byte| format!("{byte:02x}"))
    .collect::<String>();
    let day = now.date_naive().to_string();
    let previous: (Option<String>, Option<String>, Option<String>) = sqlx::query_as(
        "SELECT last_capture_day,last_snapshot_id,last_fingerprint FROM macro_score_history_state WHERE id=1"
    ).fetch_one(&state.db).await?;
    if previous
        == (
            Some(day.clone()),
            Some(snapshot_id.clone()),
            Some(fingerprint.clone()),
        )
    {
        return Ok(result);
    }
    let observed_at = now.timestamp() + i64::from(now.timestamp_subsec_nanos() > 0);
    let key = format!(
        "capture:{day}:{}:{snapshot_id}:{fingerprint}",
        now.timestamp_millis()
    );
    let profiles = profiles(state).await?;
    let mut tx = state.db.begin().await?;
    // First write fences concurrent/late captures. A -> B -> A remains three
    // observations; unchanged reads in the same UTC day remain idempotent.
    let claimed = sqlx::query("UPDATE macro_score_history_state SET last_capture_day=?,last_snapshot_id=?,last_fingerprint=?,last_observed_at=? WHERE id=1 AND (last_observed_at IS NULL OR last_observed_at<=?) AND (COALESCE(last_capture_day,'')!=? OR COALESCE(last_snapshot_id,'')!=? OR COALESCE(last_fingerprint,'')!=?)")
        .bind(&day).bind(snapshot_id).bind(&fingerprint).bind(observed_at).bind(observed_at)
        .bind(&day).bind(snapshot_id).bind(&fingerprint).execute(&mut *tx).await?;
    if claimed.rows_affected() == 0 {
        tx.rollback().await?;
        return Ok(result);
    }
    for asset in &assets {
        result.inserted += store(
            &mut tx,
            asset,
            &dashboard,
            &profiles,
            observed_at,
            &key,
            "captured",
        )
        .await?;
    }
    tx.commit().await?;
    Ok(result)
}

pub async fn scheduled_macro_score_capture(state: &AppState) -> Result<(), AppError> {
    capture_macro_scores_at(state, Utc::now()).await.map(|_| ())
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn record_macro_score_history(
    state: State<'_, AppState>,
) -> CommandResult<ScoreCaptureResult> {
    crate::runtime::require_desktop()?;
    capture_macro_scores_at(&state, Utc::now())
        .await
        .map_err(Into::into)
}

fn invert(candle: &ScoreDailyCandle) -> ScoreDailyCandle {
    ScoreDailyCandle {
        time: candle.time,
        open: 1.0 / candle.open,
        high: 1.0 / candle.low,
        low: 1.0 / candle.high,
        close: 1.0 / candle.close,
    }
}

pub(crate) fn price_unit(instrument: &ScoreInstrument) -> String {
    match instrument.base.as_str() {
        "XAU" | "XAG" | "XPT" | "XPD" => "USD/Feinunze".into(),
        "WTI" | "BRENT" => "USD/Barrel".into(),
        "NATURAL_GAS" => "USD/MMBtu".into(),
        _ => format!(
            "{} je {}",
            instrument.quote.as_deref().unwrap_or_default(),
            instrument.base
        ),
    }
}

pub(crate) async fn daily_prices(
    state: &AppState,
    instrument: &ScoreInstrument,
    from: i64,
    to: i64,
    now: i64,
) -> Result<(Vec<ScoreDailyCandle>, Option<ScorePriceSource>), AppError> {
    let Some(quote) = instrument.quote.as_deref() else {
        return Ok((vec![], None));
    };
    let direct:Option<(String,bool)>=sqlx::query_as("SELECT source_symbol,inverted FROM mt5_technical_pairs WHERE base=? AND quote=? AND source_symbol IS NOT NULL")
        .bind(&instrument.base).bind(quote).fetch_optional(&state.db).await?;
    let reverse: Option<(String, bool)> = if direct.is_none() {
        sqlx::query_as("SELECT source_symbol,inverted FROM mt5_technical_pairs WHERE base=? AND quote=? AND source_symbol IS NOT NULL")
        .bind(quote).bind(&instrument.base).fetch_optional(&state.db).await?
    } else {
        None
    };
    if let Some((symbol, source_inverted)) = direct.as_ref().or(reverse.as_ref()) {
        let reversed = direct.is_none();
        let invert_prices = reversed != *source_inverted;
        let (base, quote) = if reversed {
            (quote, instrument.base.as_str())
        } else {
            (instrument.base.as_str(), quote)
        };
        let rows:Vec<ScoreDailyCandle>=sqlx::query_as("SELECT candle_time AS time,open,high,low,close FROM mt5_technical_candles WHERE base=? AND quote=? AND timeframe='D1' AND candle_time>=? AND candle_time<? AND candle_time+86400<=? ORDER BY candle_time LIMIT 2000")
            .bind(base).bind(quote).bind(from).bind(to).bind(now).fetch_all(&state.db).await?;
        if !rows.is_empty() {
            return Ok((
                if invert_prices {
                    rows.iter().map(invert).collect()
                } else {
                    rows
                },
                Some(ScorePriceSource {
                    provider: "mt5".into(),
                    symbol: symbol.clone(),
                    label: "Abgeschlossene MT5-Daily-Kerzen · Brokerzeitachse".into(),
                    inverted: invert_prices,
                    data_kind: "ohlc".into(),
                    unit: price_unit(instrument),
                    imported_at: None,
                }),
            ));
        }
    }
    daily_provider_prices(&state.db, instrument, from, to, now).await
}

pub(crate) async fn daily_provider_prices(
    pool: &sqlx::SqlitePool,
    instrument: &ScoreInstrument,
    from: i64,
    to: i64,
    now: i64,
) -> Result<(Vec<ScoreDailyCandle>, Option<ScorePriceSource>), AppError> {
    let quote = instrument.quote.as_deref().unwrap_or("");
    let Some(price_symbol) = instrument.price_symbol.as_deref() else {
        return Ok((vec![], None));
    };
    let inverse_symbol = format!("{quote}{}.FOREX", instrument.base);
    let symbols = if instrument.kind == "forex" {
        vec![price_symbol.to_string(), inverse_symbol]
    } else {
        vec![price_symbol.to_string()]
    };
    for (index, symbol) in symbols.iter().enumerate() {
        let rows:Vec<ScoreDailyCandle>=sqlx::query_as("SELECT candle_time/1000 AS time,bid_open AS open,bid_high AS high,bid_low AS low,bid_close AS close FROM seasonality_provider_daily_candles WHERE provider='eodhd' AND provider_symbol=? AND candle_time>=? AND candle_time<? AND candle_time+86400000<=? ORDER BY candle_time LIMIT 2000")
            .bind(symbol).bind(from*1000).bind(to*1000).bind(now*1000).fetch_all(pool).await?;
        if !rows.is_empty() {
            return Ok((
                if index == 1 {
                    rows.iter().map(invert).collect()
                } else {
                    rows
                },
                Some(ScorePriceSource {
                    provider: "eodhd".into(),
                    symbol: symbol.clone(),
                    label: if symbol.ends_with(".COMMODITY") {
                        "Täglicher EODHD-Einzelpreis · Quellen-Kalendertag"
                    } else {
                        "EODHD Daily-OHLC · Quellen-Kalendertag"
                    }
                    .into(),
                    inverted: index == 1,
                    data_kind: if symbol.ends_with(".COMMODITY") {
                        "close"
                    } else {
                        "ohlc"
                    }
                    .into(),
                    unit: price_unit(instrument),
                    imported_at: None,
                }),
            ));
        }
    }
    Ok((vec![], None))
}

pub async fn load_macro_score_history_at(
    state: &AppState,
    input: MacroScoreHistoryInput,
    now: DateTime<Utc>,
) -> CommandResult<MacroScoreHistoryResponse> {
    let (instrument, from, to) = bounds(&input, now)?;
    let mut points:Vec<MacroScoreHistoryPoint>=sqlx::query_as("SELECT observation_key,observed_at,valid_until,snapshot_id,model_version,origin,score,available_components,total_components,evidence_json FROM macro_score_history WHERE instrument_id=? AND observed_at>=? AND observed_at<? AND observed_at<=? ORDER BY observed_at,observation_key LIMIT 10001")
        .bind(&instrument.id).bind(from).bind(to).bind(now.timestamp()).fetch_all(&state.db).await.map_err(AppError::from)?;
    if points.len() > 10000 {
        return Err(validation(
            "Bitte einen kürzeren Zeitraum für höchstens 10.000 Beobachtungen wählen.",
        ));
    }
    let predecessor:Option<MacroScoreHistoryPoint>=sqlx::query_as("SELECT observation_key,observed_at,valid_until,snapshot_id,model_version,origin,score,available_components,total_components,evidence_json FROM macro_score_history WHERE instrument_id=? AND observed_at<? AND valid_until>? ORDER BY observed_at DESC,observation_key DESC LIMIT 1")
        .bind(&instrument.id).bind(from).bind(from).fetch_optional(&state.db).await.map_err(AppError::from)?;
    if let Some(point) = predecessor {
        points.insert(0, point);
    }
    let earliest: Option<i64> = sqlx::query_scalar(
        "SELECT MIN(observed_at) FROM macro_score_history WHERE instrument_id=?",
    )
    .bind(&instrument.id)
    .fetch_one(&state.db)
    .await
    .map_err(AppError::from)?;
    let latest_contributions = points
        .last()
        .map(|p| serde_json::from_str(&p.evidence_json))
        .transpose()
        .map_err(|_| CommandError {
            code: "SCORE_HISTORY_INVALID".into(),
            message: "Die gespeicherten Score-Beiträge sind nicht lesbar.".into(),
            details: None,
        })?
        .unwrap_or_default();
    let (candles, price_source) =
        daily_prices(state, &instrument, from, to, now.timestamp()).await?;
    let mut reason_codes = vec![];
    if points.is_empty() {
        reason_codes.push("no_recorded_scores_in_range".into());
    }
    if candles.is_empty() && instrument.kind != "currency" {
        reason_codes.push("daily_prices_unavailable".into());
    }
    Ok(MacroScoreHistoryResponse {
        instrument,
        as_of: now.to_rfc3339(),
        model_version: macro_scores::MODEL_VERSION.into(),
        points,
        candles,
        price_source,
        latest_contributions,
        earliest_observation_at: earliest,
        reason_codes,
        from: input.from,
        to: input.to,
    })
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_macro_score_history(
    state: State<'_, AppState>,
    input: MacroScoreHistoryInput,
) -> CommandResult<MacroScoreHistoryResponse> {
    load_macro_score_history_at(&state, input, Utc::now()).await
}

#[cfg(test)]
#[path = "score_history_review_fixture.rs"]
mod review_fixture;
#[cfg(test)]
#[path = "score_history_tests.rs"]
mod tests;
