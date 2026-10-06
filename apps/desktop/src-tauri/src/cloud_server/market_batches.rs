//! Explicit bounded scans. The browser advances a generation-bound cursor and
//! shows progress; opening a page never starts a scan of the entire library.
use super::market::MarketRuntime;
use crate::{
    cloud_public::{
        cache::ArtifactKind, manifest::PublishedManifest, seasonality_extended as analysis,
    },
    errors::{CommandError, CommandResult},
    metrics::seasonality_opportunities::OpportunityUniverse,
};
use serde_json::{Value, json};
use std::sync::{Arc, OnceLock};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
static COMPUTATIONS: OnceLock<Arc<Semaphore>> = OnceLock::new();

fn failure() -> CommandError {
    CommandError {
        code: "COMMAND_FAILED".into(),
        message: "Das geprüfte Analysepaket konnte nicht geladen werden.".into(),
        details: None,
    }
}

pub(super) async fn read(
    runtime: &MarketRuntime,
    manifest: &PublishedManifest,
    command: &str,
    args: &Value,
) -> CommandResult<Value> {
    let permit=Arc::new(COMPUTATIONS.get_or_init(||Arc::new(Semaphore::new(2))).clone().try_acquire_owned()
        .map_err(|_|CommandError{code:"COMMAND_FAILED".into(),message:"Es laufen bereits zwei umfangreiche Analysen. Versuche es nach deren Abschluss erneut.".into(),details:None})?);
    tokio::time::timeout(
        std::time::Duration::from_secs(75),
        read_batch(runtime, manifest, command, args, permit),
    )
    .await
    .map_err(|_| failure())?
}
async fn read_batch(
    runtime: &MarketRuntime,
    manifest: &PublishedManifest,
    command: &str,
    args: &Value,
    permit: Arc<OwnedSemaphorePermit>,
) -> CommandResult<Value> {
    let opportunity = command == "get_seasonality_opportunities_batch";
    let batch = analysis::validate_batch(args, opportunity)?;
    if batch.generation != manifest.manifest.generation {
        return Err(CommandError {
            code: "CONFLICT".into(),
            message: "Der Marktdatenstand wurde geändert. Bitte lade die Seite neu.".into(),
            details: None,
        });
    }
    let mut keys: Vec<_> = manifest
        .manifest
        .artifacts
        .iter()
        .filter(|item| item.kind == ArtifactKind::SeasonalitySymbol)
        .map(|item| item.key.clone())
        .collect();
    keys.sort();
    if let Some(input) = &batch.input {
        match input.universe {
            OpportunityUniverse::FxFutures => keys.clear(),
            OpportunityUniverse::Forex => keys.retain(|key| {
                key.strip_prefix("eodhd:")
                    .is_some_and(|symbol| analysis::USD_SPOT_SYMBOLS.contains(&symbol))
            }),
            OpportunityUniverse::All => {}
        }
    }
    if batch.cursor > keys.len() {
        return Err(CommandError::validation("Der Analyseschritt ist ungültig."));
    }
    let end = (batch.cursor + batch.limit).min(keys.len());
    let next = (end < keys.len()).then_some(end);
    let mut rows = Vec::new();
    let mut instruments = Vec::new();
    for key in &keys[batch.cursor..end] {
        let descriptor = manifest
            .descriptor(ArtifactKind::SeasonalitySymbol, key)
            .map_err(|_| failure())?;
        let shard = runtime.load(&descriptor).await.map_err(|_| failure())?;
        if opportunity {
            let result = analysis::series(&shard).await;
            shard.close().await;
            instruments.push(result?);
        } else {
            // Keep the lease until the native numerical stage and SQLite reader
            // have both ended, even when the waiting HTTP request is cancelled.
            let handle = tokio::runtime::Handle::current();
            let worker_permit = permit.clone();
            let screener_input = batch.screener_input.clone();
            let result = tokio::task::spawn_blocking(move || {
                handle.block_on(async move {
                    let _permit = worker_permit;
                    let result = analysis::screener(&shard, screener_input).await;
                    shard.close().await;
                    result
                })
            })
            .await
            .map_err(|_| failure())??;
            rows.extend(result);
        }
    }
    let mut output =
        json!({"generation":batch.generation,"nextCursor":next,"total":keys.len(),"completed":end});
    if let Some(input) = batch.input {
        let mut currencies = Vec::new();
        // Divergences need a common complete universe. Calculate them exactly
        // once, using all seven source histories from this same generation.
        if batch.cursor == 0 && input.universe != OpportunityUniverse::FxFutures {
            for symbol in analysis::USD_SPOT_SYMBOLS {
                let key = format!("eodhd:{symbol}");
                let Ok(descriptor) = manifest.descriptor(ArtifactKind::SeasonalitySymbol, &key)
                else {
                    continue;
                };
                let shard = runtime.load(&descriptor).await.map_err(|_| failure())?;
                let result = analysis::series(&shard).await;
                shard.close().await;
                currencies.push(result?);
            }
        }
        let calculation = tokio::task::spawn_blocking(move || {
            // Cancellation cannot stop spawn_blocking. Retain the permit and
            // its bounded histories until the computation itself has ended.
            let _permit = permit;
            analysis::opportunities(instruments, currencies, input)
        });
        let result = tokio::time::timeout(std::time::Duration::from_secs(50), calculation)
            .await
            .map_err(|_| failure())?
            .map_err(|_| failure())??;
        output["result"] = serde_json::to_value(result).map_err(|_| failure())?;
    } else {
        output["rows"] = serde_json::to_value(rows).map_err(|_| failure())?;
    }
    Ok(output)
}
