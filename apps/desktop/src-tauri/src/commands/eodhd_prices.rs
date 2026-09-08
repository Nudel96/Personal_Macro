//! EODHD market-price client and the canonical Seasonality asset catalogue.
//!
//! EODHD returns provider-native trading dates. We intentionally persist those
//! dates without timezone conversion and use adjusted close when it is present.

use std::{
    collections::{BTreeMap, HashMap},
    path::{Path, PathBuf},
};

use chrono::NaiveDate;
use reqwest::{Client, Url};
use serde::Deserialize;

use crate::errors::CommandError;

const EOD_URL: &str = "https://eodhd.com/api/eod";
const INTRADAY_URL: &str = "https://eodhd.com/api/intraday";
const SYMBOLS_URL: &str = "https://eodhd.com/api/exchange-symbol-list";
const COMMODITIES_URL: &str = "https://eodhd.com/api/commodities/historical";
const COMMODITY_PAGE_SIZE: usize = 1_000;

#[derive(Debug, Clone)]
pub struct LegacyInstrument {
    pub provider_symbol: String,
    pub category: String,
    pub description: Option<String>,
    pub base_currency: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EodhdInstrument {
    pub provider_symbol: String,
    pub display_symbol: String,
    pub category: String,
    pub description: Option<String>,
    pub base_currency: Option<String>,
    pub quote_currency: Option<String>,
    pub data_kind: String,
    pub source_code: String,
    pub sync_priority: i64,
    pub native_timezone: String,
}

#[derive(Debug, Clone)]
pub struct PriceBar {
    pub time: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct ExchangeSymbol {
    #[serde(rename = "Code")]
    code: String,
    #[serde(rename = "Name")]
    name: String,
}

#[derive(Debug, Deserialize)]
struct EodRow {
    date: String,
    open: Option<f64>,
    high: Option<f64>,
    low: Option<f64>,
    close: Option<f64>,
    adjusted_close: Option<f64>,
    volume: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct IntradayRow {
    timestamp: i64,
    open: Option<f64>,
    high: Option<f64>,
    low: Option<f64>,
    close: Option<f64>,
    volume: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct CommodityPayload {
    meta: CommodityMeta,
    #[serde(default)]
    data: Vec<CommodityRow>,
}

#[derive(Debug, Deserialize)]
struct CommodityMeta {
    total: usize,
}

#[derive(Debug, Deserialize)]
struct CommodityRow {
    date: String,
    value: f64,
}

#[derive(Debug)]
struct Availability {
    forex: HashMap<String, String>,
    indices: HashMap<String, String>,
    crypto: HashMap<String, String>,
}

pub fn http_client() -> Result<Client, CommandError> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .user_agent("PersonalMacro/1 eodhd-seasonality")
        .build()
        .map_err(|_| {
            provider_error("Der EODHD-Seasonality-Client konnte nicht vorbereitet werden.")
        })
}

pub fn api_key() -> Option<String> {
    if let Ok(value) = std::env::var("EODHD_API_KEY")
        && let Some(value) = non_empty_value(value)
    {
        return Some(value);
    }

    for candidate in env_file_candidates() {
        if let Some(value) = api_key_from_file(&candidate) {
            return Some(value);
        }
    }
    None
}

fn non_empty_value(value: String) -> Option<String> {
    let value = value.trim().to_owned();
    (!value.is_empty()).then_some(value)
}

fn api_key_from_file(path: &Path) -> Option<String> {
    dotenvy::from_path_iter(path)
        .ok()?
        .filter_map(Result::ok)
        .find_map(|(key, value)| {
            (key == "EODHD_API_KEY")
                .then(|| non_empty_value(value))
                .flatten()
        })
}

fn env_file_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(current_dir) = std::env::current_dir() {
        push_env_files_for_ancestors(&mut candidates, &current_dir);
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    push_env_files_for_ancestors(&mut candidates, &manifest_dir);

    if let Ok(executable) = std::env::current_exe()
        && let Some(executable_dir) = executable.parent()
    {
        push_env_files_for_ancestors(&mut candidates, executable_dir);
    }

    if let Some(app_data) = std::env::var_os("APPDATA") {
        push_unique(
            &mut candidates,
            PathBuf::from(app_data)
                .join("com.personal-macro.app")
                .join("PersonalMacro")
                .join("settings")
                .join(".env.local"),
        );
    }

    candidates
}

fn push_env_files_for_ancestors(candidates: &mut Vec<PathBuf>, start: &Path) {
    for directory in start.ancestors() {
        push_unique(candidates, directory.join(".env.local"));
    }
}

fn push_unique(candidates: &mut Vec<PathBuf>, candidate: PathBuf) {
    if !candidates.iter().any(|existing| existing == &candidate) {
        candidates.push(candidate);
    }
}

pub async fn catalog(
    client: &Client,
    api_key: &str,
    legacy: &[LegacyInstrument],
) -> Result<Vec<EodhdInstrument>, CommandError> {
    let availability = Availability {
        forex: fetch_exchange_symbols(client, api_key, "FOREX").await?,
        indices: fetch_exchange_symbols(client, api_key, "INDX").await?,
        crypto: fetch_exchange_symbols(client, api_key, "CC").await?,
    };
    Ok(build_catalog(legacy, &availability))
}

pub async fn history(
    client: &Client,
    api_key: &str,
    instrument: &EodhdInstrument,
) -> Result<Vec<PriceBar>, CommandError> {
    match instrument.data_kind.as_str() {
        "commodity" => commodity_history(client, api_key, &instrument.source_code).await,
        _ => eod_history(client, api_key, &instrument.source_code).await,
    }
}

pub async fn intraday_hourly_history(
    client: &Client,
    api_key: &str,
    source_code: &str,
    from: i64,
    to: i64,
) -> Result<Vec<PriceBar>, CommandError> {
    if source_code.trim().is_empty() || from <= 0 || to < from {
        return Err(provider_error(
            "Die EODHD-Intraday-Anfrage enthält ungültige Parameter.",
        ));
    }
    let mut url = Url::parse(&format!("{INTRADAY_URL}/{}", source_code.trim())).map_err(|_| {
        provider_error("Die EODHD-Intraday-Anfrage konnte nicht vorbereitet werden.")
    })?;
    url.query_pairs_mut()
        .append_pair("api_token", api_key)
        .append_pair("fmt", "json")
        .append_pair("interval", "1h")
        .append_pair("from", &from.to_string())
        .append_pair("to", &to.to_string());
    let response = client.get(url).send().await.map_err(|_| {
        provider_error("Die EODHD-Intraday-Historie ist momentan nicht erreichbar.")
    })?;
    if !response.status().is_success() {
        return Err(http_error(
            "EODHD-Intraday-Historie",
            response.status().as_u16(),
        ));
    }
    let rows: Vec<IntradayRow> = response
        .json()
        .await
        .map_err(|_| provider_error("EODHD hat eine ungültige Intraday-Historie geliefert."))?;
    let mut bars = rows
        .into_iter()
        .filter_map(intraday_row_to_bar)
        .collect::<Vec<_>>();
    bars.sort_by_key(|bar| bar.time);
    bars.dedup_by_key(|bar| bar.time);
    if bars.is_empty() {
        return Err(provider_error(
            "EODHD liefert für dieses Forexpaar keine nutzbare 1H-Historie.",
        ));
    }
    Ok(bars)
}

async fn fetch_exchange_symbols(
    client: &Client,
    api_key: &str,
    exchange: &str,
) -> Result<HashMap<String, String>, CommandError> {
    let mut url = Url::parse(&format!("{SYMBOLS_URL}/{exchange}"))
        .map_err(|_| provider_error("Der EODHD-Symbolkatalog konnte nicht vorbereitet werden."))?;
    url.query_pairs_mut()
        .append_pair("api_token", api_key)
        .append_pair("fmt", "json");
    let response =
        client.get(url).send().await.map_err(|_| {
            provider_error("Der EODHD-Symbolkatalog ist momentan nicht erreichbar.")
        })?;
    if !response.status().is_success() {
        return Err(http_error(
            "EODHD-Symbolkatalog",
            response.status().as_u16(),
        ));
    }
    let rows: Vec<ExchangeSymbol> = response
        .json()
        .await
        .map_err(|_| provider_error("EODHD hat einen ungültigen Symbolkatalog geliefert."))?;
    Ok(rows
        .into_iter()
        .map(|row| (row.code.to_ascii_uppercase(), row.name))
        .collect())
}

async fn eod_history(
    client: &Client,
    api_key: &str,
    source_code: &str,
) -> Result<Vec<PriceBar>, CommandError> {
    let mut url = Url::parse(&format!("{EOD_URL}/{source_code}")).map_err(|_| {
        provider_error("Die EODHD-Historienanfrage konnte nicht vorbereitet werden.")
    })?;
    url.query_pairs_mut()
        .append_pair("api_token", api_key)
        .append_pair("fmt", "json")
        .append_pair("period", "d")
        .append_pair("order", "a");
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|_| provider_error("Die EODHD-Kurshistorie ist momentan nicht erreichbar."))?;
    if !response.status().is_success() {
        return Err(http_error("EODHD-Kurshistorie", response.status().as_u16()));
    }
    let rows: Vec<EodRow> = response
        .json()
        .await
        .map_err(|_| provider_error("EODHD hat eine ungültige Kurshistorie geliefert."))?;
    let bars = rows
        .into_iter()
        .filter_map(eod_row_to_bar)
        .collect::<Vec<_>>();
    if bars.is_empty() {
        return Err(provider_error(
            "EODHD liefert für dieses Asset keine nutzbare tägliche Kurshistorie.",
        ));
    }
    Ok(bars)
}

async fn commodity_history(
    client: &Client,
    api_key: &str,
    source_code: &str,
) -> Result<Vec<PriceBar>, CommandError> {
    let mut offset = 0_usize;
    let mut bars = Vec::new();
    loop {
        let mut url = Url::parse(&format!("{COMMODITIES_URL}/{source_code}")).map_err(|_| {
            provider_error("Die EODHD-Rohstoffanfrage konnte nicht vorbereitet werden.")
        })?;
        url.query_pairs_mut()
            .append_pair("api_token", api_key)
            .append_pair("fmt", "json")
            .append_pair("interval", "daily")
            .append_pair("page[offset]", &offset.to_string())
            .append_pair("page[limit]", &COMMODITY_PAGE_SIZE.to_string());
        let response = client.get(url).send().await.map_err(|_| {
            provider_error("Die EODHD-Rohstoffhistorie ist momentan nicht erreichbar.")
        })?;
        if !response.status().is_success() {
            return Err(http_error(
                "EODHD-Rohstoffhistorie",
                response.status().as_u16(),
            ));
        }
        let payload: CommodityPayload = response
            .json()
            .await
            .map_err(|_| provider_error("EODHD hat eine ungültige Rohstoffhistorie geliefert."))?;
        let received = payload.data.len();
        bars.extend(payload.data.into_iter().filter_map(commodity_row_to_bar));
        offset = offset.saturating_add(received);
        if received == 0 || offset >= payload.meta.total {
            break;
        }
    }
    bars.sort_by_key(|bar| bar.time);
    bars.dedup_by_key(|bar| bar.time);
    if bars.is_empty() {
        return Err(provider_error(
            "EODHD liefert für diesen Rohstoff keine nutzbare tägliche Historie.",
        ));
    }
    Ok(bars)
}

fn eod_row_to_bar(row: EodRow) -> Option<PriceBar> {
    let date = NaiveDate::parse_from_str(row.date.trim(), "%Y-%m-%d").ok()?;
    let raw_close = row.close.and_then(valid_price)?;
    let close = row
        .adjusted_close
        .and_then(valid_price)
        .unwrap_or(raw_close);
    Some(PriceBar {
        time: date.and_hms_opt(0, 0, 0)?.and_utc().timestamp_millis(),
        open: row.open.and_then(valid_price).unwrap_or(close),
        high: row.high.and_then(valid_price).unwrap_or(close),
        low: row.low.and_then(valid_price).unwrap_or(close),
        close,
        volume: row
            .volume
            .filter(|value| value.is_finite() && *value >= 0.0)
            .map(|value| value.round().clamp(0.0, i64::MAX as f64) as i64),
    })
}

fn intraday_row_to_bar(row: IntradayRow) -> Option<PriceBar> {
    let open = row.open.and_then(valid_price)?;
    let high = row.high.and_then(valid_price)?;
    let low = row.low.and_then(valid_price)?;
    let close = row.close.and_then(valid_price)?;
    if row.timestamp <= 0 || high < open.max(close).max(low) || low > open.min(close).min(high) {
        return None;
    }
    Some(PriceBar {
        time: row.timestamp.checked_mul(1_000)?,
        open,
        high,
        low,
        close,
        volume: row
            .volume
            .filter(|value| value.is_finite() && *value >= 0.0)
            .map(|value| value.round().clamp(0.0, i64::MAX as f64) as i64),
    })
}

fn commodity_row_to_bar(row: CommodityRow) -> Option<PriceBar> {
    let value = valid_price(row.value)?;
    let date = NaiveDate::parse_from_str(row.date.trim(), "%Y-%m-%d").ok()?;
    Some(PriceBar {
        time: date.and_hms_opt(0, 0, 0)?.and_utc().timestamp_millis(),
        open: value,
        high: value,
        low: value,
        close: value,
        volume: None,
    })
}

fn valid_price(value: f64) -> Option<f64> {
    (value.is_finite() && value > 0.0).then_some(value)
}

fn build_catalog(legacy: &[LegacyInstrument], availability: &Availability) -> Vec<EodhdInstrument> {
    let mut instruments = BTreeMap::new();
    for candidate in default_candidates(availability) {
        instruments.insert(candidate.provider_symbol.clone(), candidate);
    }
    for item in legacy {
        if let Some(candidate) = legacy_candidate(item, availability) {
            instruments
                .entry(candidate.provider_symbol.clone())
                .or_insert(candidate);
        }
    }
    let mut output = instruments.into_values().collect::<Vec<_>>();
    output.sort_by(|left, right| {
        left.sync_priority
            .cmp(&right.sync_priority)
            .then(left.category.cmp(&right.category))
            .then(left.display_symbol.cmp(&right.display_symbol))
    });
    output
}

fn default_candidates(availability: &Availability) -> Vec<EodhdInstrument> {
    const CORE_FOREX: &[&str] = &[
        "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "USDCNY", "EURGBP",
        "EURJPY", "EURCHF", "EURAUD", "EURCAD", "EURNZD", "GBPJPY", "GBPCHF", "GBPAUD", "GBPCAD",
        "GBPNZD", "AUDJPY", "AUDNZD", "AUDCAD", "AUDCHF", "CADJPY", "CADCHF", "NZDJPY", "NZDCHF",
        "NZDCAD", "CHFJPY",
    ];
    const METALS: &[&str] = &["XAUUSD", "XAGUSD", "XPTUSD", "XPDUSD"];
    const INDICES: &[&str] = &[
        "GSPC", "NDX", "DJI", "GDAXI", "STOXX50E", "FCHI", "N225", "HSI", "AXJO", "SSMI", "SSEC",
        "IBEX", "AEX", "WIG20", "DXY",
    ];
    const CRYPTO: &[&str] = &[
        "BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "ADA-USD", "BCH-USD", "LTC-USD", "LINK-USD",
        "AAVE-USD", "DASH-USD", "BAT-USD",
    ];
    const ENERGY: &[(&str, &str)] = &[
        ("WTI", "WTI Rohöl"),
        ("BRENT", "Brent Rohöl"),
        ("NATURAL_GAS", "Henry Hub Erdgas"),
        ("DIESEL_USGULF", "Diesel US Gulf"),
        ("HEATING_OIL_NYH", "Heating Oil New York Harbor"),
        ("JET_FUEL_USGULF", "Jet Fuel US Gulf"),
        ("PROPANE_MBTX", "Propane Mont Belvieu"),
    ];

    let mut output = Vec::new();
    output.extend(
        CORE_FOREX
            .iter()
            .filter_map(|code| market_candidate(code, "FOREX", "Forex", 10, &availability.forex)),
    );
    output.extend(METALS.iter().filter_map(|code| {
        market_candidate(code, "FOREX", "Commodities", 15, &availability.forex)
    }));
    output.extend(
        INDICES.iter().filter_map(|code| {
            market_candidate(code, "INDX", "Indizes", 20, &availability.indices)
        }),
    );
    output.extend(CRYPTO.iter().filter_map(|code| {
        market_candidate(code, "CC", "Kryptowährungen", 30, &availability.crypto)
    }));
    output.extend(ENERGY.iter().map(|(code, name)| EodhdInstrument {
        provider_symbol: format!("{code}.COMMODITY"),
        display_symbol: (*code).to_string(),
        category: "Commodities".into(),
        description: Some((*name).to_string()),
        base_currency: None,
        quote_currency: Some("USD".into()),
        data_kind: "commodity".into(),
        source_code: (*code).to_string(),
        sync_priority: 25,
        native_timezone: "EODHD/FRED provider-native date".into(),
    }));
    output.push(EodhdInstrument {
        provider_symbol: "SOYB.US".into(),
        display_symbol: "SOYB".into(),
        category: "Commodities".into(),
        description: Some("Sojabohnen · Teucrium ETF-Proxy".into()),
        base_currency: None,
        quote_currency: Some("USD".into()),
        data_kind: "eod".into(),
        source_code: "SOYB.US".into(),
        sync_priority: 26,
        native_timezone: "EODHD provider-native trading date".into(),
    });
    output
}

fn legacy_candidate(
    item: &LegacyInstrument,
    availability: &Availability,
) -> Option<EodhdInstrument> {
    match item.category.as_str() {
        "Forex" => {
            let code = compact_symbol(&item.provider_symbol);
            market_candidate(&code, "FOREX", "Forex", 40, &availability.forex)
        }
        "Kryptowährungen" => {
            let code = crypto_alias(item.provider_symbol.as_str());
            market_candidate(&code, "CC", "Kryptowährungen", 50, &availability.crypto)
        }
        "Indizes" => {
            let code = legacy_index_code(&item.provider_symbol)?;
            market_candidate(code, "INDX", "Indizes", 45, &availability.indices)
        }
        "Commodities" => {
            if matches!(
                item.base_currency.as_deref(),
                Some("XAU" | "XAG" | "XPT" | "XPD")
            ) {
                let code = compact_symbol(&item.provider_symbol);
                return market_candidate(&code, "FOREX", "Commodities", 35, &availability.forex);
            }
            let code = legacy_commodity_code(&item.provider_symbol)?;
            Some(EodhdInstrument {
                provider_symbol: format!("{code}.COMMODITY"),
                display_symbol: code.to_string(),
                category: "Commodities".into(),
                description: item.description.clone(),
                base_currency: None,
                quote_currency: Some("USD".into()),
                data_kind: "commodity".into(),
                source_code: code.to_string(),
                sync_priority: 45,
                native_timezone: "EODHD/FRED provider-native date".into(),
            })
        }
        _ => None,
    }
}

fn market_candidate(
    code: &str,
    exchange: &str,
    category: &str,
    sync_priority: i64,
    available: &HashMap<String, String>,
) -> Option<EodhdInstrument> {
    let code = code.to_ascii_uppercase();
    let description = available.get(&code)?.clone();
    let (base_currency, quote_currency, display_symbol) = if exchange == "FOREX" && code.len() == 6
    {
        let (base, quote) = code.split_at(3);
        (
            Some(base.to_string()),
            Some(quote.to_string()),
            format!("{base}/{quote}"),
        )
    } else if exchange == "CC" {
        let mut parts = code.split('-');
        let base = parts.next().map(str::to_string);
        let quote = parts.next().map(str::to_string);
        let display = match (&base, &quote) {
            (Some(base), Some(quote)) => format!("{base}/{quote}"),
            _ => code.clone(),
        };
        (base, quote, display)
    } else {
        (None, None, code.clone())
    };
    Some(EodhdInstrument {
        provider_symbol: format!("{code}.{exchange}"),
        display_symbol,
        category: category.into(),
        description: Some(description),
        base_currency,
        quote_currency,
        data_kind: "eod".into(),
        source_code: format!("{code}.{exchange}"),
        sync_priority,
        native_timezone: "EODHD provider-native trading date".into(),
    })
}

fn compact_symbol(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_uppercase()
}

fn crypto_alias(value: &str) -> String {
    let normalized = value.to_ascii_uppercase();
    match normalized.as_str() {
        "AVE-USD" => "AAVE-USD".into(),
        "DSH-USD" => "DASH-USD".into(),
        "LNK-USD" => "LINK-USD".into(),
        _ => normalized,
    }
}

fn legacy_index_code(value: &str) -> Option<&'static str> {
    match value {
        "AUS.IDX-AUD" => Some("AXJO"),
        "CHE.IDX-CHF" => Some("SSMI"),
        "CHI.IDX-USD" => Some("SSEC"),
        "DEU.IDX-EUR" => Some("GDAXI"),
        "DOLLAR.IDX-USD" => Some("DXY"),
        "ESP.IDX-EUR" => Some("IBEX"),
        "EUS.IDX-EUR" => Some("STOXX50E"),
        "FRA.IDX-EUR" => Some("FCHI"),
        "HKG.IDX-HKD" => Some("HSI"),
        "JPN.IDX-JPY" => Some("N225"),
        "NLD.IDX-EUR" => Some("AEX"),
        "PLN.IDX-PLN" => Some("WIG20"),
        "USA30.IDX-USD" => Some("DJI"),
        "USATECH.IDX-USD" => Some("NDX"),
        _ => None,
    }
}

fn legacy_commodity_code(value: &str) -> Option<&'static str> {
    match value {
        "BRENT.CMD-USD" => Some("BRENT"),
        "DIESEL.CMD-USD" => Some("DIESEL_USGULF"),
        "GAS.CMD-USD" => Some("NATURAL_GAS"),
        "LIGHT.CMD-USD" => Some("WTI"),
        _ => None,
    }
}

fn http_error(scope: &str, status: u16) -> CommandError {
    let message = match status {
        401 | 403 => format!(
            "{scope} wurde von EODHD abgelehnt. Bitte API-Key und den benötigten EODHD-Datenzugriff prüfen."
        ),
        429 => format!("{scope} wurde von EODHD begrenzt und wird später erneut versucht."),
        _ => format!("{scope} antwortete mit HTTP {status}."),
    };
    provider_error(message)
}

fn provider_error(message: impl Into<String>) -> CommandError {
    CommandError {
        code: "EODHD_SEASONALITY_PROVIDER_ERROR".into(),
        message: message.into(),
        details: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn availability() -> Availability {
        Availability {
            forex: [
                ("EURUSD".into(), "Euro/US Dollar".into()),
                ("XAUUSD".into(), "Gold Spot US Dollar".into()),
            ]
            .into_iter()
            .collect(),
            indices: [("GSPC".into(), "S&P 500 Index".into())]
                .into_iter()
                .collect(),
            crypto: [("BTC-USD".into(), "Bitcoin".into())].into_iter().collect(),
        }
    }

    #[test]
    fn catalogue_keeps_only_symbols_confirmed_by_eodhd() {
        let legacy = vec![
            LegacyInstrument {
                provider_symbol: "EUR-USD".into(),
                category: "Forex".into(),
                description: None,
                base_currency: Some("EUR".into()),
            },
            LegacyInstrument {
                provider_symbol: "AED-CNH".into(),
                category: "Forex".into(),
                description: None,
                base_currency: Some("AED".into()),
            },
        ];
        let output = build_catalog(&legacy, &availability());
        assert!(
            output
                .iter()
                .any(|item| item.provider_symbol == "EURUSD.FOREX")
        );
        assert!(
            !output
                .iter()
                .any(|item| item.provider_symbol == "AEDCNH.FOREX")
        );
    }

    #[test]
    fn catalogue_labels_the_daily_soybean_series_as_an_etf_proxy() {
        let output = build_catalog(&[], &availability());
        let soybeans = output
            .iter()
            .find(|item| item.provider_symbol == "SOYB.US")
            .expect("SOYB.US should be part of the canonical catalogue");

        assert_eq!(soybeans.display_symbol, "SOYB");
        assert_eq!(soybeans.category, "Commodities");
        assert_eq!(
            soybeans.description.as_deref(),
            Some("Sojabohnen · Teucrium ETF-Proxy")
        );
        assert_eq!(soybeans.data_kind, "eod");
        assert_eq!(soybeans.source_code, "SOYB.US");
        assert_eq!(soybeans.quote_currency.as_deref(), Some("USD"));
    }

    #[test]
    fn adjusted_close_is_the_canonical_eod_price() {
        let bar = eod_row_to_bar(EodRow {
            date: "2025-01-02".into(),
            open: Some(90.0),
            high: Some(110.0),
            low: Some(80.0),
            close: Some(100.0),
            adjusted_close: Some(50.0),
            volume: Some(10.0),
        })
        .unwrap();
        assert_eq!(bar.close, 50.0);
        assert_eq!(bar.open, 90.0);
    }

    #[test]
    fn intraday_rows_require_complete_consistent_ohlc() {
        let bar = intraday_row_to_bar(IntradayRow {
            timestamp: 1_700_000_000,
            open: Some(1.10),
            high: Some(1.12),
            low: Some(1.09),
            close: Some(1.11),
            volume: Some(42.0),
        })
        .unwrap();
        assert_eq!(bar.time, 1_700_000_000_000);
        assert_eq!(bar.high, 1.12);

        assert!(
            intraday_row_to_bar(IntradayRow {
                timestamp: 1_700_000_000,
                open: Some(1.10),
                high: Some(1.08),
                low: Some(1.09),
                close: Some(1.11),
                volume: None,
            })
            .is_none()
        );
    }

    #[test]
    fn legacy_market_aliases_are_explicit_and_reproducible() {
        assert_eq!(crypto_alias("DSH-USD"), "DASH-USD");
        assert_eq!(legacy_index_code("USA30.IDX-USD"), Some("DJI"));
        assert_eq!(legacy_commodity_code("LIGHT.CMD-USD"), Some("WTI"));
    }

    #[test]
    fn api_key_is_read_without_mutating_the_process_environment() {
        let directory = tempfile::tempdir().unwrap();
        let env_file = directory.path().join(".env.local");
        fs::write(
            &env_file,
            "IGNORED=value\nEODHD_API_KEY=  local-test-key  \n",
        )
        .unwrap();

        assert_eq!(
            api_key_from_file(&env_file).as_deref(),
            Some("local-test-key")
        );
    }

    #[test]
    fn ancestor_search_reaches_the_repository_env_file() {
        let candidates = env_file_candidates();
        let repository_env = Path::new(env!("CARGO_MANIFEST_DIR"))
            .ancestors()
            .nth(3)
            .unwrap()
            .join(".env.local");

        assert!(
            candidates
                .iter()
                .any(|candidate| candidate == &repository_env)
        );
    }
}
