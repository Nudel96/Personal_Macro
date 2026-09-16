use std::collections::BTreeMap;

use chrono::{TimeZone, Utc};
use sqlx::FromRow;
use tauri::State;

use crate::{
    database::AppState,
    errors::{AppError, CommandError, CommandResult},
    metrics::seasonality_opportunities::{
        OpportunityInput, OpportunityResponse, OpportunitySeries, OpportunityUniverse,
        complete_years, scan_opportunities,
    },
};

#[derive(FromRow)]
struct Instrument {
    provider_symbol: String,
    display_symbol: String,
    description: Option<String>,
    category: String,
}

fn currency_definition(symbol: &str) -> Option<(&'static str, bool)> {
    Some(match symbol {
        "EURUSD.FOREX" => ("EUR", false),
        "GBPUSD.FOREX" => ("GBP", false),
        "AUDUSD.FOREX" => ("AUD", false),
        "NZDUSD.FOREX" => ("NZD", false),
        "USDJPY.FOREX" => ("JPY", true),
        "USDCHF.FOREX" => ("CHF", true),
        "USDCAD.FOREX" => ("CAD", true),
        _ => return None,
    })
}

// These are currency/US-dollar SPOT series, never relabelled as CME futures.
fn currency_series(series: &OpportunitySeries) -> Option<OpportunitySeries> {
    let (currency, inverted) = currency_definition(&series.source_symbol)?;
    let mut output = series.clone();
    output.symbol = currency.into();
    output.label = format!("{currency} gegenüber USD · Spot");
    output.currency = Some(currency.into());
    output.inverted = inverted;
    if inverted {
        output.prices = series
            .prices
            .iter()
            .map(|(date, price)| (*date, 1.0 / price))
            .collect();
    }
    Some(output)
}

#[tauri::command]
pub async fn get_seasonality_opportunities(
    state: State<'_, AppState>,
    input: OpportunityInput,
) -> CommandResult<OpportunityResponse> {
    opportunities_for_state(&state, input).await
}

pub async fn opportunities_for_state(
    state: &AppState,
    input: OpportunityInput,
) -> CommandResult<OpportunityResponse> {
    input.validate().map_err(CommandError::validation)?;
    if input.universe == OpportunityUniverse::FxFutures {
        let mut response = scan_opportunities(&[], &[], input);
        response.unavailable_reason = Some(
            "Für echte FX-Futures ist noch keine Tageskurshistorie angebunden. Der am 15.09.2026 geprüfte EODHD-Katalog enthält Forex-Spotpaare, aber keine passenden CME-FX-Futures. Für 6E, 6B, 6J, 6S, 6C, 6A und 6N werden Futures-Historien mit dokumentierter Kontrakt- und Rollbehandlung benötigt.".into(),
        );
        return Ok(response);
    }
    // Keep the entire read on one SQLite snapshot while the price scheduler updates.
    let mut tx = state.db.begin().await.map_err(AppError::from)?;
    let rows: Vec<Instrument> = sqlx::query_as(
        "SELECT provider_symbol,display_symbol,description,category FROM seasonality_provider_instruments WHERE provider='eodhd' ORDER BY display_symbol",
    ).fetch_all(&mut *tx).await.map_err(AppError::from)?;
    let mut instruments = Vec::new();
    let mut currencies = Vec::new();
    let mut excluded = Vec::new();
    for instrument in rows {
        if input.universe == OpportunityUniverse::Forex
            && (instrument.category != "Forex"
                || currency_definition(&instrument.provider_symbol).is_none())
        {
            continue;
        }
        let prices: Vec<(i64, f64)> = sqlx::query_as(
            "SELECT candle_time,mid_close FROM seasonality_provider_daily_candles WHERE provider='eodhd' AND provider_symbol=? ORDER BY candle_time",
        ).bind(&instrument.provider_symbol).fetch_all(&mut *tx).await.map_err(AppError::from)?;
        let parsed = prices
            .iter()
            .map(|(time, close)| {
                let date = Utc.timestamp_millis_opt(*time).single()?.date_naive();
                (close.is_finite() && *close > 0.0).then_some((date, *close))
            })
            .collect::<Option<BTreeMap<_, _>>>();
        let Some(prices) = parsed.filter(|values| !values.is_empty()) else {
            excluded.push(instrument.display_symbol);
            continue;
        };
        let series = OpportunitySeries {
            symbol: instrument.display_symbol.clone(),
            label: instrument.description.unwrap_or(instrument.display_symbol),
            currency: None,
            source: if instrument.category == "Forex" {
                "EODHD · Forex-Spot"
            } else {
                "EODHD · historische Tageskurse"
            }
            .into(),
            source_symbol: instrument.provider_symbol,
            inverted: false,
            prices,
        };
        if complete_years(&series.prices, &input).len() < input.min_years {
            excluded.push(series.symbol);
            continue;
        }
        if let Some(currency) = currency_series(&series) {
            currencies.push(currency.clone());
            if input.universe == OpportunityUniverse::Forex {
                instruments.push(currency);
            } else {
                instruments.push(series);
            }
        } else if input.universe == OpportunityUniverse::All {
            instruments.push(series);
        }
    }
    tx.commit().await.map_err(AppError::from)?;
    // CPU work does not hold a DB transaction or block the async command executor.
    tauri::async_runtime::spawn_blocking(move || {
        let mut response = scan_opportunities(&instruments, &currencies, input);
        response.excluded_symbols = excluded;
        response
    })
    .await
    .map_err(|_| {
        CommandError::validation("Die saisonale Fenstersuche konnte nicht abgeschlossen werden.")
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    #[test]
    fn currency_universe_contains_only_seven_explicit_usd_spot_series() {
        for symbol in [
            "EURUSD.FOREX",
            "GBPUSD.FOREX",
            "AUDUSD.FOREX",
            "NZDUSD.FOREX",
            "USDJPY.FOREX",
            "USDCHF.FOREX",
            "USDCAD.FOREX",
        ] {
            assert!(currency_definition(symbol).is_some());
        }
        for symbol in [
            "EURDKK.FOREX",
            "EURCNH.FOREX",
            "GBPAED.FOREX",
            "EURJPY.FOREX",
            "6E.US",
        ] {
            assert!(currency_definition(symbol).is_none());
        }
    }

    #[tokio::test]
    async fn futures_request_never_reads_or_substitutes_the_spot_database() {
        let state = AppState {
            db: sqlx::sqlite::SqlitePoolOptions::new()
                .connect_lazy("sqlite::memory:")
                .unwrap(),
            paths: crate::database::AppPaths::resolve_headless().unwrap(),
        };
        let input = OpportunityInput {
            as_of: NaiveDate::from_ymd_opt(2026, 9, 15).unwrap(),
            month: Some(9),
            universe: OpportunityUniverse::FxFutures,
            limit: 10,
            min_days: 7,
            max_days: 45,
            min_years: 10,
            lookback_years: 20,
            upcoming_only: false,
        };
        let result = opportunities_for_state(&state, input).await.unwrap();
        assert!(result.windows.is_empty());
        assert!(result.divergences.is_empty());
        assert_eq!(result.instrument_count, 0);
        assert!(result.unavailable_reason.unwrap().contains("FX-Futures"));
    }

    #[test]
    fn inverse_currency_uses_reciprocal_prices_not_negated_returns() {
        let a = NaiveDate::from_ymd_opt(2020, 1, 1).unwrap();
        let b = NaiveDate::from_ymd_opt(2020, 2, 1).unwrap();
        let series = OpportunitySeries {
            symbol: "USDJPY".into(),
            label: "USD/JPY".into(),
            currency: None,
            source: "EODHD · Forex-Spot".into(),
            source_symbol: "USDJPY.FOREX".into(),
            inverted: false,
            prices: [(a, 100.0), (b, 110.0)].into_iter().collect(),
        };
        let yen = currency_series(&series).unwrap();
        assert!((yen.prices[&b] / yen.prices[&a] - 1.0 + 1.0 / 11.0).abs() < 1e-12);
        assert_eq!(yen.symbol, "JPY");
        assert!(yen.inverted);
        assert!(yen.source.contains("Spot"));
        let mut unrelated = series;
        unrelated.source_symbol = "EURJPY.FOREX".into();
        assert!(currency_series(&unrelated).is_none());
    }
}
