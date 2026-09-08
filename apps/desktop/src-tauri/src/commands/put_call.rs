use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

use calamine::{Data, Reader, Xlsx, open_workbook};
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
const DAILY_VOLUME_ARCHIVE_URL: &str = "https://www.cmegroup.com/ftp/daily_volume/";
const MAX_PDF_BYTES: u64 = 8 * 1024 * 1024;
const MAX_XLSX_BYTES: u64 = 32 * 1024 * 1024;
const MIN_EXTREME_SAMPLE: usize = 20;
const EXTREME_CALIBRATION_WINDOW: usize = 252;

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

#[derive(Debug, Clone)]
struct ReconstructedObservation {
    asset_symbol: String,
    source_symbol: String,
    call_value: i64,
    put_value: i64,
    orientation: SourceOrientation,
    product_codes: Vec<String>,
}

#[derive(Debug, Clone)]
struct ParsedDailyVolumeReport {
    trade_date: String,
    observations: Vec<ReconstructedObservation>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OptionSide {
    Call,
    Put,
}

#[derive(Debug, Default)]
struct DailyVolumeAggregate {
    call_value: i64,
    put_value: i64,
    product_codes: BTreeSet<String>,
}

fn normalize_header(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn normalized_words(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_uppercase()
            } else {
                ' '
            }
        })
        .collect::<String>()
}

fn cell_text(cell: Option<&Data>) -> String {
    cell.map(ToString::to_string)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn parse_contract_volume(value: &str) -> Option<i64> {
    let normalized = value.trim().replace(',', "");
    if let Ok(integer) = normalized.parse::<i64>() {
        return (integer >= 0).then_some(integer);
    }
    let float = normalized.parse::<f64>().ok()?;
    (float.is_finite() && float >= 0.0 && float.fract().abs() < f64::EPSILON)
        .then_some(float as i64)
}

fn option_side(product_description: &str) -> Option<OptionSide> {
    let words = normalized_words(product_description);
    let has_call = words.split_whitespace().any(|word| word == "CALL");
    let has_put = words.split_whitespace().any(|word| word == "PUT");
    match (has_call, has_put) {
        (true, false) => Some(OptionSide::Call),
        (false, true) => Some(OptionSide::Put),
        _ => None,
    }
}

fn asset_for_product(product_description: &str) -> Option<AssetDefinition> {
    let words = normalized_words(product_description);
    let compact = normalize_header(product_description).to_ascii_uppercase();
    let currency_codes = ["EUR", "GBP", "AUD", "NZD", "JPY", "CAD", "CHF", "USD"];
    let present_codes = currency_codes
        .into_iter()
        .filter(|code| compact.contains(code))
        .collect::<BTreeSet<_>>();
    let non_usd_codes = present_codes
        .iter()
        .copied()
        .filter(|code| *code != "USD")
        .collect::<Vec<_>>();
    if non_usd_codes.len() > 1 || (non_usd_codes.len() == 1 && !present_codes.contains("USD")) {
        return None;
    }
    if present_codes.contains("USD") && non_usd_codes.len() == 1 {
        let symbol = match non_usd_codes[0] {
            "EUR" => "EURUSD",
            "GBP" => "GBPUSD",
            "AUD" => "AUDUSD",
            "NZD" => "NZDUSD",
            "JPY" => "USDJPY",
            "CAD" => "USDCAD",
            "CHF" => "USDCHF",
            _ => return None,
        };
        return SUPPORTED_ASSETS
            .iter()
            .copied()
            .find(|asset| asset.symbol == symbol);
    }

    let aliases = [
        ("EURO FX", "EURUSD"),
        ("BRITISH POUND", "GBPUSD"),
        ("AUSTRALIAN DOLLAR", "AUDUSD"),
        ("NEW ZEALAND DOLLAR", "NZDUSD"),
        ("JAPANESE YEN", "USDJPY"),
        ("CANADIAN DOLLAR", "USDCAD"),
        ("SWISS FRANC", "USDCHF"),
    ];
    let matched_symbols = aliases
        .into_iter()
        .filter_map(|(alias, symbol)| words.contains(alias).then_some(symbol))
        .collect::<BTreeSet<_>>();
    if matched_symbols.len() != 1 {
        return None;
    }
    SUPPORTED_ASSETS
        .iter()
        .copied()
        .find(|asset| asset.symbol == *matched_symbols.first().expect("one symbol"))
}

fn parse_trade_date_from_xlsx_path(path: &Path) -> Result<String, AppError> {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::Validation("Der CME-XLSX-Dateiname ist ungültig.".into()))?;
    let captures = Regex::new(r"(?i)^daily_volume_(\d{8})\.xlsx$")
        .map_err(|error| AppError::DataTransfer(error.to_string()))?
        .captures(file_name)
        .ok_or_else(|| {
            AppError::Validation(
                "CME-XLSX-Dateien müssen daily_volume_YYYYMMDD.xlsx heißen.".into(),
            )
        })?;
    NaiveDate::parse_from_str(&captures[1], "%Y%m%d")
        .map_err(|_| AppError::Validation("Das CME-XLSX-Handelsdatum ist ungültig.".into()))
        .map(|date| date.format("%Y-%m-%d").to_string())
}

fn find_header_indices(rows: &[Vec<Data>]) -> Option<(usize, BTreeMap<String, usize>)> {
    for (row_index, row) in rows.iter().take(100).enumerate() {
        let headers = row
            .iter()
            .enumerate()
            .filter_map(|(index, cell)| {
                let normalized = normalize_header(&cell.to_string());
                (!normalized.is_empty()).then_some((normalized, index))
            })
            .collect::<BTreeMap<_, _>>();
        let has_product = headers.contains_key("productdescription");
        let has_total = headers.contains_key("totalvolume");
        let has_indicator = headers.contains_key("futureoptionindicator");
        let has_asset_class = headers.contains_key("description")
            || headers.contains_key("assetclass")
            || headers.contains_key("assetclassdescription");
        if has_product && has_total && has_indicator && has_asset_class {
            return Some((row_index, headers));
        }
    }
    None
}

fn parse_daily_volume_workbook(path: &Path) -> Result<ParsedDailyVolumeReport, AppError> {
    let is_xlsx = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("xlsx"));
    if !is_xlsx {
        return Err(AppError::Validation(
            "Bitte offizielle CME-XLSX-Dateien auswählen.".into(),
        ));
    }
    let trade_date = parse_trade_date_from_xlsx_path(path)?;
    let canonical = path.canonicalize().map_err(|_| {
        AppError::Validation("Die ausgewählte CME-XLSX-Datei wurde nicht gefunden.".into())
    })?;
    let metadata = fs::metadata(&canonical)?;
    if !metadata.is_file() || metadata.len() > MAX_XLSX_BYTES {
        return Err(AppError::Validation(
            "Die CME-XLSX-Datei ist ungültig oder größer als 32 MiB.".into(),
        ));
    }

    let mut workbook: Xlsx<_> =
        open_workbook(&canonical).map_err(|error: calamine::XlsxError| {
            AppError::DataTransfer(format!(
                "CME-XLSX konnte nicht geöffnet werden: {}",
                error.to_string().chars().take(220).collect::<String>()
            ))
        })?;
    let mut selected = None;
    for sheet_name in workbook.sheet_names() {
        let range = workbook.worksheet_range(&sheet_name).map_err(|error| {
            AppError::DataTransfer(format!(
                "CME-XLSX-Tabellenblatt konnte nicht gelesen werden: {}",
                error.to_string().chars().take(220).collect::<String>()
            ))
        })?;
        let rows = range.rows().map(|row| row.to_vec()).collect::<Vec<_>>();
        if let Some((header_row, headers)) = find_header_indices(&rows) {
            selected = Some((rows, header_row, headers));
            break;
        }
    }
    let (rows, header_row, headers) = selected.ok_or_else(|| {
        AppError::DataTransfer(
            "Die CME-XLSX enthält kein unterstütztes produktbezogenes Volume-Schema.".into(),
        )
    })?;
    let product_index = headers["productdescription"];
    let total_index = headers["totalvolume"];
    let indicator_index = headers["futureoptionindicator"];
    let asset_class_index = headers
        .get("description")
        .or_else(|| headers.get("assetclass"))
        .or_else(|| headers.get("assetclassdescription"))
        .copied()
        .expect("validated asset-class header");
    let product_code_index = headers
        .get("productcode")
        .or_else(|| headers.get("commodityindicator"))
        .copied();

    let mut aggregates = BTreeMap::<String, DailyVolumeAggregate>::new();
    for row in rows.iter().skip(header_row + 1) {
        let asset_class = normalized_words(&cell_text(row.get(asset_class_index)));
        if asset_class.trim() != "FX" && !asset_class.contains("FOREIGN EXCHANGE") {
            continue;
        }
        let indicator = normalized_words(&cell_text(row.get(indicator_index)));
        if !matches!(indicator.trim(), "O" | "OPTION" | "OPTIONS") {
            continue;
        }
        let description = cell_text(row.get(product_index));
        let Some(side) = option_side(&description) else {
            continue;
        };
        let Some(asset) = asset_for_product(&description) else {
            continue;
        };
        let Some(volume) = parse_contract_volume(&cell_text(row.get(total_index))) else {
            continue;
        };
        if volume == 0 {
            continue;
        }
        let aggregate = aggregates.entry(asset.symbol.into()).or_default();
        match side {
            OptionSide::Call => aggregate.call_value += volume,
            OptionSide::Put => aggregate.put_value += volume,
        }
        if let Some(index) = product_code_index {
            let code = cell_text(row.get(index));
            if !code.is_empty() {
                aggregate.product_codes.insert(code);
            }
        }
    }

    let observations = aggregates
        .into_iter()
        .filter(|(_, aggregate)| aggregate.call_value > 0 && aggregate.put_value > 0)
        .filter_map(|(asset_symbol, aggregate)| {
            let definition = SUPPORTED_ASSETS
                .iter()
                .copied()
                .find(|asset| asset.symbol == asset_symbol)?;
            Some(ReconstructedObservation {
                asset_symbol,
                source_symbol: definition.source_symbol.into(),
                call_value: aggregate.call_value,
                put_value: aggregate.put_value,
                orientation: definition.orientation,
                product_codes: aggregate.product_codes.into_iter().collect(),
            })
        })
        .collect::<Vec<_>>();
    if observations.is_empty() {
        return Err(AppError::DataTransfer(
            "Die CME-XLSX enthält keinen vollständigen Call-/Put-Tageswert für unterstützte USD-FX-Assets.".into(),
        ));
    }
    Ok(ParsedDailyVolumeReport {
        trade_date,
        observations,
    })
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
    pub ma5: Option<f64>,
    pub call_value: i64,
    pub put_value: i64,
    pub value_unit: String,
    pub calculation_method: String,
    pub method_label: String,
    pub source_file: Option<String>,
    pub is_preliminary: bool,
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
    pub latest_raw_ratio: Option<f64>,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PutCallBatchImportResult {
    pub selected_files: usize,
    pub valid_trading_days: usize,
    pub stored_observations: usize,
    pub skipped_lower_priority: usize,
    pub earliest_trade_date: Option<String>,
    pub latest_trade_date: Option<String>,
    pub imported_at: String,
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
    if values.len() < MIN_EXTREME_SAMPLE {
        return None;
    }
    let sample_start = values.len().saturating_sub(EXTREME_CALIBRATION_WINDOW);
    let mut sample = values[sample_start..].to_vec();
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

fn calculation_method_label(method: &str) -> &'static str {
    match method {
        "official_notional_pdf" => "CME Official Notional PCR",
        "reconstructed_weighted_pcr" => "CME Reconstructed Weighted PCR",
        "contract_volume_pcr" => "CME Contract-Volume PCR",
        _ => "CME PCR",
    }
}

fn validate_pdf_document(body: &[u8]) -> Result<(), AppError> {
    if !body.starts_with(b"%PDF-") {
        return Err(AppError::DataTransfer(
            "Der CME-Report besitzt keine gültige PDF-Signatur.".into(),
        ));
    }
    if body.len() as u64 > MAX_PDF_BYTES {
        return Err(AppError::DataTransfer(
            "Der CME-Report überschreitet die zulässige Größe.".into(),
        ));
    }
    Ok(())
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
    validate_pdf_document(body)
}

fn read_local_pdf(path: &Path) -> Result<Vec<u8>, AppError> {
    let is_pdf = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"));
    if !is_pdf {
        return Err(AppError::Validation(
            "Bitte eine PDF-Datei des CME-Reports auswählen.".into(),
        ));
    }
    let canonical = path.canonicalize().map_err(|_| {
        AppError::Validation("Die ausgewählte CME-PDF wurde nicht gefunden.".into())
    })?;
    let metadata = fs::metadata(&canonical)?;
    if !metadata.is_file() {
        return Err(AppError::Validation(
            "Der ausgewählte Pfad ist keine Datei.".into(),
        ));
    }
    if metadata.len() > MAX_PDF_BYTES {
        return Err(AppError::Validation(
            "Die CME-PDF darf maximal 8 MiB groß sein.".into(),
        ));
    }
    let bytes = fs::read(canonical)?;
    validate_pdf_document(&bytes)?;
    Ok(bytes)
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

#[tauri::command]
pub async fn import_put_call_pdf(
    state: State<'_, AppState>,
    path: String,
) -> CommandResult<PutCallSyncResult> {
    let run_id = Uuid::new_v4().to_string();
    let started_at = Utc::now().to_rfc3339();
    let outcome = import_pdf_path(&state.db, Path::new(path.trim())).await;

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
                tracing::warn!(error = ?record_error, "Put/Call-Importfehler konnte nicht protokolliert werden");
            }
            Err(CommandError::from(error))
        }
    }
}

#[tauri::command]
pub async fn import_put_call_xlsx(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> CommandResult<PutCallBatchImportResult> {
    let run_id = Uuid::new_v4().to_string();
    let started_at = Utc::now().to_rfc3339();
    let paths = paths
        .into_iter()
        .map(|path| PathBuf::from(path.trim()))
        .collect::<Vec<_>>();
    let outcome = import_xlsx_paths(&state.db, &paths).await;

    match outcome {
        Ok(result) => {
            record_sync_run(
                &state.db,
                &run_id,
                &started_at,
                "success",
                result.selected_files,
                result.stored_observations,
                Some(&format!(
                    "{} CME-XLSX-Dateien mit {} Handelstagen verarbeitet; {} Beobachtungen gespeichert, {} wegen höherer Quellenpriorität übersprungen.",
                    result.selected_files,
                    result.valid_trading_days,
                    result.stored_observations,
                    result.skipped_lower_priority
                )),
            )
            .await
            .map_err(CommandError::from)?;
            Ok(result)
        }
        Err(error) => {
            let message = error.to_string();
            if let Err(record_error) = record_sync_run(
                &state.db,
                &run_id,
                &started_at,
                "failed",
                paths.len(),
                0,
                Some(&message),
            )
            .await
            {
                tracing::warn!(error = ?record_error, "Put/Call-XLSX-Importfehler konnte nicht protokolliert werden");
            }
            Err(CommandError::from(error))
        }
    }
}

async fn import_pdf_path(db: &SqlitePool, path: &Path) -> Result<(String, usize), AppError> {
    let bytes = read_local_pdf(path)?;
    let text = pdf_extract::extract_text_from_mem(&bytes).map_err(|error| {
        AppError::DataTransfer(format!(
            "CME-PDF konnte nicht ausgewertet werden: {}",
            error.to_string().chars().take(220).collect::<String>()
        ))
    })?;
    let report = parse_report_text(&text)?;
    let source_file = path.file_name().and_then(|value| value.to_str());
    let stored_assets = store_observations_with_source_file(
        db,
        &report.trade_date,
        &report.observations,
        source_file,
    )
    .await?;
    Ok((report.trade_date, stored_assets))
}

async fn import_xlsx_paths(
    db: &SqlitePool,
    paths: &[PathBuf],
) -> Result<PutCallBatchImportResult, AppError> {
    if paths.is_empty() {
        return Err(AppError::Validation(
            "Bitte mindestens eine CME-XLSX-Datei auswählen.".into(),
        ));
    }

    let mut reports = Vec::with_capacity(paths.len());
    let mut dates = BTreeSet::new();
    for path in paths {
        let report = parse_daily_volume_workbook(path)?;
        if !dates.insert(report.trade_date.clone()) {
            return Err(AppError::Validation(format!(
                "Der CME-Handelstag {} wurde mehrfach ausgewählt.",
                report.trade_date
            )));
        }
        reports.push((path, report));
    }

    let collected_at = Utc::now().to_rfc3339();
    let mut transaction = db.begin().await?;
    let mut stored_observations = 0_usize;
    let mut skipped_lower_priority = 0_usize;
    for (path, report) in &reports {
        let source_file = path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| AppError::Validation("CME-XLSX-Dateiname ist ungültig.".into()))?;
        for observation in &report.observations {
            let product_codes_json = serde_json::to_string(&observation.product_codes)
                .map_err(|error| AppError::DataTransfer(error.to_string()))?;
            let outcome = sqlx::query(
                "INSERT INTO put_call_observations (
                    asset_symbol, source_symbol, trade_date, call_notional_usd,
                    put_notional_usd, source_orientation, source_url, collected_at,
                    call_value, put_value, value_unit, calculation_method,
                    source_priority, source_file, is_preliminary, direct_import,
                    product_codes_json, parser_version
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(asset_symbol, trade_date) DO UPDATE SET
                    source_symbol = excluded.source_symbol,
                    call_notional_usd = excluded.call_notional_usd,
                    put_notional_usd = excluded.put_notional_usd,
                    source_orientation = excluded.source_orientation,
                    source_url = excluded.source_url,
                    collected_at = excluded.collected_at,
                    call_value = excluded.call_value,
                    put_value = excluded.put_value,
                    value_unit = excluded.value_unit,
                    calculation_method = excluded.calculation_method,
                    source_priority = excluded.source_priority,
                    source_file = excluded.source_file,
                    is_preliminary = excluded.is_preliminary,
                    direct_import = excluded.direct_import,
                    product_codes_json = excluded.product_codes_json,
                    parser_version = excluded.parser_version
                 WHERE excluded.source_priority >= put_call_observations.source_priority",
            )
            .bind(&observation.asset_symbol)
            .bind(&observation.source_symbol)
            .bind(&report.trade_date)
            .bind(observation.call_value)
            .bind(observation.put_value)
            .bind(observation.orientation.as_str())
            .bind(DAILY_VOLUME_ARCHIVE_URL)
            .bind(&collected_at)
            .bind(observation.call_value)
            .bind(observation.put_value)
            .bind("contracts")
            .bind("contract_volume_pcr")
            .bind(10_i64)
            .bind(source_file)
            .bind(1_i64)
            .bind(0_i64)
            .bind(product_codes_json)
            .bind("xlsx-contract-volume-v1")
            .execute(&mut *transaction)
            .await?;
            if outcome.rows_affected() == 1 {
                stored_observations += 1;
            } else {
                skipped_lower_priority += 1;
            }
        }
    }
    transaction.commit().await?;

    Ok(PutCallBatchImportResult {
        selected_files: paths.len(),
        valid_trading_days: dates.len(),
        stored_observations,
        skipped_lower_priority,
        earliest_trade_date: dates.first().cloned(),
        latest_trade_date: dates.last().cloned(),
        imported_at: collected_at,
    })
}

async fn store_observations(
    db: &SqlitePool,
    trade_date: &str,
    observations: &[ProviderObservation],
) -> Result<usize, AppError> {
    store_observations_with_source_file(db, trade_date, observations, Some("fx-put-call.pdf")).await
}

async fn store_observations_with_source_file(
    db: &SqlitePool,
    trade_date: &str,
    observations: &[ProviderObservation],
    source_file: Option<&str>,
) -> Result<usize, AppError> {
    NaiveDate::parse_from_str(trade_date, "%Y-%m-%d")
        .map_err(|_| AppError::Validation("Ungültiges CME-Berichtsdatum.".into()))?;
    let collected_at = Utc::now().to_rfc3339();
    let mut transaction = db.begin().await?;
    for observation in observations {
        sqlx::query(
            "INSERT INTO put_call_observations (
                asset_symbol, source_symbol, trade_date, call_notional_usd,
                put_notional_usd, source_orientation, source_url, collected_at,
                call_value, put_value, value_unit, calculation_method,
                source_priority, source_file, is_preliminary, direct_import,
                product_codes_json, parser_version
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(asset_symbol, trade_date) DO UPDATE SET
                source_symbol = excluded.source_symbol,
                call_notional_usd = excluded.call_notional_usd,
                put_notional_usd = excluded.put_notional_usd,
                source_orientation = excluded.source_orientation,
                source_url = excluded.source_url,
                collected_at = excluded.collected_at,
                call_value = excluded.call_value,
                put_value = excluded.put_value,
                value_unit = excluded.value_unit,
                calculation_method = excluded.calculation_method,
                source_priority = excluded.source_priority,
                source_file = excluded.source_file,
                is_preliminary = excluded.is_preliminary,
                direct_import = excluded.direct_import,
                product_codes_json = excluded.product_codes_json,
                parser_version = excluded.parser_version",
        )
        .bind(&observation.asset_symbol)
        .bind(&observation.source_symbol)
        .bind(trade_date)
        .bind(observation.call_notional_usd)
        .bind(observation.put_notional_usd)
        .bind(observation.orientation.as_str())
        .bind(SOURCE_URL)
        .bind(&collected_at)
        .bind(observation.call_notional_usd)
        .bind(observation.put_notional_usd)
        .bind("usd_notional")
        .bind("official_notional_pdf")
        .bind(30_i64)
        .bind(source_file)
        .bind(0_i64)
        .bind(1_i64)
        .bind("[]")
        .bind("pdf-v1")
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

    let rows = sqlx::query_as::<_, (String, i64, i64, String, String, Option<String>, i64)>(
        "SELECT trade_date, call_value, put_value, value_unit,
                calculation_method, source_file, is_preliminary
         FROM (
            SELECT trade_date, call_value, put_value, value_unit,
                   calculation_method, source_file, is_preliminary
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
        .filter_map(
            |(trade_date, call, put, unit, method, source_file, preliminary)| {
                daily_ratio(call, put, definition.orientation).map(|ratio| {
                    (
                        trade_date,
                        call,
                        put,
                        ratio,
                        unit,
                        method,
                        source_file,
                        preliminary != 0,
                    )
                })
            },
        )
        .collect::<Vec<_>>();
    let raw_ratios = valid_rows
        .iter()
        .map(|(_, _, _, ratio, _, _, _, _)| *ratio)
        .collect::<Vec<_>>();
    let averages = ma5(&raw_ratios);
    let calibrated = thresholds(&averages);
    let calibration_sample_size = averages.len().min(EXTREME_CALIBRATION_WINDOW);
    let threshold_view = calibrated.map(|(bullish, bearish)| PutCallThresholds {
        bullish,
        bearish,
        sample_size: calibration_sample_size,
    });
    let all_points = valid_rows
        .iter()
        .enumerate()
        .map(|(index, row)| {
            let (trade_date, call, put, raw_ratio, unit, method, source_file, preliminary) = row;
            PutCallPoint {
                trade_date: trade_date.clone(),
                raw_ratio: *raw_ratio,
                ma5: index
                    .checked_sub(4)
                    .map(|average_index| averages[average_index]),
                call_value: *call,
                put_value: *put,
                value_unit: unit.clone(),
                calculation_method: method.clone(),
                method_label: calculation_method_label(method).into(),
                source_file: source_file.clone(),
                is_preliminary: *preliminary,
            }
        })
        .collect::<Vec<_>>();
    let points = all_points
        .into_iter()
        .skip(valid_rows.len().saturating_sub(90))
        .collect::<Vec<_>>();
    let latest_raw_ratio = raw_ratios.last().copied();
    let latest_value = averages.last().copied();
    let sentiment = classify(latest_value, calibrated);
    let last_trade_date = valid_rows
        .last()
        .map(|(date, _, _, _, _, _, _, _)| date.clone());

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
        latest_raw_ratio,
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
    use std::fmt::Write as _;
    use std::fs;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::path::Path;
    use zip::{ZipWriter, write::SimpleFileOptions};

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

    fn xml_escape(value: &str) -> String {
        value
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&apos;")
    }

    fn excel_column(mut index: usize) -> String {
        let mut output = String::new();
        loop {
            output.insert(0, (b'A' + (index % 26) as u8) as char);
            if index < 26 {
                break;
            }
            index = index / 26 - 1;
        }
        output
    }

    fn write_xlsx_fixture(path: &Path, sheet_name: &str, rows: &[Vec<&str>]) {
        let file = fs::File::create(path).unwrap();
        let mut archive = ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        let parts = [
            (
                "[Content_Types].xml",
                r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>"#
                    .to_string(),
            ),
            (
                "_rels/.rels",
                r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"#
                    .to_string(),
            ),
            (
                "xl/workbook.xml",
                format!(
                    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="{}" sheetId="1" r:id="rId1"/></sheets>
</workbook>"#,
                    xml_escape(sheet_name)
                ),
            ),
            (
                "xl/_rels/workbook.xml.rels",
                r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>"#
                    .to_string(),
            ),
        ];
        for (name, contents) in parts {
            archive.start_file(name, options).unwrap();
            archive.write_all(contents.as_bytes()).unwrap();
        }

        let mut sheet = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>"#,
        );
        for (row_index, row) in rows.iter().enumerate() {
            write!(&mut sheet, "<row r=\"{}\">", row_index + 1).unwrap();
            for (column_index, value) in row.iter().enumerate() {
                let reference = format!("{}{}", excel_column(column_index), row_index + 1);
                if value.parse::<i64>().is_ok() {
                    write!(
                        &mut sheet,
                        "<c r=\"{reference}\"><v>{}</v></c>",
                        xml_escape(value)
                    )
                    .unwrap();
                } else {
                    write!(
                        &mut sheet,
                        "<c r=\"{reference}\" t=\"inlineStr\"><is><t>{}</t></is></c>",
                        xml_escape(value)
                    )
                    .unwrap();
                }
            }
            sheet.push_str("</row>");
        }
        sheet.push_str("</sheetData></worksheet>");
        archive
            .start_file("xl/worksheets/sheet1.xml", options)
            .unwrap();
        archive.write_all(sheet.as_bytes()).unwrap();
        archive.finish().unwrap();
    }

    #[test]
    fn parses_reordered_daily_volume_headers_and_excludes_crosses_and_futures() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("daily_volume_20260811.xlsx");
        write_xlsx_fixture(
            &path,
            "CME Group Vol and OI by Product",
            &[
                vec![
                    "Product Description",
                    "Total Volume",
                    "Future/Option Indicator",
                    "Description",
                    "Exchange Name",
                    "Commodity Indicator",
                    "Product Code",
                ],
                vec!["EURUSD WEEK4 CALL", "10", "O", "FX", "CME", "EU", "EU-W4-C"],
                vec!["EURUSD WEEK4 PUT", "25", "O", "FX", "CME", "EU", "EU-W4-P"],
                vec!["JPYUSD WED CALL", "40", "O", "FX", "CME", "JY", "JY-W-C"],
                vec!["JPYUSD WED PUT", "20", "O", "FX", "CME", "JY", "JY-W-P"],
                vec!["EURJPY CALL", "999", "O", "FX", "CME", "RY", "RY-C"],
                vec!["EURUSD FUTURE", "999", "F", "FX", "CME", "6E", "6E"],
                vec!["GBPUSD CALL", "12", "O", "FX", "CME", "BP", "BP-C"],
            ],
        );

        let report = parse_daily_volume_workbook(&path).unwrap();

        assert_eq!(report.trade_date, "2026-08-11");
        assert_eq!(report.observations.len(), 2);
        let euro = report
            .observations
            .iter()
            .find(|item| item.asset_symbol == "EURUSD")
            .unwrap();
        assert_eq!((euro.call_value, euro.put_value), (10, 25));
        assert_eq!(euro.product_codes, vec!["EU-W4-C", "EU-W4-P"]);
        let yen = report
            .observations
            .iter()
            .find(|item| item.asset_symbol == "USDJPY")
            .unwrap();
        assert_eq!((yen.call_value, yen.put_value), (40, 20));
    }

    #[test]
    fn rejects_daily_volume_workbooks_without_required_schema_or_trade_date() {
        let directory = tempfile::tempdir().unwrap();
        let missing_header = directory.path().join("daily_volume_20260811.xlsx");
        write_xlsx_fixture(
            &missing_header,
            "CME Group Vol and OI by Product",
            &[
                vec![
                    "Product Description",
                    "Future/Option Indicator",
                    "Description",
                ],
                vec!["EURUSD CALL", "O", "FX"],
            ],
        );
        assert!(matches!(
            parse_daily_volume_workbook(&missing_header),
            Err(AppError::DataTransfer(_))
        ));

        let invalid_name = directory.path().join("daily_volume_latest.xlsx");
        write_xlsx_fixture(
            &invalid_name,
            "CME Group Vol and OI by Product",
            &[
                vec![
                    "Product Description",
                    "Total Volume",
                    "Future/Option Indicator",
                    "Description",
                ],
                vec!["EURUSD CALL", "10", "O", "FX"],
                vec!["EURUSD PUT", "20", "O", "FX"],
            ],
        );
        assert!(matches!(
            parse_daily_volume_workbook(&invalid_name),
            Err(AppError::Validation(_))
        ));
    }

    #[tokio::test]
    async fn xlsx_contract_volume_cannot_replace_higher_priority_pdf_notional() {
        let state = initialize_headless().await.unwrap();
        store_observations(
            &state.db,
            "2026-08-11",
            &[ProviderObservation {
                asset_symbol: "EURUSD".into(),
                source_symbol: "Euro FX".into(),
                call_notional_usd: 1_000,
                put_notional_usd: 2_500,
                orientation: SourceOrientation::Direct,
            }],
        )
        .await
        .unwrap();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("daily_volume_20260811.xlsx");
        write_xlsx_fixture(
            &path,
            "CME Group Vol and OI by Product",
            &[
                vec![
                    "Description",
                    "Product Description",
                    "Future/Option Indicator",
                    "Total Volume",
                    "Product Code",
                ],
                vec!["FX", "EURUSD CALL", "O", "10", "EU-C"],
                vec!["FX", "EURUSD PUT", "O", "25", "EU-P"],
            ],
        );

        let result = import_xlsx_paths(&state.db, &[path]).await.unwrap();
        let persisted = sqlx::query_as::<_, (i64, i64, String, i64)>(
            "SELECT call_value, put_value, calculation_method, source_priority
             FROM put_call_observations
             WHERE asset_symbol = 'EURUSD' AND trade_date = '2026-08-11'",
        )
        .fetch_one(&state.db)
        .await
        .unwrap();

        assert_eq!(
            persisted,
            (1_000, 2_500, "official_notional_pdf".into(), 30)
        );
        assert_eq!(result.stored_observations, 0);
        assert_eq!(result.skipped_lower_priority, 1);
    }

    #[tokio::test]
    async fn malformed_xlsx_batch_does_not_partially_store_valid_files() {
        let state = initialize_headless().await.unwrap();
        let directory = tempfile::tempdir().unwrap();
        let valid = directory.path().join("daily_volume_20260811.xlsx");
        write_xlsx_fixture(
            &valid,
            "CME Group Vol and OI by Product",
            &[
                vec![
                    "Description",
                    "Product Description",
                    "Future/Option Indicator",
                    "Total Volume",
                ],
                vec!["FX", "EURUSD CALL", "O", "10"],
                vec!["FX", "EURUSD PUT", "O", "25"],
            ],
        );
        let malformed = directory.path().join("daily_volume_20260810.xlsx");
        fs::write(&malformed, b"not an xlsx workbook").unwrap();

        let result = import_xlsx_paths(&state.db, &[valid, malformed]).await;
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM put_call_observations")
            .fetch_one(&state.db)
            .await
            .unwrap();

        assert!(result.is_err());
        assert_eq!(count, 0);
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
    fn thresholds_require_20_values_and_interpolate_p20_p80() {
        assert!(thresholds(&[1.0; 19]).is_none());
        let observations = (1..=20).map(f64::from).collect::<Vec<_>>();
        let (high_call, high_put) = thresholds(&observations).unwrap();
        assert!((high_call - 4.8).abs() < 1e-12);
        assert!((high_put - 16.2).abs() < 1e-12);
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
        assert_eq!(dashboard.points.len(), 5);
        assert_eq!(dashboard.points[4].trade_date, "2026-08-08");
        assert_eq!(dashboard.points[4].raw_ratio, 5.0);
        assert_eq!(dashboard.points[4].ma5, Some(3.0));
        assert!(
            dashboard.points[..4]
                .iter()
                .all(|point| point.ma5.is_none())
        );
        assert_eq!(dashboard.calibration_sample_size, 1);
        assert!(dashboard.thresholds.is_none());
        assert_eq!(dashboard.sentiment, Sentiment::Unavailable);
    }

    #[tokio::test]
    async fn dashboard_exposes_one_raw_day_before_ma5_exists() {
        let state = initialize_headless().await.unwrap();
        store_observations(
            &state.db,
            "2026-08-08",
            &[ProviderObservation {
                asset_symbol: "EURUSD".into(),
                source_symbol: "Euro FX".into(),
                call_notional_usd: 100,
                put_notional_usd: 250,
                orientation: SourceOrientation::Direct,
            }],
        )
        .await
        .unwrap();

        let dashboard = load_dashboard(&state.db, "EURUSD").await.unwrap();

        assert_eq!(dashboard.points.len(), 1);
        assert_eq!(dashboard.points[0].trade_date, "2026-08-08");
        assert_eq!(dashboard.points[0].raw_ratio, 2.5);
        assert_eq!(dashboard.points[0].ma5, None);
        assert_eq!(dashboard.latest_raw_ratio, Some(2.5));
        assert_eq!(dashboard.latest_value, None);
    }

    #[tokio::test]
    async fn legacy_pdf_observations_receive_explicit_notional_provenance() {
        let state = initialize_headless().await.unwrap();
        store_observations(
            &state.db,
            "2026-08-08",
            &[ProviderObservation {
                asset_symbol: "EURUSD".into(),
                source_symbol: "Euro FX".into(),
                call_notional_usd: 100,
                put_notional_usd: 250,
                orientation: SourceOrientation::Direct,
            }],
        )
        .await
        .unwrap();

        let provenance = sqlx::query_as::<_, (i64, i64, String, String, i64, i64, String)>(
            "SELECT call_value, put_value, value_unit, calculation_method,
                    source_priority, direct_import, parser_version
             FROM put_call_observations
             WHERE asset_symbol = 'EURUSD' AND trade_date = '2026-08-08'",
        )
        .fetch_one(&state.db)
        .await
        .unwrap();

        assert_eq!(
            provenance,
            (
                100,
                250,
                "usd_notional".into(),
                "official_notional_pdf".into(),
                30,
                1,
                "pdf-v1".into(),
            )
        );
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

    fn minimal_text_pdf(text: &str) -> Vec<u8> {
        let escaped_lines = text.lines().map(|line| {
            line.replace('\\', "\\\\")
                .replace('(', "\\(")
                .replace(')', "\\)")
        });
        let mut content = String::from("BT\n/F1 8 Tf\n20 800 Td\n10 TL\n");
        for line in escaped_lines {
            writeln!(&mut content, "({line}) Tj T*").unwrap();
        }
        content.push_str("ET\n");

        let objects = [
            "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>".to_string(),
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
            format!("<< /Length {} >>\nstream\n{}endstream", content.len(), content),
        ];
        let mut pdf = b"%PDF-1.4\n".to_vec();
        let mut offsets = Vec::new();
        for (index, object) in objects.iter().enumerate() {
            offsets.push(pdf.len());
            pdf.extend_from_slice(format!("{} 0 obj\n{}\nendobj\n", index + 1, object).as_bytes());
        }
        let xref_offset = pdf.len();
        pdf.extend_from_slice(format!("xref\n0 {}\n", objects.len() + 1).as_bytes());
        pdf.extend_from_slice(b"0000000000 65535 f \n");
        for offset in offsets {
            pdf.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
        }
        pdf.extend_from_slice(
            format!(
                "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n",
                objects.len() + 1
            )
            .as_bytes(),
        );
        pdf
    }

    #[tokio::test]
    async fn imports_a_local_cme_pdf_and_stores_all_supported_assets() {
        let state = initialize_headless().await.unwrap();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("fx-put-call-copy.pdf");
        fs::write(&path, minimal_text_pdf(COMPLETE_CME_REPORT)).unwrap();

        let (trade_date, stored_assets) =
            import_pdf_path(&state.db, Path::new(&path)).await.unwrap();

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM put_call_observations")
            .fetch_one(&state.db)
            .await
            .unwrap();
        let source_file: Option<String> = sqlx::query_scalar(
            "SELECT source_file FROM put_call_observations
             WHERE asset_symbol = 'EURUSD' AND trade_date = '2026-08-10'",
        )
        .fetch_one(&state.db)
        .await
        .unwrap();
        assert_eq!(trade_date, "2026-08-10");
        assert_eq!(stored_assets, 7);
        assert_eq!(count, 7);
        assert_eq!(source_file.as_deref(), Some("fx-put-call-copy.pdf"));
    }

    #[test]
    fn rejects_a_local_report_without_a_pdf_extension() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("fx-put-call.txt");
        fs::write(&path, minimal_text_pdf(COMPLETE_CME_REPORT)).unwrap();

        let result = read_local_pdf(&path);

        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[tokio::test]
    async fn invalid_local_pdf_preserves_existing_observations() {
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
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("invalid.pdf");
        fs::write(&path, b"%PDF-invalid").unwrap();

        let result = import_pdf_path(&state.db, &path).await;

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM put_call_observations")
            .fetch_one(&state.db)
            .await
            .unwrap();
        assert!(matches!(result, Err(AppError::DataTransfer(_))));
        assert_eq!(count, 1);
    }

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
