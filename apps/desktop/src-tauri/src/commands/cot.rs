use std::collections::{BTreeMap, HashMap};

use chrono::{Duration, NaiveDate, Utc};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::FromRow;
use tauri::State;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::{
    database::AppState,
    errors::{AppError, CommandResult},
};

const LEGACY_URL: &str = "https://publicreporting.cftc.gov/resource/6dca-aqww.json";
const LEGACY_SELECT: &str = "cftc_contract_market_code,report_date_as_yyyy_mm_dd,\
open_interest_all,change_in_open_interest_all,noncomm_positions_long_all,\
noncomm_positions_short_all,change_in_noncomm_long_all,change_in_noncomm_short_all";
const CFTC_COT_LANDING_URL: &str = "https://publicreporting.cftc.gov/stories/s/r4w3-av2u";
const MIN_HISTORY_WEEKS: usize = 104;
const VALID_HISTORY_WEEKS: usize = 156;
const EVALUATION_LOOKBACK_WEEKS: usize = 260;
const REPORT_STALE_AFTER_DAYS: i64 = 10;
const SCORING_VERSION: &str = "cot-v3";
const HISTORY_YEARS: i64 = 15;
static COT_SYNC_LOCK: Mutex<()> = Mutex::const_new(());

#[derive(Clone, Copy)]
struct ContractSeed {
    symbol: &'static str,
    display_name: &'static str,
    asset_class: &'static str,
    report_family: &'static str,
    trader_group: &'static str,
    cftc_code: &'static str,
    legacy_cftc_code: &'static str,
    currency: Option<&'static str>,
    order: i64,
}

// TFF contains financial futures. Disaggregated is intentionally reserved for
// physical commodities, where Managed Money is the comparable speculative cohort.
const CONTRACTS: &[ContractSeed] = &[
    ContractSeed {
        symbol: "AUD",
        display_name: "Australian Dollar",
        asset_class: "Währung",
        report_family: "tff",
        trader_group: "Leveraged Funds",
        cftc_code: "232741",
        legacy_cftc_code: "232741",
        currency: Some("AUD"),
        order: 10,
    },
    ContractSeed {
        symbol: "CAD",
        display_name: "Canadian Dollar",
        asset_class: "Währung",
        report_family: "tff",
        trader_group: "Leveraged Funds",
        cftc_code: "090741",
        legacy_cftc_code: "090741",
        currency: Some("CAD"),
        order: 20,
    },
    ContractSeed {
        symbol: "CHF",
        display_name: "Swiss Franc",
        asset_class: "Währung",
        report_family: "tff",
        trader_group: "Leveraged Funds",
        cftc_code: "092741",
        legacy_cftc_code: "092741",
        currency: Some("CHF"),
        order: 30,
    },
    ContractSeed {
        symbol: "EUR",
        display_name: "Euro FX",
        asset_class: "Währung",
        report_family: "tff",
        trader_group: "Leveraged Funds",
        cftc_code: "099741",
        legacy_cftc_code: "099741",
        currency: Some("EUR"),
        order: 40,
    },
    ContractSeed {
        symbol: "GBP",
        display_name: "British Pound",
        asset_class: "Währung",
        report_family: "tff",
        trader_group: "Leveraged Funds",
        cftc_code: "096742",
        legacy_cftc_code: "096742",
        currency: Some("GBP"),
        order: 50,
    },
    ContractSeed {
        symbol: "JPY",
        display_name: "Japanese Yen",
        asset_class: "Währung",
        report_family: "tff",
        trader_group: "Leveraged Funds",
        cftc_code: "097741",
        legacy_cftc_code: "097741",
        currency: Some("JPY"),
        order: 60,
    },
    ContractSeed {
        symbol: "NZD",
        display_name: "New Zealand Dollar",
        asset_class: "Währung",
        report_family: "tff",
        trader_group: "Leveraged Funds",
        cftc_code: "112741",
        legacy_cftc_code: "112741",
        currency: Some("NZD"),
        order: 70,
    },
    ContractSeed {
        symbol: "USD",
        display_name: "U.S. Dollar Index",
        asset_class: "Währung",
        report_family: "tff",
        trader_group: "Leveraged Funds",
        cftc_code: "098662",
        legacy_cftc_code: "098662",
        currency: Some("USD"),
        order: 80,
    },
    ContractSeed {
        symbol: "SPX",
        display_name: "S&P 500",
        asset_class: "Aktienindex",
        report_family: "tff",
        trader_group: "Leveraged Funds",
        cftc_code: "13874+",
        legacy_cftc_code: "13874+",
        currency: None,
        order: 100,
    },
    ContractSeed {
        symbol: "NASDAQ",
        display_name: "Nasdaq-100",
        asset_class: "Aktienindex",
        report_family: "tff",
        trader_group: "Leveraged Funds",
        cftc_code: "20974+",
        legacy_cftc_code: "20974+",
        currency: None,
        order: 110,
    },
    ContractSeed {
        symbol: "DOW",
        display_name: "Dow Jones",
        asset_class: "Aktienindex",
        report_family: "tff",
        trader_group: "Leveraged Funds",
        cftc_code: "12460+",
        legacy_cftc_code: "124603",
        currency: None,
        order: 120,
    },
    ContractSeed {
        symbol: "RUSSELL",
        display_name: "Russell 2000",
        asset_class: "Aktienindex",
        report_family: "tff",
        trader_group: "Leveraged Funds",
        cftc_code: "239742",
        legacy_cftc_code: "239742",
        currency: None,
        order: 130,
    },
    ContractSeed {
        symbol: "UST2Y",
        display_name: "U.S. Treasury 2Y",
        asset_class: "Zinsen",
        report_family: "tff",
        trader_group: "Leveraged Funds",
        cftc_code: "042601",
        legacy_cftc_code: "042601",
        currency: None,
        order: 140,
    },
    ContractSeed {
        symbol: "UST5Y",
        display_name: "U.S. Treasury 5Y",
        asset_class: "Zinsen",
        report_family: "tff",
        trader_group: "Leveraged Funds",
        cftc_code: "044601",
        legacy_cftc_code: "044601",
        currency: None,
        order: 150,
    },
    ContractSeed {
        symbol: "UST10Y",
        display_name: "U.S. Treasury 10Y",
        asset_class: "Zinsen",
        report_family: "tff",
        trader_group: "Leveraged Funds",
        cftc_code: "043602",
        legacy_cftc_code: "043602",
        currency: None,
        order: 160,
    },
    ContractSeed {
        symbol: "BTC",
        display_name: "Bitcoin",
        asset_class: "Krypto",
        report_family: "tff",
        trader_group: "Leveraged Funds",
        cftc_code: "133741",
        legacy_cftc_code: "133741",
        currency: None,
        order: 170,
    },
    ContractSeed {
        symbol: "ETH",
        display_name: "Ether",
        asset_class: "Krypto",
        report_family: "tff",
        trader_group: "Leveraged Funds",
        cftc_code: "146021",
        legacy_cftc_code: "146021",
        currency: None,
        order: 180,
    },
    ContractSeed {
        symbol: "GOLD",
        display_name: "Gold",
        asset_class: "Metalle",
        report_family: "disaggregated",
        trader_group: "Managed Money",
        cftc_code: "088691",
        legacy_cftc_code: "088691",
        currency: None,
        order: 200,
    },
    ContractSeed {
        symbol: "SILVER",
        display_name: "Silber",
        asset_class: "Metalle",
        report_family: "disaggregated",
        trader_group: "Managed Money",
        cftc_code: "084691",
        legacy_cftc_code: "084691",
        currency: None,
        order: 210,
    },
    ContractSeed {
        symbol: "COPPER",
        display_name: "Kupfer",
        asset_class: "Metalle",
        report_family: "disaggregated",
        trader_group: "Managed Money",
        cftc_code: "085692",
        legacy_cftc_code: "085692",
        currency: None,
        order: 220,
    },
    ContractSeed {
        symbol: "OIL",
        display_name: "WTI Rohöl",
        asset_class: "Energie",
        report_family: "disaggregated",
        trader_group: "Managed Money",
        cftc_code: "067651",
        legacy_cftc_code: "067651",
        currency: None,
        order: 230,
    },
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CotSignalComponent {
    pub key: String,
    pub label: String,
    pub value: Option<f64>,
    pub percentile: Option<f64>,
    pub signal: Option<i8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CotAssessment {
    pub scoring_version: String,
    pub status: String,
    pub quality: String,
    pub bias_signal: Option<i8>,
    pub bias_label: String,
    pub crowding_status: String,
    pub report_date: Option<String>,
    pub reason_codes: Vec<String>,
    pub why: Vec<String>,
    pub components: Vec<CotSignalComponent>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CotContractView {
    pub symbol: String,
    pub display_name: String,
    pub asset_class: String,
    pub report_family: String,
    pub trader_group: String,
    pub currency: Option<String>,
    pub report_date: Option<String>,
    pub long_positions: Option<i64>,
    pub short_positions: Option<i64>,
    pub long_change: Option<i64>,
    pub short_change: Option<i64>,
    pub open_interest: Option<i64>,
    pub net_positions: Option<i64>,
    pub net_change: Option<i64>,
    pub net_position_pct_oi: Option<f64>,
    pub net_change_pct_oi: Option<f64>,
    pub position_percentile: Option<f64>,
    pub change_percentile: Option<f64>,
    pub position_signal: Option<i8>,
    pub change_signal: Option<i8>,
    pub persistence_signal: Option<i8>,
    pub latest_change_signal: Option<i8>,
    pub assessment: CotAssessment,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CotCurrencySignal {
    pub currency: String,
    pub report_date: String,
    pub position_signal: i8,
    pub change_signal: i8,
    pub persistence_signal: i8,
    pub confirmed_signal: i8,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CotPairScore {
    pub base: String,
    pub quote: String,
    pub position_score: Option<i8>,
    pub change_score: Option<i8>,
    pub persistence_score: Option<i8>,
    pub confirmed_score: Option<i8>,
    pub report_date: Option<String>,
    pub reason_code: Option<String>,
    pub raw_score: i8,
    pub coverage: f64,
    pub bias_label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CotDashboard {
    pub source_url: String,
    pub last_synced_at: Option<String>,
    pub contracts: Vec<CotContractView>,
    pub currencies: Vec<CotCurrencySignal>,
    pub pairs: Vec<CotPairScore>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CotSyncResult {
    pub imported: usize,
    pub last_synced_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CotDetailInput {
    pub symbol: String,
    pub participant_group: Option<String>,
    pub lookback_weeks: Option<usize>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CotBrokerLinkInput {
    pub symbol: String,
    pub broker_symbol: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CotSeriesPoint {
    pub report_date: String,
    pub long_positions: i64,
    pub short_positions: i64,
    pub net_positions: i64,
    pub net_position_pct_oi: f64,
    pub open_interest: i64,
    pub z_score: Option<f64>,
    pub percentile: Option<f64>,
    pub cot_index: Option<f64>,
    pub flow_4w: Option<f64>,
    pub persistence_13w: Option<f64>,
    pub broker_price: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CotOutcomeWindow {
    pub weeks: usize,
    pub sample_size: usize,
    pub median_return: Option<f64>,
    pub hit_rate: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CotHistoricalOutcomes {
    pub status: String,
    pub reason: String,
    pub windows: Vec<CotOutcomeWindow>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CotGroupSummary {
    pub participant_group: String,
    pub net_positions: Option<i64>,
    pub net_position_pct_oi: Option<f64>,
    pub z_score: Option<f64>,
    pub percentile: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CotAssetDetail {
    pub symbol: String,
    pub display_name: String,
    pub asset_class: String,
    pub report_family: String,
    pub participant_group: String,
    pub lookback_weeks: usize,
    pub sample_size: usize,
    pub z_score: Option<f64>,
    pub percentile: Option<f64>,
    pub cot_index: Option<f64>,
    pub net_positions: Option<i64>,
    pub net_position_pct_oi: Option<f64>,
    pub net_change: Option<i64>,
    pub broker_symbol: Option<String>,
    pub assessment: CotAssessment,
    pub historical_outcomes: CotHistoricalOutcomes,
    pub groups: Vec<CotGroupSummary>,
    pub series: Vec<CotSeriesPoint>,
}

#[tauri::command]
pub async fn link_cot_broker_symbol(
    state: State<'_, AppState>,
    input: CotBrokerLinkInput,
) -> CommandResult<()> {
    let contract_id: Option<String> =
        sqlx::query_scalar("SELECT id FROM cot_contracts WHERE symbol=? AND is_active=1")
            .bind(input.symbol.trim())
            .fetch_optional(&state.db)
            .await
            .map_err(AppError::from)?;
    let contract_id = contract_id.ok_or_else(|| {
        crate::errors::CommandError::validation("Der CFTC-Kontrakt wurde nicht gefunden.")
    })?;
    let exists: Option<String> =
        sqlx::query_scalar("SELECT symbol FROM market_instruments WHERE symbol=?")
            .bind(input.broker_symbol.trim())
            .fetch_optional(&state.db)
            .await
            .map_err(AppError::from)?;
    if exists.is_none() {
        return Err(crate::errors::CommandError::validation(
            "Das BlackBull-Asset muss zuerst in der Seasonality geladen werden.",
        ));
    }
    sqlx::query("INSERT INTO cot_broker_links(contract_id,broker_symbol,linked_at) VALUES(?,?,?) ON CONFLICT(contract_id) DO UPDATE SET broker_symbol=excluded.broker_symbol,linked_at=excluded.linked_at")
        .bind(contract_id).bind(input.broker_symbol.trim()).bind(Utc::now().to_rfc3339()).execute(&state.db).await.map_err(AppError::from)?;
    Ok(())
}

#[derive(Debug, Clone, FromRow)]
struct ContractRow {
    id: String,
    symbol: String,
    display_name: String,
    asset_class: String,
    report_family: String,
    trader_group: String,
    legacy_cftc_contract_market_code: Option<String>,
    currency: Option<String>,
}
#[derive(Debug, Clone, FromRow)]
struct ObservationRow {
    report_date: String,
    long_positions: i64,
    short_positions: i64,
    long_change: i64,
    short_change: i64,
    open_interest: i64,
    net_positions: i64,
    net_change: i64,
    net_position_pct_oi: String,
    net_change_pct_oi: String,
}

#[derive(Debug, Clone, FromRow)]
struct GroupObservationRow {
    report_date: String,
    participant_group: String,
    long_positions: i64,
    short_positions: i64,
    net_positions: i64,
    net_position_pct_oi: String,
    open_interest: i64,
}
#[derive(Debug, FromRow)]
struct DailyCloseRow {
    candle_time: i64,
    close: f64,
}

pub async fn scheduled_cot_sync(state: &AppState) -> Result<(), AppError> {
    let recent: Option<String> = sqlx::query_scalar("SELECT completed_at FROM cot_sync_runs WHERE status='complete' ORDER BY completed_at DESC LIMIT 1").fetch_optional(&state.db).await?;
    let due = recent
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(&value).ok())
        .map(|value| Utc::now() - value.with_timezone(&Utc) > Duration::hours(6))
        .unwrap_or(true);
    if due {
        sync_cot(state).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn sync_cot_data(state: State<'_, AppState>) -> CommandResult<CotSyncResult> {
    sync_cot(&state).await.map_err(Into::into)
}

async fn sync_cot(state: &AppState) -> Result<CotSyncResult, AppError> {
    let _guard = COT_SYNC_LOCK.lock().await;
    seed_contracts(state).await?;
    let now = Utc::now().to_rfc3339();
    let run_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO cot_sync_runs (id,status,started_at,records_upserted,source_url) VALUES (?, 'running', ?, 0, ?)")
        .bind(&run_id).bind(&now).bind(LEGACY_URL).execute(&state.db).await?;
    let result = sync_cot_inner(state).await;
    match result {
        Ok(imported) => {
            sqlx::query("UPDATE cot_sync_runs SET status='complete', completed_at=?, records_upserted=? WHERE id=?").bind(&now).bind(imported as i64).bind(&run_id).execute(&state.db).await?;
            Ok(CotSyncResult {
                imported,
                last_synced_at: now,
            })
        }
        Err(error) => {
            sqlx::query("UPDATE cot_sync_runs SET status='failed', completed_at=?, error_message=? WHERE id=?").bind(&now).bind(error.to_string()).bind(&run_id).execute(&state.db).await?;
            Err(error)
        }
    }
}

async fn sync_cot_inner(state: &AppState) -> Result<usize, AppError> {
    let client = Client::builder()
        .user_agent("PersonalMacro/1.0 (+local COT collector)")
        .build()
        .map_err(|error| {
            AppError::DataTransfer(format!("CFTC-Client konnte nicht erstellt werden: {error}"))
        })?;
    let contracts = contract_rows(state).await?;
    let cutoff = (Utc::now().date_naive() - Duration::days(HISTORY_YEARS * 366))
        .format("%Y-%m-%d")
        .to_string();
    if contracts
        .iter()
        .any(|contract| contract.legacy_cftc_contract_market_code.is_none())
    {
        return Err(AppError::DataTransfer(
            "Mindestens einem aktiven COT-Kontrakt fehlt der Legacy-CFTC-Code.".into(),
        ));
    }

    let codes = contracts
        .iter()
        .filter_map(|contract| contract.legacy_cftc_contract_market_code.as_deref())
        .map(|code| format!("'{code}'"))
        .collect::<Vec<_>>()
        .join(",");
    let where_clause = format!(
        "cftc_contract_market_code in({codes}) AND report_date_as_yyyy_mm_dd >= '{cutoff}T00:00:00.000'"
    );
    let url = Url::parse_with_params(
        LEGACY_URL,
        &[
            ("$limit", "50000"),
            ("$select", LEGACY_SELECT),
            (
                "$order",
                "report_date_as_yyyy_mm_dd ASC, cftc_contract_market_code ASC",
            ),
            ("$where", &where_clause),
        ],
    )
    .map_err(|error| AppError::DataTransfer(format!("CFTC-URL ist ungültig: {error}")))?;
    let rows: Vec<Value> = client
        .get(url.clone())
        .send()
        .await
        .map_err(|error| AppError::DataTransfer(format!("CFTC-Abruf fehlgeschlagen: {error}")))?
        .error_for_status()
        .map_err(|error| AppError::DataTransfer(format!("CFTC antwortete mit Fehler: {error}")))?
        .json()
        .await
        .map_err(|error| AppError::DataTransfer(format!("CFTC-JSON ist ungültig: {error}")))?;
    if rows.is_empty() {
        return Err(AppError::DataTransfer(
            "Die offizielle CFTC-Quelle lieferte keine Legacy-Futures-Only-Daten.".into(),
        ));
    }

    let by_code: HashMap<_, _> = contracts
        .iter()
        .filter_map(|contract| {
            contract
                .legacy_cftc_contract_market_code
                .as_deref()
                .map(|code| (code, contract))
        })
        .collect();
    let mut previous_positions: HashMap<String, (i64, i64)> = HashMap::new();
    let mut imported = 0;
    let mut tx = state.db.begin().await?;
    for row in rows {
        let Some(code) = value_string(&row, "cftc_contract_market_code") else {
            continue;
        };
        let Some(contract) = by_code.get(code.as_str()) else {
            continue;
        };
        let Some(observation) = parse_legacy_observation(&row, url.as_ref()) else {
            continue;
        };
        let weekly_change = previous_positions.get(&contract.id).and_then(
            |&(previous_long, previous_short)| {
                weekly_long_share_change(
                    observation.long_positions,
                    observation.short_positions,
                    previous_long,
                    previous_short,
                )
            },
        );
        let observation_fingerprint = fingerprint(&format!(
            "legacy|Non-Commercial|{}|{}|{}|{}|{}",
            contract.id,
            observation.report_date,
            observation.long_positions,
            observation.short_positions,
            observation.open_interest
        ));
        let raw_payload = row.to_string();
        let fetched_at = Utc::now().to_rfc3339();
        sqlx::query("INSERT INTO cot_legacy_source_rows (id,contract_id,report_date,report_family,participant_group,report_scope,source_url,fetched_at,source_fingerprint,raw_payload) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(contract_id,report_date) DO UPDATE SET source_url=excluded.source_url,fetched_at=excluded.fetched_at,source_fingerprint=excluded.source_fingerprint,raw_payload=excluded.raw_payload")
            .bind(Uuid::new_v4().to_string())
            .bind(&contract.id)
            .bind(&observation.report_date)
            .bind("legacy")
            .bind("Non-Commercial")
            .bind("futures_only")
            .bind(url.as_str())
            .bind(&fetched_at)
            .bind(fingerprint(&raw_payload))
            .bind(raw_payload)
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO cot_legacy_observations (id,contract_id,report_date,fetched_at,source_url,source_fingerprint,open_interest,open_interest_change,long_positions,short_positions,long_change,short_change,net_positions,net_change,net_position_pct_oi,net_change_pct_oi,long_share,short_share,weekly_long_share_change) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(contract_id,report_date) DO UPDATE SET fetched_at=excluded.fetched_at,source_url=excluded.source_url,source_fingerprint=excluded.source_fingerprint,open_interest=excluded.open_interest,open_interest_change=excluded.open_interest_change,long_positions=excluded.long_positions,short_positions=excluded.short_positions,long_change=excluded.long_change,short_change=excluded.short_change,net_positions=excluded.net_positions,net_change=excluded.net_change,net_position_pct_oi=excluded.net_position_pct_oi,net_change_pct_oi=excluded.net_change_pct_oi,long_share=excluded.long_share,short_share=excluded.short_share,weekly_long_share_change=excluded.weekly_long_share_change")
            .bind(Uuid::new_v4().to_string())
            .bind(&contract.id)
            .bind(&observation.report_date)
            .bind(&fetched_at)
            .bind(&observation.source_url)
            .bind(observation_fingerprint)
            .bind(observation.open_interest)
            .bind(observation.open_interest_change)
            .bind(observation.long_positions)
            .bind(observation.short_positions)
            .bind(observation.long_change)
            .bind(observation.short_change)
            .bind(observation.net_positions)
            .bind(observation.net_change)
            .bind(observation.net_position_pct_oi.to_string())
            .bind(observation.net_change_pct_oi.to_string())
            .bind(observation.long_share.to_string())
            .bind(observation.short_share.to_string())
            .bind(weekly_change.map(|value| value.to_string()))
            .execute(&mut *tx)
            .await?;
        previous_positions.insert(
            contract.id.clone(),
            (observation.long_positions, observation.short_positions),
        );
        imported += 1;
    }
    tx.commit().await?;
    Ok(imported)
}

struct ParsedLegacyObservation {
    report_date: String,
    source_url: String,
    open_interest: i64,
    open_interest_change: i64,
    long_positions: i64,
    short_positions: i64,
    long_change: i64,
    short_change: i64,
    net_positions: i64,
    net_change: i64,
    net_position_pct_oi: f64,
    net_change_pct_oi: f64,
    long_share: f64,
    short_share: f64,
}

fn long_share(long_positions: i64, short_positions: i64) -> Option<f64> {
    if long_positions < 0 || short_positions < 0 {
        return None;
    }
    let total = long_positions.checked_add(short_positions)?;
    (total > 0).then(|| long_positions as f64 / total as f64)
}

fn weekly_long_share_change(
    current_long: i64,
    current_short: i64,
    previous_long: i64,
    previous_short: i64,
) -> Option<f64> {
    Some(
        long_share(current_long, current_short)? - long_share(previous_long, previous_short)?,
    )
}

fn parse_legacy_observation(row: &Value, source_url: &str) -> Option<ParsedLegacyObservation> {
    let report_date = value_string(row, "report_date_as_yyyy_mm_dd")?
        .get(..10)?
        .to_string();
    let open_interest = value_i64(row, "open_interest_all")?;
    let open_interest_change = value_i64(row, "change_in_open_interest_all")?;
    let long_positions = value_i64(row, "noncomm_positions_long_all")?;
    let short_positions = value_i64(row, "noncomm_positions_short_all")?;
    let long_change = value_i64(row, "change_in_noncomm_long_all")?;
    let short_change = value_i64(row, "change_in_noncomm_short_all")?;
    if open_interest <= 0 {
        return None;
    }
    let long_share = long_share(long_positions, short_positions)?;
    let net_positions = long_positions - short_positions;
    let net_change = long_change - short_change;
    Some(ParsedLegacyObservation {
        report_date,
        source_url: source_url.into(),
        open_interest,
        open_interest_change,
        long_positions,
        short_positions,
        long_change,
        short_change,
        net_positions,
        net_change,
        net_position_pct_oi: net_positions as f64 / open_interest as f64,
        net_change_pct_oi: net_change as f64 / open_interest as f64,
        long_share,
        short_share: 1.0 - long_share,
    })
}

fn value_string(row: &Value, key: &str) -> Option<String> {
    row.get(key)?.as_str().map(str::to_string)
}
fn value_i64(row: &Value, key: &str) -> Option<i64> {
    value_string(row, key)?.parse().ok()
}
fn fingerprint(input: &str) -> String {
    Sha256::digest(input.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
async fn seed_contracts(state: &AppState) -> Result<(), AppError> {
    let mut tx = state.db.begin().await?;
    for seed in CONTRACTS {
        sqlx::query("INSERT INTO cot_contracts (id,symbol,display_name,asset_class,report_family,trader_group,cftc_contract_market_code,legacy_cftc_contract_market_code,currency,sort_order,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,1) ON CONFLICT(symbol) DO UPDATE SET display_name=excluded.display_name,asset_class=excluded.asset_class,report_family=excluded.report_family,trader_group=excluded.trader_group,cftc_contract_market_code=excluded.cftc_contract_market_code,legacy_cftc_contract_market_code=excluded.legacy_cftc_contract_market_code,currency=excluded.currency,sort_order=excluded.sort_order,is_active=1")
            .bind(Uuid::new_v4().to_string()).bind(seed.symbol).bind(seed.display_name).bind(seed.asset_class).bind(seed.report_family).bind(seed.trader_group).bind(seed.cftc_code).bind(seed.legacy_cftc_code).bind(seed.currency).bind(seed.order).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}
async fn contract_rows(state: &AppState) -> Result<Vec<ContractRow>, AppError> {
    sqlx::query_as("SELECT id,symbol,display_name,asset_class,report_family,trader_group,legacy_cftc_contract_market_code,currency FROM cot_contracts WHERE is_active=1 ORDER BY sort_order").fetch_all(&state.db).await.map_err(Into::into)
}

#[tauri::command]
pub async fn get_cot_dashboard(state: State<'_, AppState>) -> CommandResult<CotDashboard> {
    cot_dashboard(&state).await.map_err(Into::into)
}
pub async fn cot_dashboard(state: &AppState) -> Result<CotDashboard, AppError> {
    seed_contracts(state).await?;
    let contracts = contract_rows(state).await?;
    let mut views = Vec::new();
    let mut currencies = BTreeMap::new();
    for contract in contracts {
        let observations: Vec<ObservationRow> = sqlx::query_as("SELECT report_date,long_positions,short_positions,long_change,short_change,open_interest,net_positions,net_change,net_position_pct_oi,net_change_pct_oi FROM cot_observations WHERE contract_id=? AND report_date >= ? ORDER BY report_date")
            .bind(&contract.id).bind((Utc::now().date_naive() - Duration::days(HISTORY_YEARS * 366)).format("%Y-%m-%d").to_string()).fetch_all(&state.db).await?;
        let latest = observations.last();
        let assessment = assess_observations(&observations, Utc::now().date_naive());
        persist_evaluation(state, &contract.id, &assessment).await?;
        let position_component = assessment
            .components
            .iter()
            .find(|item| item.key == "positioning");
        let flow_component = assessment
            .components
            .iter()
            .find(|item| item.key == "flow_4w");
        let persistence_component = assessment
            .components
            .iter()
            .find(|item| item.key == "persistence_13w");
        let position_percentile = position_component.and_then(|item| item.percentile);
        let change_percentile = flow_component.and_then(|item| item.percentile);
        let position_signal = position_component.and_then(|item| item.signal);
        let change_signal = flow_component.and_then(|item| item.signal);
        let persistence_signal = persistence_component.and_then(|item| item.signal);
        let latest_change_signal = latest_change_signal(latest, Utc::now().date_naive());
        // DXY is exposed as an explicit USD proxy. The canonical heatmap applies
        // the reduced 0.25 weight and retains the basket provenance.
        if let (
            Some(currency),
            Some(report_date),
            Some(position_signal),
            Some(change_signal),
            Some(persistence_signal),
            Some(confirmed_signal),
        ) = (
            contract
                .currency
                .clone()
                .filter(|_| is_pair_currency(&contract.symbol, &contract.currency)),
            latest.map(|row| row.report_date.clone()),
            position_signal,
            change_signal,
            persistence_signal,
            assessment.bias_signal,
        ) {
            currencies.insert(
                currency.clone(),
                CotCurrencySignal {
                    currency,
                    report_date,
                    position_signal,
                    change_signal,
                    persistence_signal,
                    confirmed_signal,
                    score: f64::from(confirmed_signal),
                },
            );
        }
        views.push(CotContractView {
            symbol: contract.symbol,
            display_name: contract.display_name,
            asset_class: contract.asset_class,
            report_family: contract.report_family,
            trader_group: contract.trader_group,
            currency: contract.currency,
            report_date: latest.map(|row| row.report_date.clone()),
            long_positions: latest.map(|row| row.long_positions),
            short_positions: latest.map(|row| row.short_positions),
            long_change: latest.map(|row| row.long_change),
            short_change: latest.map(|row| row.short_change),
            open_interest: latest.map(|row| row.open_interest),
            net_positions: latest.map(|row| row.net_positions),
            net_change: latest.map(|row| row.net_change),
            net_position_pct_oi: latest.and_then(|row| row.net_position_pct_oi.parse().ok()),
            net_change_pct_oi: latest.and_then(|row| row.net_change_pct_oi.parse().ok()),
            position_percentile,
            change_percentile,
            position_signal,
            change_signal,
            persistence_signal,
            latest_change_signal,
            assessment,
        });
    }
    let currencies: Vec<_> = currencies.into_values().collect();
    let pairs = currency_pairs(&currencies);
    let last_synced_at = sqlx::query_scalar("SELECT completed_at FROM cot_sync_runs WHERE status='complete' ORDER BY completed_at DESC LIMIT 1").fetch_optional(&state.db).await?;
    Ok(CotDashboard {
        source_url: CFTC_COT_LANDING_URL.into(),
        last_synced_at,
        contracts: views,
        currencies,
        pairs,
    })
}
fn is_pair_currency(_symbol: &str, currency: &Option<String>) -> bool {
    currency.is_some()
}
fn percentile(values: &[f64], current: f64) -> f64 {
    if values.is_empty() {
        return 0.5;
    }
    let lower = values.iter().filter(|value| **value < current).count() as f64;
    let equal = values
        .iter()
        .filter(|value| (**value - current).abs() < 1e-12)
        .count() as f64;
    (lower + equal * 0.5) / values.len() as f64
}
fn percentile_signal(percentile: f64) -> i8 {
    if percentile < 0.3 {
        -1
    } else if percentile > 0.7 {
        1
    } else {
        0
    }
}

fn report_is_stale(report_date: Option<&str>, today: NaiveDate) -> bool {
    report_date
        .and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok())
        .map(|date| (today - (date + Duration::days(3))).num_days() > REPORT_STALE_AFTER_DAYS)
        .unwrap_or(true)
}

fn latest_change_signal(observation: Option<&ObservationRow>, today: NaiveDate) -> Option<i8> {
    let observation = observation?;
    if report_is_stale(Some(&observation.report_date), today) {
        return None;
    }
    Some((observation.long_change - observation.short_change).signum() as i8)
}

fn component(
    key: &str,
    label: &str,
    value: Option<f64>,
    percentile: Option<f64>,
) -> CotSignalComponent {
    CotSignalComponent {
        key: key.into(),
        label: label.into(),
        value,
        percentile,
        signal: percentile.map(percentile_signal),
    }
}

fn trailing_percentile(series: &[f64]) -> Option<f64> {
    let current = *series.last()?;
    if series.len() < 2 {
        return None;
    }
    let start = series.len().saturating_sub(EVALUATION_LOOKBACK_WEEKS);
    Some(percentile(&series[start..], current))
}

fn changes(values: &[f64], weeks: usize) -> Vec<f64> {
    values
        .iter()
        .enumerate()
        .filter_map(|(index, value)| index.checked_sub(weeks).map(|prior| value - values[prior]))
        .collect()
}

fn median(values: &mut [f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(f64::total_cmp);
    let middle = values.len() / 2;
    if values.len().is_multiple_of(2) {
        Some((values[middle - 1] + values[middle]) / 2.0)
    } else {
        Some(values[middle])
    }
}

fn theil_sen_slope(values: &[f64]) -> Option<f64> {
    if values.len() < 2 {
        return None;
    }
    let mut slopes = Vec::with_capacity(values.len() * (values.len() - 1) / 2);
    for left in 0..values.len() - 1 {
        for right in left + 1..values.len() {
            slopes.push((values[right] - values[left]) / (right - left) as f64);
        }
    }
    median(&mut slopes)
}

fn assess_observations(observations: &[ObservationRow], today: NaiveDate) -> CotAssessment {
    let values: Vec<f64> = observations
        .iter()
        .filter_map(|row| row.net_position_pct_oi.parse().ok())
        .collect();
    let report_date = observations.last().map(|row| row.report_date.clone());
    let position_value = values.last().copied();
    let flow_values = changes(&values, 4);
    let persistence_values: Vec<f64> = (12..values.len())
        .filter_map(|index| theil_sen_slope(&values[index - 12..=index]))
        .collect();
    let flow_value = flow_values.last().copied();
    let persistence_value = persistence_values.last().copied();
    let position_percentile = trailing_percentile(&values);
    let flow_percentile = trailing_percentile(&flow_values);
    let persistence_percentile = trailing_percentile(&persistence_values);
    let components = vec![
        component(
            "positioning",
            "Positionierung",
            position_value,
            position_percentile,
        ),
        component(
            "flow_4w",
            "Kapitalfluss (4 Wochen)",
            flow_value,
            flow_percentile,
        ),
        component(
            "persistence_13w",
            "Theil-Sen-Trend (13 Wochen)",
            persistence_value,
            persistence_percentile,
        ),
    ];
    let mut reason_codes = Vec::new();
    let mut why = Vec::new();
    if values.len() < MIN_HISTORY_WEEKS {
        reason_codes.push("insufficient_history".into());
        why.push(format!(
            "Nur {} von mindestens {} benötigten Wochen verfügbar.",
            values.len(),
            MIN_HISTORY_WEEKS
        ));
        return CotAssessment {
            scoring_version: SCORING_VERSION.into(),
            status: "unavailable".into(),
            quality: "unavailable".into(),
            bias_signal: None,
            bias_label: "Nicht verfügbar".into(),
            crowding_status: "Nicht bewertbar".into(),
            report_date,
            reason_codes,
            why,
            components,
        };
    }
    let recent_start = observations.len().saturating_sub(EVALUATION_LOOKBACK_WEEKS);
    let has_gap = observations[recent_start..].windows(2).any(|window| {
        let left = NaiveDate::parse_from_str(&window[0].report_date, "%Y-%m-%d");
        let right = NaiveDate::parse_from_str(&window[1].report_date, "%Y-%m-%d");
        matches!((left, right), (Ok(left), Ok(right)) if (right - left).num_days() > 15)
    });
    let stale = report_is_stale(report_date.as_deref(), today);
    if has_gap {
        reason_codes.push("weekly_gap".into());
        why.push("Die wöchentliche COT-Historie enthält eine nicht erklärte Lücke.".into());
    }
    if stale {
        reason_codes.push("stale_report".into());
        why.push("Der jüngste Bericht ist älter als zehn Kalendertage.".into());
    }
    if let (Some(current), Some(previous)) = (observations.last(), observations.iter().rev().nth(1))
    {
        let computed_change = current.net_positions - previous.net_positions;
        if (computed_change - current.net_change).abs() > 1 {
            reason_codes.push("reported_change_mismatch".into());
            why.push("Gemeldete und aus der Historie berechnete Nettoänderung weichen ab.".into());
        }
    }
    let signals: Vec<i8> = components.iter().filter_map(|item| item.signal).collect();
    let positive = signals.iter().filter(|&&value| value > 0).count();
    let negative = signals.iter().filter(|&&value| value < 0).count();
    let bias_signal = if !stale && !has_gap && positive >= 2 && negative == 0 {
        Some(1)
    } else if !stale && !has_gap && negative >= 2 && positive == 0 {
        Some(-1)
    } else if !stale && !has_gap {
        reason_codes.push("mixed_components".into());
        why.push(
            "Positionierung, Kapitalfluss und Persistenz bestätigen keine gemeinsame Richtung."
                .into(),
        );
        Some(0)
    } else {
        None
    };
    if let Some(percentile) = position_percentile {
        why.push(format!(
            "Netto-Positionierung liegt bei P{:.0} im rollierenden Fünfjahresfenster.",
            percentile * 100.0
        ));
    }
    if let Some(percentile) = flow_percentile {
        why.push(format!(
            "Der 4-Wochen-Kapitalfluss liegt bei P{:.0} seiner eigenen Historie.",
            percentile * 100.0
        ));
    }
    let crowding_status = match (position_percentile, flow_percentile) {
        (Some(level), Some(flow)) if level >= 0.9 && flow <= 0.5 => "Erschöpfungsrisiko Long",
        (Some(level), Some(flow)) if level <= 0.1 && flow >= 0.5 => "Erschöpfungsrisiko Short",
        (Some(level), _) if level >= 0.9 => "Crowding Long",
        (Some(level), _) if level <= 0.1 => "Crowding Short",
        _ => "Kein Extrem",
    }
    .into();
    let status = if stale || has_gap {
        "stale"
    } else if values.len() < VALID_HISTORY_WEEKS {
        "limited_history"
    } else {
        "available"
    };
    let quality = if stale || has_gap {
        "unavailable"
    } else if values.len() < VALID_HISTORY_WEEKS {
        "limited"
    } else {
        "high"
    };
    let bias_label = match bias_signal {
        Some(1) => "Bestätigt Bullish",
        Some(-1) => "Bestätigt Bearish",
        Some(0) => "Gemischt / Neutral",
        None => "Nicht verfügbar",
        _ => "Nicht verfügbar",
    }
    .into();
    CotAssessment {
        scoring_version: SCORING_VERSION.into(),
        status: status.into(),
        quality: quality.into(),
        bias_signal,
        bias_label,
        crowding_status,
        report_date,
        reason_codes,
        why,
        components,
    }
}

async fn persist_evaluation(
    state: &AppState,
    contract_id: &str,
    assessment: &CotAssessment,
) -> Result<(), AppError> {
    let Some(report_date) = assessment.report_date.as_deref() else {
        return Ok(());
    };
    let component = |key: &str| {
        assessment
            .components
            .iter()
            .find(|item| item.key == key)
            .and_then(|item| item.percentile)
    };
    sqlx::query("INSERT INTO cot_evaluations (contract_id,report_date,scoring_version,calculated_at,status,quality,bias_signal,level_percentile,flow_percentile,persistence_percentile,crowding_status,reason_codes_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(contract_id,report_date,scoring_version) DO UPDATE SET calculated_at=excluded.calculated_at,status=excluded.status,quality=excluded.quality,bias_signal=excluded.bias_signal,level_percentile=excluded.level_percentile,flow_percentile=excluded.flow_percentile,persistence_percentile=excluded.persistence_percentile,crowding_status=excluded.crowding_status,reason_codes_json=excluded.reason_codes_json")
        .bind(contract_id).bind(report_date).bind(SCORING_VERSION).bind(Utc::now().to_rfc3339())
        .bind(&assessment.status).bind(&assessment.quality).bind(assessment.bias_signal)
        .bind(component("positioning").map(|value| value.to_string()))
        .bind(component("flow_4w").map(|value| value.to_string()))
        .bind(component("persistence_13w").map(|value| value.to_string()))
        .bind(&assessment.crowding_status).bind(serde_json::to_string(&assessment.reason_codes).unwrap_or_else(|_| "[]".into()))
        .execute(&state.db).await?;
    Ok(())
}
fn currency_pairs(currencies: &[CotCurrencySignal]) -> Vec<CotPairScore> {
    let mut pairs = Vec::new();
    for base in currencies {
        for quote in currencies {
            if base.currency == quote.currency {
                continue;
            }
            if base.report_date != quote.report_date {
                pairs.push(CotPairScore {
                    base: base.currency.clone(),
                    quote: quote.currency.clone(),
                    position_score: None,
                    change_score: None,
                    persistence_score: None,
                    confirmed_score: None,
                    raw_score: 0,
                    coverage: 0.0,
                    bias_label: "Nicht verfügbar".into(),
                    report_date: None,
                    reason_code: Some("asynchronous_report_dates".into()),
                });
                continue;
            }
            let position_value = base.position_signal - quote.position_signal;
            let change_value = base.change_signal - quote.change_signal;
            let persistence_value = base.persistence_signal - quote.persistence_signal;
            let confirmed_value = base.confirmed_signal - quote.confirmed_signal;
            pairs.push(CotPairScore {
                base: base.currency.clone(),
                quote: quote.currency.clone(),
                position_score: Some(position_value),
                change_score: Some(change_value),
                persistence_score: Some(persistence_value),
                confirmed_score: Some(confirmed_value),
                raw_score: confirmed_value,
                coverage: 1.0,
                bias_label: cot_bias(confirmed_value).into(),
                report_date: Some(base.report_date.clone()),
                reason_code: None,
            });
        }
    }
    pairs
}
fn cot_bias(score: i8) -> &'static str {
    if score >= 2 {
        "Sehr Bullish"
    } else if score >= 1 {
        "Bullish"
    } else if score <= -2 {
        "Sehr Bearish"
    } else if score <= -1 {
        "Bearish"
    } else {
        "Neutral"
    }
}

#[tauri::command]
pub async fn get_cot_asset_detail(
    state: State<'_, AppState>,
    input: CotDetailInput,
) -> CommandResult<CotAssetDetail> {
    let lookback = input.lookback_weeks.unwrap_or(156);
    if lookback != 0 && ![52, 156, 260, 520, 780].contains(&lookback) {
        return Err(crate::errors::CommandError::validation(
            "Der COT-Lookback muss 52, 156, 260, 520, 780 oder Gesamt sein.",
        ));
    }
    let contract: Option<ContractRow> = sqlx::query_as("SELECT id,symbol,display_name,asset_class,report_family,trader_group,cftc_contract_market_code,currency FROM cot_contracts WHERE symbol=? AND is_active=1")
        .bind(input.symbol.trim()).fetch_optional(&state.db).await.map_err(AppError::from)?;
    let contract = contract.ok_or_else(|| {
        crate::errors::CommandError::validation(
            "Der ausgewÃ¤hlte CFTC-Kontrakt ist nicht verfÃ¼gbar.",
        )
    })?;
    let selected_group = input
        .participant_group
        .unwrap_or(contract.trader_group.clone());
    let rows: Vec<GroupObservationRow> = sqlx::query_as("SELECT cgo.report_date,cgo.participant_group,cgo.long_positions,cgo.short_positions,cgo.net_positions,cgo.net_position_pct_oi,co.open_interest FROM cot_group_observations cgo JOIN cot_observations co ON co.contract_id=cgo.contract_id AND co.report_date=cgo.report_date WHERE cgo.contract_id=? ORDER BY cgo.report_date")
        .bind(&contract.id).fetch_all(&state.db).await.map_err(AppError::from)?;
    let primary_observations: Vec<ObservationRow> = sqlx::query_as("SELECT report_date,long_positions,short_positions,long_change,short_change,open_interest,net_positions,net_change,net_position_pct_oi,net_change_pct_oi FROM cot_observations WHERE contract_id=? ORDER BY report_date")
        .bind(&contract.id).fetch_all(&state.db).await.map_err(AppError::from)?;
    let mut selected: Vec<_> = rows
        .iter()
        .filter(|row| row.participant_group == selected_group)
        .cloned()
        .collect();
    if lookback > 0 && selected.len() > lookback {
        selected.drain(0..selected.len() - lookback);
    }
    let values: Vec<f64> = selected
        .iter()
        .filter_map(|row| row.net_position_pct_oi.parse().ok())
        .collect();
    let latest = selected.last();
    let current = latest.and_then(|row| row.net_position_pct_oi.parse::<f64>().ok());
    let current_z_score = current.and_then(|value| z_score(&values, value));
    let percentile_value = current.map(|value| percentile(&values, value));
    let current_cot_index = current.and_then(|value| cot_index(&values, value));
    let broker_symbol: Option<String> =
        sqlx::query_scalar("SELECT broker_symbol FROM cot_broker_links WHERE contract_id=?")
            .bind(&contract.id)
            .fetch_optional(&state.db)
            .await
            .map_err(AppError::from)?;
    let broker_candles: Vec<DailyCloseRow> = if let Some(symbol) = &broker_symbol {
        sqlx::query_as("SELECT candle_time,close FROM market_daily_candles WHERE symbol=? ORDER BY candle_time")
            .bind(symbol).fetch_all(&state.db).await.map_err(AppError::from)?
    } else {
        Vec::new()
    };
    let assessment = assess_observations(&primary_observations, Utc::now().date_naive());
    let historical_outcomes = historical_outcomes(
        &primary_observations,
        &broker_candles,
        assessment.bias_signal,
    );
    let series = selected
        .iter()
        .enumerate()
        .filter_map(|(index, row)| {
            let value = row.net_position_pct_oi.parse::<f64>().ok()?;
            Some(CotSeriesPoint {
                report_date: row.report_date.clone(),
                long_positions: row.long_positions,
                short_positions: row.short_positions,
                net_positions: row.net_positions,
                net_position_pct_oi: value,
                open_interest: row.open_interest,
                z_score: z_score(&values, value),
                percentile: Some(percentile(&values, value)),
                cot_index: cot_index(&values, value),
                flow_4w: index.checked_sub(4).map(|prior| value - values[prior]),
                persistence_13w: index.checked_sub(13).map(|prior| value - values[prior]),
                broker_price: close_on_or_before(&broker_candles, &row.report_date),
            })
        })
        .collect();
    let mut groups: BTreeMap<String, Vec<&GroupObservationRow>> = BTreeMap::new();
    for row in &rows {
        groups
            .entry(row.participant_group.clone())
            .or_default()
            .push(row);
    }
    let groups = groups
        .into_iter()
        .map(|(name, values)| {
            let latest = values.last();
            let values: Vec<f64> = values
                .iter()
                .filter_map(|row| row.net_position_pct_oi.parse().ok())
                .collect();
            let current = latest.and_then(|row| row.net_position_pct_oi.parse().ok());
            CotGroupSummary {
                participant_group: name,
                net_positions: latest.map(|row| row.net_positions),
                net_position_pct_oi: current,
                z_score: current.and_then(|value| z_score(&values, value)),
                percentile: current.map(|value| percentile(&values, value)),
            }
        })
        .collect();
    let net_change = if selected.len() >= 2 {
        Some(
            selected[selected.len() - 1].net_positions - selected[selected.len() - 2].net_positions,
        )
    } else {
        None
    };
    Ok(CotAssetDetail {
        symbol: contract.symbol,
        display_name: contract.display_name,
        asset_class: contract.asset_class,
        report_family: contract.report_family,
        participant_group: selected_group,
        lookback_weeks: lookback,
        sample_size: values.len(),
        z_score: current_z_score,
        percentile: percentile_value,
        cot_index: current_cot_index,
        net_positions: latest.map(|row| row.net_positions),
        net_position_pct_oi: current,
        net_change,
        broker_symbol,
        assessment,
        historical_outcomes,
        groups,
        series,
    })
}

fn z_score(values: &[f64], value: f64) -> Option<f64> {
    if values.len() < 52 {
        return None;
    }
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    let variance =
        values.iter().map(|item| (item - mean).powi(2)).sum::<f64>() / (values.len() - 1) as f64;
    (variance > 0.0).then(|| (value - mean) / variance.sqrt())
}
fn cot_index(values: &[f64], value: f64) -> Option<f64> {
    let min = values.iter().copied().reduce(f64::min)?;
    let max = values.iter().copied().reduce(f64::max)?;
    (max > min).then(|| (value - min) / (max - min) * 100.0)
}

fn historical_outcomes(
    observations: &[ObservationRow],
    candles: &[DailyCloseRow],
    current_bias: Option<i8>,
) -> CotHistoricalOutcomes {
    let Some(current_bias) = current_bias else {
        return CotHistoricalOutcomes {
            status: "unavailable".into(),
            reason: "Aktueller COT-Bias ist nicht bestätigt.".into(),
            windows: Vec::new(),
        };
    };
    if candles.is_empty() {
        return CotHistoricalOutcomes {
            status: "unavailable".into(),
            reason: "Für historische Outcomes ist eine Preisreihe erforderlich.".into(),
            windows: Vec::new(),
        };
    }
    let mut samples: Vec<Vec<f64>> = vec![Vec::new(), Vec::new()];
    for index in MIN_HISTORY_WEEKS..observations.len() {
        let Some(report_date) =
            NaiveDate::parse_from_str(&observations[index].report_date, "%Y-%m-%d").ok()
        else {
            continue;
        };
        let assessment = assess_observations(&observations[..=index], report_date);
        if assessment.bias_signal != Some(current_bias) {
            continue;
        }
        // Reports are normally published on Friday. Starting seven days after the Tuesday
        // observation deliberately avoids using unavailable COT information in backtests.
        let start = close_on_or_after_date(candles, report_date + Duration::days(7));
        for (sample, weeks) in samples.iter_mut().zip([4_i64, 13]) {
            if let (Some(start), Some(end)) = (
                start,
                close_on_or_after_date(candles, report_date + Duration::days(7 + weeks * 7)),
            ) && start != 0.0
            {
                sample.push(end / start - 1.0);
            }
        }
    }
    let windows: Vec<CotOutcomeWindow> = samples
        .into_iter()
        .zip([4_usize, 13])
        .map(|(mut values, weeks)| {
            values.sort_by(|left, right| left.total_cmp(right));
            let sample_size = values.len();
            let median_return = (sample_size >= 30).then(|| {
                let middle = sample_size / 2;
                if sample_size % 2 == 0 {
                    (values[middle - 1] + values[middle]) / 2.0
                } else {
                    values[middle]
                }
            });
            let hit_rate = (sample_size >= 30).then(|| {
                values.iter().filter(|&&value| value > 0.0).count() as f64 / sample_size as f64
            });
            CotOutcomeWindow {
                weeks,
                sample_size,
                median_return,
                hit_rate,
            }
        })
        .collect();
    let enough = windows
        .iter()
        .any(|window: &CotOutcomeWindow| window.sample_size >= 30);
    CotHistoricalOutcomes {
        status: if enough {
            "available"
        } else {
            "insufficient_sample"
        }
        .into(),
        reason: if enough {
            "Deskriptive historische Fälle mit gleichem bestätigten COT-Bias; keine Prognose."
                .into()
        } else {
            "Weniger als 30 vergleichbare historische Fälle.".into()
        },
        windows,
    }
}

fn close_on_or_after_date(candles: &[DailyCloseRow], date: NaiveDate) -> Option<f64> {
    let target = date.and_hms_opt(0, 0, 0)?.and_utc().timestamp();
    candles
        .iter()
        .find(|row| row.candle_time >= target)
        .map(|row| row.close)
}
fn close_on_or_before(candles: &[DailyCloseRow], report_date: &str) -> Option<f64> {
    let target = NaiveDate::parse_from_str(report_date, "%Y-%m-%d")
        .ok()?
        .and_hms_opt(23, 59, 59)?
        .and_utc()
        .timestamp();
    candles
        .iter()
        .take_while(|row| row.candle_time <= target)
        .last()
        .map(|row| row.close)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn migration_adds_isolated_legacy_cot_storage() {
        let state = crate::database::initialize_headless().await.unwrap();
        let columns: Vec<String> = sqlx::query_scalar(
            "SELECT name FROM pragma_table_info('cot_contracts') ORDER BY cid",
        )
        .fetch_all(&state.db)
        .await
        .unwrap();
        assert!(
            columns
                .iter()
                .any(|name| name == "legacy_cftc_contract_market_code"),
            "cot_contracts is missing its Legacy CFTC code"
        );

        for table in ["cot_legacy_source_rows", "cot_legacy_observations"] {
            let count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
            )
            .bind(table)
            .fetch_one(&state.db)
            .await
            .unwrap();
            assert_eq!(count, 1, "missing table: {table}");
        }
    }

    #[test]
    fn percentile_thresholds_are_neutral_in_the_middle() {
        assert_eq!(percentile_signal(0.29), -1);
        assert_eq!(percentile_signal(0.3), 0);
        assert_eq!(percentile_signal(0.7), 0);
        assert_eq!(percentile_signal(0.71), 1);
    }

    #[test]
    fn latest_change_signal_uses_long_change_minus_short_change() {
        let today = NaiveDate::from_ymd_opt(2026, 8, 10).unwrap();
        let mut row = observations(1, 0.0).remove(0);
        row.report_date = "2026-08-04".into();

        row.long_change = 30;
        row.short_change = 10;
        assert_eq!(latest_change_signal(Some(&row), today), Some(1));

        row.long_change = 10;
        row.short_change = 30;
        assert_eq!(latest_change_signal(Some(&row), today), Some(-1));

        row.long_change = 25;
        row.short_change = 25;
        assert_eq!(latest_change_signal(Some(&row), today), Some(0));
    }

    #[test]
    fn latest_change_signal_is_unavailable_for_missing_or_stale_reports() {
        let today = NaiveDate::from_ymd_opt(2026, 8, 10).unwrap();
        let mut row = observations(1, 0.0).remove(0);
        row.report_date = "2026-07-14".into();
        row.long_change = 30;
        row.short_change = 10;

        assert_eq!(latest_change_signal(None, today), None);
        assert_eq!(latest_change_signal(Some(&row), today), None);
    }

    #[test]
    fn legacy_parser_uses_noncommercial_fields() {
        let row = serde_json::json!({
            "report_date_as_yyyy_mm_dd": "2026-08-04T00:00:00.000",
            "open_interest_all": "419393",
            "change_in_open_interest_all": "-12973",
            "noncomm_positions_long_all": "147228",
            "noncomm_positions_short_all": "192701",
            "change_in_noncomm_long_all": "45957",
            "change_in_noncomm_short_all": "-71982"
        });

        let parsed = parse_legacy_observation(&row, "source").unwrap();
        assert_eq!(parsed.report_date, "2026-08-04");
        assert_eq!(parsed.long_positions, 147_228);
        assert_eq!(parsed.short_positions, 192_701);
        assert_eq!(parsed.open_interest_change, -12_973);
        assert_eq!(parsed.net_positions, -45_473);
        assert_eq!(parsed.net_change, 117_939);
    }

    #[test]
    fn screenshot_reference_vectors_use_week_over_week_long_share_change() {
        let jpy =
            weekly_long_share_change(147_228, 192_701, 101_271, 264_683).unwrap();
        let usd = weekly_long_share_change(35_247, 12_748, 35_339, 18_142).unwrap();

        assert!((jpy - 0.1564).abs() < 0.00005, "JPY was {jpy}");
        assert!((usd - 0.0736).abs() < 0.00005, "USD was {usd}");
    }

    #[test]
    fn long_share_is_unavailable_for_zero_denominator() {
        assert_eq!(long_share(0, 0), None);
    }

    #[test]
    fn dow_uses_the_reference_djia_x5_contract() {
        let dow = CONTRACTS
            .iter()
            .find(|seed| seed.symbol == "DOW")
            .unwrap();
        assert_eq!(dow.legacy_cftc_code, "124603");
    }

    #[test]
    fn contract_view_serializes_latest_change_signal_in_camel_case() {
        let view = CotContractView {
            symbol: "USD".into(),
            display_name: "U.S. Dollar Index".into(),
            asset_class: "Währung".into(),
            report_family: "tff".into(),
            trader_group: "Leveraged Funds".into(),
            currency: Some("USD".into()),
            report_date: Some("2026-08-04".into()),
            long_positions: Some(600),
            short_positions: Some(400),
            long_change: Some(30),
            short_change: Some(10),
            open_interest: Some(1_000),
            net_positions: Some(200),
            net_change: Some(20),
            net_position_pct_oi: Some(0.2),
            net_change_pct_oi: Some(0.02),
            position_percentile: Some(0.8),
            change_percentile: Some(0.75),
            position_signal: Some(1),
            change_signal: Some(1),
            persistence_signal: Some(1),
            latest_change_signal: Some(1),
            assessment: CotAssessment {
                scoring_version: SCORING_VERSION.into(),
                status: "available".into(),
                quality: "high".into(),
                bias_signal: Some(1),
                bias_label: "Bestätigt Bullish".into(),
                crowding_status: "Kein Extrem".into(),
                report_date: Some("2026-08-04".into()),
                reason_codes: Vec::new(),
                why: Vec::new(),
                components: Vec::new(),
            },
        };

        let json = serde_json::to_value(view).unwrap();
        assert_eq!(json["latestChangeSignal"], 1);
        assert!(json.get("latest_change_signal").is_none());
    }

    fn observations(count: usize, step: f64) -> Vec<ObservationRow> {
        (0..count)
            .map(|index| ObservationRow {
                report_date: (NaiveDate::from_ymd_opt(2023, 1, 3).unwrap()
                    + Duration::weeks(index as i64))
                .to_string(),
                long_positions: 1_000 + index as i64,
                short_positions: 500,
                long_change: 1,
                short_change: 0,
                open_interest: 10_000,
                net_positions: 500 + index as i64,
                net_change: 1,
                net_position_pct_oi: (index as f64 * step).to_string(),
                net_change_pct_oi: step.to_string(),
            })
            .collect()
    }

    #[test]
    fn v2_requires_minimum_history_and_confirms_aligned_components() {
        let short = observations(103, 0.001);
        let assessment = assess_observations(&short, NaiveDate::from_ymd_opt(2025, 1, 1).unwrap());
        assert_eq!(assessment.status, "unavailable");
        assert_eq!(assessment.bias_signal, None);

        let full = observations(156, 0.001);
        let assessment = assess_observations(&full, NaiveDate::from_ymd_opt(2026, 1, 1).unwrap());
        assert_eq!(assessment.status, "available");
        assert_eq!(assessment.bias_signal, Some(1));
        assert_eq!(assessment.components.len(), 3);
    }

    #[test]
    fn v2_marks_stale_reports_unavailable_for_pair_scoring() {
        let full = observations(156, 0.001);
        let assessment = assess_observations(&full, NaiveDate::from_ymd_opt(2030, 1, 1).unwrap());
        assert_eq!(assessment.status, "stale");
        assert_eq!(assessment.bias_signal, None);
        assert!(
            assessment
                .reason_codes
                .iter()
                .any(|reason| reason == "stale_report")
        );
    }

    #[test]
    fn dxy_is_available_as_an_explicit_usd_proxy_input() {
        assert!(is_pair_currency("USD", &Some("USD".into())));
        assert!(is_pair_currency("EUR", &Some("EUR".into())));
        assert!(!is_pair_currency("GOLD", &None));
    }
    #[test]
    fn currency_pairs_are_antisymmetric() {
        let values = vec![
            CotCurrencySignal {
                currency: "AUD".into(),
                report_date: "2026-07-14".into(),
                position_signal: 1,
                change_signal: 1,
                persistence_signal: 1,
                confirmed_signal: 1,
                score: 1.0,
            },
            CotCurrencySignal {
                currency: "CHF".into(),
                report_date: "2026-07-14".into(),
                position_signal: -1,
                change_signal: 0,
                persistence_signal: -1,
                confirmed_signal: -1,
                score: -0.5,
            },
        ];
        let pairs = currency_pairs(&values);
        let aud_chf = pairs
            .iter()
            .find(|pair| pair.base == "AUD" && pair.quote == "CHF")
            .unwrap();
        let chf_aud = pairs
            .iter()
            .find(|pair| pair.base == "CHF" && pair.quote == "AUD")
            .unwrap();
        assert_eq!(aud_chf.raw_score, -chf_aud.raw_score);
        assert_eq!(aud_chf.position_score.unwrap(), 2);
        assert_eq!(aud_chf.change_score.unwrap(), 1);
        assert_eq!(aud_chf.persistence_score.unwrap(), 2);
        assert_eq!(aud_chf.confirmed_score.unwrap(), 2);
    }

}
