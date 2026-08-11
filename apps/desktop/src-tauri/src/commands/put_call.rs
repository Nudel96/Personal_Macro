use std::time::Duration;

use chrono::{NaiveDate, Utc};
use regex::Regex;
use reqwest::{Client, header};
use serde::Serialize;
use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;

use crate::{
    database::AppState,
    errors::{AppError, CommandError, CommandResult},
};

const SOURCE_URL: &str = "https://www.cmegroup.com/reports/fx-put-call.pdf";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SourceOrientation {
    Direct,
    Inverse,
}

impl SourceOrientation {
    fn as_str(self) -> &'static str {
        match self {
            Self::Direct => "direct",
            Self::Inverse => "inverse",
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct AssetDefinition {
    symbol: &'static str,
    label: &'static str,
    source_symbol: &'static str,
    orientation: SourceOrientation,
}

const SUPPORTED_ASSETS: [AssetDefinition; 7] = [
    AssetDefinition {
        symbol: "EURUSD",
        label: "EUR/USD",
        source_symbol: "Euro FX",
        orientation: SourceOrientation::Direct,
    },
    AssetDefinition {
        symbol: "GBPUSD",
        label: "GBP/USD",
        source_symbol: "British Pound",
        orientation: SourceOrientation::Direct,
    },
    AssetDefinition {
        symbol: "AUDUSD",
        label: "AUD/USD",
        source_symbol: "Australian Dollar",
        orientation: SourceOrientation::Direct,
    },
    AssetDefinition {
        symbol: "NZDUSD",
        label: "NZD/USD",
        source_symbol: "New Zealand Dollar",
        orientation: SourceOrientation::Direct,
    },
    AssetDefinition {
        symbol: "USDJPY",
        label: "USD/JPY",
        source_symbol: "Japanese Yen",
        orientation: SourceOrientation::Inverse,
    },
    AssetDefinition {
        symbol: "USDCAD",
        label: "USD/CAD",
        source_symbol: "Canadian Dollar",
        orientation: SourceOrientation::Inverse,
    },
    AssetDefinition {
        symbol: "USDCHF",
        label: "USD/CHF",
        source_symbol: "Swiss Franc",
        orientation: SourceOrientation::Inverse,
    },
];

#[derive(Debug, Clone)]
struct ProviderObservation {
    asset_symbol: String,
    source_symbol: String,
    call_notional_usd: i64,
    put_notional_usd: i64,
    orientation: SourceOrientation,
}

#[derive(Debug, Clone)]
struct ParsedReport {
    trade_date: String,
    observations: Vec<ProviderObservation>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PutCallAsset {
    pub symbol: String,
    pub label: String,
    pub source_symbol: String,
    pub source_orientation: String,
}

impl From<AssetDefinition> for PutCallAsset {
    fn from(value: AssetDefinition) -> Self {
        Self {
            symbol: value.symbol.into(),
            label: value.label.into(),
            source_symbol: value.source_symbol.into(),
            source_orientation: value.orientation.as_str().into(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PutCallPoint {
    pub trade_date: String,
    pub raw_ratio: f64,
    pub ma5: f64,
    pub call_notional_usd: i64,
    pub put_notional_usd: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PutCallThresholds {
    pub bullish: f64,
    pub bearish: f64,
    pub sample_size: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Sentiment {
    Bullish,
    Neutral,
    Bearish,
    Unavailable,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PutCallDashboard {
    pub assets: Vec<PutCallAsset>,
    pub selected_asset: PutCallAsset,
    pub points: Vec<PutCallPoint>,
    pub thresholds: Option<PutCallThresholds>,
    pub latest_value: Option<f64>,
    pub sentiment: Sentiment,
    pub calibration_sample_size: usize,
    pub last_successful_sync_at: Option<String>,
    pub last_trade_date: Option<String>,
    pub last_run_status: Option<String>,
    pub last_run_message: Option<String>,
    pub native_only: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PutCallSyncResult {
    pub trade_date: String,
    pub stored_assets: usize,
    pub last_synced_at: String,
}

fn daily_ratio(
    call_notional_usd: i64,
    put_notional_usd: i64,
    orientation: SourceOrientation,
) -> Option<f64> {
    if call_notional_usd <= 0 || put_notional_usd <= 0 {
        return None;
    }

    let (effective_call, effective_put) = match orientation {
        SourceOrientation::Direct => (call_notional_usd, put_notional_usd),
        SourceOrientation::Inverse => (put_notional_usd, call_notional_usd),
    };
    Some(effective_put as f64 / effective_call as f64)
}

fn ma5(values: &[f64]) -> Vec<f64> {
    values
        .windows(5)
        .map(|window| window.iter().sum::<f64>() / 5.0)
        .collect()
}

fn linear_percentile(sorted_values: &[f64], percentile: f64) -> f64 {
    let rank = percentile * (sorted_values.len() - 1) as f64;
    let lower_index = rank.floor() as usize;
    let upper_index = rank.ceil() as usize;
    let fraction = rank - lower_index as f64;
    sorted_values[lower_index]
        + (sorted_values[upper_index] - sorted_values[lower_index]) * fraction
}

fn thresholds(values: &[f64]) -> Option<(f64, f64)> {
    if values.len() < 252 {
        return None;
    }
    let mut sample = values[values.len() - 252..].to_vec();
    sample.sort_by(f64::total_cmp);
    Some((
        linear_percentile(&sample, 0.2),
        linear_percentile(&sample, 0.8),
    ))
}

fn classify(value: Option<f64>, calibrated: Option<(f64, f64)>) -> Sentiment {
    let (Some(value), Some((bullish, bearish))) = (value, calibrated) else {
        return Sentiment::Unavailable;
    };
    if value >= bearish {
        Sentiment::Bearish
    } else if value <= bullish {
        Sentiment::Bullish
    } else {
        Sentiment::Neutral
    }
}

fn validate_pdf_response(content_type: Option<&str>, body: &[u8]) -> Result<(), AppError> {
    let is_pdf_content_type = content_type
        .map(|value| value.to_ascii_lowercase().starts_with("application/pdf"))
        .unwrap_or(false);
    if !is_pdf_content_type {
        return Err(AppError::DataTransfer(
            "CME hat keinen PDF-Report geliefert.".into(),
        ));
    }
    if !body.starts_with(b"%PDF-") {
        return Err(AppError::DataTransfer(
            "Der CME-Report besitzt keine gültige PDF-Signatur.".into(),
        ));
    }
    if body.len() > 8 * 1024 * 1024 {
        return Err(AppError::DataTransfer(
            "Der CME-Report überschreitet die zulässige Größe.".into(),
        ));
    }
    Ok(())
}

fn parse_usd_notional(value: &str) -> Result<i64, AppError> {
    value
        .trim()
        .trim_start_matches('$')
        .replace(',', "")
        .parse::<i64>()
        .map_err(|_| AppError::DataTransfer("CME-Notional konnte nicht gelesen werden.".into()))
}

fn parse_report_text(text: &str) -> Result<ParsedReport, AppError> {
    let date_regex = Regex::new(r"Daily FX Options Update:\s*(\d{2}/\d{2}/\d{4})\s+All Currencies")
        .map_err(|error| AppError::DataTransfer(error.to_string()))?;
    let date_capture = date_regex
        .captures(text)
        .and_then(|captures| captures.get(1))
        .ok_or_else(|| AppError::DataTransfer("CME-Berichtsdatum fehlt.".into()))?;
    let trade_date = NaiveDate::parse_from_str(date_capture.as_str(), "%m/%d/%Y")
        .map_err(|_| AppError::DataTransfer("CME-Berichtsdatum ist ungültig.".into()))?
        .format("%Y-%m-%d")
        .to_string();

    let mut observations = Vec::with_capacity(SUPPORTED_ASSETS.len());
    for definition in SUPPORTED_ASSETS {
        let row_regex = Regex::new(&format!(
            r"(?m)^{}\s+(\$?[\d,]+)\s+(\$?[\d,]+)\s+(\$?[\d,]+)\s*$",
            regex::escape(definition.source_symbol)
        ))
        .map_err(|error| AppError::DataTransfer(error.to_string()))?;
        let matches = row_regex.captures_iter(text).collect::<Vec<_>>();
        if matches.len() != 1 {
            return Err(AppError::DataTransfer(format!(
                "CME-Zeile für {} fehlt oder ist nicht eindeutig.",
                definition.label
            )));
        }
        let captures = &matches[0];
        let call_notional_usd = parse_usd_notional(&captures[1])?;
        let put_notional_usd = parse_usd_notional(&captures[2])?;
        let total_notional_usd = parse_usd_notional(&captures[3])?;
        if call_notional_usd + put_notional_usd != total_notional_usd {
            return Err(AppError::DataTransfer(format!(
                "CME-Summe für {} ist inkonsistent.",
                definition.label
            )));
        }
        observations.push(ProviderObservation {
            asset_symbol: definition.symbol.into(),
            source_symbol: definition.source_symbol.into(),
            call_notional_usd,
            put_notional_usd,
            orientation: definition.orientation,
        });
    }

    Ok(ParsedReport {
        trade_date,
        observations,
    })
}

async fn fetch_report_pdf(url: &str) -> Result<Vec<u8>, AppError> {
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("PersonalMacro/1 put-call-ratio")
        .build()
        .map_err(|error| AppError::DataTransfer(error.to_string()))?;
    let response = client
        .get(url)
        .header(header::ACCEPT, "application/pdf")
        .send()
        .await
        .map_err(|error| {
            AppError::DataTransfer(format!(
                "CME Put/Call-Report konnte nicht abgerufen werden: {}",
                error.to_string().chars().take(220).collect::<String>()
            ))
        })?;
    let status = response.status();
    if !status.is_success() {
        return Err(AppError::DataTransfer(format!(
            "CME Put/Call-Report antwortet mit HTTP {}.",
            status.as_u16()
        )));
    }
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let body = response.bytes().await.map_err(|error| {
        AppError::DataTransfer(format!(
            "CME Put/Call-Report konnte nicht gelesen werden: {}",
            error.to_string().chars().take(220).collect::<String>()
        ))
    })?;
    validate_pdf_response(content_type.as_deref(), &body)?;
    Ok(body.to_vec())
}

async fn record_sync_run(
    db: &SqlitePool,
    id: &str,
    started_at: &str,
    status: &str,
    fetched_assets: usize,
    stored_assets: usize,
    message: Option<&str>,
) -> Result<(), AppError> {
    let bounded_message = message.map(|value| value.chars().take(280).collect::<String>());
    sqlx::query(
        "INSERT INTO put_call_sync_runs (
            id, started_at, finished_at, status, fetched_assets, stored_assets, message
         ) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id)
    .bind(started_at)
    .bind(Utc::now().to_rfc3339())
    .bind(status)
    .bind(fetched_assets as i64)
    .bind(stored_assets as i64)
    .bind(bounded_message)
    .execute(db)
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn get_put_call_dashboard(
    state: State<'_, AppState>,
    asset_symbol: Option<String>,
) -> CommandResult<PutCallDashboard> {
    let symbol = asset_symbol
        .unwrap_or_else(|| "EURUSD".into())
        .trim()
        .replace('/', "")
        .to_ascii_uppercase();
    load_dashboard(&state.db, &symbol)
        .await
        .map_err(CommandError::from)
}

#[tauri::command]
pub async fn sync_put_call_data(state: State<'_, AppState>) -> CommandResult<PutCallSyncResult> {
    let run_id = Uuid::new_v4().to_string();
    let started_at = Utc::now().to_rfc3339();
    let outcome = async {
        let bytes = fetch_report_pdf(SOURCE_URL).await?;
        let text = pdf_extract::extract_text_from_mem(&bytes).map_err(|error| {
            AppError::DataTransfer(format!(
                "CME-PDF konnte nicht ausgewertet werden: {}",
                error.to_string().chars().take(220).collect::<String>()
            ))
        })?;
        let report = parse_report_text(&text)?;
        let stored_assets =
            store_observations(&state.db, &report.trade_date, &report.observations).await?;
        Ok::<_, AppError>((report.trade_date, stored_assets))
    }
    .await;

    match outcome {
        Ok((trade_date, stored_assets)) => {
            record_sync_run(
                &state.db,
                &run_id,
                &started_at,
                "success",
                stored_assets,
                stored_assets,
                None,
            )
            .await
            .map_err(CommandError::from)?;
            Ok(PutCallSyncResult {
                trade_date,
                stored_assets,
                last_synced_at: Utc::now().to_rfc3339(),
            })
        }
        Err(error) => {
            let message = error.to_string();
            if let Err(record_error) = record_sync_run(
                &state.db,
                &run_id,
                &started_at,
                "failed",
                0,
                0,
                Some(&message),
            )
            .await
            {
                tracing::warn!(error = ?record_error, "Put/Call-Syncfehler konnte nicht protokolliert werden");
            }
            Err(CommandError::from(error))
        }
    }
}

async fn store_observations(
    db: &SqlitePool,
    trade_date: &str,
    observations: &[ProviderObservation],
) -> Result<usize, AppError> {
    NaiveDate::parse_from_str(trade_date, "%Y-%m-%d")
        .map_err(|_| AppError::Validation("Ungültiges CME-Berichtsdatum.".into()))?;
    let collected_at = Utc::now().to_rfc3339();
    let mut transaction = db.begin().await?;
    for observation in observations {
        sqlx::query(
            "INSERT INTO put_call_observations (
                asset_symbol, source_symbol, trade_date, call_notional_usd,
                put_notional_usd, source_orientation, source_url, collected_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(asset_symbol, trade_date) DO UPDATE SET
                source_symbol = excluded.source_symbol,
                call_notional_usd = excluded.call_notional_usd,
                put_notional_usd = excluded.put_notional_usd,
                source_orientation = excluded.source_orientation,
                source_url = excluded.source_url,
                collected_at = excluded.collected_at",
        )
        .bind(&observation.asset_symbol)
        .bind(&observation.source_symbol)
        .bind(trade_date)
        .bind(observation.call_notional_usd)
        .bind(observation.put_notional_usd)
        .bind(observation.orientation.as_str())
        .bind(SOURCE_URL)
        .bind(&collected_at)
        .execute(&mut *transaction)
        .await?;
    }
    transaction.commit().await?;
    Ok(observations.len())
}

async fn load_dashboard(db: &SqlitePool, asset_symbol: &str) -> Result<PutCallDashboard, AppError> {
    let definition = SUPPORTED_ASSETS
        .iter()
        .copied()
        .find(|asset| asset.symbol == asset_symbol)
        .ok_or_else(|| AppError::Validation("Unbekanntes Put/Call-Asset.".into()))?;

    let rows = sqlx::query_as::<_, (String, i64, i64)>(
        "SELECT trade_date, call_notional_usd, put_notional_usd
         FROM (
            SELECT trade_date, call_notional_usd, put_notional_usd
            FROM put_call_observations
            WHERE asset_symbol = ?
            ORDER BY trade_date DESC
            LIMIT 350
         )
         ORDER BY trade_date ASC",
    )
    .bind(asset_symbol)
    .fetch_all(db)
    .await?;

    let valid_rows = rows
        .into_iter()
        .filter_map(|(trade_date, call, put)| {
            daily_ratio(call, put, definition.orientation)
                .map(|ratio| (trade_date, call, put, ratio))
        })
        .collect::<Vec<_>>();
    let raw_ratios = valid_rows
        .iter()
        .map(|(_, _, _, ratio)| *ratio)
        .collect::<Vec<_>>();
    let averages = ma5(&raw_ratios);
    let calibrated = thresholds(&averages);
    let calibration_sample_size = averages.len().min(252);
    let threshold_view = calibrated.map(|(bullish, bearish)| PutCallThresholds {
        bullish,
        bearish,
        sample_size: 252,
    });
    let mut points = averages
        .iter()
        .enumerate()
        .map(|(index, average)| {
            let (trade_date, call, put, raw_ratio) = &valid_rows[index + 4];
            PutCallPoint {
                trade_date: trade_date.clone(),
                raw_ratio: *raw_ratio,
                ma5: *average,
                call_notional_usd: *call,
                put_notional_usd: *put,
            }
        })
        .collect::<Vec<_>>();
    if points.len() > 90 {
        points = points.split_off(points.len() - 90);
    }
    let latest_value = averages.last().copied();
    let sentiment = classify(latest_value, calibrated);
    let last_trade_date = valid_rows.last().map(|(date, _, _, _)| date.clone());

    let last_successful_sync_at = sqlx::query_scalar::<_, String>(
        "SELECT finished_at FROM put_call_sync_runs
         WHERE status = 'success' AND finished_at IS NOT NULL
         ORDER BY started_at DESC LIMIT 1",
    )
    .fetch_optional(db)
    .await?;
    let last_run = sqlx::query_as::<_, (String, Option<String>)>(
        "SELECT status, message FROM put_call_sync_runs
         ORDER BY started_at DESC LIMIT 1",
    )
    .fetch_optional(db)
    .await?;

    Ok(PutCallDashboard {
        assets: SUPPORTED_ASSETS.into_iter().map(Into::into).collect(),
        selected_asset: definition.into(),
        points,
        thresholds: threshold_view,
        latest_value,
        sentiment,
        calibration_sample_size,
        last_successful_sync_at,
        last_trade_date,
        last_run_status: last_run.as_ref().map(|(status, _)| status.clone()),
        last_run_message: last_run.and_then(|(_, message)| message),
        native_only: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::initialize_headless;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn serve_once(status: &str, content_type: &str, body: &'static [u8]) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let status = status.to_string();
        let content_type = content_type.to_string();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 2048];
            let _ = stream.read(&mut request);
            let response = format!(
                "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            stream.write_all(response.as_bytes()).unwrap();
            stream.write_all(body).unwrap();
        });
        format!("http://{address}/fx-put-call.pdf")
    }

    #[test]
    fn direct_ratio_divides_put_by_call() {
        assert_eq!(daily_ratio(100, 250, SourceOrientation::Direct), Some(2.5));
    }

    #[test]
    fn inverse_ratio_swaps_provider_put_and_call() {
        assert_eq!(daily_ratio(100, 250, SourceOrientation::Inverse), Some(0.4));
    }

    #[test]
    fn zero_notional_is_unavailable() {
        assert_eq!(daily_ratio(0, 250, SourceOrientation::Direct), None);
        assert_eq!(daily_ratio(100, 0, SourceOrientation::Direct), None);
    }

    #[test]
    fn ma5_requires_five_values_and_uses_a_rolling_window() {
        assert_eq!(ma5(&[1.0, 2.0, 3.0, 4.0]), Vec::<f64>::new());
        assert_eq!(ma5(&[1.0, 2.0, 3.0, 4.0, 5.0]), vec![3.0]);
        assert_eq!(ma5(&[1.0, 2.0, 3.0, 4.0, 5.0, 10.0]), vec![3.0, 4.8]);
    }

    #[test]
    fn thresholds_require_252_values_and_interpolate_p20_p80() {
        assert!(thresholds(&vec![1.0; 251]).is_none());
        let observations = (1..=252).map(f64::from).collect::<Vec<_>>();
        assert_eq!(thresholds(&observations), Some((51.2, 201.8)));
    }

    #[test]
    fn thresholds_use_only_the_latest_252_values() {
        let mut observations = vec![10_000.0];
        observations.extend((1..=252).map(f64::from));
        assert_eq!(thresholds(&observations), Some((51.2, 201.8)));
    }

    #[test]
    fn sentiment_includes_exact_thresholds_and_preserves_unavailable() {
        let calibrated = Some((51.2, 201.8));
        assert_eq!(classify(Some(201.8), calibrated), Sentiment::Bearish);
        assert_eq!(classify(Some(51.2), calibrated), Sentiment::Bullish);
        assert_eq!(classify(Some(100.0), calibrated), Sentiment::Neutral);
        assert_eq!(classify(Some(100.0), None), Sentiment::Unavailable);
        assert_eq!(classify(None, calibrated), Sentiment::Unavailable);
    }

    #[tokio::test]
    async fn dashboard_reads_persisted_ma5() {
        let state = initialize_headless().await.unwrap();
        for (day, put_notional_usd) in [(4, 100), (5, 200), (6, 300), (7, 400), (8, 500)] {
            store_observations(
                &state.db,
                &format!("2026-08-{day:02}"),
                &[ProviderObservation {
                    asset_symbol: "EURUSD".into(),
                    source_symbol: "Euro FX".into(),
                    call_notional_usd: 100,
                    put_notional_usd,
                    orientation: SourceOrientation::Direct,
                }],
            )
            .await
            .unwrap();
        }

        let dashboard = load_dashboard(&state.db, "EURUSD").await.unwrap();

        assert_eq!(dashboard.selected_asset.symbol, "EURUSD");
        assert_eq!(dashboard.points.len(), 1);
        assert_eq!(dashboard.points[0].trade_date, "2026-08-08");
        assert_eq!(dashboard.points[0].raw_ratio, 5.0);
        assert_eq!(dashboard.points[0].ma5, 3.0);
        assert_eq!(dashboard.calibration_sample_size, 1);
        assert!(dashboard.thresholds.is_none());
        assert_eq!(dashboard.sentiment, Sentiment::Unavailable);
    }

    #[tokio::test]
    async fn failed_observation_transaction_preserves_existing_data() {
        let state = initialize_headless().await.unwrap();
        store_observations(
            &state.db,
            "2026-08-08",
            &[ProviderObservation {
                asset_symbol: "EURUSD".into(),
                source_symbol: "Euro FX".into(),
                call_notional_usd: 100,
                put_notional_usd: 200,
                orientation: SourceOrientation::Direct,
            }],
        )
        .await
        .unwrap();

        let result = store_observations(
            &state.db,
            "2026-08-08",
            &[
                ProviderObservation {
                    asset_symbol: "EURUSD".into(),
                    source_symbol: "Euro FX".into(),
                    call_notional_usd: 500,
                    put_notional_usd: 500,
                    orientation: SourceOrientation::Direct,
                },
                ProviderObservation {
                    asset_symbol: "GBPUSD".into(),
                    source_symbol: "British Pound".into(),
                    call_notional_usd: -1,
                    put_notional_usd: 100,
                    orientation: SourceOrientation::Direct,
                },
            ],
        )
        .await;
        assert!(result.is_err());

        let persisted_call: i64 = sqlx::query_scalar(
            "SELECT call_notional_usd FROM put_call_observations WHERE asset_symbol = 'EURUSD' AND trade_date = '2026-08-08'",
        )
        .fetch_one(&state.db)
        .await
        .unwrap();
        assert_eq!(persisted_call, 100);
    }

    const COMPLETE_CME_REPORT: &str = r#"
Daily FX Options Update: 08/10/2026 All Currencies
For questions regarding this report, please contact cmefxoptions@cmegroup.com
Call Option Put Option TOTAL
Currency $1,348,322,388 $1,208,124,325 $2,556,446,713
Euro FX $510,416,015 $629,086,390 $1,139,502,405
Japanese Yen $444,084,719 $351,568,172 $795,652,891
Canadian Dollar $218,826,800 $35,979,830 $254,806,630
British Pound $118,113,982 $129,517,302 $247,631,284
Australian Dollar $52,503,665 $55,835,170 $108,338,835
Mexican Peso $756,340 $4,580,680 $5,337,020
Swiss Franc $3,561,982 $1,556,781 $5,118,763
New Zealand Dollar $58,885 $10,000 $68,885
"#;

    #[test]
    fn parses_complete_cme_summary() {
        let report = parse_report_text(COMPLETE_CME_REPORT).unwrap();

        assert_eq!(report.trade_date, "2026-08-10");
        assert_eq!(report.observations.len(), 7);
        let euro = report
            .observations
            .iter()
            .find(|item| item.asset_symbol == "EURUSD")
            .unwrap();
        assert_eq!(euro.call_notional_usd, 510_416_015);
        assert_eq!(euro.put_notional_usd, 629_086_390);
        assert_eq!(euro.orientation, SourceOrientation::Direct);
        let yen = report
            .observations
            .iter()
            .find(|item| item.asset_symbol == "USDJPY")
            .unwrap();
        assert_eq!(yen.call_notional_usd, 444_084_719);
        assert_eq!(yen.put_notional_usd, 351_568_172);
        assert_eq!(yen.orientation, SourceOrientation::Inverse);
    }

    #[test]
    fn rejects_incomplete_or_duplicate_cme_summary() {
        let incomplete =
            COMPLETE_CME_REPORT.replace("Swiss Franc $3,561,982 $1,556,781 $5,118,763\n", "");
        assert!(matches!(
            parse_report_text(&incomplete),
            Err(AppError::DataTransfer(_))
        ));

        let duplicate =
            format!("{COMPLETE_CME_REPORT}\nEuro FX $510,416,015 $629,086,390 $1,139,502,405");
        assert!(matches!(
            parse_report_text(&duplicate),
            Err(AppError::DataTransfer(_))
        ));
    }

    #[test]
    fn rejects_invalid_pdf_response_and_missing_report_date() {
        assert!(matches!(
            validate_pdf_response(Some("text/html"), b"%PDF-content"),
            Err(AppError::DataTransfer(_))
        ));
        assert!(matches!(
            validate_pdf_response(Some("application/pdf"), b"<html>blocked</html>"),
            Err(AppError::DataTransfer(_))
        ));
        let missing_date = COMPLETE_CME_REPORT.replace(
            "Daily FX Options Update: 08/10/2026 All Currencies",
            "Daily FX Options Update: All Currencies",
        );
        assert!(matches!(
            parse_report_text(&missing_date),
            Err(AppError::DataTransfer(_))
        ));
    }

    #[tokio::test]
    async fn fetch_report_pdf_accepts_a_bounded_pdf_response() {
        let url = serve_once("200 OK", "application/pdf", b"%PDF-test");

        let bytes = fetch_report_pdf(&url).await.unwrap();

        assert_eq!(bytes, b"%PDF-test");
    }

    #[tokio::test]
    async fn fetch_report_pdf_rejects_provider_status_and_html() {
        let forbidden = serve_once("403 Forbidden", "application/json", b"blocked");
        assert!(matches!(
            fetch_report_pdf(&forbidden).await,
            Err(AppError::DataTransfer(_))
        ));

        let html = serve_once("200 OK", "text/html", b"<html>blocked</html>");
        assert!(matches!(
            fetch_report_pdf(&html).await,
            Err(AppError::DataTransfer(_))
        ));
    }

    #[tokio::test]
    async fn failed_sync_run_preserves_observations_and_is_visible() {
        let state = initialize_headless().await.unwrap();
        store_observations(
            &state.db,
            "2026-08-08",
            &[ProviderObservation {
                asset_symbol: "EURUSD".into(),
                source_symbol: "Euro FX".into(),
                call_notional_usd: 100,
                put_notional_usd: 200,
                orientation: SourceOrientation::Direct,
            }],
        )
        .await
        .unwrap();
        record_sync_run(
            &state.db,
            "run-1",
            "2026-08-11T12:00:00Z",
            "failed",
            0,
            0,
            Some("CME blockiert den Abruf."),
        )
        .await
        .unwrap();

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM put_call_observations")
            .fetch_one(&state.db)
            .await
            .unwrap();
        let dashboard = load_dashboard(&state.db, "EURUSD").await.unwrap();

        assert_eq!(count, 1);
        assert_eq!(dashboard.last_run_status.as_deref(), Some("failed"));
        assert_eq!(
            dashboard.last_run_message.as_deref(),
            Some("CME blockiert den Abruf.")
        );
    }
}
