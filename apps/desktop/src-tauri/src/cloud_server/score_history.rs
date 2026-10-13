//! Public score observations persist independently of the personal journal.
//! Provider downloads and calculations never hold a PostgreSQL transaction.
use super::*;
use crate::{
    cloud_postgres::{CloudError, CloudResult},
    cloud_public::{cache::ArtifactKind, macro_readers, manifest::PublishedManifest},
    commands::{self, macro_scores, score_history as native},
};
use chrono::{DateTime, Utc};

pub(super) const COMMANDS: &[&str] = &[
    "get_macro_score_catalog",
    "get_macro_score_history",
    "record_macro_score_history",
];

fn unavailable() -> CloudError {
    CloudError::new(
        "SCORE_HISTORY_UNAVAILABLE",
        "Die Score-Historie konnte nicht geladen werden.",
    )
}
fn keys(args: &Value, allowed: &[&str]) -> CloudResult<()> {
    let Some(map) = args.as_object() else {
        return Err(CloudError::validation("Ungültige Score-Abfrage."));
    };
    if map.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(CloudError::validation("Ungültige Score-Abfrage."));
    }
    Ok(())
}

impl CloudServer {
    pub(super) async fn score_command(&self, request: CommandRequest) -> Outcome {
        let (revision, manifest) = match self.market_snapshot().await {
            Ok((revision, Some(manifest)))
                if self.market.is_some()
                    && market::capabilities(&manifest).contains(&request.command.as_str()) =>
            {
                (revision, manifest)
            }
            _ => {
                return failure(
                    StatusCode::NOT_FOUND,
                    "COMMAND_UNAVAILABLE",
                    "Die Score-Historie ist noch nicht angebunden.",
                    None,
                );
            }
        };
        let result = self
            .score_dispatch(&manifest, &request.command, &request.args)
            .await;
        let payload = match result {
            Ok(data) => json!({"ok":true,"data":data,"revision":revision}),
            Err(error) => {
                json!({"ok":false,"error":{"code":error.code,"message":error.message},"revision":revision})
            }
        };
        if payload.to_string().len() > MAX_RESPONSE_BYTES {
            return failure(
                StatusCode::OK,
                "RESPONSE_TOO_LARGE",
                "Bitte einen kürzeren Score-Zeitraum wählen.",
                Some(revision),
            );
        }
        (StatusCode::OK, payload)
    }

    async fn score_dispatch(
        &self,
        manifest: &PublishedManifest,
        command: &str,
        args: &Value,
    ) -> CloudResult<Value> {
        keys(
            args,
            if command == "get_macro_score_history" {
                &["generation", "input"]
            } else {
                &["generation"]
            },
        )?;
        if let Some(generation) = args.get("generation")
            && generation.as_str() != Some(&manifest.manifest.generation)
        {
            return Err(CloudError::new(
                "CONFLICT",
                "Der Marktdatenstand hat sich geändert. Bitte neu laden.",
            ));
        }
        match command {
            "get_macro_score_catalog" => {
                serde_json::to_value(macro_scores::instruments()).map_err(|_| unavailable())
            }
            "record_macro_score_history" => self.capture_cloud_scores().await,
            "get_macro_score_history" => {
                let input: commands::MacroScoreHistoryInput =
                    serde_json::from_value(args.get("input").cloned().ok_or_else(|| {
                        CloudError::validation("Bitte einen Markt und Zeitraum wählen.")
                    })?)
                    .map_err(|_| {
                        CloudError::validation("Bitte einen gültigen Markt und Zeitraum wählen.")
                    })?;
                self.read_cloud_scores(manifest, input).await
            }
            _ => Err(unavailable()),
        }
    }

    pub(super) async fn capture_cloud_scores(&self) -> CloudResult<Value> {
        let (_, manifest) = self.market_snapshot().await.map_err(|_| unavailable())?;
        let Some(manifest) = manifest else {
            return Ok(json!({"inserted":0,"archiveCompleted":true}));
        };
        let Some(runtime) = &self.market else {
            return Ok(json!({"inserted":0,"archiveCompleted":true}));
        };
        let descriptor = manifest
            .descriptor(ArtifactKind::Macro, "eodhd:macro")
            .map_err(|_| unavailable())?;
        let shard = runtime.load(&descriptor).await.map_err(|_| unavailable())?;
        let now = Utc::now();
        let result =
            native::prepare_score_capture_at(&macro_readers::shard_state(&shard), now).await;
        shard.close().await;
        let Some(prepared) = result.map_err(|_| unavailable())? else {
            return Ok(json!({"inserted":0,"archiveCompleted":true}));
        };
        self.store_cloud_scores(&manifest.manifest.generation, prepared)
            .await
    }

    async fn store_cloud_scores(
        &self,
        generation: &str,
        prepared: native::PreparedScoreCapture,
    ) -> CloudResult<Value> {
        let mut tx = self.pool.begin().await?;
        self.scope(&mut tx).await?;
        // Serialize with public-generation publication; a late calculation may
        // neither label old data as current nor replace a newer observation.
        let active: Option<String> =
            sqlx::query_scalar("SELECT generation FROM cloud_public_active WHERE id=1 FOR SHARE")
                .fetch_optional(&mut *tx)
                .await?;
        if active.as_deref() != Some(generation) {
            return Err(CloudError::new(
                "CONFLICT",
                "Der Marktdatenstand hat sich geändert. Bitte erneut erfassen.",
            ));
        }
        let claimed = sqlx::query("UPDATE cloud_score_state SET last_day=$1,last_snapshot_id=$2,last_fingerprint=$3,last_observed_at=$4,last_started_at_ms=$5 WHERE id=1 AND (last_started_at_ms IS NULL OR last_started_at_ms<=$5) AND (COALESCE(last_day,'')!=$1 OR COALESCE(last_snapshot_id,'')!=$2 OR COALESCE(last_fingerprint,'')!=$3)")
            .bind(&prepared.day).bind(&prepared.snapshot_id).bind(&prepared.fingerprint).bind(prepared.observed_at).bind(prepared.started_at_ms).execute(&mut *tx).await?.rows_affected();
        if claimed == 0 {
            tx.rollback().await?;
            return Ok(json!({"inserted":0,"archiveCompleted":true}));
        }
        let key = format!("cloud:{}:{}", prepared.started_at_ms, Uuid::new_v4());
        let evidence: serde_json::Map<String, Value> = prepared
            .observations
            .iter()
            .map(|(asset, _)| {
                serde_json::to_value(&asset.contributions)
                    .map(|value| (asset.instrument.id.clone(), value))
            })
            .collect::<Result<_, _>>()
            .map_err(|_| unavailable())?;
        sqlx::query("INSERT INTO cloud_score_batches(observation_key,observed_at,snapshot_id,generation,model_version,origin,evidence_json) VALUES($1,$2,$3,$4,$5,'cloud_captured',$6)")
            .bind(&key).bind(prepared.observed_at).bind(&prepared.snapshot_id).bind(generation).bind(macro_scores::MODEL_VERSION).bind(Value::Object(evidence).to_string()).execute(&mut *tx).await?;
        let mut inserted = 0;
        for (asset, expiry) in prepared.observations {
            inserted += sqlx::query("INSERT INTO cloud_score_points(instrument_id,observation_key,observed_at,valid_until,score,available_components,total_components) VALUES($1,$2,$3,$4,$5,$6,$7)")
                .bind(&asset.instrument.id).bind(&key).bind(prepared.observed_at).bind(expiry).bind(asset.score).bind(asset.available_components as i32).bind(asset.total_components as i32).execute(&mut *tx).await?.rows_affected();
        }
        tx.commit().await?;
        Ok(json!({"inserted":inserted,"archiveCompleted":true}))
    }

    async fn read_cloud_scores(
        &self,
        manifest: &PublishedManifest,
        input: commands::MacroScoreHistoryInput,
    ) -> CloudResult<Value> {
        let now = Utc::now();
        let (instrument, from, to) = native::bounds(&input, now)
            .map_err(|error| CloudError::new(&error.code, &error.message))?;
        let mut tx = self.pool.begin().await?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            .execute(&mut *tx)
            .await?;
        self.scope(&mut tx).await?;
        // Historical contributions are loaded only for the last observation,
        // not multiplied across every point in a five-year response.
        let mut points: Vec<commands::MacroScoreHistoryPoint> = sqlx::query_as("SELECT p.observation_key,p.observed_at,p.valid_until,b.snapshot_id,b.model_version,b.origin,p.score,p.available_components::bigint AS available_components,p.total_components::bigint AS total_components,'' AS evidence_json FROM cloud_score_points p JOIN cloud_score_batches b USING(observation_key) WHERE p.instrument_id=$1 AND p.observed_at>=$2 AND p.observed_at<$3 AND p.observed_at<=$4 ORDER BY p.observed_at,p.observation_key LIMIT 10001")
            .bind(&instrument.id).bind(from).bind(to).bind(now.timestamp()).fetch_all(&mut *tx).await?;
        if points.len() > 10000 {
            return Err(CloudError::validation(
                "Bitte einen Zeitraum mit höchstens 10.000 Beobachtungen wählen.",
            ));
        }
        let predecessor: Option<commands::MacroScoreHistoryPoint> = sqlx::query_as("SELECT p.observation_key,p.observed_at,p.valid_until,b.snapshot_id,b.model_version,b.origin,p.score,p.available_components::bigint AS available_components,p.total_components::bigint AS total_components,'' AS evidence_json FROM cloud_score_points p JOIN cloud_score_batches b USING(observation_key) WHERE p.instrument_id=$1 AND p.observed_at<$2 AND p.valid_until>$2 ORDER BY p.observed_at DESC,p.observation_key DESC LIMIT 1")
            .bind(&instrument.id).bind(from).fetch_optional(&mut *tx).await?;
        if let Some(point) = predecessor {
            points.insert(0, point);
        }
        let earliest: Option<i64> = sqlx::query_scalar(
            "SELECT MIN(observed_at) FROM cloud_score_points WHERE instrument_id=$1",
        )
        .bind(&instrument.id)
        .fetch_one(&mut *tx)
        .await?;
        let latest_contributions = if let Some(point) = points.last() {
            let evidence: String = sqlx::query_scalar(
                "SELECT evidence_json FROM cloud_score_batches WHERE observation_key=$1",
            )
            .bind(&point.observation_key)
            .fetch_one(&mut *tx)
            .await?;
            let evidence: Value = serde_json::from_str(&evidence).map_err(|_| unavailable())?;
            serde_json::from_value(
                evidence
                    .get(&instrument.id)
                    .cloned()
                    .ok_or_else(unavailable)?,
            )
            .map_err(|_| unavailable())?
        } else {
            vec![]
        };
        let source: Option<(String,i64,String)> = sqlx::query_as("SELECT id,imported_at,source_json FROM cloud_score_price_snapshots WHERE instrument_id=$1 ORDER BY imported_at DESC,id DESC LIMIT 1").bind(&instrument.id).fetch_optional(&mut *tx).await?;
        let mut candles: Vec<commands::ScoreDailyCandle> = vec![];
        let mut price_source = None;
        if let Some((id, imported_at, source)) = source {
            candles = sqlx::query_as("SELECT time,open,high,low,close FROM cloud_score_daily_prices WHERE snapshot_id=$1 AND time>=$2 AND time<$3 AND time+86400<=$4 ORDER BY time LIMIT 2000").bind(id).bind(from).bind(to).bind(now.timestamp()).fetch_all(&mut *tx).await?;
            if !candles.is_empty() {
                let mut parsed: commands::ScorePriceSource =
                    serde_json::from_str(&source).map_err(|_| unavailable())?;
                parsed.imported_at =
                    DateTime::from_timestamp(imported_at, 0).map(|t| t.to_rfc3339());
                price_source = Some(parsed);
            }
        }
        tx.rollback().await?;
        if candles.is_empty()
            && let Some(runtime) = &self.market
        {
            let symbols =
                instrument
                    .price_symbol
                    .iter()
                    .cloned()
                    .chain((instrument.kind == "forex").then(|| {
                        format!(
                            "{}{}.FOREX",
                            instrument.quote.as_deref().unwrap_or(""),
                            instrument.base
                        )
                    }));
            for symbol in symbols {
                let Ok(descriptor) = manifest
                    .descriptor(ArtifactKind::SeasonalitySymbol, &format!("eodhd:{symbol}"))
                else {
                    continue;
                };
                let shard = runtime.load(&descriptor).await.map_err(|_| unavailable())?;
                // The reviewed seasonality-symbol schema contains mid_close
                // only. Preserve that contract; OHLC comes from explicit D1
                // imports and is never reconstructed from a closing price.
                let prices =
                    public_daily_closes(shard.pool(), &symbol, from, to, now.timestamp()).await;
                shard.close().await;
                candles = prices.map_err(|_| unavailable())?;
                let inverted = instrument.price_symbol.as_deref() != Some(&symbol);
                if inverted {
                    for candle in &mut candles {
                        let value = 1.0 / candle.close;
                        candle.open = value;
                        candle.high = value;
                        candle.low = value;
                        candle.close = value;
                    }
                }
                if !candles.is_empty() {
                    price_source = Some(commands::ScorePriceSource {
                        provider: "eodhd".into(),
                        symbol,
                        label: "EODHD Daily-Schlusskurs · Quellen-Kalendertag".into(),
                        inverted,
                        data_kind: "close".into(),
                        unit: native::price_unit(&instrument),
                        imported_at: Some(manifest.manifest.created_at.clone()),
                    });
                }
                if !candles.is_empty() {
                    break;
                }
            }
        }
        let mut reason_codes = vec![];
        if points.is_empty() {
            reason_codes.push("no_recorded_scores_in_range".into());
        }
        if candles.is_empty() && instrument.kind != "currency" {
            reason_codes.push("daily_prices_unavailable".into());
        }
        let response = commands::MacroScoreHistoryResponse {
            instrument,
            as_of: now.to_rfc3339(),
            model_version: macro_scores::MODEL_VERSION.into(),
            points,
            candles,
            price_source,
            latest_contributions,
            earliest_observation_at: earliest,
            reason_codes,
            from: input.from,
            to: input.to,
        };
        let mut value = serde_json::to_value(response).map_err(|_| unavailable())?;
        value["cloudGeneration"] = json!(manifest.manifest.generation);
        value["cloudImportedAt"] = json!(manifest.manifest.created_at);
        Ok(value)
    }
}

#[cfg(test)]
mod tests;

async fn public_daily_closes(
    pool: &sqlx::SqlitePool,
    symbol: &str,
    from: i64,
    to: i64,
    now: i64,
) -> Result<Vec<commands::ScoreDailyCandle>, sqlx::Error> {
    sqlx::query_as("SELECT candle_time/1000 AS time,mid_close AS open,mid_close AS high,mid_close AS low,mid_close AS close FROM seasonality_provider_daily_candles WHERE provider='eodhd' AND provider_symbol=? AND candle_time>=? AND candle_time<? AND candle_time+86400000<=? ORDER BY candle_time LIMIT 2000")
        .bind(symbol).bind(from*1000).bind(to*1000).bind(now*1000).fetch_all(pool).await
}
