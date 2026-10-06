//! Daily broker-native chart snapshots. Never written to EODHD or journal tables.
mod bridge;
#[cfg(test)]
mod tests;

use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Datelike, Duration, TimeZone, Utc, Weekday};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use super::technical_signals::{
    ChartTrendSource, ChartTrendView, FOREX_PRIORITY, chart_view, timeframe_view,
    unavailable_timeframe,
};
use crate::{
    database::AppState,
    errors::{AppError, CommandError, CommandResult},
    metrics::technical_trend::{OhlcBar, assess_trend},
};

const LEASE_SECONDS: i64 = 120;
const RETRY_SECONDS: i64 = 30 * 60;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MarketSnapshot {
    source_label: String,
    observed_at: i64,
    pairs: Vec<MarketPair>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MarketPair {
    base: String,
    quote: String,
    source_symbol: Option<String>,
    inverted: bool,
    four_hour: Vec<MarketBar>,
    daily: Vec<MarketBar>,
    four_hour_reason: Option<String>,
    daily_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct MarketBar {
    time: i64,
    open: f64,
    high: f64,
    low: f64,
    close: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mt5RefreshView {
    pub status: String,
    pub last_attempt_at: Option<String>,
    pub last_success_at: Option<String>,
    pub next_refresh_at: Option<String>,
    pub source_label: Option<String>,
    pub terminal_path: Option<String>,
    pub message: Option<String>,
}

#[derive(FromRow)]
struct RefreshRow {
    status: String,
    last_attempt_at: Option<i64>,
    last_success_at: Option<i64>,
    next_refresh_at: i64,
    lease_until: i64,
    source_label: Option<String>,
    terminal_path: Option<String>,
    error_message: Option<String>,
}

#[derive(FromRow)]
struct PairRow {
    base: String,
    quote: String,
    source_symbol: Option<String>,
    inverted: bool,
    four_hour_reason: Option<String>,
    daily_reason: Option<String>,
}

#[derive(FromRow)]
struct CandleRow {
    base: String,
    quote: String,
    timeframe: String,
    candle_time: i64,
    open: f64,
    high: f64,
    low: f64,
    close: f64,
}

fn timestamp(value: Option<i64>) -> Option<String> {
    value
        .and_then(|time| DateTime::from_timestamp(time, 0))
        .map(|time| time.to_rfc3339())
}

fn next_day(now: DateTime<Utc>) -> i64 {
    let timezone = chrono_tz::Europe::Berlin;
    let tomorrow = now.with_timezone(&timezone).date_naive() + Duration::days(1);
    timezone
        .from_local_datetime(&tomorrow.and_hms_opt(0, 0, 0).unwrap())
        .earliest()
        .unwrap()
        .timestamp()
}

async fn claim(state: &AppState, now: i64, force: bool) -> CommandResult<Option<String>> {
    let token = Uuid::new_v4().to_string();
    let result = sqlx::query(
        "UPDATE mt5_technical_refresh SET status='running',last_attempt_at=?,lease_token=?,lease_until=?,error_code=NULL,error_message=NULL
         WHERE id=1 AND (status!='running' OR lease_until<=?) AND (? OR next_refresh_at<=? OR status='running')",
    )
    .bind(now).bind(&token).bind(now + LEASE_SECONDS).bind(now).bind(force).bind(now)
    .execute(&state.db).await.map_err(AppError::from)?;
    Ok((result.rows_affected() == 1).then_some(token))
}

pub(super) async fn refresh(state: &AppState, force: bool) -> CommandResult<()> {
    let started = Utc::now();
    let Some(token) = claim(state, started.timestamp(), force).await? else {
        return if force {
            Err(error("MT5_TECHNICAL_BUSY"))
        } else {
            Ok(())
        };
    };
    let terminal_path: Option<String> =
        sqlx::query_scalar("SELECT terminal_path FROM mt5_technical_refresh WHERE id=1")
            .fetch_one(&state.db)
            .await
            .map_err(AppError::from)?;
    let paths = state.paths.clone();
    let result =
        match tokio::task::spawn_blocking(move || bridge::read(&paths, terminal_path.as_deref()))
            .await
        {
            Ok(result) => result,
            Err(_) => Err(error("MT5_CONNECTOR_ERROR")),
        };
    let result = match result {
        Ok(snapshot) => store_snapshot(state, &token, &snapshot, started, Utc::now()).await,
        Err(error) => Err(error),
    };
    if let Err(ref failure) = result {
        sqlx::query("UPDATE mt5_technical_refresh SET status='failed',next_refresh_at=?,lease_token=NULL,lease_until=0,error_code=?,error_message=? WHERE id=1 AND lease_token=?")
            .bind(Utc::now().timestamp() + RETRY_SECONDS).bind(&failure.code).bind(&failure.message).bind(&token)
            .execute(&state.db).await.map_err(AppError::from)?;
    }
    result
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn set_mt5_technical_terminal(
    state: crate::runtime::State<'_, AppState>,
    terminal_path: Option<String>,
) -> CommandResult<()> {
    crate::runtime::require_desktop()?;
    configure_terminal(&state, terminal_path).await
}

async fn configure_terminal(state: &AppState, terminal_path: Option<String>) -> CommandResult<()> {
    let path = terminal_path
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());
    if let Some(value) = &path {
        let file = std::path::Path::new(value);
        if value.len() > 1024
            || !file.is_absolute()
            || !file.is_file()
            || !file
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.eq_ignore_ascii_case("terminal64.exe"))
        {
            return Err(error("MT5_TERMINAL_PATH_INVALID"));
        }
    }
    let changed = sqlx::query("UPDATE mt5_technical_refresh SET terminal_path=?,status='pending',next_refresh_at=0,lease_token=NULL,lease_until=0,error_code=NULL,error_message=NULL WHERE id=1 AND (status!='running' OR lease_until<=?)")
        .bind(path).bind(Utc::now().timestamp()).execute(&state.db).await.map_err(AppError::from)?;
    if changed.rows_affected() != 1 {
        return Err(error("MT5_TECHNICAL_BUSY"));
    }
    Ok(())
}

fn valid_text(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= 120 && !value.chars().any(char::is_control)
}

fn validate_snapshot(snapshot: &MarketSnapshot, started: i64, now: i64) -> CommandResult<()> {
    if !valid_text(&snapshot.source_label)
        || snapshot.observed_at < started - 5
        || snapshot.observed_at > now + 5
        || snapshot.pairs.len() != 36
    {
        return Err(error("MT5_INVALID_SNAPSHOT"));
    }
    let mut seen = HashSet::new();
    let mut usable = false;
    for pair in &snapshot.pairs {
        let base = FOREX_PRIORITY.iter().position(|value| *value == pair.base);
        let quote = FOREX_PRIORITY.iter().position(|value| *value == pair.quote);
        if !matches!((base,quote), (Some(a),Some(b)) if a < b)
            || !seen.insert((&pair.base, &pair.quote))
            || pair
                .source_symbol
                .as_ref()
                .is_some_and(|value| !valid_text(value))
        {
            return Err(error("MT5_INVALID_SNAPSHOT"));
        }
        for (bars, reason, seconds) in [
            (&pair.four_hour, &pair.four_hour_reason, 14_400),
            (&pair.daily, &pair.daily_reason, 86_400),
        ] {
            if bars.len() > 300
                || (bars.is_empty() != reason.is_some())
                || (!bars.is_empty() && pair.source_symbol.is_none())
                || reason.as_deref().is_some_and(|value| {
                    !matches!(
                        value,
                        "mt5_symbol_ambiguous"
                            | "mt5_symbol_unavailable"
                            | "mt5_history_unavailable"
                            | "mt5_invalid_candles"
                    )
                })
            {
                return Err(error("MT5_INVALID_SNAPSHOT"));
            }
            let mut previous = 0;
            for bar in bars {
                if bar.time <= previous
                    || bar.time > snapshot.observed_at - seconds
                    || ![bar.open, bar.high, bar.low, bar.close]
                        .iter()
                        .all(|v| v.is_finite() && *v > 0.0)
                    || bar.high < bar.open.max(bar.close).max(bar.low)
                    || bar.low > bar.open.min(bar.close)
                {
                    return Err(error("MT5_INVALID_SNAPSHOT"));
                }
                previous = bar.time;
            }
            usable |= bars.len() >= 100;
        }
    }
    if !usable {
        return Err(error("MT5_NO_HISTORY"));
    }
    Ok(())
}

async fn store_snapshot(
    state: &AppState,
    token: &str,
    snapshot: &MarketSnapshot,
    started: DateTime<Utc>,
    now: DateTime<Utc>,
) -> CommandResult<()> {
    validate_snapshot(snapshot, started.timestamp(), now.timestamp())?;
    let mut tx = state.db.begin().await.map_err(AppError::from)?;
    // Claim and final publication are both conditional writes. An expired worker
    // cannot replace the snapshot committed by a newer lease holder.
    let updated = sqlx::query("UPDATE mt5_technical_refresh SET status='complete',last_success_at=?,next_refresh_at=?,source_label=?,lease_token=NULL,lease_until=0,error_code=NULL,error_message=NULL WHERE id=1 AND lease_token=? AND lease_until>?")
        .bind(snapshot.observed_at).bind(next_day(now)).bind(&snapshot.source_label).bind(token).bind(now.timestamp())
        .execute(&mut *tx).await.map_err(AppError::from)?;
    if updated.rows_affected() != 1 {
        return Err(error("MT5_TECHNICAL_BUSY"));
    }
    sqlx::query("DELETE FROM mt5_technical_pairs")
        .execute(&mut *tx)
        .await
        .map_err(AppError::from)?;
    for pair in &snapshot.pairs {
        sqlx::query("INSERT INTO mt5_technical_pairs(base,quote,source_symbol,inverted,four_hour_reason,daily_reason) VALUES(?,?,?,?,?,?)")
            .bind(&pair.base).bind(&pair.quote).bind(&pair.source_symbol).bind(pair.inverted)
            .bind(&pair.four_hour_reason).bind(&pair.daily_reason)
            .execute(&mut *tx).await.map_err(AppError::from)?;
        for (timeframe, bars) in [("H4", &pair.four_hour), ("D1", &pair.daily)] {
            for bar in bars {
                sqlx::query("INSERT INTO mt5_technical_candles(base,quote,timeframe,candle_time,open,high,low,close) VALUES(?,?,?,?,?,?,?,?)")
                    .bind(&pair.base).bind(&pair.quote).bind(timeframe).bind(bar.time)
                    .bind(bar.open).bind(bar.high).bind(bar.low).bind(bar.close)
                    .execute(&mut *tx).await.map_err(AppError::from)?;
            }
        }
    }
    tx.commit().await.map_err(AppError::from)?;
    Ok(())
}

pub(super) async fn load(
    state: &AppState,
    now: DateTime<Utc>,
) -> CommandResult<(Mt5RefreshView, HashMap<(String, String), ChartTrendView>)> {
    let mut tx = state.db.begin().await.map_err(AppError::from)?;
    let refresh: RefreshRow = sqlx::query_as("SELECT status,last_attempt_at,last_success_at,next_refresh_at,lease_until,source_label,terminal_path,error_message FROM mt5_technical_refresh WHERE id=1")
        .fetch_one(&mut *tx).await.map_err(AppError::from)?;
    let pairs: Vec<PairRow> = sqlx::query_as("SELECT base,quote,source_symbol,inverted,four_hour_reason,daily_reason FROM mt5_technical_pairs")
        .fetch_all(&mut *tx).await.map_err(AppError::from)?;
    let candles: Vec<CandleRow> = sqlx::query_as("SELECT base,quote,timeframe,candle_time,open,high,low,close FROM mt5_technical_candles ORDER BY candle_time")
        .fetch_all(&mut *tx).await.map_err(AppError::from)?;
    tx.commit().await.map_err(AppError::from)?;
    let mut candles_by_pair: HashMap<_, Vec<OhlcBar>> = HashMap::new();
    for bar in candles {
        candles_by_pair
            .entry((bar.base, bar.quote, bar.timeframe))
            .or_default()
            .push(OhlcBar {
                time: bar.candle_time,
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close,
            });
    }
    let mut rows: HashMap<_, _> = pairs
        .into_iter()
        .map(|pair| ((pair.base.clone(), pair.quote.clone()), pair))
        .collect();
    let mut charts = HashMap::new();
    for (index, base) in FOREX_PRIORITY.iter().enumerate() {
        for quote in FOREX_PRIORITY.iter().skip(index + 1) {
            let key = (base.to_string(), quote.to_string());
            let pair = rows.remove(&key);
            let frame = |name: &str, reason: Option<&str>| {
                if pair.is_none() {
                    return unavailable_timeframe("mt5_not_loaded");
                }
                if let Some(reason) = reason {
                    return unavailable_timeframe(reason);
                }
                let bars = candles_by_pair.get(&(key.0.clone(), key.1.clone(), name.into()));
                let mut assessment = assess_trend(bars.map(Vec::as_slice).unwrap_or_default());
                if let Some(latest) = assessment.latest_candle_at {
                    let h4 = name == "H4";
                    let age = now.timestamp() - latest - if h4 { 14_400 } else { 86_400 };
                    // A daily H4 snapshot stays usable until the next daily run;
                    // weekends extend the allowance, not the underlying candle time.
                    let max_age = if h4 {
                        if matches!(now.weekday(), Weekday::Sat | Weekday::Sun | Weekday::Mon) {
                            80 * 3600
                        } else {
                            32 * 3600
                        }
                    } else {
                        4 * 86400
                    };
                    if age < 0 || age > max_age {
                        assessment.signal = None;
                        assessment.reason_code = "stale_completed_candles";
                    }
                }
                timeframe_view(
                    assessment,
                    pair.as_ref().is_some_and(|value| value.inverted),
                )
            };
            let four_hour = frame(
                "H4",
                pair.as_ref()
                    .and_then(|value| value.four_hour_reason.as_deref()),
            );
            let daily = frame(
                "D1",
                pair.as_ref()
                    .and_then(|value| value.daily_reason.as_deref()),
            );
            let source = ChartTrendSource {
                provider: "mt5".into(),
                label: refresh.source_label.clone(),
                symbol: pair.as_ref().and_then(|value| value.source_symbol.clone()),
                inverted: pair.as_ref().is_some_and(|value| value.inverted),
                fetched_at: timestamp(refresh.last_success_at),
            };
            charts.insert(key, chart_view(four_hour, daily, Some(source)));
        }
    }
    let interrupted = refresh.status == "running" && refresh.lease_until <= now.timestamp();
    Ok((
        Mt5RefreshView {
            status: if interrupted {
                "failed".into()
            } else {
                refresh.status
            },
            last_attempt_at: timestamp(refresh.last_attempt_at),
            last_success_at: timestamp(refresh.last_success_at),
            next_refresh_at: timestamp(
                (refresh.next_refresh_at > 0).then_some(refresh.next_refresh_at),
            ),
            source_label: refresh.source_label,
            terminal_path: refresh.terminal_path,
            message: if interrupted {
                Some("Der MT5-Abruf wurde unterbrochen und wird erneut versucht.".into())
            } else {
                refresh.error_message
            },
        },
        charts,
    ))
}

fn error(code: &str) -> CommandError {
    let message = match code {
        "MT5_TERMINAL_PATH_INVALID" => {
            "Bitte den vollständigen Pfad zu einer vorhandenen terminal64.exe angeben oder das Feld für automatische Erkennung leeren."
        }
        "MT5_PACKAGE_MISSING" => {
            "Das Python-Paket MetaTrader5 fehlt. Bitte in der lokalen Python-Installation ergänzen."
        }
        "PYTHON_NOT_FOUND" => "Python 3 wurde für den lokalen MT5-Kursabruf nicht gefunden.",
        "MT5_INITIALIZE_FAILED" | "MT5_NOT_CONNECTED" => {
            "Bitte MetaTrader 5 öffnen und beim gewünschten Brokerkonto anmelden. Danach MT5-Trends aktualisieren."
        }
        "MT5_ACCOUNT_CHANGED" => {
            "Das MT5-Konto wurde während des Kursabrufs gewechselt. Bitte erneut aktualisieren."
        }
        "MT5_SYMBOLS_UNAVAILABLE" | "MT5_NO_HISTORY" => {
            "MT5 liefert noch keine ausreichende Forex-Historie. Bitte die gewünschten Paare in MT5 öffnen und erneut aktualisieren."
        }
        "MT5_TECHNICAL_BUSY" => "Ein MT5-Kursabruf läuft bereits. Bitte kurz warten.",
        "MT5_TIMEOUT" => {
            "Der MT5-Kursabruf hat zu lange gedauert. Bitte die Terminalverbindung prüfen und erneut aktualisieren."
        }
        _ => {
            "Die MT5-Kursdaten konnten nicht sicher übernommen werden. Bitte die Terminalverbindung prüfen."
        }
    };
    CommandError {
        code: code.into(),
        message: message.into(),
        details: None,
    }
}
