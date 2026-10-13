//! Explicit asset models. Economic surprise signals are assumptions, not fitted forecasts.
use chrono::{DateTime, Duration, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::str::FromStr;

use super::eodhd_fundamentals::{FundamentalIndicatorView, MacroFundamentalsDashboard};
use crate::{
    database::AppState,
    errors::{AppError, CommandResult},
    runtime::State,
};

pub(super) const MODEL_VERSION: &str = "macro-fundamentals-observed-v1";
pub(super) const CURRENCIES: [&str; 9] = [
    "EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY", "CNY",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreInstrument {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub base: String,
    pub quote: Option<String>,
    pub default_threshold: i32,
    pub score_name: String,
    pub price_symbol: Option<String>,
    pub cot_symbol: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreContribution {
    pub key: String,
    pub label: String,
    pub channel: String,
    pub score: Option<i32>,
    pub source_currency: Option<String>,
    pub actual: Option<String>,
    pub forecast: Option<String>,
    pub previous: Option<String>,
    pub released_at: Option<String>,
    pub source_url: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetScore {
    pub instrument: ScoreInstrument,
    pub score: Option<i32>,
    pub available_components: usize,
    pub total_components: usize,
    pub contributions: Vec<ScoreContribution>,
    pub scope: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommodityScoreDashboard {
    pub as_of: String,
    pub model_version: String,
    pub assets: Vec<AssetScore>,
}

fn commodity_instruments() -> Vec<ScoreInstrument> {
    [
        ("XAU", "Gold", Some("XAUUSD.FOREX"), "GOLD"),
        ("XAG", "Silber", Some("XAGUSD.FOREX"), "SILVER"),
        ("XPT", "Platin", Some("XPTUSD.FOREX"), "PLATINUM"),
        ("XPD", "Palladium", Some("XPDUSD.FOREX"), "PALLADIUM"),
        ("COPPER", "Kupfer", None, "COPPER"),
        ("WTI", "WTI Rohöl", Some("WTI.COMMODITY"), "OIL"),
        ("BRENT", "Brent Rohöl", Some("BRENT.COMMODITY"), ""),
        (
            "NATURAL_GAS",
            "Henry Hub Erdgas",
            Some("NATURAL_GAS.COMMODITY"),
            "NATGAS",
        ),
    ]
    .into_iter()
    .map(|(base, name, price, cot)| ScoreInstrument {
        id: format!("commodity:{base}/USD"),
        label: format!("{name} · {base}/USD"),
        kind: "commodity".into(),
        base: base.into(),
        quote: Some("USD".into()),
        default_threshold: 5,
        score_name: "Rohstoff-Fundamentals (Teilmodell)".into(),
        price_symbol: price.map(str::to_owned),
        cot_symbol: (!cot.is_empty()).then(|| cot.into()),
    })
    .collect()
}

pub(super) fn instruments() -> Vec<ScoreInstrument> {
    let mut result = CURRENCIES
        .iter()
        .map(|currency| ScoreInstrument {
            id: format!("currency:{currency}"),
            label: (*currency).into(),
            kind: "currency".into(),
            base: (*currency).into(),
            quote: None,
            default_threshold: 1,
            score_name: "Fundamentals Score".into(),
            price_symbol: None,
            cot_symbol: None,
        })
        .collect::<Vec<_>>();
    for base in CURRENCIES {
        for quote in CURRENCIES {
            if base == quote {
                continue;
            }
            result.push(ScoreInstrument {
                id: format!("forex:{base}/{quote}"),
                label: format!("{base}/{quote}"),
                kind: "forex".into(),
                base: base.into(),
                quote: Some(quote.into()),
                default_threshold: 5,
                score_name: "Fundamentals Score".into(),
                price_symbol: Some(format!("{base}{quote}.FOREX")),
                cot_symbol: None,
            });
        }
    }
    result.extend(commodity_instruments());
    result
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_macro_score_catalog() -> Vec<ScoreInstrument> {
    instruments()
}

fn contribution(
    indicator: &FundamentalIndicatorView,
    currency: &str,
    channel: &str,
    sign: i32,
) -> ScoreContribution {
    ScoreContribution {
        key: format!("{channel}:{currency}:{}", indicator.key),
        label: format!("{currency} · {}", indicator.label),
        channel: channel.into(),
        score: matches!(indicator.status.as_str(), "scored" | "neutral")
            .then_some(i32::from(indicator.score) * sign),
        source_currency: Some(currency.into()),
        actual: indicator.actual_text.clone(),
        forecast: indicator.forecast_text.clone(),
        previous: indicator.previous_text.clone(),
        released_at: indicator.released_at.clone(),
        source_url: indicator.source_url.clone(),
        reason: (!indicator.reason_codes.is_empty()).then(|| indicator.reason_codes.join(", ")),
    }
}

fn missing(key: &str, label: &str, channel: &str) -> ScoreContribution {
    ScoreContribution {
        key: key.into(),
        label: label.into(),
        channel: channel.into(),
        score: None,
        source_currency: None,
        actual: None,
        forecast: None,
        previous: None,
        released_at: None,
        source_url: None,
        reason: Some("Dafür ist noch keine geprüfte numerische Datenquelle angebunden.".into()),
    }
}

fn aggregate(
    instrument: ScoreInstrument,
    contributions: Vec<ScoreContribution>,
    scope: String,
) -> AssetScore {
    let available_components = contributions.iter().filter(|v| v.score.is_some()).count();
    AssetScore {
        instrument,
        score: (available_components > 0)
            .then(|| contributions.iter().filter_map(|v| v.score).sum()),
        available_components,
        total_components: contributions.len(),
        contributions,
        scope,
    }
}

pub(super) fn fundamental_assets(dashboard: &MacroFundamentalsDashboard) -> Vec<AssetScore> {
    instruments().into_iter().filter(|instrument|instrument.kind!="commodity").map(|instrument| {
        let contributions = if instrument.kind=="currency" {
            dashboard.currencies.iter().find(|v|v.currency==instrument.base).map(|v|v.indicators.iter()
                .map(|i|contribution(i,&v.currency,"fundamentals",1)).collect()).unwrap_or_default()
        } else {
            dashboard.pairs.iter().find(|v|v.base==instrument.base && Some(&v.quote)==instrument.quote.as_ref())
                .map(|pair|pair.cells.iter().map(|cell| ScoreContribution {
                    key:cell.key.clone(),label:format!("{} · Base {:+} − Quote {:+}",cell.label,cell.base_score,cell.quote_score),channel:cell.factor.clone(),
                    // Match native one-sided semantics; full coverage is recorded separately.
                    score:(cell.base_available||cell.quote_available).then_some(i32::from(cell.score)),
                    source_currency:None,actual:None,forecast:None,previous:None,
                    released_at:None,source_url:None,reason:(!cell.available).then(||cell.reason_codes.join(", ")),
                }).collect()).unwrap_or_default()
        };
        aggregate(instrument,contributions,"Gespeicherter nativer 17-Indikatoren-Vertrag; COT, technische Trends und Seasonality separat.".into())
    }).collect()
}

#[derive(Debug, FromRow)]
struct InventoryEvent {
    provider_type: String,
    actual_value: Option<String>,
    forecast_value: Option<String>,
    previous_value: Option<String>,
    released_at: String,
    source_url: String,
}

async fn inventory(
    state: &AppState,
    gas: bool,
    now: DateTime<Utc>,
) -> Result<ScoreContribution, AppError> {
    let label = if gas {
        "EIA US-Gasspeicher · Überraschung"
    } else {
        "EIA US-Rohöllager · Überraschung"
    };
    let mut value = missing(
        if gas {
            "gas_inventory"
        } else {
            "oil_inventory"
        },
        label,
        "inventory",
    );
    let aliases = if gas {
        [
            "EIA Natural Gas Stocks Change",
            "EIA Natural Gas Storage Change",
            "Natural Gas Storage",
        ]
    } else {
        [
            "EIA Crude Oil Stocks Change",
            "Crude Oil Inventories",
            "EIA Crude Oil Inventories",
        ]
    };
    let events:Vec<InventoryEvent>=sqlx::query_as("SELECT provider_type,actual_value,forecast_value,previous_value,released_at,source_url FROM eodhd_events WHERE currency='USD' AND mapping_status!='ignored' AND provider_type COLLATE NOCASE IN (?,?,?) AND julianday(released_at)<=julianday(?) AND julianday(released_at)>=julianday(?) AND julianday(updated_at)<=julianday(?) ORDER BY julianday(released_at) DESC LIMIT 20")
        .bind(aliases[0]).bind(aliases[1]).bind(aliases[2]).bind(now.to_rfc3339()).bind((now-Duration::days(8)).to_rfc3339()).bind(now.to_rfc3339()).fetch_all(&state.db).await?;
    // Latest incomplete release never manufactures a forecast; an older complete release can remain active.
    if let Some(event) = events.iter().find(|e| {
        e.actual_value
            .as_deref()
            .and_then(|v| Decimal::from_str(v).ok())
            .is_some()
            && e.forecast_value
                .as_deref()
                .and_then(|v| Decimal::from_str(v).ok())
                .is_some()
    }) {
        let actual = Decimal::from_str(event.actual_value.as_deref().unwrap_or_default()).unwrap();
        let forecast =
            Decimal::from_str(event.forecast_value.as_deref().unwrap_or_default()).unwrap();
        let released = DateTime::parse_from_rfc3339(&event.released_at).ok();
        let conflicting = events
            .iter()
            .filter(|candidate| {
                DateTime::parse_from_rfc3339(&candidate.released_at).ok() == released
            })
            .any(|candidate| {
                candidate
                    .actual_value
                    .as_deref()
                    .and_then(|v| Decimal::from_str(v).ok())
                    .is_some_and(|v| v != actual)
                    || candidate
                        .forecast_value
                        .as_deref()
                        .and_then(|v| Decimal::from_str(v).ok())
                        .is_some_and(|v| v != forecast)
            });
        if conflicting {
            value.reason = Some("Widersprüchliche Lagerwerte zum selben Veröffentlichungstermin; keine eindeutige Überraschung.".into());
            return Ok(value);
        }
        value.label = format!("{label} · {}", event.provider_type);
        value.score = Some(if actual < forecast {
            1
        } else if actual > forecast {
            -1
        } else {
            0
        });
        value.actual = event.actual_value.clone();
        value.forecast = event.forecast_value.clone();
        value.previous = event.previous_value.clone();
        value.released_at = Some(event.released_at.clone());
        value.source_url = Some(event.source_url.clone());
        value.source_currency = Some("USD".into());
        value.reason = None;
    } else {
        value.reason = Some(
            "Kein frischer, eindeutig zugeordneter EODHD-Lagerbericht mit Actual und Forecast."
                .into(),
        );
    }
    Ok(value)
}

pub(super) async fn commodity_assets(
    state: &AppState,
    dashboard: &MacroFundamentalsDashboard,
    now: DateTime<Utc>,
    archive: bool,
) -> Result<Vec<AssetScore>, AppError> {
    let oil = if archive {
        missing("oil_inventory", "EIA US-Rohöllager", "inventory")
    } else {
        inventory(state, false, now).await?
    };
    let gas = if archive {
        missing("gas_inventory", "EIA US-Gasspeicher", "inventory")
    } else {
        inventory(state, true, now).await?
    };
    Ok(commodity_instruments().into_iter().map(|instrument| {
        let gold=instrument.base=="XAU";let gas_asset=instrument.base=="NATURAL_GAS";
        let mut contributions=Vec::new();
        for currency in &dashboard.currencies {
            for indicator in &currency.indicators {
                if currency.currency=="USD" && (gold||indicator.factor!="growth") {
                    contributions.push(contribution(indicator,"USD","usd",-1));
                } else if !gold && matches!(currency.currency.as_str(),"USD"|"CNY")
                    && (!gas_asset||currency.currency=="USD")
                    && matches!(indicator.key.as_str(),"gdp"|"manufacturing_pmi"|"industrial_production") {
                    contributions.push(contribution(indicator,&currency.currency,"demand",1));
                }
            }
        }
        match instrument.base.as_str() {
            "XAU" => {contributions.push(missing("real_yields","US-Realzinsen","asset"));contributions.push(missing("gold_flows","ETF-/Zentralbanknachfrage und Minenangebot","asset"));},
            "WTI"|"BRENT" => {contributions.push(oil.clone());contributions.push(missing("oil_supply","OPEC-/Weltangebot und Lieferausfälle","asset"));},
            "NATURAL_GAS" => {contributions.push(gas.clone());contributions.push(missing("gas_weather","US-Heiz-/Kühlbedarf, Produktion und LNG","asset"));},
            _ => {contributions.push(missing("metal_supply","Minenangebot, Bestände und Recycling","asset"));contributions.push(missing("sector_demand","Branchenspezifische Nachfrage","asset"));},
        }
        let scope=if gold {"Inverser USD-Kanal; Realzinsen und physische Goldnachfrage fehlen."}
            else if gas_asset {"Regionaler Henry-Hub-US-Markt; globale Erdgaspreise und Wetter sind keine Ersatzdaten."}
            else if instrument.base=="BRENT" {"USD- und Industrienachfrage; US-Rohöllager sind ein Stellvertreter, keine Brent-Bestände."}
            else {"USD-Kanal und US-/China-Industrienachfrage; physische Angebots-/Nachfrageabdeckung bleibt unvollständig."};
        aggregate(instrument,contributions,scope.into())
    }).collect())
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_macro_commodity_dashboard(
    state: State<'_, AppState>,
) -> CommandResult<CommodityScoreDashboard> {
    let now = Utc::now();
    let dashboard =
        super::eodhd_fundamentals::load_fundamental_dashboard_snapshot(&state, Some(now), None)
            .await?;
    Ok(CommodityScoreDashboard {
        as_of: now.to_rfc3339(),
        model_version: MODEL_VERSION.into(),
        assets: commodity_assets(&state, &dashboard, now, false).await?,
    })
}

#[cfg(test)]
#[path = "macro_scores_tests.rs"]
mod tests;
