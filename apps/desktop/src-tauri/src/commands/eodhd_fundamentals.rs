use std::{collections::HashMap, str::FromStr};

use chrono::{DateTime, Datelike, Duration, Months, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::FromRow;
use tauri::State;
use uuid::Uuid;

use crate::{
    database::AppState,
    errors::{AppError, CommandResult},
};

use super::{eodhd, eodhd_prices};

const CURRENCIES: [&str; 9] = [
    "AUD", "CAD", "CHF", "CNY", "EUR", "GBP", "JPY", "NZD", "USD",
];

#[derive(Debug, Clone, Copy)]
struct CanonicalField {
    key: &'static str,
    label: &'static str,
    factor: &'static str,
    direction: i8,
}

const FIELDS: [CanonicalField; 17] = [
    CanonicalField {
        key: "gdp",
        label: "GDP",
        factor: "growth",
        direction: 1,
    },
    CanonicalField {
        key: "manufacturing_pmi",
        label: "mPMI",
        factor: "growth",
        direction: 1,
    },
    CanonicalField {
        key: "services_pmi",
        label: "sPMI",
        factor: "growth",
        direction: 1,
    },
    CanonicalField {
        key: "retail_sales",
        label: "Retail Sales",
        factor: "growth",
        direction: 1,
    },
    CanonicalField {
        key: "consumer_confidence",
        label: "Consumer Confidence",
        factor: "growth",
        direction: 1,
    },
    CanonicalField {
        key: "industrial_production",
        label: "Industrial Production",
        factor: "growth",
        direction: 1,
    },
    CanonicalField {
        key: "trade_balance",
        label: "Trade Balance",
        factor: "growth",
        direction: 1,
    },
    CanonicalField {
        key: "cpi_yoy",
        label: "CPI YoY",
        factor: "inflation",
        direction: 1,
    },
    CanonicalField {
        key: "ppi_yoy",
        label: "PPI YoY",
        factor: "inflation",
        direction: 1,
    },
    CanonicalField {
        key: "pce_yoy",
        label: "Core Inflation",
        factor: "inflation",
        direction: 1,
    },
    CanonicalField {
        key: "interest_rates",
        label: "Interest Rates",
        factor: "rates",
        direction: 1,
    },
    CanonicalField {
        key: "nfp",
        label: "Employment",
        factor: "labor",
        direction: 1,
    },
    CanonicalField {
        key: "unemployment_rate",
        label: "Unemployment Rate",
        factor: "labor",
        direction: -1,
    },
    CanonicalField {
        key: "unemployment_claims",
        label: "Unemployment Claims",
        factor: "labor",
        direction: -1,
    },
    CanonicalField {
        key: "adp",
        label: "ADP",
        factor: "labor",
        direction: 1,
    },
    CanonicalField {
        key: "jolts",
        label: "Labor Demand",
        factor: "labor",
        direction: 1,
    },
    CanonicalField {
        key: "wage_growth",
        label: "Wage Growth",
        factor: "labor",
        direction: 1,
    },
];

// These provider-native China releases enrich the economic-data history but
// intentionally stay outside the fixed 17-cell cross-currency pair model.
const CNY_HISTORY_ONLY_FIELDS: [&str; 14] = [
    "china_private_manufacturing_pmi",
    "china_private_services_pmi",
    "fixed_asset_investment",
    "exports_yoy",
    "imports_yoy",
    "industrial_profits_yoy",
    "industrial_capacity_utilization",
    "current_account",
    "foreign_direct_investment",
    "house_price_index_yoy",
    "m2_money_supply_yoy",
    "new_yuan_loans",
    "total_social_financing",
    "loan_prime_rate_5y",
];

#[derive(Debug, Clone)]
struct ReleaseCandidate {
    id: Option<String>,
    currency: String,
    canonical_key: String,
    provider_type: String,
    comparison: Option<String>,
    released_at: String,
    frequency: String,
    actual: Option<String>,
    forecast: Option<String>,
    previous: Option<String>,
    source_url: Option<String>,
    unit: Option<String>,
    priority: i64,
}

#[derive(Debug, Clone)]
struct SelectedRelease {
    release: ReleaseCandidate,
    pending_newer_release_at: Option<String>,
}

#[derive(Debug, Clone)]
struct MappingScore {
    canonical_key: String,
    confidence: i32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum MappingDecision {
    Automatic(String),
    ReviewRequired,
    Unavailable,
}

#[derive(Debug, Clone, FromRow)]
struct ProfileRow {
    currency: String,
    canonical_key: String,
    target_label: String,
    factor: String,
    direction: i64,
    expected_comparison: Option<String>,
    expected_frequency: Option<String>,
    unit: Option<String>,
    freshness_days: i64,
}

#[derive(Debug, Clone, FromRow)]
struct PinnedSeriesRow {
    currency: String,
    canonical_key: String,
    provider_type: String,
    comparison: Option<String>,
}

#[derive(Debug, Clone, FromRow)]
struct EventRow {
    id: String,
    currency: String,
    canonical_key: Option<String>,
    provider_type: String,
    comparison: Option<String>,
    released_at: String,
    frequency: String,
    actual_value: Option<String>,
    forecast_value: Option<String>,
    previous_value: Option<String>,
    source_url: String,
    unit: Option<String>,
    priority: i64,
}

impl EventRow {
    fn as_release(&self) -> Option<ReleaseCandidate> {
        Some(ReleaseCandidate {
            id: Some(self.id.clone()),
            currency: self.currency.clone(),
            canonical_key: self.canonical_key.clone()?,
            provider_type: self.provider_type.clone(),
            comparison: self.comparison.clone(),
            released_at: self.released_at.clone(),
            frequency: self.frequency.clone(),
            actual: self.actual_value.clone(),
            forecast: self.forecast_value.clone(),
            previous: self.previous_value.clone(),
            source_url: Some(self.source_url.clone()),
            unit: self.unit.clone(),
            priority: self.priority,
        })
    }
}

#[derive(Debug, Clone, FromRow)]
struct EvaluationRow {
    currency: String,
    canonical_key: String,
    source_label: Option<String>,
    actual_text: Option<String>,
    forecast_text: Option<String>,
    previous_text: Option<String>,
    surprise_text: Option<String>,
    score: i64,
    evaluation_status: String,
    reason_codes_json: String,
    released_at: Option<String>,
    pending_newer_release_at: Option<String>,
    frequency: Option<String>,
    source_url: Option<String>,
    unit: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MacroFundamentalsDashboard {
    pub as_of: String,
    pub snapshot_id: Option<String>,
    pub currencies: Vec<FundamentalCurrencyView>,
    pub pairs: Vec<FundamentalPairView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FundamentalCurrencyView {
    pub currency: String,
    pub economic_growth_score: i32,
    pub inflation_score: i32,
    pub rates_score: i32,
    pub jobs_market_score: i32,
    pub fundamentals_score: i32,
    pub economic_growth_bias: String,
    pub inflation_bias: String,
    pub rates_bias: String,
    pub jobs_market_bias: String,
    pub fundamentals_bias: String,
    pub indicators: Vec<FundamentalIndicatorView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FundamentalIndicatorView {
    pub key: String,
    pub label: String,
    pub factor: String,
    pub direction: i8,
    pub source_indicator_key: Option<String>,
    pub source_label: Option<String>,
    pub actual_text: Option<String>,
    pub forecast_text: Option<String>,
    pub previous_text: Option<String>,
    pub surprise_text: Option<String>,
    pub score: i8,
    pub status: String,
    pub reason_codes: Vec<String>,
    pub released_at: Option<String>,
    pub pending_newer_release_at: Option<String>,
    pub unit: Option<String>,
    pub frequency: Option<String>,
    pub source_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FundamentalPairView {
    pub base: String,
    pub quote: String,
    pub fundamental_score: i32,
    pub bias_label: String,
    pub cells: Vec<FundamentalPairCellView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FundamentalPairCellView {
    pub key: String,
    pub label: String,
    pub factor: String,
    pub base_score: i8,
    pub quote_score: i8,
    pub score: i8,
    pub available: bool,
    pub base_available: bool,
    pub quote_available: bool,
    pub base_released_at: Option<String>,
    pub quote_released_at: Option<String>,
    pub base_frequency: Option<String>,
    pub quote_frequency: Option<String>,
    pub reason_codes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EodhdSyncRun {
    pub id: String,
    pub trigger_kind: String,
    pub status: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub countries_requested: i64,
    pub events_seen: i64,
    pub events_updated: i64,
    pub mapping_candidates: i64,
    pub snapshot_updated: bool,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EodhdFeedStatus {
    pub configured: bool,
    pub running: bool,
    pub last_run: Option<EodhdSyncRun>,
    pub pending_jobs: i64,
    pub next_due_at: Option<String>,
    pub pending_mapping_reviews: i64,
    pub last_success_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EodhdSyncResult {
    pub run: EodhdSyncRun,
    pub snapshot: MacroFundamentalsDashboard,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EodhdMappingCandidate {
    pub id: String,
    pub currency: String,
    pub provider_type: String,
    pub comparison: Option<String>,
    pub proposed_canonical_key: Option<String>,
    pub confidence: i64,
    pub runner_up_canonical_key: Option<String>,
    pub runner_up_confidence: Option<i64>,
    pub status: String,
    pub created_at: String,
    pub reviewed_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EodhdIndicatorHistoryInput {
    pub currency: String,
    pub canonical_key: String,
    pub months: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EodhdIndicatorHistory {
    pub currency: String,
    pub country: Option<String>,
    pub canonical_key: String,
    pub label: String,
    pub factor: String,
    pub direction: i8,
    pub comparison: Option<String>,
    pub frequency: Option<String>,
    pub unit: Option<String>,
    pub freshness_days: i64,
    pub months: u32,
    pub from: String,
    pub to: String,
    pub next_release_at: Option<String>,
    pub points: Vec<EodhdIndicatorHistoryPoint>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EodhdIndicatorHistoryPoint {
    pub id: String,
    pub country: String,
    pub provider_type: String,
    pub comparison: Option<String>,
    pub period: Option<String>,
    pub released_at: String,
    pub actual_text: Option<String>,
    pub forecast_text: Option<String>,
    pub previous_text: Option<String>,
    pub frequency: String,
    pub unit: String,
    pub revision_count: i64,
    pub source_url: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EconomicCalendarInput {
    pub range: String,
    pub timezone_offset_minutes: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EconomicCalendarResponse {
    pub as_of: String,
    pub from: String,
    pub to: String,
    pub source_name: String,
    pub source_url: String,
    pub events: Vec<EconomicCalendarEvent>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EconomicCalendarEvent {
    pub id: String,
    pub country: String,
    pub currency: String,
    pub title: String,
    pub category: String,
    pub canonical_key: Option<String>,
    pub comparison: Option<String>,
    pub period: Option<String>,
    pub scheduled_at: String,
    pub actual_text: Option<String>,
    pub forecast_text: Option<String>,
    pub previous_text: Option<String>,
    pub frequency: String,
    pub affected_assets: Vec<String>,
    pub mapping_status: String,
    pub source_url: String,
}

#[derive(Debug, Clone, FromRow)]
struct EconomicCalendarRow {
    id: String,
    country: String,
    currency: String,
    provider_type: String,
    canonical_key: Option<String>,
    comparison: Option<String>,
    period: Option<String>,
    released_at: String,
    actual_value: Option<String>,
    forecast_value: Option<String>,
    previous_value: Option<String>,
    frequency: String,
    mapping_status: String,
    source_url: String,
    factor: Option<String>,
}

fn release_signal(release: &ReleaseCandidate, direction: i8) -> Option<i8> {
    let actual = Decimal::from_str(release.actual.as_deref()?).ok()?;
    let forecast = Decimal::from_str(release.forecast.as_deref()?).ok()?;
    Some(match (actual - forecast) * Decimal::from(direction) {
        value if value > Decimal::ZERO => 1,
        value if value < Decimal::ZERO => -1,
        _ => 0,
    })
}

fn pair_component(base: Option<i8>, quote: Option<i8>) -> i8 {
    base.unwrap_or(0)
        .saturating_sub(quote.unwrap_or(0))
        .clamp(-2, 2)
}

fn select_current_release(releases: &[ReleaseCandidate]) -> Option<SelectedRelease> {
    let mut ordered = releases.iter().collect::<Vec<_>>();
    ordered.sort_by(|left, right| {
        right
            .released_at
            .cmp(&left.released_at)
            .then_with(|| left.priority.cmp(&right.priority))
    });
    let selected = ordered
        .iter()
        .copied()
        .find(|release| release.actual.is_some() && release.forecast.is_some())?;
    let pending_newer_release_at = ordered
        .iter()
        .copied()
        .filter(|release| {
            release.released_at > selected.released_at
                && (release.actual.is_none() || release.forecast.is_none())
        })
        .min_by(|left, right| left.released_at.cmp(&right.released_at))
        .map(|release| release.released_at.clone());
    Some(SelectedRelease {
        release: selected.clone(),
        pending_newer_release_at,
    })
}

fn mapping_confidence(
    currency: &str,
    canonical_key: &str,
    target_label: &str,
    provider_type: &str,
) -> i32 {
    (eodhd::candidate_score(currency, canonical_key, target_label, provider_type) * 2).clamp(0, 100)
}

fn series_identity(currency: &str, provider_type: &str, comparison: Option<&str>) -> String {
    format!(
        "{}|{}|{}",
        currency.trim().to_ascii_uppercase(),
        provider_type.trim().to_ascii_lowercase(),
        comparison.unwrap_or_default().trim().to_ascii_lowercase()
    )
}

fn decide_mapping(scores: &[MappingScore]) -> MappingDecision {
    let mut ordered = scores.to_vec();
    ordered.sort_by_key(|item| std::cmp::Reverse(item.confidence));
    let Some(best) = ordered.first() else {
        return MappingDecision::Unavailable;
    };
    if best.confidence <= 0 {
        return MappingDecision::Unavailable;
    }
    let margin = best.confidence - ordered.get(1).map_or(0, |item| item.confidence);
    if best.confidence >= 75 && margin >= 15 {
        MappingDecision::Automatic(best.canonical_key.clone())
    } else {
        MappingDecision::ReviewRequired
    }
}

#[tauri::command]
pub async fn get_eodhd_fundamentals_dashboard(
    state: State<'_, AppState>,
) -> CommandResult<MacroFundamentalsDashboard> {
    if snapshot_refresh_is_due(&state, Utc::now()).await? {
        rebuild_snapshot(&state).await?;
    }
    load_fundamental_dashboard(&state).await.map_err(Into::into)
}

#[tauri::command]
pub async fn get_eodhd_indicator_history(
    state: State<'_, AppState>,
    input: EodhdIndicatorHistoryInput,
) -> CommandResult<EodhdIndicatorHistory> {
    load_indicator_history_at(&state, input, Utc::now())
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn get_economic_calendar(
    state: State<'_, AppState>,
    input: EconomicCalendarInput,
) -> CommandResult<EconomicCalendarResponse> {
    load_economic_calendar_at(&state, input, Utc::now())
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn sync_eodhd_indicator_history(
    state: State<'_, AppState>,
    input: EodhdIndicatorHistoryInput,
) -> CommandResult<EodhdIndicatorHistory> {
    sync_indicator_history(&state, input)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn get_eodhd_feed_status(state: State<'_, AppState>) -> CommandResult<EodhdFeedStatus> {
    load_feed_status(&state).await.map_err(Into::into)
}

#[tauri::command]
pub async fn sync_eodhd_now(state: State<'_, AppState>) -> CommandResult<EodhdSyncResult> {
    sync_eodhd(&state, "manual", true).await.map_err(Into::into)
}

#[tauri::command]
pub async fn list_eodhd_mapping_candidates(
    state: State<'_, AppState>,
) -> CommandResult<Vec<EodhdMappingCandidate>> {
    sqlx::query_as(
        "SELECT id,currency,provider_type,comparison,proposed_canonical_key,confidence,runner_up_canonical_key,runner_up_confidence,status,created_at,reviewed_at
         FROM eodhd_mapping_candidates ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,created_at DESC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub async fn review_eodhd_mapping_candidate(
    state: State<'_, AppState>,
    id: String,
    action: String,
    canonical_key: Option<String>,
) -> CommandResult<EodhdMappingCandidate> {
    review_mapping_candidate(&state, &id, &action, canonical_key.as_deref())
        .await
        .map_err(Into::into)
}

pub async fn scheduled_eodhd_sync(state: &AppState) -> Result<(), AppError> {
    if snapshot_refresh_is_due(state, Utc::now()).await? {
        rebuild_snapshot(state).await?;
    }
    if eodhd_api_key().is_none() || !sync_is_due(state).await? {
        return Ok(());
    }
    let trigger = if last_success_at(state).await?.is_some() {
        "scheduled"
    } else {
        "startup"
    };
    sync_eodhd(state, trigger, false).await.map(|_| ())
}

pub(crate) async fn sync_eodhd_for_rates(state: &AppState) -> Result<(), AppError> {
    sync_eodhd(state, "manual", true).await.map(|_| ())
}

async fn sync_eodhd(
    state: &AppState,
    trigger_kind: &str,
    force: bool,
) -> Result<EodhdSyncResult, AppError> {
    recover_stale_sync_runs(state, Utc::now()).await?;
    let running: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM eodhd_sync_runs WHERE status='running'")
            .fetch_one(&state.db)
            .await?;
    if running > 0 {
        return Err(AppError::Conflict(
            "Eine EODHD-Synchronisierung läuft bereits.".into(),
        ));
    }
    if !force && !sync_is_due(state).await? {
        return Err(AppError::Conflict(
            "Aktuell ist keine EODHD-Prüfung fällig.".into(),
        ));
    }
    let api_key = eodhd_api_key().ok_or_else(|| {
        AppError::Validation("EODHD_API_KEY ist im nativen Backend nicht konfiguriert.".into())
    })?;
    let run_id = Uuid::new_v4().to_string();
    let started_at = Utc::now().to_rfc3339();

    let due_currencies = due_release_currencies(state).await?;
    let scoped = !force && !due_currencies.is_empty();
    let currencies = if scoped {
        due_currencies
    } else {
        CURRENCIES.iter().map(|value| (*value).to_owned()).collect()
    };
    sqlx::query(
        "INSERT INTO eodhd_sync_runs(id,trigger_kind,status,started_at,countries_requested)
         VALUES(?,?,'running',?,?)",
    )
    .bind(&run_id)
    .bind(trigger_kind)
    .bind(&started_at)
    .bind(currencies.len() as i64)
    .execute(&state.db)
    .await?;

    let now = Utc::now();
    let (from, to) = if scoped {
        (now - Duration::days(2), now + Duration::days(2))
    } else {
        (now - Duration::days(180), now + Duration::days(90))
    };
    let refs = currencies.iter().map(String::as_str).collect::<Vec<_>>();
    let outcome = async {
        let events = eodhd::fetch_events_for_currencies(&api_key, &refs, from, to).await?;
        let (events_updated, mapping_candidates) = ingest_events(state, &events).await?;
        let snapshot_updated = rebuild_snapshot(state).await?;
        sqlx::query(
            "UPDATE eodhd_release_jobs SET status='complete',last_attempt_at=?,attempts=attempts+1,error_message=NULL
             WHERE status IN ('pending','failed') AND scheduled_for<=?",
        )
        .bind(now.to_rfc3339())
        .bind(now.to_rfc3339())
        .execute(&state.db)
        .await?;
        Ok::<_, AppError>((
            events.len() as i64,
            events_updated,
            mapping_candidates,
            snapshot_updated,
        ))
    }
    .await;

    match outcome {
        Ok((events_seen, events_updated, mapping_candidates, snapshot_updated)) => {
            let completed_at = Utc::now().to_rfc3339();
            sqlx::query(
                "UPDATE eodhd_sync_runs SET status='complete',completed_at=?,events_seen=?,events_updated=?,mapping_candidates=?,snapshot_updated=? WHERE id=?",
            )
            .bind(&completed_at)
            .bind(events_seen)
            .bind(events_updated)
            .bind(mapping_candidates)
            .bind(snapshot_updated)
            .bind(&run_id)
            .execute(&state.db)
            .await?;
            let run = load_run(state, &run_id).await?;
            let snapshot = load_fundamental_dashboard(state).await?;
            Ok(EodhdSyncResult { run, snapshot })
        }
        Err(error) => {
            sqlx::query(
                "UPDATE eodhd_sync_runs SET status='failed',completed_at=?,error_message=? WHERE id=?",
            )
            .bind(Utc::now().to_rfc3339())
            .bind(error.to_string().chars().take(500).collect::<String>())
            .bind(&run_id)
            .execute(&state.db)
            .await?;
            Err(error)
        }
    }
}

pub(crate) async fn sync_indicator_history(
    state: &AppState,
    input: EodhdIndicatorHistoryInput,
) -> Result<EodhdIndicatorHistory, AppError> {
    let (currency, _) = validate_history_input(&input)?;
    let now = Utc::now();
    recover_stale_sync_runs(state, now).await?;
    let running: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM eodhd_sync_runs WHERE status='running'")
            .fetch_one(&state.db)
            .await?;
    if running > 0 {
        return Err(AppError::Conflict(
            "Eine EODHD-Synchronisierung läuft bereits.".into(),
        ));
    }
    let api_key = eodhd_api_key().ok_or_else(|| {
        AppError::Validation("EODHD_API_KEY ist im nativen Backend nicht konfiguriert.".into())
    })?;
    let run_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO eodhd_sync_runs(id,trigger_kind,status,started_at,countries_requested)
         VALUES(?,'manual','running',?,1)",
    )
    .bind(&run_id)
    .bind(now.to_rfc3339())
    .execute(&state.db)
    .await?;

    let from = now
        .checked_sub_months(Months::new(input.months))
        .unwrap_or_else(|| now - Duration::days(i64::from(input.months) * 31));
    let to = now + Duration::days(30);
    let result = async {
        let events =
            eodhd::fetch_events_for_currencies(&api_key, &[currency.as_str()], from, to).await?;
        let (events_updated, mapping_candidates) = ingest_events(state, &events).await?;
        let snapshot_updated = rebuild_snapshot(state).await?;
        Ok::<_, AppError>((
            events.len() as i64,
            events_updated,
            mapping_candidates,
            snapshot_updated,
        ))
    }
    .await;

    match result {
        Ok((events_seen, events_updated, mapping_candidates, snapshot_updated)) => {
            sqlx::query(
                "UPDATE eodhd_sync_runs
                 SET status='complete',completed_at=?,events_seen=?,events_updated=?,
                     mapping_candidates=?,snapshot_updated=? WHERE id=?",
            )
            .bind(Utc::now().to_rfc3339())
            .bind(events_seen)
            .bind(events_updated)
            .bind(mapping_candidates)
            .bind(snapshot_updated)
            .bind(&run_id)
            .execute(&state.db)
            .await?;
            load_indicator_history_at(state, input, Utc::now()).await
        }
        Err(error) => {
            sqlx::query(
                "UPDATE eodhd_sync_runs
                 SET status='failed',completed_at=?,error_message=? WHERE id=?",
            )
            .bind(Utc::now().to_rfc3339())
            .bind(error.to_string().chars().take(500).collect::<String>())
            .bind(&run_id)
            .execute(&state.db)
            .await?;
            Err(error)
        }
    }
}

async fn recover_stale_sync_runs(state: &AppState, now: DateTime<Utc>) -> Result<u64, AppError> {
    let result = sqlx::query(
        "UPDATE eodhd_sync_runs
         SET status='failed',completed_at=?,error_message=?
         WHERE status='running' AND started_at<?",
    )
    .bind(now.to_rfc3339())
    .bind("Der EODHD-Abgleich wurde unterbrochen und beim nächsten Start freigegeben.")
    .bind((now - Duration::minutes(30)).to_rfc3339())
    .execute(&state.db)
    .await?;
    Ok(result.rows_affected())
}

async fn load_economic_calendar_at(
    state: &AppState,
    input: EconomicCalendarInput,
    now: DateTime<Utc>,
) -> Result<EconomicCalendarResponse, AppError> {
    if !(-840..=840).contains(&input.timezone_offset_minutes) {
        return Err(AppError::Validation(
            "Die lokale Zeitzone des Wirtschaftskalenders ist ungültig.".into(),
        ));
    }
    let local_now = now - Duration::minutes(i64::from(input.timezone_offset_minutes));
    let local_date = local_now.date_naive();
    let local_start = match input.range.as_str() {
        "today" => local_date,
        "week" => {
            local_date - Duration::days(i64::from(local_date.weekday().num_days_from_monday()))
        }
        "month" => local_date
            .with_day(1)
            .expect("ein Monatsanfang existiert immer"),
        "future7" | "future30" | "future90" => local_date,
        _ => {
            return Err(AppError::Validation(
                "Der Kalenderzeitraum ist nicht zulässig.".into(),
            ));
        }
    };
    let history = matches!(input.range.as_str(), "today" | "week" | "month");
    let from = if history {
        DateTime::<Utc>::from_naive_utc_and_offset(
            local_start
                .and_hms_opt(0, 0, 0)
                .expect("Mitternacht ist immer gültig")
                + Duration::minutes(i64::from(input.timezone_offset_minutes)),
            Utc,
        )
    } else {
        now
    };
    let to = match input.range.as_str() {
        "future7" => now + Duration::days(7),
        "future30" => now + Duration::days(30),
        "future90" => now + Duration::days(90),
        _ => now,
    };
    let rows: Vec<EconomicCalendarRow> = sqlx::query_as(
        "SELECT e.id,e.country,e.currency,e.provider_type,e.canonical_key,e.comparison,e.period,
                e.released_at,e.actual_value,e.forecast_value,e.previous_value,e.frequency,e.mapping_status,
                e.source_url,p.factor
         FROM eodhd_events e
         LEFT JOIN eodhd_indicator_profiles p
           ON p.currency=e.currency AND p.canonical_key=e.canonical_key
         WHERE e.released_at>=? AND e.released_at<=?
         ORDER BY e.released_at,e.currency,e.provider_type",
    )
    .bind(from.to_rfc3339())
    .bind(to.to_rfc3339())
    .fetch_all(&state.db)
    .await?;

    let events = rows
        .into_iter()
        .map(|row| {
            let category = economic_calendar_category(
                row.factor.as_deref(),
                row.canonical_key.as_deref(),
                &row.provider_type,
            );
            EconomicCalendarEvent {
                id: row.id,
                country: row.country,
                currency: row.currency.clone(),
                title: row.provider_type,
                category: category.into(),
                canonical_key: row.canonical_key,
                comparison: row.comparison,
                period: row.period,
                scheduled_at: row.released_at,
                actual_text: row.actual_value,
                forecast_text: row.forecast_value,
                previous_text: row.previous_value,
                frequency: row.frequency,
                affected_assets: economic_calendar_assets(&row.currency, category),
                mapping_status: row.mapping_status,
                source_url: row.source_url,
            }
        })
        .collect();

    Ok(EconomicCalendarResponse {
        as_of: now.to_rfc3339(),
        from: from.to_rfc3339(),
        to: to.to_rfc3339(),
        source_name: "EODHD Economic Events API".into(),
        source_url: eodhd::ECONOMIC_EVENTS_URL.into(),
        events,
    })
}

fn economic_calendar_category(
    factor: Option<&str>,
    canonical_key: Option<&str>,
    title: &str,
) -> &'static str {
    match factor {
        Some("growth") => return "growth",
        Some("inflation") => return "inflation",
        Some("labor") => return "labor",
        Some("rates") => return "rates",
        _ => {}
    }
    let value = format!("{} {}", canonical_key.unwrap_or_default(), title).to_ascii_lowercase();
    if [
        "interest rate",
        "central bank",
        "monetary policy",
        "fomc",
        "fed ",
        "ecb",
        "boe",
        "boj",
        "rba",
        "rbnz",
        "boc",
        "snb",
        "pboc",
        "minutes",
        "powell",
        "lagarde",
    ]
    .iter()
    .any(|needle| value.contains(needle))
    {
        "rates"
    } else if ["inflation", "cpi", "ppi", "pce", "price index"]
        .iter()
        .any(|needle| value.contains(needle))
    {
        "inflation"
    } else if [
        "employment",
        "unemployment",
        "jobless",
        "payroll",
        "wage",
        "earnings",
        "jolts",
        "labor",
        "labour",
    ]
    .iter()
    .any(|needle| value.contains(needle))
    {
        "labor"
    } else if [
        "gdp",
        "pmi",
        "industrial production",
        "retail sales",
        "durable goods",
        "factory orders",
        "construction",
    ]
    .iter()
    .any(|needle| value.contains(needle))
    {
        "growth"
    } else if ["trade balance", "exports", "imports", "current account"]
        .iter()
        .any(|needle| value.contains(needle))
    {
        "trade"
    } else if ["housing", "home sales", "building permits", "mortgage"]
        .iter()
        .any(|needle| value.contains(needle))
    {
        "housing"
    } else if ["oil", "gas", "crude", "petroleum", "energy", "inventory"]
        .iter()
        .any(|needle| value.contains(needle))
    {
        "energy"
    } else if ["confidence", "sentiment", "expectations"]
        .iter()
        .any(|needle| value.contains(needle))
    {
        "confidence"
    } else if ["budget", "government", "debt", "bond auction", "treasury"]
        .iter()
        .any(|needle| value.contains(needle))
    {
        "fiscal"
    } else {
        "other"
    }
}

fn economic_calendar_assets(currency: &str, category: &str) -> Vec<String> {
    let mut assets = vec![format!("{currency} / FX")];
    let primary_market = match currency {
        "AUD" => "ASX 200",
        "CAD" => "TSX",
        "CHF" => "SMI",
        "CNY" => "CSI 300 / Hang Seng",
        "EUR" => "Euro Stoxx / DAX",
        "GBP" => "FTSE 100",
        "JPY" => "Nikkei 225",
        "NZD" => "NZX 50",
        "USD" => "S&P 500 / Nasdaq 100",
        _ => "Aktienindizes",
    };
    assets.push(primary_market.into());
    if matches!(category, "rates" | "inflation" | "fiscal") {
        assets.push("Staatsanleihen".into());
    }
    if currency == "USD" {
        assets.push("Gold".into());
        assets.push("BTC / ETH".into());
        if matches!(category, "energy" | "growth" | "inflation") {
            assets.push("WTI / Brent".into());
        }
    }
    if currency == "CNY" {
        assets.push("Kupfer / Industriemetalle".into());
        assets.push("WTI / Brent".into());
    }
    if currency == "CAD" || category == "energy" {
        assets.push("WTI / Brent".into());
    }
    if matches!(currency, "AUD" | "NZD") {
        assets.push("Rohstoffe / Metalle".into());
    }
    assets.sort();
    assets.dedup();
    assets
}

async fn ingest_events(
    state: &AppState,
    events: &[eodhd::EconomicEvent],
) -> Result<(i64, i64), AppError> {
    let profiles: Vec<ProfileRow> = sqlx::query_as(
        "SELECT currency,canonical_key,target_label,factor,direction,expected_comparison,
                expected_frequency,unit,freshness_days
         FROM eodhd_indicator_profiles WHERE enabled=1 ORDER BY currency,mapping_rank,canonical_key",
    )
    .fetch_all(&state.db)
    .await?;
    let mut by_currency: HashMap<&str, Vec<&ProfileRow>> = HashMap::new();
    for profile in &profiles {
        by_currency
            .entry(profile.currency.as_str())
            .or_default()
            .push(profile);
    }
    let pinned_series: Vec<PinnedSeriesRow> = sqlx::query_as(
        "SELECT currency,canonical_key,provider_type,comparison
         FROM eodhd_indicator_series WHERE enabled=1",
    )
    .fetch_all(&state.db)
    .await?;
    let pinned_by_identity = pinned_series
        .into_iter()
        .map(|series| {
            (
                series_identity(
                    &series.currency,
                    &series.provider_type,
                    series.comparison.as_deref(),
                ),
                series.canonical_key,
            )
        })
        .collect::<HashMap<_, _>>();
    let now = Utc::now();
    let now_text = now.to_rfc3339();
    let mut updated = 0_i64;
    let mut transaction = state.db.begin().await?;

    for event in events {
        let Some(currency) = event.country.as_deref().and_then(currency_for_country) else {
            continue;
        };
        let Some(released_at) = eodhd::parse_release_time(&event.date) else {
            continue;
        };
        let comparison = event
            .comparison
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty());
        let pinned_key = pinned_by_identity
            .get(&series_identity(currency, &event.event_type, comparison))
            .cloned();
        let approved: Option<String> = sqlx::query_scalar(
            "SELECT proposed_canonical_key FROM eodhd_mapping_candidates
             WHERE currency=? AND provider_type=? AND COALESCE(comparison,'')=COALESCE(?,'')
               AND status='approved' LIMIT 1",
        )
        .bind(currency)
        .bind(&event.event_type)
        .bind(comparison)
        .fetch_optional(&mut *transaction)
        .await?;

        let scores = by_currency
            .get(currency)
            .into_iter()
            .flatten()
            .map(|profile| MappingScore {
                canonical_key: profile.canonical_key.clone(),
                confidence: mapping_confidence(
                    currency,
                    &profile.canonical_key,
                    &profile.target_label,
                    &event.event_type,
                ),
            })
            .collect::<Vec<_>>();
        let mut ordered_scores = scores.clone();
        ordered_scores.sort_by_key(|item| std::cmp::Reverse(item.confidence));
        let decision = pinned_key
            .clone()
            .or(approved.clone())
            .map(MappingDecision::Automatic)
            .unwrap_or_else(|| decide_mapping(&scores));
        let (canonical_key, mapping_status, confidence) = match decision {
            MappingDecision::Automatic(key) => {
                let confidence = if pinned_key.as_deref() == Some(key.as_str()) {
                    100
                } else {
                    ordered_scores
                        .iter()
                        .find(|score| score.canonical_key == key)
                        .map_or(100, |score| score.confidence)
                };
                (
                    Some(key),
                    if approved.is_some() && pinned_key.is_none() {
                        "approved"
                    } else {
                        "automatic"
                    },
                    confidence,
                )
            }
            MappingDecision::ReviewRequired => {
                let best = ordered_scores.first();
                let runner_up = ordered_scores.get(1);
                let candidate_id = Uuid::new_v4().to_string();
                sqlx::query(
                    "INSERT INTO eodhd_mapping_candidates(id,currency,provider_type,comparison,proposed_canonical_key,confidence,runner_up_canonical_key,runner_up_confidence,status,created_at)
                     VALUES(?,?,?,?,?,?,?,?,'pending',?)
                     ON CONFLICT(currency,provider_type,comparison) DO UPDATE SET
                       proposed_canonical_key=excluded.proposed_canonical_key,
                       confidence=excluded.confidence,
                       runner_up_canonical_key=excluded.runner_up_canonical_key,
                       runner_up_confidence=excluded.runner_up_confidence",
                )
                .bind(candidate_id)
                .bind(currency)
                .bind(&event.event_type)
                .bind(comparison.unwrap_or(""))
                .bind(best.map(|score| score.canonical_key.as_str()))
                .bind(best.map_or(0, |score| score.confidence))
                .bind(runner_up.map(|score| score.canonical_key.as_str()))
                .bind(runner_up.map(|score| score.confidence))
                .bind(&now_text)
                .execute(&mut *transaction)
                .await?;
                (None, "review", best.map_or(0, |score| score.confidence))
            }
            MappingDecision::Unavailable => (None, "unavailable", 0),
        };

        let frequency = canonical_key
            .as_deref()
            .map(|key| eodhd::frequency(currency, key, event))
            .unwrap_or_else(|| infer_frequency(event));
        let actual_value = event.actual.as_ref().and_then(eodhd::value_decimal);
        let forecast_value = event.estimate.as_ref().and_then(eodhd::value_decimal);
        let previous_value = event.previous.as_ref().and_then(eodhd::value_decimal);
        let identity = event_identity(currency, event);
        let id = format!("eodhd:{identity}");
        sqlx::query(
            "INSERT INTO eodhd_event_revisions(
               id,event_id,event_identity,actual_value,forecast_value,previous_value,observed_at
             )
             SELECT ?,id,event_identity,actual_value,forecast_value,previous_value,?
             FROM eodhd_events
             WHERE event_identity=?
               AND (
                 (? IS NOT NULL AND COALESCE(actual_value,'')<>?) OR
                 (? IS NOT NULL AND COALESCE(forecast_value,'')<>?) OR
                 (? IS NOT NULL AND COALESCE(previous_value,'')<>?)
               )",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&now_text)
        .bind(&identity)
        .bind(&actual_value)
        .bind(&actual_value)
        .bind(&forecast_value)
        .bind(&forecast_value)
        .bind(&previous_value)
        .bind(&previous_value)
        .execute(&mut *transaction)
        .await?;

        sqlx::query(
            "INSERT INTO eodhd_events(id,event_identity,country,currency,provider_type,comparison,period,released_at,actual_value,forecast_value,previous_value,frequency,canonical_key,mapping_status,mapping_confidence,source_url,first_seen_at,updated_at)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(event_identity) DO UPDATE SET
               actual_value=COALESCE(excluded.actual_value,eodhd_events.actual_value),
               forecast_value=COALESCE(excluded.forecast_value,eodhd_events.forecast_value),
               previous_value=COALESCE(excluded.previous_value,eodhd_events.previous_value),
               frequency=excluded.frequency,
               canonical_key=CASE WHEN eodhd_events.mapping_status='approved' THEN eodhd_events.canonical_key ELSE excluded.canonical_key END,
               mapping_status=CASE WHEN eodhd_events.mapping_status='approved' THEN 'approved' ELSE excluded.mapping_status END,
               mapping_confidence=CASE WHEN eodhd_events.mapping_status='approved' THEN eodhd_events.mapping_confidence ELSE excluded.mapping_confidence END,
               updated_at=excluded.updated_at",
        )
        .bind(&id)
        .bind(&identity)
        .bind(event.country.as_deref().unwrap_or_default())
        .bind(currency)
        .bind(&event.event_type)
        .bind(comparison)
        .bind(&event.period)
        .bind(released_at.to_rfc3339())
        .bind(&actual_value)
        .bind(&forecast_value)
        .bind(&previous_value)
        .bind(frequency)
        .bind(&canonical_key)
        .bind(mapping_status)
        .bind(confidence)
        .bind(eodhd::ECONOMIC_EVENTS_URL)
        .bind(&now_text)
        .bind(&now_text)
        .execute(&mut *transaction)
        .await?;
        updated += 1;

        let has_actual = actual_value.is_some();
        let has_forecast = forecast_value.is_some();
        let planned_retries = [2_i64, 10, 30, 120]
            .map(|minutes| (released_at + Duration::minutes(minutes)).to_rfc3339());
        if has_actual && has_forecast {
            sqlx::query(
                "UPDATE eodhd_release_jobs SET status='cancelled'
                 WHERE event_id=? AND status IN ('pending','failed')",
            )
            .bind(&id)
            .execute(&mut *transaction)
            .await?;
        } else {
            // Older builds anchored retries to every observation time. Remove those
            // duplicates so an incomplete provider record cannot trigger a sync loop.
            sqlx::query(
                "UPDATE eodhd_release_jobs SET status='cancelled'
                 WHERE event_id=? AND status IN ('pending','failed')
                   AND scheduled_for NOT IN (?,?,?,?)",
            )
            .bind(&id)
            .bind(&planned_retries[0])
            .bind(&planned_retries[1])
            .bind(&planned_retries[2])
            .bind(&planned_retries[3])
            .execute(&mut *transaction)
            .await?;
        }

        let needs_release_follow_up = canonical_key.is_some()
            && ((released_at > now && released_at <= now + Duration::days(30))
                || (released_at <= now
                    && released_at >= now - Duration::days(7)
                    && (event
                        .actual
                        .as_ref()
                        .and_then(eodhd::value_decimal)
                        .is_none()
                        || event
                            .estimate
                            .as_ref()
                            .and_then(eodhd::value_decimal)
                            .is_none())));
        if needs_release_follow_up {
            for scheduled_for in planned_retries {
                sqlx::query(
                    "INSERT OR IGNORE INTO eodhd_release_jobs(id,event_id,scheduled_for,status,created_at)
                     VALUES(?,?,?,'pending',?)",
                )
                .bind(Uuid::new_v4().to_string())
                .bind(&id)
                .bind(scheduled_for)
                .bind(&now_text)
                .execute(&mut *transaction)
                .await?;
            }
        }
    }
    transaction.commit().await?;
    let candidates: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM eodhd_mapping_candidates WHERE status='pending'")
            .fetch_one(&state.db)
            .await?;
    Ok((updated, candidates))
}

async fn rebuild_snapshot(state: &AppState) -> Result<bool, AppError> {
    rebuild_snapshot_at(state, Utc::now()).await
}

async fn rebuild_snapshot_at(state: &AppState, now: DateTime<Utc>) -> Result<bool, AppError> {
    let profiles: Vec<ProfileRow> = sqlx::query_as(
        "SELECT currency,canonical_key,target_label,factor,direction,expected_comparison,
                expected_frequency,unit,freshness_days
         FROM eodhd_indicator_profiles WHERE enabled=1 ORDER BY currency,mapping_rank,canonical_key",
    )
    .fetch_all(&state.db)
    .await?;
    let events: Vec<EventRow> = sqlx::query_as(
        "SELECT e.id,e.currency,s.canonical_key,e.provider_type,e.comparison,e.released_at,
                s.frequency,e.actual_value,e.forecast_value,e.previous_value,e.source_url,
                s.unit,s.priority
         FROM eodhd_events e
         JOIN eodhd_indicator_series s
          ON s.currency=e.currency
         AND s.provider_type=e.provider_type
          AND LOWER(COALESCE(s.comparison,''))=LOWER(COALESCE(e.comparison,''))
          AND s.enabled=1
         WHERE e.released_at<=?
         ORDER BY e.released_at DESC,s.priority ASC",
    )
    .bind(now.to_rfc3339())
    .fetch_all(&state.db)
    .await?;
    let mut by_key: HashMap<(String, String), Vec<ReleaseCandidate>> = HashMap::new();
    for event in &events {
        if let Some(release) = event.as_release() {
            by_key
                .entry((release.currency.clone(), release.canonical_key.clone()))
                .or_default()
                .push(release);
        }
    }

    #[derive(Clone)]
    struct BuiltEvaluation {
        profile: ProfileRow,
        selected: Option<SelectedRelease>,
        score: i8,
        status: String,
        reason_codes: Vec<String>,
        surprise: Option<String>,
    }

    let mut evaluations = Vec::with_capacity(profiles.len());
    let mut fingerprint = Sha256::new();
    let mut unavailable = 0_usize;
    for profile in profiles {
        let releases = by_key
            .get(&(profile.currency.clone(), profile.canonical_key.clone()))
            .map(Vec::as_slice)
            .unwrap_or_default()
            .to_vec();
        let selected_candidate = select_current_release(&releases);
        let stale_release = selected_candidate.as_ref().is_some_and(|selected| {
            DateTime::parse_from_rfc3339(&selected.release.released_at)
                .ok()
                .map(|released_at| released_at.with_timezone(&Utc))
                .is_some_and(|released_at| {
                    released_at < now - Duration::days(profile.freshness_days)
                })
        });
        let selected = (!stale_release).then_some(selected_candidate).flatten();
        let (score, status, reasons, surprise) = if let Some(selected) = &selected {
            let signal = release_signal(&selected.release, profile.direction as i8).unwrap_or(0);
            let actual = Decimal::from_str(selected.release.actual.as_deref().unwrap_or("0")).ok();
            let forecast =
                Decimal::from_str(selected.release.forecast.as_deref().unwrap_or("0")).ok();
            let surprise = actual
                .zip(forecast)
                .map(|(actual, forecast)| (actual - forecast).to_string());
            if signal == 0 {
                (
                    0,
                    "neutral".to_owned(),
                    vec!["actual_equals_forecast".to_owned()],
                    surprise,
                )
            } else {
                (signal, "scored".to_owned(), Vec::new(), surprise)
            }
        } else if stale_release {
            unavailable += 1;
            (
                0,
                "unmapped".to_owned(),
                vec!["stale_release".to_owned()],
                None,
            )
        } else {
            unavailable += 1;
            let review_exists: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM eodhd_mapping_candidates WHERE currency=? AND proposed_canonical_key=? AND status='pending'",
            )
            .bind(&profile.currency)
            .bind(&profile.canonical_key)
            .fetch_one(&state.db)
            .await?;
            if review_exists > 0 {
                (
                    0,
                    "review_required".to_owned(),
                    vec!["mapping_review_required".to_owned()],
                    None,
                )
            } else {
                (
                    0,
                    "unmapped".to_owned(),
                    vec!["eodhd_release_unavailable".to_owned()],
                    None,
                )
            }
        };
        fingerprint.update(profile.currency.as_bytes());
        fingerprint.update(profile.canonical_key.as_bytes());
        fingerprint.update(score.to_string().as_bytes());
        fingerprint.update(status.as_bytes());
        fingerprint.update(profile.freshness_days.to_string().as_bytes());
        fingerprint.update(profile.unit.as_deref().unwrap_or_default().as_bytes());
        fingerprint.update(
            profile
                .expected_frequency
                .as_deref()
                .unwrap_or_default()
                .as_bytes(),
        );
        fingerprint.update(
            profile
                .expected_comparison
                .as_deref()
                .unwrap_or_default()
                .as_bytes(),
        );
        if let Some(selected) = &selected {
            fingerprint.update(selected.release.released_at.as_bytes());
            fingerprint.update(selected.release.provider_type.as_bytes());
            fingerprint.update(
                selected
                    .release
                    .comparison
                    .as_deref()
                    .unwrap_or_default()
                    .as_bytes(),
            );
            fingerprint.update(
                selected
                    .release
                    .actual
                    .as_deref()
                    .unwrap_or_default()
                    .as_bytes(),
            );
            fingerprint.update(
                selected
                    .release
                    .forecast
                    .as_deref()
                    .unwrap_or_default()
                    .as_bytes(),
            );
            fingerprint.update(
                selected
                    .release
                    .previous
                    .as_deref()
                    .unwrap_or_default()
                    .as_bytes(),
            );
        }
        evaluations.push(BuiltEvaluation {
            profile,
            selected,
            score,
            status,
            reason_codes: reasons,
            surprise,
        });
    }
    let fingerprint = fingerprint
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let existing: Option<String> = sqlx::query_scalar(
        "SELECT id FROM eodhd_fundamental_snapshots WHERE input_fingerprint=? LIMIT 1",
    )
    .bind(&fingerprint)
    .fetch_optional(&state.db)
    .await?;
    if existing.is_some() {
        return Ok(false);
    }

    let snapshot_id = Uuid::new_v4().to_string();
    let built_at = now.to_rfc3339();
    let mut transaction = state.db.begin().await?;
    sqlx::query(
        "INSERT INTO eodhd_fundamental_snapshots(id,built_at,input_fingerprint,status)
         VALUES(?,?,?,?)",
    )
    .bind(&snapshot_id)
    .bind(&built_at)
    .bind(&fingerprint)
    .bind(if unavailable == 0 {
        "complete"
    } else {
        "partial"
    })
    .execute(&mut *transaction)
    .await?;
    for evaluation in evaluations {
        let release = evaluation.selected.as_ref().map(|item| &item.release);
        sqlx::query(
            "INSERT INTO eodhd_fundamental_evaluations(id,snapshot_id,event_id,currency,canonical_key,source_label,factor,direction,actual_text,forecast_text,previous_text,surprise_text,score,evaluation_status,reason_codes_json,released_at,pending_newer_release_at,frequency,source_url,unit)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&snapshot_id)
        .bind(release.and_then(|item| item.id.as_deref()))
        .bind(&evaluation.profile.currency)
        .bind(&evaluation.profile.canonical_key)
        .bind(release.map(|item| item.provider_type.as_str()))
        .bind(&evaluation.profile.factor)
        .bind(evaluation.profile.direction)
        .bind(release.and_then(|item| item.actual.as_deref()))
        .bind(release.and_then(|item| item.forecast.as_deref()))
        .bind(release.and_then(|item| item.previous.as_deref()))
        .bind(&evaluation.surprise)
        .bind(evaluation.score)
        .bind(&evaluation.status)
        .bind(serde_json::to_string(&evaluation.reason_codes).unwrap_or_else(|_| "[]".into()))
        .bind(release.map(|item| item.released_at.as_str()))
        .bind(evaluation.selected.as_ref().and_then(|item| item.pending_newer_release_at.as_deref()))
        .bind(release.map(|item| item.frequency.as_str()))
        .bind(release.and_then(|item| item.source_url.as_deref()))
        .bind(
            release
                .and_then(|item| item.unit.as_deref())
                .or(evaluation.profile.unit.as_deref()),
        )
        .execute(&mut *transaction)
        .await?;
    }
    transaction.commit().await?;
    Ok(true)
}

async fn load_fundamental_dashboard(
    state: &AppState,
) -> Result<MacroFundamentalsDashboard, AppError> {
    let snapshot: Option<(String, String)> = sqlx::query_as(
        "SELECT id,built_at FROM eodhd_fundamental_snapshots ORDER BY built_at DESC LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await?;
    let (snapshot_id, as_of, rows) = if let Some((id, built_at)) = snapshot {
        let rows: Vec<EvaluationRow> = sqlx::query_as(
            "SELECT currency,canonical_key,source_label,actual_text,forecast_text,previous_text,surprise_text,score,evaluation_status,reason_codes_json,released_at,pending_newer_release_at,frequency,source_url,unit
             FROM eodhd_fundamental_evaluations WHERE snapshot_id=? ORDER BY currency,canonical_key",
        )
        .bind(&id)
        .fetch_all(&state.db)
        .await?;
        (Some(id), built_at, rows)
    } else {
        (None, Utc::now().to_rfc3339(), Vec::new())
    };
    let by_key = rows
        .into_iter()
        .map(|row| ((row.currency.clone(), row.canonical_key.clone()), row))
        .collect::<HashMap<_, _>>();
    let mut currencies = Vec::with_capacity(CURRENCIES.len());
    for currency in CURRENCIES {
        let indicators = FIELDS
            .iter()
            .map(|field| {
                indicator_view(
                    currency,
                    *field,
                    by_key.get(&(currency.into(), field.key.into())),
                )
            })
            .collect::<Vec<_>>();
        let factor_score = |factor: &str| {
            indicators
                .iter()
                .filter(|item| item.factor == factor)
                .map(|item| i32::from(item.score))
                .sum::<i32>()
        };
        let economic_growth_score = factor_score("growth");
        let inflation_score = factor_score("inflation");
        let rates_score = factor_score("rates");
        let jobs_market_score = factor_score("labor");
        let fundamentals_score =
            economic_growth_score + inflation_score + rates_score + jobs_market_score;
        currencies.push(FundamentalCurrencyView {
            currency: currency.into(),
            economic_growth_score,
            inflation_score,
            rates_score,
            jobs_market_score,
            fundamentals_score,
            economic_growth_bias: simple_bias(economic_growth_score),
            inflation_bias: simple_bias(inflation_score),
            rates_bias: simple_bias(rates_score),
            jobs_market_bias: simple_bias(jobs_market_score),
            fundamentals_bias: simple_bias(fundamentals_score),
            indicators,
        });
    }
    let currency_map = currencies
        .iter()
        .map(|item| (item.currency.as_str(), item))
        .collect::<HashMap<_, _>>();
    let mut pairs = Vec::with_capacity(CURRENCIES.len() * (CURRENCIES.len() - 1));
    for base in CURRENCIES {
        for quote in CURRENCIES {
            if base == quote {
                continue;
            }
            let base_currency = currency_map.get(base).expect("fixed base currency exists");
            let quote_currency = currency_map
                .get(quote)
                .expect("fixed quote currency exists");
            let cells = FIELDS
                .iter()
                .enumerate()
                .map(|(index, field)| {
                    pair_cell(
                        *field,
                        &base_currency.indicators[index],
                        &quote_currency.indicators[index],
                    )
                })
                .collect::<Vec<_>>();
            let fundamental_score = cells.iter().map(|cell| i32::from(cell.score)).sum();
            pairs.push(FundamentalPairView {
                base: base.into(),
                quote: quote.into(),
                fundamental_score,
                bias_label: pair_bias(fundamental_score),
                cells,
            });
        }
    }
    Ok(MacroFundamentalsDashboard {
        as_of,
        snapshot_id,
        currencies,
        pairs,
    })
}

fn validate_history_input(
    input: &EodhdIndicatorHistoryInput,
) -> Result<(String, String), AppError> {
    let currency = input.currency.trim().to_ascii_uppercase();
    if !CURRENCIES.contains(&currency.as_str()) {
        return Err(AppError::Validation(
            "Die gewählte Volkswirtschaft wird nicht unterstützt.".into(),
        ));
    }
    let canonical_key = input.canonical_key.trim().to_ascii_lowercase();
    let is_pair_field = FIELDS.iter().any(|field| field.key == canonical_key);
    let is_cny_history_field =
        currency == "CNY" && CNY_HISTORY_ONLY_FIELDS.contains(&canonical_key.as_str());
    if !is_pair_field && !is_cny_history_field {
        return Err(AppError::Validation(
            "Der gewählte Wirtschaftsindikator ist unbekannt.".into(),
        ));
    }
    if !matches!(input.months, 12 | 24 | 36 | 60 | 120 | 240) {
        return Err(AppError::Validation(
            "Der Zeitraum muss 12, 24, 36, 60, 120 oder 240 Monate betragen.".into(),
        ));
    }
    Ok((currency, canonical_key))
}

async fn load_indicator_history_at(
    state: &AppState,
    input: EodhdIndicatorHistoryInput,
    now: DateTime<Utc>,
) -> Result<EodhdIndicatorHistory, AppError> {
    let (currency, canonical_key) = validate_history_input(&input)?;
    let (
        label,
        factor,
        direction,
        profile_unit,
        freshness_days,
        expected_comparison,
        expected_frequency,
    ): (
        String,
        String,
        i64,
        Option<String>,
        i64,
        Option<String>,
        Option<String>,
    ) = sqlx::query_as(
        "SELECT target_label,factor,direction,unit,freshness_days,
                expected_comparison,expected_frequency
         FROM eodhd_indicator_profiles
         WHERE currency=? AND canonical_key=? AND enabled=1",
    )
    .bind(&currency)
    .bind(&canonical_key)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("EODHD-Indikatorprofil".into()))?;

    let from = now
        .checked_sub_months(Months::new(input.months))
        .unwrap_or_else(|| now - Duration::days(i64::from(input.months) * 31));
    let from_text = from.to_rfc3339();
    let to_text = now.to_rfc3339();
    let points: Vec<EodhdIndicatorHistoryPoint> = sqlx::query_as(
        "WITH ranked AS (
           SELECT e.id,e.country,e.provider_type,e.comparison,e.period,e.released_at,
                  e.actual_value AS actual_text,e.forecast_value AS forecast_text,
                  e.previous_value AS previous_text,s.frequency,s.unit,e.source_url,
                  (SELECT COUNT(*) FROM eodhd_event_revisions r WHERE r.event_id=e.id)
                    AS revision_count,
                  ROW_NUMBER() OVER (
                    PARTITION BY e.released_at,COALESCE(e.period,'')
                    ORDER BY CASE WHEN e.forecast_value IS NOT NULL THEN 0 ELSE 1 END,
                             s.priority,e.updated_at DESC
                  ) AS series_rank
           FROM eodhd_events e
           JOIN eodhd_indicator_series s
             ON s.currency=e.currency
            AND s.provider_type=e.provider_type
            AND LOWER(COALESCE(s.comparison,''))=LOWER(COALESCE(e.comparison,''))
            AND s.enabled=1
           WHERE e.currency=?1 AND s.canonical_key=?2
             AND e.released_at>=?3 AND e.released_at<=?4
             AND (e.actual_value IS NOT NULL OR e.forecast_value IS NOT NULL OR e.previous_value IS NOT NULL)
         )
         SELECT id,country,provider_type,comparison,period,released_at,
                actual_text,forecast_text,previous_text,frequency,unit,revision_count,source_url
         FROM ranked WHERE series_rank=1
         ORDER BY released_at ASC",
    )
    .bind(&currency)
    .bind(&canonical_key)
    .bind(&from_text)
    .bind(&to_text)
    .fetch_all(&state.db)
    .await?;

    let latest = points.last();
    let next_release_at = sqlx::query_scalar(
        "SELECT MIN(e.released_at)
         FROM eodhd_events e
         JOIN eodhd_indicator_series s
           ON s.currency=e.currency
          AND s.provider_type=e.provider_type
          AND LOWER(COALESCE(s.comparison,''))=LOWER(COALESCE(e.comparison,''))
          AND s.enabled=1
         WHERE e.currency=? AND s.canonical_key=? AND e.released_at>?",
    )
    .bind(&currency)
    .bind(&canonical_key)
    .bind(&to_text)
    .fetch_one(&state.db)
    .await?;

    Ok(EodhdIndicatorHistory {
        currency,
        country: latest.map(|point| point.country.clone()),
        canonical_key,
        label,
        factor,
        direction: direction.clamp(-1, 1) as i8,
        comparison: latest
            .and_then(|point| point.comparison.clone())
            .or(expected_comparison),
        frequency: latest
            .map(|point| point.frequency.clone())
            .or(expected_frequency),
        unit: latest.map(|point| point.unit.clone()).or(profile_unit),
        freshness_days,
        months: input.months,
        from: from_text,
        to: to_text,
        next_release_at,
        points,
    })
}

fn indicator_view(
    currency: &str,
    field: CanonicalField,
    row: Option<&EvaluationRow>,
) -> FundamentalIndicatorView {
    if let Some(row) = row {
        return FundamentalIndicatorView {
            key: field.key.into(),
            label: field.label.into(),
            factor: field.factor.into(),
            direction: field.direction,
            source_indicator_key: Some(row.canonical_key.clone()),
            source_label: row.source_label.clone(),
            actual_text: row.actual_text.clone(),
            forecast_text: row.forecast_text.clone(),
            previous_text: row.previous_text.clone(),
            surprise_text: row.surprise_text.clone(),
            score: row.score.clamp(-1, 1) as i8,
            status: row.evaluation_status.clone(),
            reason_codes: serde_json::from_str(&row.reason_codes_json).unwrap_or_default(),
            released_at: row.released_at.clone(),
            pending_newer_release_at: row.pending_newer_release_at.clone(),
            unit: row.unit.clone(),
            frequency: row.frequency.clone(),
            source_url: row.source_url.clone(),
        };
    }
    FundamentalIndicatorView {
        key: field.key.into(),
        label: field.label.into(),
        factor: field.factor.into(),
        direction: field.direction,
        source_indicator_key: None,
        source_label: None,
        actual_text: None,
        forecast_text: None,
        previous_text: None,
        surprise_text: None,
        score: 0,
        status: "unmapped".into(),
        reason_codes: vec![format!("{currency}_eodhd_release_unavailable")],
        released_at: None,
        pending_newer_release_at: None,
        unit: None,
        frequency: None,
        source_url: None,
    }
}

fn pair_cell(
    field: CanonicalField,
    base: &FundamentalIndicatorView,
    quote: &FundamentalIndicatorView,
) -> FundamentalPairCellView {
    let base_available = matches!(base.status.as_str(), "scored" | "neutral");
    let quote_available = matches!(quote.status.as_str(), "scored" | "neutral");
    let mut reason_codes = Vec::new();
    if !base_available {
        reason_codes.extend(
            base.reason_codes
                .iter()
                .map(|reason| format!("base_{reason}")),
        );
    }
    if !quote_available {
        reason_codes.extend(
            quote
                .reason_codes
                .iter()
                .map(|reason| format!("quote_{reason}")),
        );
    }
    FundamentalPairCellView {
        key: field.key.into(),
        label: field.label.into(),
        factor: field.factor.into(),
        base_score: base.score,
        quote_score: quote.score,
        score: pair_component(
            base_available.then_some(base.score),
            quote_available.then_some(quote.score),
        ),
        available: base_available && quote_available,
        base_available,
        quote_available,
        base_released_at: base.released_at.clone(),
        quote_released_at: quote.released_at.clone(),
        base_frequency: base.frequency.clone(),
        quote_frequency: quote.frequency.clone(),
        reason_codes,
    }
}

async fn load_feed_status(state: &AppState) -> Result<EodhdFeedStatus, AppError> {
    let last_run = sqlx::query_as(
        "SELECT id,trigger_kind,status,started_at,completed_at,countries_requested,events_seen,events_updated,mapping_candidates,snapshot_updated,error_message
         FROM eodhd_sync_runs ORDER BY started_at DESC LIMIT 1",
    ).fetch_optional(&state.db).await?;
    let running: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM eodhd_sync_runs WHERE status='running'")
            .fetch_one(&state.db)
            .await?;
    let pending_jobs: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM eodhd_release_jobs WHERE status IN ('pending','failed')",
    )
    .fetch_one(&state.db)
    .await?;
    let next_due_at = sqlx::query_scalar(
        "SELECT MIN(scheduled_for) FROM eodhd_release_jobs WHERE status IN ('pending','failed')",
    )
    .fetch_one(&state.db)
    .await?;
    let pending_mapping_reviews: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM eodhd_mapping_candidates WHERE status='pending'")
            .fetch_one(&state.db)
            .await?;
    Ok(EodhdFeedStatus {
        configured: eodhd_api_key().is_some(),
        running: running > 0,
        last_run,
        pending_jobs,
        next_due_at,
        pending_mapping_reviews,
        last_success_at: last_success_at(state).await?,
    })
}

async fn load_run(state: &AppState, id: &str) -> Result<EodhdSyncRun, AppError> {
    sqlx::query_as(
        "SELECT id,trigger_kind,status,started_at,completed_at,countries_requested,events_seen,events_updated,mapping_candidates,snapshot_updated,error_message
         FROM eodhd_sync_runs WHERE id=?",
    ).bind(id).fetch_one(&state.db).await.map_err(Into::into)
}

async fn review_mapping_candidate(
    state: &AppState,
    id: &str,
    action: &str,
    canonical_key: Option<&str>,
) -> Result<EodhdMappingCandidate, AppError> {
    let candidate: EodhdMappingCandidate = sqlx::query_as(
        "SELECT id,currency,provider_type,comparison,proposed_canonical_key,confidence,runner_up_canonical_key,runner_up_confidence,status,created_at,reviewed_at FROM eodhd_mapping_candidates WHERE id=?",
    ).bind(id).fetch_optional(&state.db).await?.ok_or_else(|| AppError::NotFound("EODHD-Mappingkandidat".into()))?;
    let now = Utc::now().to_rfc3339();
    match action {
        "approve" => {
            let key = canonical_key
                .or(candidate.proposed_canonical_key.as_deref())
                .ok_or_else(|| {
                    AppError::Validation(
                        "Für die Freigabe ist ein kanonischer Datenpunkt erforderlich.".into(),
                    )
                })?;
            let profile_exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM eodhd_indicator_profiles WHERE currency=? AND canonical_key=? AND enabled=1")
                .bind(&candidate.currency).bind(key).fetch_one(&state.db).await?;
            if profile_exists == 0 {
                return Err(AppError::Validation(
                    "Der gewählte Datenpunkt ist für diese Währung nicht konfiguriert.".into(),
                ));
            }
            if key == "interest_rates"
                && !eodhd::is_interest_rate_decision_event(&candidate.provider_type)
            {
                return Err(AppError::Validation(
                    "Für den Zins-Slot sind ausschließlich numerische Leitzinsentscheidungen zulässig; Reden, Protokolle und Pressekonferenzen bleiben Kontext.".into(),
                ));
            }
            let mut transaction = state.db.begin().await?;
            sqlx::query("UPDATE eodhd_mapping_candidates SET status='approved',proposed_canonical_key=?,reviewed_at=? WHERE id=?")
                .bind(key).bind(&now).bind(id).execute(&mut *transaction).await?;
            sqlx::query(
                "INSERT OR IGNORE INTO eodhd_indicator_series(
                   id,currency,canonical_key,provider_type,comparison,priority,unit,frequency,enabled,created_at
                 )
                 SELECT ?,p.currency,p.canonical_key,?,?,100,
                        COALESCE(p.unit,'value'),
                        COALESCE(p.expected_frequency,
                          (SELECT frequency FROM eodhd_events
                           WHERE currency=? AND provider_type=?
                             AND LOWER(COALESCE(comparison,''))=LOWER(COALESCE(?,''))
                           ORDER BY released_at DESC LIMIT 1),
                          'Monthly'),
                        1,?
                 FROM eodhd_indicator_profiles p
                 WHERE p.currency=? AND p.canonical_key=? AND p.enabled=1",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(&candidate.provider_type)
            .bind(&candidate.comparison)
            .bind(&candidate.currency)
            .bind(&candidate.provider_type)
            .bind(&candidate.comparison)
            .bind(&now)
            .bind(&candidate.currency)
            .bind(key)
            .execute(&mut *transaction)
            .await?;
            sqlx::query("UPDATE eodhd_events SET canonical_key=?,mapping_status='approved',mapping_confidence=100,updated_at=? WHERE currency=? AND provider_type=? AND COALESCE(comparison,'')=COALESCE(?,'')")
                .bind(key).bind(&now).bind(&candidate.currency).bind(&candidate.provider_type).bind(&candidate.comparison).execute(&mut *transaction).await?;
            transaction.commit().await?;
        }
        "ignore" => {
            let mut transaction = state.db.begin().await?;
            sqlx::query(
                "UPDATE eodhd_mapping_candidates SET status='ignored',reviewed_at=? WHERE id=?",
            )
            .bind(&now)
            .bind(id)
            .execute(&mut *transaction)
            .await?;
            sqlx::query("UPDATE eodhd_events SET canonical_key=NULL,mapping_status='ignored',updated_at=? WHERE currency=? AND provider_type=? AND COALESCE(comparison,'')=COALESCE(?,'')")
                .bind(&now).bind(&candidate.currency).bind(&candidate.provider_type).bind(&candidate.comparison).execute(&mut *transaction).await?;
            transaction.commit().await?;
        }
        _ => return Err(AppError::Validation("Unbekannte Prüfaktion.".into())),
    }
    rebuild_snapshot(state).await?;
    sqlx::query_as(
        "SELECT id,currency,provider_type,comparison,proposed_canonical_key,confidence,runner_up_canonical_key,runner_up_confidence,status,created_at,reviewed_at FROM eodhd_mapping_candidates WHERE id=?",
    ).bind(id).fetch_one(&state.db).await.map_err(Into::into)
}

async fn sync_is_due(state: &AppState) -> Result<bool, AppError> {
    if !due_release_currencies(state).await?.is_empty() {
        return Ok(true);
    }
    let Some(last) = last_success_at(state).await? else {
        return Ok(true);
    };
    let parsed = DateTime::parse_from_rfc3339(&last)
        .ok()
        .map(|value| value.with_timezone(&Utc));
    Ok(parsed.is_none_or(|value| value <= Utc::now() - Duration::hours(24)))
}

async fn snapshot_refresh_is_due(state: &AppState, now: DateTime<Utc>) -> Result<bool, AppError> {
    let latest: Option<(String, String)> = sqlx::query_as(
        "SELECT id,built_at FROM eodhd_fundamental_snapshots ORDER BY built_at DESC LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await?;
    let Some((snapshot_id, built_at)) = latest else {
        return Ok(true);
    };
    let built_at = DateTime::parse_from_rfc3339(&built_at)
        .ok()
        .map(|value| value.with_timezone(&Utc));
    if built_at.is_none_or(|value| value <= now - Duration::hours(24)) {
        return Ok(true);
    }
    let profile_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM eodhd_indicator_profiles WHERE enabled=1")
            .fetch_one(&state.db)
            .await?;
    let evaluation_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM eodhd_fundamental_evaluations WHERE snapshot_id=?",
    )
    .bind(&snapshot_id)
    .fetch_one(&state.db)
    .await?;
    if profile_count != evaluation_count {
        return Ok(true);
    }
    let invalid_selected_series: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)
         FROM eodhd_fundamental_evaluations evaluation
         JOIN eodhd_events event ON event.id=evaluation.event_id
         WHERE evaluation.snapshot_id=?
           AND (
             event.released_at>? OR NOT EXISTS (
               SELECT 1 FROM eodhd_indicator_series series
               WHERE series.currency=evaluation.currency
                 AND series.canonical_key=evaluation.canonical_key
                 AND series.provider_type=event.provider_type
                 AND LOWER(COALESCE(series.comparison,''))=LOWER(COALESCE(event.comparison,''))
                 AND series.enabled=1
             )
           )",
    )
    .bind(&snapshot_id)
    .bind(now.to_rfc3339())
    .fetch_one(&state.db)
    .await?;
    Ok(invalid_selected_series > 0)
}

async fn last_success_at(state: &AppState) -> Result<Option<String>, AppError> {
    sqlx::query_scalar("SELECT completed_at FROM eodhd_sync_runs WHERE status IN ('complete','partial') AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1")
        .fetch_optional(&state.db).await.map_err(Into::into)
}

async fn due_release_currencies(state: &AppState) -> Result<Vec<String>, AppError> {
    sqlx::query_scalar(
        "SELECT DISTINCT e.currency FROM eodhd_release_jobs j JOIN eodhd_events e ON e.id=j.event_id
         WHERE j.status IN ('pending','failed') AND j.scheduled_for<=? ORDER BY e.currency",
    ).bind(Utc::now().to_rfc3339()).fetch_all(&state.db).await.map_err(Into::into)
}

fn eodhd_api_key() -> Option<String> {
    eodhd_prices::api_key()
}

fn event_identity(currency: &str, event: &eodhd::EconomicEvent) -> String {
    let mut hasher = Sha256::new();
    for value in [
        currency,
        &event.event_type,
        event.comparison.as_deref().unwrap_or_default(),
        event.period.as_deref().unwrap_or_default(),
        &event.date,
    ] {
        hasher.update(value.as_bytes());
        hasher.update([0]);
    }
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn currency_for_country(country: &str) -> Option<&'static str> {
    match country.trim().to_ascii_uppercase().as_str() {
        "AU" | "AUSTRALIA" => Some("AUD"),
        "CA" | "CANADA" => Some("CAD"),
        "CH" | "SWITZERLAND" => Some("CHF"),
        "CN" | "CHINA" => Some("CNY"),
        "EU" | "EURO AREA" | "EUROZONE" => Some("EUR"),
        "UK" | "GB" | "UNITED KINGDOM" => Some("GBP"),
        "JP" | "JAPAN" => Some("JPY"),
        "NZ" | "NEW ZEALAND" => Some("NZD"),
        "US" | "UNITED STATES" => Some("USD"),
        _ => None,
    }
}

fn infer_frequency(event: &eodhd::EconomicEvent) -> &'static str {
    if event.event_type.to_ascii_lowercase().contains("claim") {
        return "Weekly";
    }
    if event
        .period
        .as_deref()
        .is_some_and(|period| period.trim().to_ascii_uppercase().starts_with('Q'))
    {
        return "Quarterly";
    }
    "Monthly"
}

fn simple_bias(score: i32) -> String {
    if score > 0 {
        "Bullish".into()
    } else if score < 0 {
        "Bearish".into()
    } else {
        "Neutral".into()
    }
}

fn pair_bias(score: i32) -> String {
    if score >= 9 {
        "Sehr Bullish".into()
    } else if score >= 5 {
        "Bullish".into()
    } else if score <= -9 {
        "Sehr Bearish".into()
    } else if score <= -5 {
        "Bearish".into()
    } else {
        "Neutral".into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release(
        currency: &str,
        key: &str,
        released_at: &str,
        frequency: &str,
        actual: Option<&str>,
        forecast: Option<&str>,
    ) -> ReleaseCandidate {
        ReleaseCandidate {
            id: None,
            currency: currency.into(),
            canonical_key: key.into(),
            provider_type: key.into(),
            comparison: None,
            released_at: released_at.into(),
            frequency: frequency.into(),
            actual: actual.map(str::to_owned),
            forecast: forecast.map(str::to_owned),
            previous: None,
            source_url: None,
            unit: None,
            priority: 10,
        }
    }

    #[test]
    fn pair_component_compares_monthly_and_quarterly_release_signals() {
        let monthly = release(
            "USD",
            "cpi_yoy",
            "2026-08-01T12:30:00Z",
            "Monthly",
            Some("3.0"),
            Some("2.8"),
        );
        let quarterly = release(
            "NZD",
            "cpi_yoy",
            "2026-07-20T22:45:00Z",
            "Quarterly",
            Some("2.0"),
            Some("2.3"),
        );
        assert_eq!(release_signal(&monthly, 1), Some(1));
        assert_eq!(release_signal(&quarterly, 1), Some(-1));
        assert_eq!(pair_component(Some(1), Some(-1)), 2);
    }

    #[test]
    fn latest_complete_release_remains_active_while_newer_release_is_incomplete() {
        let complete = release(
            "USD",
            "unemployment_claims",
            "2026-07-30T12:30:00Z",
            "Weekly",
            Some("210"),
            Some("220"),
        );
        let incomplete = release(
            "USD",
            "unemployment_claims",
            "2026-08-06T12:30:00Z",
            "Weekly",
            Some("205"),
            None,
        );
        let later_incomplete = release(
            "USD",
            "unemployment_claims",
            "2026-08-13T12:30:00Z",
            "Weekly",
            None,
            Some("204"),
        );
        let selected = select_current_release(&[complete, incomplete, later_incomplete]).unwrap();
        assert_eq!(selected.release.released_at, "2026-07-30T12:30:00Z");
        assert_eq!(
            selected.pending_newer_release_at.as_deref(),
            Some("2026-08-06T12:30:00Z")
        );
    }

    #[test]
    fn interest_rate_mapping_rejects_inflation_events() {
        assert_eq!(
            mapping_confidence("CAD", "interest_rates", "Overnight Rate", "Inflation Rate"),
            0
        );
    }

    #[test]
    fn ambiguous_automatic_mapping_requires_manual_review() {
        let decision = decide_mapping(&[
            MappingScore {
                canonical_key: "consumer_confidence".into(),
                confidence: 91,
            },
            MappingScore {
                canonical_key: "manufacturing_pmi".into(),
                confidence: 82,
            },
        ]);
        assert_eq!(decision, MappingDecision::ReviewRequired);
    }

    #[test]
    fn missing_counterpart_is_scored_as_zero_but_remains_unavailable() {
        assert_eq!(pair_component(Some(1), None), 1);
        assert_eq!(pair_component(None, Some(-1)), 1);
    }

    #[test]
    fn indicator_history_rejects_unknown_ranges_and_series() {
        assert!(
            validate_history_input(&EodhdIndicatorHistoryInput {
                currency: "USD".into(),
                canonical_key: "cpi_yoy".into(),
                months: 24,
            })
            .is_ok()
        );
        assert!(
            validate_history_input(&EodhdIndicatorHistoryInput {
                currency: "USD".into(),
                canonical_key: "cpi_yoy".into(),
                months: 18,
            })
            .is_err()
        );
        assert!(
            validate_history_input(&EodhdIndicatorHistoryInput {
                currency: "USD".into(),
                canonical_key: "invented_indicator".into(),
                months: 24,
            })
            .is_err()
        );
        assert!(
            validate_history_input(&EodhdIndicatorHistoryInput {
                currency: "CNY".into(),
                canonical_key: "new_yuan_loans".into(),
                months: 24,
            })
            .is_ok()
        );
        assert!(
            validate_history_input(&EodhdIndicatorHistoryInput {
                currency: "USD".into(),
                canonical_key: "new_yuan_loans".into(),
                months: 24,
            })
            .is_err()
        );
    }

    #[tokio::test]
    async fn china_private_pmi_labels_form_one_history_without_entering_pair_cells() {
        let state = crate::database::initialize_headless().await.unwrap();
        let events = vec![
            eodhd::EconomicEvent {
                event_type: "Caixin Manufacturing PMI".into(),
                comparison: None,
                period: Some("Jan 2026".into()),
                country: Some("CN".into()),
                date: "2026-02-02 01:45:00".into(),
                actual: Some(serde_json::json!(50.1)),
                previous: Some(serde_json::json!(49.9)),
                estimate: Some(serde_json::json!(50.0)),
            },
            eodhd::EconomicEvent {
                event_type: "S&P Global Manufacturing PMI".into(),
                comparison: None,
                period: Some("Feb 2026".into()),
                country: Some("CN".into()),
                date: "2026-03-04 01:45:00".into(),
                actual: Some(serde_json::json!(52.1)),
                previous: Some(serde_json::json!(50.1)),
                estimate: Some(serde_json::json!(50.2)),
            },
        ];

        ingest_events(&state, &events).await.unwrap();
        let history = load_indicator_history_at(
            &state,
            EodhdIndicatorHistoryInput {
                currency: "CNY".into(),
                canonical_key: "china_private_manufacturing_pmi".into(),
                months: 24,
            },
            DateTime::parse_from_rfc3339("2026-08-16T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
        )
        .await
        .unwrap();

        assert_eq!(history.points.len(), 2);
        assert_eq!(history.points[0].provider_type, "Caixin Manufacturing PMI");
        assert_eq!(
            history.points[1].provider_type,
            "S&P Global Manufacturing PMI"
        );

        rebuild_snapshot_at(
            &state,
            DateTime::parse_from_rfc3339("2026-08-16T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
        )
        .await
        .unwrap();
        let dashboard = load_fundamental_dashboard(&state).await.unwrap();
        assert!(dashboard.pairs.iter().all(|pair| pair.cells.len() == 17));
        assert!(dashboard.currencies.iter().all(|currency| {
            currency
                .indicators
                .iter()
                .all(|indicator| indicator.key != "china_private_manufacturing_pmi")
        }));
    }

    #[tokio::test]
    async fn stale_sync_run_is_released_before_the_next_provider_sync() {
        let state = crate::database::initialize_headless().await.unwrap();
        sqlx::query(
            "INSERT INTO eodhd_sync_runs(id,trigger_kind,status,started_at,countries_requested)
             VALUES('stale-run','scheduled','running','2026-08-12T18:35:24Z',9)",
        )
        .execute(&state.db)
        .await
        .unwrap();

        let recovered = recover_stale_sync_runs(
            &state,
            DateTime::parse_from_rfc3339("2026-08-16T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
        )
        .await
        .unwrap();
        let (status, message): (String, Option<String>) =
            sqlx::query_as("SELECT status,error_message FROM eodhd_sync_runs WHERE id='stale-run'")
                .fetch_one(&state.db)
                .await
                .unwrap();

        assert_eq!(recovered, 1);
        assert_eq!(status, "failed");
        assert!(message.is_some_and(|value| value.contains("unterbrochen")));
    }

    #[tokio::test]
    async fn snapshot_builds_all_pair_cells_from_provider_events() {
        let state = crate::database::initialize_headless().await.unwrap();
        let events = vec![
            eodhd::EconomicEvent {
                event_type: "Inflation Rate".into(),
                comparison: Some("YoY".into()),
                period: Some("Jul".into()),
                country: Some("US".into()),
                date: "2026-08-01 12:30:00".into(),
                actual: Some(serde_json::json!(3.0)),
                previous: Some(serde_json::json!(2.9)),
                estimate: Some(serde_json::json!(2.8)),
            },
            eodhd::EconomicEvent {
                event_type: "Inflation Rate".into(),
                comparison: Some("YoY".into()),
                period: Some("Q2".into()),
                country: Some("NZ".into()),
                date: "2026-07-20 22:45:00".into(),
                actual: Some(serde_json::json!(2.0)),
                previous: Some(serde_json::json!(2.2)),
                estimate: Some(serde_json::json!(2.3)),
            },
        ];

        ingest_events(&state, &events).await.unwrap();
        let history = load_indicator_history_at(
            &state,
            EodhdIndicatorHistoryInput {
                currency: "USD".into(),
                canonical_key: "cpi_yoy".into(),
                months: 24,
            },
            DateTime::parse_from_rfc3339("2026-08-16T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
        )
        .await
        .unwrap();
        assert_eq!(history.label, "Inflation Rate");
        assert_eq!(history.points.len(), 1);
        assert_eq!(history.unit.as_deref(), Some("percent"));
        assert_eq!(history.points[0].revision_count, 0);
        assert_eq!(
            history.points[0]
                .actual_text
                .as_deref()
                .and_then(|value| Decimal::from_str(value).ok()),
            Some(Decimal::from_str("3.0").unwrap())
        );
        assert_eq!(
            history.points[0]
                .forecast_text
                .as_deref()
                .and_then(|value| Decimal::from_str(value).ok()),
            Some(Decimal::from_str("2.8").unwrap())
        );

        assert!(
            rebuild_snapshot_at(
                &state,
                DateTime::parse_from_rfc3339("2026-08-16T00:00:00Z")
                    .unwrap()
                    .with_timezone(&Utc),
            )
            .await
            .unwrap()
        );
        let dashboard = load_fundamental_dashboard(&state).await.unwrap();
        let pair = dashboard
            .pairs
            .iter()
            .find(|pair| pair.base == "USD" && pair.quote == "NZD")
            .unwrap();
        let cpi = pair
            .cells
            .iter()
            .find(|cell| cell.key == "cpi_yoy")
            .unwrap();
        let reverse = dashboard
            .pairs
            .iter()
            .find(|pair| pair.base == "NZD" && pair.quote == "USD")
            .unwrap();
        let reverse_cpi = reverse
            .cells
            .iter()
            .find(|cell| cell.key == "cpi_yoy")
            .unwrap();

        assert_eq!(dashboard.currencies.len(), 9);
        assert_eq!(dashboard.pairs.len(), 72);
        assert!(dashboard.pairs.iter().all(|pair| pair.cells.len() == 17));
        assert_eq!(cpi.score, 2);
        assert_eq!(reverse_cpi.score, -2);
        assert_eq!(pair.fundamental_score, -reverse.fundamental_score);
        assert_eq!(cpi.base_frequency.as_deref(), Some("Monthly"));
        assert_eq!(cpi.quote_frequency.as_deref(), Some("Quarterly"));
    }

    #[tokio::test]
    async fn snapshot_uses_only_pinned_rate_decisions_and_excludes_future_releases() {
        let state = crate::database::initialize_headless().await.unwrap();
        let events = vec![
            eodhd::EconomicEvent {
                event_type: "ECB President Lagarde Speech".into(),
                comparison: None,
                period: None,
                country: Some("EU".into()),
                date: "2026-08-10 09:00:00".into(),
                actual: Some(serde_json::json!(9.0)),
                previous: Some(serde_json::json!(8.0)),
                estimate: Some(serde_json::json!(1.0)),
            },
            eodhd::EconomicEvent {
                event_type: "Interest Rate Decision".into(),
                comparison: None,
                period: None,
                country: Some("EU".into()),
                date: "2026-08-11 12:15:00".into(),
                actual: Some(serde_json::json!(2.0)),
                previous: Some(serde_json::json!(2.0)),
                estimate: Some(serde_json::json!(2.0)),
            },
            eodhd::EconomicEvent {
                event_type: "Interest Rate Decision".into(),
                comparison: None,
                period: None,
                country: Some("EU".into()),
                date: "2026-09-10 12:15:00".into(),
                actual: Some(serde_json::json!(4.0)),
                previous: Some(serde_json::json!(2.0)),
                estimate: Some(serde_json::json!(1.0)),
            },
        ];

        ingest_events(&state, &events).await.unwrap();
        rebuild_snapshot_at(
            &state,
            DateTime::parse_from_rfc3339("2026-08-16T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
        )
        .await
        .unwrap();
        let dashboard = load_fundamental_dashboard(&state).await.unwrap();
        let rate = dashboard
            .currencies
            .iter()
            .find(|item| item.currency == "EUR")
            .unwrap()
            .indicators
            .iter()
            .find(|item| item.key == "interest_rates")
            .unwrap();

        assert_eq!(rate.source_label.as_deref(), Some("Interest Rate Decision"));
        assert_eq!(
            rate.released_at.as_deref(),
            Some("2026-08-11T12:15:00+00:00")
        );
        assert_eq!(rate.score, 0);
        let speech_mapping: (Option<String>, String) = sqlx::query_as(
            "SELECT canonical_key,mapping_status FROM eodhd_events WHERE provider_type='ECB President Lagarde Speech'",
        )
        .fetch_one(&state.db)
        .await
        .unwrap();
        assert_ne!(speech_mapping.0.as_deref(), Some("interest_rates"));
    }

    #[tokio::test]
    async fn provider_revisions_are_retained_for_history_quality_metadata() {
        let state = crate::database::initialize_headless().await.unwrap();
        let mut event = eodhd::EconomicEvent {
            event_type: "Inflation Rate".into(),
            comparison: Some("YoY".into()),
            period: Some("Jul 2026".into()),
            country: Some("US".into()),
            date: "2026-08-12 12:30:00".into(),
            actual: Some(serde_json::json!(3.0)),
            previous: Some(serde_json::json!(2.9)),
            estimate: Some(serde_json::json!(2.8)),
        };
        ingest_events(&state, std::slice::from_ref(&event))
            .await
            .unwrap();
        event.actual = Some(serde_json::json!(3.1));
        ingest_events(&state, std::slice::from_ref(&event))
            .await
            .unwrap();
        event.actual = None;
        ingest_events(&state, &[event]).await.unwrap();

        let history = load_indicator_history_at(
            &state,
            EodhdIndicatorHistoryInput {
                currency: "USD".into(),
                canonical_key: "cpi_yoy".into(),
                months: 24,
            },
            DateTime::parse_from_rfc3339("2026-08-16T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
        )
        .await
        .unwrap();

        assert_eq!(history.points.len(), 1);
        assert_eq!(history.points[0].actual_text.as_deref(), Some("3.1"));
        assert_eq!(history.points[0].revision_count, 1);
    }

    #[tokio::test]
    async fn economic_calendar_returns_future_events_with_categories_and_assets() {
        let state = crate::database::initialize_headless().await.unwrap();
        let events = vec![
            eodhd::EconomicEvent {
                event_type: "Inflation Rate".into(),
                comparison: Some("YoY".into()),
                period: Some("Aug 2026".into()),
                country: Some("US".into()),
                date: "2026-08-20 12:30:00".into(),
                actual: None,
                previous: Some(serde_json::json!(2.9)),
                estimate: Some(serde_json::json!(2.8)),
            },
            eodhd::EconomicEvent {
                event_type: "EIA Crude Oil Stocks Change".into(),
                comparison: None,
                period: Some("Aug 2026".into()),
                country: Some("US".into()),
                date: "2026-08-21 14:30:00".into(),
                actual: None,
                previous: Some(serde_json::json!(-3.1)),
                estimate: Some(serde_json::json!(-1.2)),
            },
            eodhd::EconomicEvent {
                event_type: "Retail Sales".into(),
                comparison: Some("MoM".into()),
                period: Some("Jul 2026".into()),
                country: Some("US".into()),
                date: "2026-08-10 12:30:00".into(),
                actual: Some(serde_json::json!(0.4)),
                previous: Some(serde_json::json!(0.2)),
                estimate: Some(serde_json::json!(0.3)),
            },
        ];
        ingest_events(&state, &events).await.unwrap();

        let calendar = load_economic_calendar_at(
            &state,
            EconomicCalendarInput {
                range: "future30".into(),
                timezone_offset_minutes: 0,
            },
            DateTime::parse_from_rfc3339("2026-08-16T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
        )
        .await
        .unwrap();

        assert_eq!(calendar.events.len(), 2);
        assert_eq!(calendar.events[0].category, "inflation");
        assert!(calendar.events[0].affected_assets.contains(&"Gold".into()));
        assert_eq!(calendar.events[1].category, "energy");
        assert!(
            calendar.events[1]
                .affected_assets
                .contains(&"WTI / Brent".into())
        );
        assert_eq!(calendar.events[0].forecast_text.as_deref(), Some("2.8"));
    }

    #[tokio::test]
    async fn economic_calendar_returns_only_elapsed_releases_from_the_current_month() {
        let state = crate::database::initialize_headless().await.unwrap();
        let events = vec![
            eodhd::EconomicEvent {
                event_type: "Retail Sales".into(),
                comparison: Some("MoM".into()),
                period: Some("Aug 2026".into()),
                country: Some("US".into()),
                date: "2026-08-10 12:30:00".into(),
                actual: Some(serde_json::json!(0.4)),
                previous: Some(serde_json::json!(0.2)),
                estimate: Some(serde_json::json!(0.3)),
            },
            eodhd::EconomicEvent {
                event_type: "Inflation Rate".into(),
                comparison: Some("YoY".into()),
                period: Some("Aug 2026".into()),
                country: Some("US".into()),
                date: "2026-08-20 12:30:00".into(),
                actual: None,
                previous: Some(serde_json::json!(2.9)),
                estimate: Some(serde_json::json!(2.8)),
            },
        ];
        ingest_events(&state, &events).await.unwrap();

        let calendar = load_economic_calendar_at(
            &state,
            EconomicCalendarInput {
                range: "month".into(),
                timezone_offset_minutes: 0,
            },
            DateTime::parse_from_rfc3339("2026-08-16T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
        )
        .await
        .unwrap();

        assert_eq!(calendar.events.len(), 1);
        assert_eq!(calendar.events[0].title, "Retail Sales");
        assert_eq!(calendar.events[0].actual_text.as_deref(), Some("0.4"));
        assert_eq!(calendar.from, "2026-08-01T00:00:00+00:00");
        assert_eq!(calendar.to, "2026-08-16T00:00:00+00:00");
    }

    #[tokio::test]
    async fn incomplete_releases_keep_only_the_four_release_anchored_retries() {
        let state = crate::database::initialize_headless().await.unwrap();
        let released_at = Utc::now() - Duration::days(1);
        let event = eodhd::EconomicEvent {
            event_type: "Inflation Rate".into(),
            comparison: Some("YoY".into()),
            period: Some("Current".into()),
            country: Some("US".into()),
            date: released_at.format("%Y-%m-%d %H:%M:%S").to_string(),
            actual: None,
            previous: Some(serde_json::json!(2.9)),
            estimate: Some(serde_json::json!(2.8)),
        };

        ingest_events(&state, std::slice::from_ref(&event))
            .await
            .unwrap();
        let event_id: String =
            sqlx::query_scalar("SELECT id FROM eodhd_events WHERE currency='USD' LIMIT 1")
                .fetch_one(&state.db)
                .await
                .unwrap();
        sqlx::query(
            "INSERT INTO eodhd_release_jobs(id,event_id,scheduled_for,status,created_at)
             VALUES('legacy-duplicate',?,?,'pending',?)",
        )
        .bind(event_id)
        .bind((released_at + Duration::minutes(45)).to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .execute(&state.db)
        .await
        .unwrap();
        ingest_events(&state, &[event]).await.unwrap();

        let active_jobs: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM eodhd_release_jobs WHERE status IN ('pending','failed')",
        )
        .fetch_one(&state.db)
        .await
        .unwrap();
        let cancelled_jobs: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM eodhd_release_jobs WHERE status='cancelled'")
                .fetch_one(&state.db)
                .await
                .unwrap();
        assert_eq!(active_jobs, 4);
        assert_eq!(cancelled_jobs, 1);
    }

    #[tokio::test]
    async fn economic_calendar_rejects_unknown_ranges() {
        let state = crate::database::initialize_headless().await.unwrap();
        let result = load_economic_calendar_at(
            &state,
            EconomicCalendarInput {
                range: "year".into(),
                timezone_offset_minutes: 0,
            },
            Utc::now(),
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    #[ignore = "benötigt einen konfigurierten EODHD_API_KEY und Netzwerkzugriff"]
    async fn live_eodhd_sync_builds_a_usable_fundamental_snapshot() {
        let state = crate::database::initialize_headless().await.unwrap();
        let result = sync_eodhd(&state, "manual", true).await.unwrap();
        let usable = result
            .snapshot
            .currencies
            .iter()
            .flat_map(|currency| &currency.indicators)
            .filter(|indicator| matches!(indicator.status.as_str(), "scored" | "neutral"))
            .count();
        eprintln!(
            "events={} updated={} reviews={} usable={}/126",
            result.run.events_seen,
            result.run.events_updated,
            result.run.mapping_candidates,
            usable
        );
        assert!(result.run.events_seen > 500);
        assert_eq!(result.snapshot.currencies.len(), 9);
        assert_eq!(result.snapshot.pairs.len(), 72);
        assert!(
            usable >= 45,
            "zu wenige nutzbare EODHD-Datenpunkte: {usable}"
        );
    }
}
