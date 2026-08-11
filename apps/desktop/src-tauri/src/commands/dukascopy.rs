//! Thin client for Dukascopy's public Historical Data Export feed.
//!
//! The feed is intentionally used at native D1 resolution only.  It preserves
//! the provider's own trading-day boundary and avoids storing multi-gigabyte
//! tick archives for a calendar-seasonality use case.

use reqwest::{
    Client,
    header::{HeaderMap, HeaderValue, ORIGIN, REFERER, USER_AGENT},
};
use serde::Deserialize;

use crate::errors::CommandError;

const BASE_URL: &str = "https://jetta.dukascopy.com/v1";

#[derive(Debug, Clone)]
pub struct DukascopyInstrument {
    pub symbol: String,
    pub display_symbol: String,
    pub category: String,
    pub description: String,
    pub base_currency: Option<String>,
    pub quote_currency: Option<String>,
    pub earliest_daily_at: i64,
    pub native_timezone: Option<String>,
}

#[derive(Debug, Clone)]
pub struct DukascopyDailyBar {
    pub time: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct CatalogResponse {
    instruments: Vec<CatalogInstrument>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogInstrument {
    code: String,
    name: String,
    description: Option<String>,
    platform_group_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstrumentDetail {
    code: String,
    name: String,
    description: Option<String>,
    default_timezone: Option<String>,
    histories: Vec<HistoryRange>,
}

#[derive(Debug, Deserialize)]
struct HistoryRange {
    period: String,
    from: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct PackedBars {
    timestamp: i64,
    multiplier: f64,
    open: f64,
    high: f64,
    low: f64,
    close: f64,
    shift: i64,
    #[serde(default)]
    times: Vec<i64>,
    #[serde(default)]
    opens: Vec<f64>,
    #[serde(default)]
    highs: Vec<f64>,
    #[serde(default)]
    lows: Vec<f64>,
    #[serde(default)]
    closes: Vec<f64>,
    #[serde(default)]
    volumes: Vec<f64>,
}

pub fn http_client() -> Result<Client, CommandError> {
    let mut headers = HeaderMap::new();
    headers.insert(
        ORIGIN,
        HeaderValue::from_static("https://widgets.dukascopy.com"),
    );
    headers.insert(
        REFERER,
        HeaderValue::from_static("https://widgets.dukascopy.com/"),
    );
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static("PersonalMacro/1.0 (local seasonality research)"),
    );
    Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|_| provider_error("Der Dukascopy-Client konnte nicht vorbereitet werden."))
}

pub async fn catalog(client: &Client) -> Result<Vec<DukascopyInstrument>, CommandError> {
    let response: CatalogResponse = fetch_json(client, "/instruments").await?;
    let mut instruments = Vec::new();
    for item in response.instruments {
        let Some(category) = category_for_group(item.platform_group_id.as_deref()) else {
            continue;
        };
        let detail = match detail(client, &item.code).await {
            Ok(value) => value,
            Err(_) => continue,
        };
        let Some(earliest_daily_at) = detail
            .histories
            .iter()
            .find(|range| range.period == "DAY")
            .and_then(|range| range.from)
        else {
            continue;
        };
        let (base_currency, quote_currency) = split_pair(&detail.name);
        let display_symbol = item.name.clone();
        instruments.push(DukascopyInstrument {
            symbol: detail.code,
            display_symbol,
            category: category.into(),
            description: detail.description.or(item.description).unwrap_or(item.name),
            base_currency,
            quote_currency,
            earliest_daily_at,
            native_timezone: detail.default_timezone,
        });
    }
    instruments.sort_by(|left, right| left.display_symbol.cmp(&right.display_symbol));
    Ok(instruments)
}

async fn detail(client: &Client, symbol: &str) -> Result<InstrumentDetail, CommandError> {
    fetch_json(client, &format!("/instruments/{symbol}")).await
}

pub async fn daily_bars(
    client: &Client,
    symbol: &str,
    side: &str,
    year: i32,
) -> Result<Vec<DukascopyDailyBar>, CommandError> {
    let side = if side == "ASK" { "ASK" } else { "BID" };
    let packed: PackedBars = fetch_json(
        client,
        &format!("/candles/trade/day/{symbol}/{side}/{year}"),
    )
    .await?;
    decode_bars(packed)
}

fn decode_bars(packed: PackedBars) -> Result<Vec<DukascopyDailyBar>, CommandError> {
    let len = packed.times.len();
    if [
        packed.opens.len(),
        packed.highs.len(),
        packed.lows.len(),
        packed.closes.len(),
    ]
    .iter()
    .any(|length| *length != len)
    {
        return Err(provider_error(
            "Dukascopy hat eine inkonsistente D1-Serie geliefert.",
        ));
    }
    let mut time = packed.timestamp;
    let mut open = packed.open;
    let mut high = packed.high;
    let mut low = packed.low;
    let mut close = packed.close;
    let mut output = Vec::with_capacity(len);
    for index in 0..len {
        time = time.saturating_add(packed.shift.saturating_mul(packed.times[index]));
        open += packed.opens[index] * packed.multiplier;
        high += packed.highs[index] * packed.multiplier;
        low += packed.lows[index] * packed.multiplier;
        close += packed.closes[index] * packed.multiplier;
        if time > 0
            && [open, high, low, close]
                .iter()
                .all(|value| value.is_finite() && *value > 0.0)
        {
            output.push(DukascopyDailyBar {
                time,
                open,
                high,
                low,
                close,
                volume: packed
                    .volumes
                    .get(index)
                    .map(|value| (value * 1_000_000.0).round() as i64),
            });
        }
    }
    Ok(output)
}

async fn fetch_json<T: serde::de::DeserializeOwned>(
    client: &Client,
    path: &str,
) -> Result<T, CommandError> {
    let response = client
        .get(format!("{BASE_URL}{path}"))
        .send()
        .await
        .map_err(|_| provider_error("Dukascopy ist momentan nicht erreichbar."))?;
    if !response.status().is_success() {
        return Err(provider_error(
            "Dukascopy konnte die angeforderte Historie nicht liefern.",
        ));
    }
    response
        .json()
        .await
        .map_err(|_| provider_error("Dukascopy hat eine ungültige Historienantwort geliefert."))
}

fn category_for_group(group: Option<&str>) -> Option<&'static str> {
    match group.unwrap_or_default() {
        group if group.starts_with("FX_") && group != "FX_METAL" => Some("Forex"),
        "FX_METAL" | "COM_SPOT" => Some("Commodities"),
        "IDX_CASH" => Some("Indizes"),
        "CRYPTO_CURR" | "CRYPTO_DC" => Some("Kryptowährungen"),
        _ => None,
    }
}

fn split_pair(name: &str) -> (Option<String>, Option<String>) {
    let mut values = name.split('/');
    let Some(base) = values.next() else {
        return (None, None);
    };
    let Some(quote) = values.next() else {
        return (None, None);
    };
    if values.next().is_none() && base.len() <= 6 && quote.len() <= 6 {
        (Some(base.to_string()), Some(quote.to_string()))
    } else {
        (None, None)
    }
}

fn provider_error(message: impl Into<String>) -> CommandError {
    CommandError {
        code: "DUKASCOPY_PROVIDER_ERROR".into(),
        message: message.into(),
        details: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_delta_encoded_daily_bars() {
        let rows = decode_bars(PackedBars {
            timestamp: 1_000,
            multiplier: 0.01,
            open: 10.0,
            high: 11.0,
            low: 9.0,
            close: 10.5,
            shift: 100,
            times: vec![2, 1],
            opens: vec![1.0, -0.5],
            highs: vec![1.0, 0.0],
            lows: vec![1.0, -1.0],
            closes: vec![1.0, -0.5],
            volumes: vec![1.0, 2.0],
        })
        .unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].time, 1_200);
        assert!((rows[0].close - 10.51).abs() < 1e-9);
        assert!((rows[1].close - 10.505).abs() < 1e-9);
    }

    #[test]
    fn only_core_market_groups_are_catalogued() {
        assert_eq!(category_for_group(Some("FX_MAJOR")), Some("Forex"));
        assert_eq!(category_for_group(Some("COM_SPOT")), Some("Commodities"));
        assert_eq!(category_for_group(Some("IDX_CASH")), Some("Indizes"));
        assert_eq!(category_for_group(Some("STK_CASH")), None);
    }
}
