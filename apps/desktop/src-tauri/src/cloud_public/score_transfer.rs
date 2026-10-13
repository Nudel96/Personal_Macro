//! Explicit public-only transfer. The exporter selects named score columns and
//! reuses the native D1 reader; no account, credential or personal table is read.
use crate::{
    cloud_postgres::{CloudError, CloudResult},
    commands::{self, macro_scores, score_history as native},
    database::AppState,
};
use chrono::{DateTime, Utc};
use serde_json::{Value, json};

pub async fn export(state: &AppState, now: DateTime<Utc>) -> CloudResult<Value> {
    #[derive(sqlx::FromRow)]
    struct ExportRow {
        instrument_id: String,
        #[sqlx(flatten)]
        point: commands::MacroScoreHistoryPoint,
    }
    let rows: Vec<ExportRow> = sqlx::query_as("SELECT instrument_id,observation_key,observed_at,valid_until,snapshot_id,model_version,origin,score,available_components,total_components,evidence_json FROM macro_score_history WHERE observed_at<=? ORDER BY observed_at,observation_key,instrument_id LIMIT 100001")
        .bind(now.timestamp()).fetch_all(&state.db).await.map_err(|_| CloudError::new("SCORE_EXPORT_OBSERVATIONS", "Öffentliche Beobachtungen konnten nicht gelesen werden."))?;
    if rows.len() > 100000 {
        return Err(CloudError::validation(
            "Zu viele Score-Beobachtungen für die Übernahme.",
        ));
    }
    let observations: Vec<Value> = rows
        .into_iter()
        .map(|row| {
            let point = row.point;
            let evidence: Value = serde_json::from_str(&point.evidence_json)
                .map_err(|_| CloudError::validation("Ungültige Score-Beiträge."))?;
            let mut value = serde_json::to_value(point)
                .map_err(|_| CloudError::validation("Ungültige Score-Beobachtung."))?;
            value["instrumentId"] = json!(row.instrument_id);
            value["contributions"] = evidence;
            Ok(value)
        })
        .collect::<CloudResult<_>>()?;
    let mut prices = vec![];
    for instrument in macro_scores::instruments()
        .into_iter()
        .filter(|i| i.kind != "currency")
    {
        let (candles, source) = native::daily_prices(
            state,
            &instrument,
            now.timestamp() - 366 * 5 * 86400,
            now.timestamp(),
            now.timestamp(),
        )
        .await
        .map_err(|_| {
            CloudError::new(
                "SCORE_EXPORT_PRICES",
                "Daily-Kurse konnten nicht gelesen werden.",
            )
        })?;
        // Existing seasonality cloud shards retain only mid_close. Transfer
        // available native OHLC explicitly, with its original source contract.
        if let Some(source) = source {
            prices.push(json!({"instrumentId":instrument.id,"source":source,"candles":candles}));
        }
    }
    Ok(
        json!({"format":"public-score-transfer-v1","exportedAt":now.timestamp(),"modelVersion":macro_scores::MODEL_VERSION,"observations":observations,"prices":prices}),
    )
}
