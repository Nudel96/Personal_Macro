//! Bounded native calculations over verified public shards. The caller pins one
//! generation, loads a bounded batch, and closes every shard before the next.
use super::cache::{ArtifactKind, LoadedShard};
use crate::{
    commands,
    database::{AppPaths, AppState},
    errors::{CommandError, CommandResult},
    metrics::seasonality_opportunities::{
        MarketWindowInput, OpportunityInput, OpportunityResponse, OpportunitySeries,
        OpportunityUniverse, complete_years, scan_opportunities,
    },
    runtime::State,
};
use chrono::{TimeZone, Utc};
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;

pub const USD_SPOT_SYMBOLS: [&str; 7] = [
    "EURUSD.FOREX",
    "GBPUSD.FOREX",
    "AUDUSD.FOREX",
    "NZDUSD.FOREX",
    "USDJPY.FOREX",
    "USDCHF.FOREX",
    "USDCAD.FOREX",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BatchInput {
    pub generation: String,
    pub cursor: usize,
    pub limit: usize,
    pub input: Option<OpportunityInput>,
    pub screener_input: Option<MarketWindowInput>,
}

pub fn validate_batch(args: &Value, opportunities: bool) -> CommandResult<BatchInput> {
    let batch: BatchInput = serde_json::from_value(args.clone()).map_err(|_| invalid())?;
    if batch.generation.len() != 36
        || batch.cursor > 10_000
        || !(1..=5).contains(&batch.limit)
        || opportunities != batch.input.is_some()
        || (opportunities && batch.screener_input.is_some())
    {
        return Err(invalid());
    }
    if let Some(input) = &batch.screener_input {
        input.validate().map_err(CommandError::validation)?;
    }
    if let Some(input) = &batch.input {
        input.validate().map_err(CommandError::validation)?;
        let value = args
            .get("input")
            .and_then(Value::as_object)
            .ok_or_else(invalid)?;
        if value.keys().any(|key| {
            ![
                "asOf",
                "month",
                "universe",
                "limit",
                "minDays",
                "maxDays",
                "minYears",
                "lookbackYears",
                "upcomingOnly",
            ]
            .contains(&key.as_str())
        }) {
            return Err(invalid());
        }
    }
    Ok(batch)
}

pub async fn screener(
    shard: &LoadedShard,
    input: Option<MarketWindowInput>,
) -> CommandResult<Vec<commands::SeasonalityScreenerRow>> {
    if shard.artifact.kind != ArtifactKind::SeasonalitySymbol {
        return Err(invalid());
    }
    commands::get_seasonality_screener(State::new(&state(shard)), input)
        .await
        .map_err(redact)
}

pub async fn forex_pairs(shard: &LoadedShard) -> CommandResult<Value> {
    if shard.artifact.kind != ArtifactKind::SeasonalityIndex {
        return Err(invalid());
    }
    serde_json::to_value(
        commands::get_seasonality_forex_pairs(State::new(&state(shard)))
            .await
            .map_err(redact)?,
    )
    .map_err(|_| invalid())
}

/// One verified symbol shard contains one catalog row and its native daily
/// history. No browser-provided path or raw provider URL enters this reader.
pub async fn series(shard: &LoadedShard) -> CommandResult<OpportunitySeries> {
    if shard.artifact.kind != ArtifactKind::SeasonalitySymbol {
        return Err(invalid());
    }
    let (provider, symbol, description, category): (String, String, Option<String>, String) =
        sqlx::query_as("SELECT provider_symbol,display_symbol,description,category FROM seasonality_provider_instruments WHERE provider='eodhd'")
            .fetch_one(shard.pool()).await.map_err(|_| unavailable())?;
    if shard.artifact.key != format!("eodhd:{provider}") {
        return Err(invalid());
    }
    let rows: Vec<(i64, f64)> = sqlx::query_as(
        "SELECT candle_time,mid_close FROM seasonality_provider_daily_candles WHERE provider='eodhd' AND provider_symbol=? ORDER BY candle_time",
    ).bind(&provider).fetch_all(shard.pool()).await.map_err(|_| unavailable())?;
    let prices = rows
        .into_iter()
        .map(|(time, close)| {
            let date = Utc.timestamp_millis_opt(time).single()?.date_naive();
            (close.is_finite() && close > 0.0).then_some((date, close))
        })
        .collect::<Option<BTreeMap<_, _>>>()
        .filter(|prices| !prices.is_empty())
        .ok_or_else(unavailable)?;
    Ok(OpportunitySeries {
        label: description.unwrap_or_else(|| symbol.clone()),
        symbol,
        source: if category == "Forex" {
            "EODHD · Forex-Spot"
        } else {
            "EODHD · historische Tageskurse"
        }
        .into(),
        source_symbol: provider,
        currency: None,
        inverted: false,
        prices,
    })
}

pub fn currency_series(source: &OpportunitySeries) -> Option<OpportunitySeries> {
    let (currency, inverted) = match source.source_symbol.as_str() {
        "EURUSD.FOREX" => ("EUR", false),
        "GBPUSD.FOREX" => ("GBP", false),
        "AUDUSD.FOREX" => ("AUD", false),
        "NZDUSD.FOREX" => ("NZD", false),
        "USDJPY.FOREX" => ("JPY", true),
        "USDCHF.FOREX" => ("CHF", true),
        "USDCAD.FOREX" => ("CAD", true),
        _ => return None,
    };
    let mut output = source.clone();
    output.symbol = currency.into();
    output.label = format!("{currency} gegenüber USD · Spot");
    output.currency = Some(currency.into());
    output.inverted = inverted;
    if inverted {
        output.prices = source
            .prices
            .iter()
            .map(|(date, price)| (*date, 1.0 / price))
            .collect();
    }
    Some(output)
}

/// `currencies` is supplied once for all seven USD spot series, never inferred
/// from an arbitrary batch. A batch's top ten suffices for a final global top ten.
pub fn opportunities(
    instruments: Vec<OpportunitySeries>,
    currencies: Vec<OpportunitySeries>,
    input: OpportunityInput,
) -> CommandResult<OpportunityResponse> {
    input.validate().map_err(CommandError::validation)?;
    if input.universe == OpportunityUniverse::FxFutures {
        let mut result = scan_opportunities(&[], &[], input);
        result.unavailable_reason = Some("Für echte FX-Futures ist noch keine Tageskurshistorie mit dokumentierter Kontrakt- und Rollbehandlung angebunden. Forex-Spot bleibt eine ausdrücklich andere Datenbasis.".into());
        return Ok(result);
    }
    let mut excluded = Vec::new();
    let valid = instruments
        .into_iter()
        .filter_map(|series| {
            if complete_years(&series.prices, &input).len() < input.min_years {
                excluded.push(series.symbol);
                None
            } else if input.universe == OpportunityUniverse::Forex {
                currency_series(&series)
            } else {
                Some(series)
            }
        })
        .collect::<Vec<_>>();
    let currencies = currencies
        .iter()
        .filter(|series| complete_years(&series.prices, &input).len() >= input.min_years)
        .filter_map(currency_series)
        .collect::<Vec<_>>();
    let mut result = scan_opportunities(&valid, &currencies, input);
    result.excluded_symbols = excluded;
    Ok(result)
}

fn state(shard: &LoadedShard) -> AppState {
    let root = shard.directory().to_owned();
    AppState {
        db: shard.pool().clone(),
        paths: AppPaths {
            database: root.join("data.sqlite"),
            media: root.join("unused-media"),
            exports: root.join("unused-exports"),
            backups: root.join("unused-backups"),
            logs: root.join("unused-logs"),
            settings: root.join("unused-settings"),
            central_bank_reports: root.join("unused-reports"),
            root,
        },
    }
}
fn invalid() -> CommandError {
    CommandError::validation("Die Auswahl für die saisonale Berechnung ist ungültig.")
}
fn unavailable() -> CommandError {
    CommandError {
        code: "MARKET_DATA_UNAVAILABLE".into(),
        message: "Die geprüfte saisonale Historie konnte nicht gelesen werden.".into(),
        details: None,
    }
}
fn redact(error: CommandError) -> CommandError {
    if error.code == "VALIDATION_ERROR" {
        CommandError::validation(error.message)
    } else {
        unavailable()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn batches_reject_unbounded_and_unknown_arguments() {
        let base =
            json!({"generation":"11111111-1111-4111-8111-111111111111", "cursor":0,"limit":5});
        assert!(validate_batch(&base, false).is_ok());
        let mut large = base.clone();
        large["limit"] = json!(6);
        assert!(validate_batch(&large, false).is_err());
        let mut paths = base;
        paths["path"] = json!("arbitrary");
        assert!(validate_batch(&paths, false).is_err());
    }
    #[test]
    fn inverse_spot_uses_reciprocal_prices() {
        let day = chrono::NaiveDate::from_ymd_opt(2020, 1, 1).unwrap();
        let source = OpportunitySeries {
            symbol: "USDJPY".into(),
            label: "Yen".into(),
            currency: None,
            source: "EODHD · Forex-Spot".into(),
            source_symbol: "USDJPY.FOREX".into(),
            inverted: false,
            prices: [(day, 100.)].into_iter().collect(),
        };
        let yen = currency_series(&source).unwrap();
        assert_eq!(yen.prices[&day], 0.01);
        assert!(yen.inverted);
        let mut other = source;
        other.source_symbol = "EURJPY.FOREX".into();
        assert!(currency_series(&other).is_none());
    }

    #[test]
    fn rolling_screener_input_is_bounded_and_cannot_change_opportunity_scans() {
        let base = json!({"generation":"11111111-1111-4111-8111-111111111111", "cursor":0,"limit":5,"screenerInput":{"asOf":"2026-12-15"}});
        let batch = validate_batch(&base, false).unwrap();
        assert_eq!(
            batch.screener_input.unwrap().horizon_end().to_string(),
            "2027-03-15"
        );
        let mut extra = base.clone();
        extra["screenerInput"]["horizonDays"] = json!(1000);
        assert!(validate_batch(&extra, false).is_err());
        let mut old = base.clone();
        old["screenerInput"]["asOf"] = json!("1800-01-01");
        assert!(validate_batch(&old, false).is_err());
        let mut opportunities = base;
        opportunities["input"] = json!({"asOf":"2026-12-15","month":null,"universe":"all","limit":10,"minDays":5,"maxDays":90,"minYears":5,"lookbackYears":20,"upcomingOnly":true});
        assert!(validate_batch(&opportunities, true).is_err());
    }
}
