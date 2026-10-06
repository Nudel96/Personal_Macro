//! Public market snapshots have their own pinned generation. Downloading and
//! calculating must never hold a PostgreSQL transaction or a journal write lock.
use crate::cloud_public::{
    atlas_readers,
    cache::{ArtifactKind, PrivateBlobReader, PublicCacheLoader},
    macro_readers,
    manifest::PublishedManifest,
    readers,
};
use serde_json::{Value, json};
use std::collections::HashSet;

pub(super) fn is_command(command: &str) -> bool {
    readers::COMMANDS.contains(&command)
        || macro_readers::COMMANDS.contains(&command)
        || atlas_readers::COMMANDS.contains(&command)
        || matches!(
            command,
            "get_central_bank_reports"
                | "get_central_bank_report"
                | "get_seasonality_forex_pairs"
                | "get_seasonality_screener_batch"
                | "get_seasonality_opportunities_batch"
        )
}

pub(super) struct MarketRuntime {
    reader: PrivateBlobReader,
    loader: PublicCacheLoader,
    #[cfg(test)]
    test_loader: Option<TestLoader>,
}

#[cfg(test)]
pub(super) type TestLoader = std::sync::Arc<
    dyn Fn(
            crate::cloud_public::cache::DownloadDescriptor,
        ) -> futures_util::future::BoxFuture<
            'static,
            Result<crate::cloud_public::cache::LoadedShard, crate::cloud_public::cache::CacheError>,
        > + Send
        + Sync,
>;

impl MarketRuntime {
    pub(super) fn from_env() -> Result<Option<Self>, super::AnyError> {
        let Ok(origin) = std::env::var("MACRO_PUBLIC_BLOB_ORIGIN") else {
            return Ok(None);
        };
        let token = std::env::var("BLOB_READ_WRITE_TOKEN")
            .map_err(|_| "Privater Marktdatenspeicher nicht konfiguriert")?;
        Ok(Some(Self {
            reader: PrivateBlobReader::new(&origin, token)?,
            loader: PublicCacheLoader::new(std::env::temp_dir().join("macro-public-cache"))?,
            #[cfg(test)]
            test_loader: None,
        }))
    }

    #[cfg(test)]
    pub(super) fn with_test_loader(
        test_loader: TestLoader,
        cache_root: std::path::PathBuf,
    ) -> Result<Self, super::AnyError> {
        Ok(Self {
            reader: PrivateBlobReader::new(
                "https://synthetic.private.blob.vercel-storage.com",
                "synthetic-never-sent".into(),
            )?,
            loader: PublicCacheLoader::new(cache_root)?,
            test_loader: Some(test_loader),
        })
    }

    pub(super) async fn load(
        &self,
        descriptor: &crate::cloud_public::cache::DownloadDescriptor,
    ) -> Result<crate::cloud_public::cache::LoadedShard, crate::cloud_public::cache::CacheError>
    {
        #[cfg(test)]
        if let Some(load) = &self.test_loader {
            return load(descriptor.clone()).await;
        }
        self.reader.load(&self.loader, descriptor).await
    }

    pub(super) async fn read(
        &self,
        manifest: &PublishedManifest,
        command: &str,
        args: &Value,
    ) -> Result<Value, crate::errors::CommandError> {
        if args
            .get("generation")
            .is_some_and(|value| value.as_str() != Some(&manifest.manifest.generation))
        {
            return Err(error(
                "CONFLICT",
                "Der Marktdatenstand wurde geändert. Bitte lade die Auswahl neu.",
            ));
        }
        if matches!(
            command,
            "get_seasonality_screener_batch" | "get_seasonality_opportunities_batch"
        ) {
            return super::market_batches::read(self, manifest, command, args).await;
        }
        readers::validate(command, args)?;
        let (kind, key) = match command {
            name if macro_readers::COMMANDS.contains(&name) => {
                macro_readers::artifact(command, args)?
            }
            name if atlas_readers::COMMANDS.contains(&name) => {
                atlas_readers::artifact(command, args)?
            }
            "get_central_bank_reports" | "get_central_bank_report" => (
                ArtifactKind::CentralBankReports,
                "official:central-bank-reports".into(),
            ),
            "get_seasonality_forex_pairs" => {
                (ArtifactKind::SeasonalityIndex, "eodhd:seasonality".into())
            }
            "get_policy_rates" => (ArtifactKind::Rates, "eodhd:policy-rates".to_owned()),
            "get_seasonality" => (
                ArtifactKind::SeasonalityIndex,
                "eodhd:seasonality".to_owned(),
            ),
            "get_seasonality_asset_detail" | "analyze_seasonality" => {
                if args.get("generation").and_then(Value::as_str)
                    != Some(manifest.manifest.generation.as_str())
                {
                    return Err(error(
                        "CONFLICT",
                        "Der Marktdatenstand wurde geändert. Bitte lade die Auswahl neu.",
                    ));
                }
                let symbol = if command == "analyze_seasonality" {
                    args.get("input").and_then(|v| v.get("symbol"))
                } else {
                    args.get("symbol")
                }
                .and_then(Value::as_str)
                .ok_or_else(|| error("VALIDATION_ERROR", "Bitte wähle ein gültiges Symbol."))?;
                let key = self.symbol_key(manifest, symbol).await?;
                (ArtifactKind::SeasonalitySymbol, key)
            }
            _ => {
                return Err(error(
                    "COMMAND_UNAVAILABLE",
                    "Diese Marktansicht ist noch nicht verfügbar.",
                ));
            }
        };
        let descriptor = manifest.descriptor(kind, &key).map_err(|_| {
            error(
                "NOT_FOUND",
                "Diese Marktreihe wurde noch nicht in den privaten Cloud-Speicher übernommen.",
            )
        })?;
        let shard = self.load(&descriptor).await
            .map_err(|_| error("COMMAND_FAILED", "Das geprüfte Marktdatenpaket konnte nicht geladen werden. Bitte versuche es erneut."))?;
        // Native analysis has a synchronous numerical stage. A maximum of two
        // disk leases also bounds blocking workers. On timeout/cancellation the
        // worker retains its lease until it really ends and closes SQLite.
        let command_owned = command.to_owned();
        let args_owned = args.clone();
        let handle = tokio::runtime::Handle::current();
        let calculation = tokio::task::spawn_blocking(move || {
            handle.block_on(async move {
            let symbol_names = if command_owned == "get_seasonality" {
                Some(sqlx::query_as::<_, (String, String)>(
                    "SELECT display_symbol,provider_symbol FROM seasonality_provider_instruments WHERE provider='eodhd'"
                ).fetch_all(shard.pool()).await)
            } else { None };
            let result = readers::read(&command_owned, &args_owned, &shard).await;
            shard.close().await;
            (result, symbol_names)
        })
        });
        let (result, symbol_names) =
            tokio::time::timeout(std::time::Duration::from_secs(50), calculation)
                .await
                .map_err(|_| {
                    error(
                        "COMMAND_FAILED",
                        "Die Analyse benötigt zu lange. Bitte schränke die Auswahl ein.",
                    )
                })?
                .map_err(|_| unavailable())?;
        let mut result = result?;
        if command == "get_seasonality" {
            let provider_symbols: HashSet<&str> = manifest
                .manifest
                .artifacts
                .iter()
                .filter(|artifact| artifact.kind == ArtifactKind::SeasonalitySymbol)
                .filter_map(|artifact| artifact.key.strip_prefix("eodhd:"))
                .collect();
            let symbols: HashSet<String> = symbol_names
                .ok_or_else(unavailable)?
                .map_err(|_| unavailable())?
                .into_iter()
                .filter(|(_, provider)| provider_symbols.contains(provider.as_str()))
                .map(|(display, _)| display)
                .collect();
            for field in ["assets", "items"] {
                if let Some(rows) = result.get_mut(field).and_then(Value::as_array_mut) {
                    rows.retain(|row| {
                        row.get("symbol")
                            .and_then(Value::as_str)
                            .is_some_and(|symbol| symbols.contains(symbol))
                    });
                }
            }
            result["dataVersion"] = json!(manifest.manifest.generation);
            result["collectionCompleted"] = json!(symbols.len());
            result["collectionTotal"] = json!(symbols.len());
            result["collectionStatus"] = json!("snapshot");
            result["collectionError"] = Value::Null;
        }
        if result.is_object() {
            result["cloudGeneration"] = json!(manifest.manifest.generation);
            result["cloudImportedAt"] = json!(manifest.manifest.created_at);
        }
        Ok(result)
    }

    async fn symbol_key(
        &self,
        manifest: &PublishedManifest,
        symbol: &str,
    ) -> Result<String, crate::errors::CommandError> {
        if symbol.is_empty() || symbol.len() > 128 || symbol.chars().any(char::is_control) {
            return Err(error(
                "VALIDATION_ERROR",
                "Bitte wähle ein gültiges Symbol.",
            ));
        }
        // Display symbols (e.g. EUR/USD) are not provider identifiers. Resolve
        // exclusively through the verified catalog of this pinned generation.
        let index = manifest
            .descriptor(ArtifactKind::SeasonalityIndex, "eodhd:seasonality")
            .map_err(|_| unavailable())?;
        let shard = self.load(&index).await.map_err(|_| unavailable())?;
        let rows = sqlx::query_scalar::<_, String>(
            "SELECT provider_symbol FROM seasonality_provider_instruments WHERE provider='eodhd' AND (lower(display_symbol)=lower(?) OR lower(provider_symbol)=lower(?))"
        ).bind(symbol.trim()).bind(symbol.trim()).fetch_all(shard.pool()).await;
        shard.close().await;
        let rows: Vec<String> = rows
            .map_err(|_| unavailable())?
            .into_iter()
            .filter(|provider| {
                manifest.manifest.artifacts.iter().any(|artifact| {
                    artifact.kind == ArtifactKind::SeasonalitySymbol
                        && artifact.key == format!("eodhd:{provider}")
                })
            })
            .collect();
        if rows.len() != 1 {
            return Err(error(
                "NOT_FOUND",
                "Die ausgewählte Marktreihe ist nicht eindeutig verfügbar.",
            ));
        }
        Ok(format!("eodhd:{}", rows[0]))
    }
}

pub(super) fn capabilities(manifest: &PublishedManifest) -> Vec<&'static str> {
    let has = |kind| {
        manifest
            .manifest
            .artifacts
            .iter()
            .any(|artifact| artifact.kind == kind)
    };
    let mut commands = Vec::new();
    if has(ArtifactKind::Rates) {
        commands.push("get_policy_rates");
    }
    if has(ArtifactKind::SeasonalityIndex) && has(ArtifactKind::SeasonalitySymbol) {
        commands.extend([
            "get_seasonality",
            "get_seasonality_asset_detail",
            "analyze_seasonality",
            "get_seasonality_forex_pairs",
            "get_seasonality_screener_batch",
            "get_seasonality_opportunities_batch",
        ]);
    }
    for &command in macro_readers::COMMANDS {
        let kind = match command {
            "get_cot_dashboard" | "get_cot_asset_detail" => ArtifactKind::Cot,
            "get_pair_technical_signals" => ArtifactKind::Technicals,
            "get_aud_china_cpi_regime" => ArtifactKind::Regime,
            _ => ArtifactKind::Macro,
        };
        if has(kind) {
            commands.push(command);
        }
    }
    for &command in atlas_readers::COMMANDS {
        if command.starts_with("get_government_bond") {
            if has(ArtifactKind::Bonds) {
                commands.push(command);
            }
        } else {
            let suffix = command.strip_prefix("get_atlas_").unwrap_or("");
            let family = if suffix == "public_source" {
                "public"
            } else {
                suffix
            };
            if manifest.manifest.artifacts.iter().any(|artifact| {
                artifact.kind == ArtifactKind::Atlas
                    && atlas_readers::schema_family(artifact.kind, &artifact.key).ok()
                        == Some(family)
            }) {
                commands.push(command);
            }
        }
    }
    if has(ArtifactKind::CentralBankReports) {
        commands.extend(["get_central_bank_reports", "get_central_bank_report"]);
    }
    commands
}

fn error(code: &str, message: &str) -> crate::errors::CommandError {
    crate::errors::CommandError {
        code: code.into(),
        message: message.into(),
        details: None,
    }
}

fn unavailable() -> crate::errors::CommandError {
    error(
        "COMMAND_FAILED",
        "Das geprüfte Marktdatenverzeichnis konnte nicht geladen werden.",
    )
}
