use std::collections::HashMap;

use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
use sqlx::FromRow;
use tauri::State;

use crate::{
    database::AppState,
    errors::{AppError, CommandResult},
    metrics::policy_rates::{self, PolicyRateEvaluation, PolicyRateInput, UsdRelativeEvaluation},
};

use super::{eodhd, sync_eodhd_for_rates};

const EXPECTED_CURRENCY_COUNT: usize = 9;
const AUTOMATIC_REFRESH_HOURS: i64 = 24;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyRateDashboard {
    pub snapshot_at: Option<String>,
    pub source_name: Option<String>,
    pub source_url: Option<String>,
    pub rates: Vec<PolicyRateEvaluation>,
    pub usd_relative: UsdRelativeEvaluation,
    pub automation: PolicyRateAutomationStatus,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyRateAutomationStatus {
    pub enabled: bool,
    pub last_attempt_at: Option<String>,
    pub last_success_at: Option<String>,
    pub last_status: Option<String>,
    pub error_message: Option<String>,
    pub covered_currencies: usize,
    pub expected_currencies: usize,
    pub refresh_interval_hours: i64,
    pub next_refresh_at: Option<String>,
}

#[derive(Debug, Clone, FromRow)]
struct RateEventRow {
    currency: String,
    provider_type: String,
    released_at: String,
    actual_value: Option<String>,
    forecast_value: Option<String>,
    source_url: String,
    updated_at: String,
}

#[derive(Debug, Clone, FromRow)]
struct EodhdRunRow {
    started_at: String,
    status: String,
    error_message: Option<String>,
}

#[tauri::command]
pub async fn get_policy_rates(state: State<'_, AppState>) -> CommandResult<PolicyRateDashboard> {
    get_policy_rates_inner(&state).await.map_err(Into::into)
}

#[tauri::command]
pub async fn sync_policy_rates(state: State<'_, AppState>) -> CommandResult<PolicyRateDashboard> {
    sync_eodhd_for_rates(&state)
        .await
        .map_err(crate::errors::CommandError::from)?;
    get_policy_rates_inner(&state).await.map_err(Into::into)
}

async fn get_policy_rates_inner(state: &AppState) -> Result<PolicyRateDashboard, AppError> {
    let inputs = load_eodhd_policy_inputs(state, Utc::now()).await?;
    let snapshot_at = inputs
        .iter()
        .filter_map(|input| input.provider_snapshot_at.as_deref())
        .max()
        .map(str::to_owned);
    let automation = load_automation_status(state, inputs.len()).await?;
    Ok(PolicyRateDashboard {
        snapshot_at,
        source_name: (!inputs.is_empty()).then(|| "EODHD Economic Events API".into()),
        source_url: (!inputs.is_empty()).then(|| eodhd::ECONOMIC_EVENTS_URL.into()),
        rates: inputs.iter().map(policy_rates::evaluate).collect(),
        usd_relative: policy_rates::evaluate_usd_relative(&inputs, 4),
        automation,
    })
}

async fn load_eodhd_policy_inputs(
    state: &AppState,
    now: DateTime<Utc>,
) -> Result<Vec<PolicyRateInput>, AppError> {
    let rows: Vec<RateEventRow> = sqlx::query_as(
        "SELECT currency,provider_type,released_at,actual_value,forecast_value,source_url,updated_at
         FROM eodhd_events
         WHERE canonical_key='interest_rates' AND mapping_status IN ('automatic','approved')
         ORDER BY currency,released_at",
    )
    .fetch_all(&state.db)
    .await?;
    let mut by_currency: HashMap<String, Vec<RateEventRow>> = HashMap::new();
    for row in rows {
        by_currency
            .entry(row.currency.clone())
            .or_default()
            .push(row);
    }

    let mut inputs = Vec::new();
    for currency in [
        "AUD", "CAD", "CHF", "CNY", "EUR", "GBP", "JPY", "NZD", "USD",
    ] {
        let Some(events) = by_currency.get(currency) else {
            continue;
        };
        let current = events
            .iter()
            .filter(|event| {
                release_time(&event.released_at).is_some_and(|time| time <= now)
                    && event.actual_value.is_some()
            })
            .max_by(|left, right| left.released_at.cmp(&right.released_at));
        let next = events
            .iter()
            .filter(|event| {
                release_time(&event.released_at).is_some_and(|time| time > now)
                    && event.forecast_value.is_some()
            })
            .min_by(|left, right| left.released_at.cmp(&right.released_at));
        let Some(current) = current else {
            continue;
        };
        inputs.push(PolicyRateInput {
            currency: currency.into(),
            central_bank: central_bank(currency).into(),
            current_rate: current.actual_value.clone(),
            expected_rate: next.and_then(|event| event.forecast_value.clone()),
            actual_rate: None,
            rate_definition: Some(current.provider_type.clone()),
            current_rate_low: None,
            current_rate_high: None,
            official_source_url: Some(current.source_url.clone()),
            official_published_at: Some(current.released_at.clone()),
            expected_source_url: next.map(|event| event.source_url.clone()),
            expected_observed_at: next.map(|event| event.updated_at.clone()),
            expected_for_decision_at: next.map(|event| event.released_at.clone()),
            next_decision_at: next.map(|event| event.released_at.clone()),
            provider_snapshot_at: Some(current.updated_at.clone()),
            quality_status: "provider_confirmed".into(),
            weight: "1".into(),
        });
    }
    Ok(inputs)
}

async fn load_automation_status(
    state: &AppState,
    covered_currencies: usize,
) -> Result<PolicyRateAutomationStatus, AppError> {
    let latest: Option<EodhdRunRow> = sqlx::query_as(
        "SELECT started_at,status,error_message FROM eodhd_sync_runs ORDER BY started_at DESC LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await?;
    let last_success_at: Option<String> = sqlx::query_scalar(
        "SELECT completed_at FROM eodhd_sync_runs WHERE status IN ('complete','partial') AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await?;
    let next_refresh_at = last_success_at
        .as_deref()
        .and_then(release_time)
        .map(|time| (time + Duration::hours(AUTOMATIC_REFRESH_HOURS)).to_rfc3339());
    Ok(PolicyRateAutomationStatus {
        enabled: true,
        last_attempt_at: latest.as_ref().map(|run| run.started_at.clone()),
        last_success_at,
        last_status: latest.as_ref().map(|run| run.status.clone()),
        error_message: latest.and_then(|run| run.error_message),
        covered_currencies,
        expected_currencies: EXPECTED_CURRENCY_COUNT,
        refresh_interval_hours: AUTOMATIC_REFRESH_HOURS,
        next_refresh_at,
    })
}

fn central_bank(currency: &str) -> &'static str {
    match currency {
        "AUD" => "Reserve Bank of Australia",
        "CAD" => "Bank of Canada",
        "CHF" => "Schweizerische Nationalbank",
        "CNY" => "People's Bank of China",
        "EUR" => "Europäische Zentralbank",
        "GBP" => "Bank of England",
        "JPY" => "Bank of Japan",
        "NZD" => "Reserve Bank of New Zealand",
        "USD" => "Federal Reserve",
        _ => "Zentralbank",
    }
}

fn release_time(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|value| value.with_timezone(&Utc))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn eodhd_events_supply_current_and_next_policy_rate() {
        let state = crate::database::initialize_headless().await.unwrap();
        let now = Utc::now();
        for (released_at, actual, forecast) in [
            (now - Duration::days(30), Some("4.25"), Some("4.25")),
            (now + Duration::days(20), None, Some("4.00")),
        ] {
            sqlx::query(
                "INSERT INTO eodhd_events(id,event_identity,country,currency,provider_type,released_at,actual_value,forecast_value,frequency,canonical_key,mapping_status,mapping_confidence,source_url,first_seen_at,updated_at)
                 VALUES(?,?,?,?,?,?,?,?,?,'interest_rates','approved',100,?,?,?)",
            )
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(uuid::Uuid::new_v4().to_string())
            .bind("NZ")
            .bind("NZD")
            .bind("RBNZ Interest Rate Decision")
            .bind(released_at.to_rfc3339())
            .bind(actual)
            .bind(forecast)
            .bind("Meeting")
            .bind(eodhd::ECONOMIC_EVENTS_URL)
            .bind(now.to_rfc3339())
            .bind(now.to_rfc3339())
            .execute(&state.db)
            .await
            .unwrap();
        }

        let inputs = load_eodhd_policy_inputs(&state, now).await.unwrap();
        let nzd = inputs.iter().find(|input| input.currency == "NZD").unwrap();

        assert_eq!(nzd.current_rate.as_deref(), Some("4.25"));
        assert_eq!(nzd.expected_rate.as_deref(), Some("4.00"));
        assert_eq!(nzd.quality_status, "provider_confirmed");
        assert!(nzd.next_decision_at.is_some());
    }
}
