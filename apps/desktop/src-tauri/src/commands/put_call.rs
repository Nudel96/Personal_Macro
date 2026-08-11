use chrono::{NaiveDate, Utc};
use serde::Serialize;
use sqlx::SqlitePool;

use crate::errors::AppError;

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
}
