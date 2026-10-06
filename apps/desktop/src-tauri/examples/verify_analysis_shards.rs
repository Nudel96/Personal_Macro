//! Offline verification of explicitly exported, audited public SQLite packages.
//! Run with --no-default-features --features postgres --example verify_analysis_shards
//! -- --manifest <absolute external manifest.json>. No environment secrets, live
//! database, provider, cloud client, migrations or application startup are used.
//! The manifest and its hash-named SQLite files must be siblings. Only metadata
//! is printed; a false result or process exit 1 must prevent publication.

#[cfg(not(all(feature = "postgres", not(feature = "desktop"))))]
fn main() {
    println!(
        "{{\"kind\":\"validation\",\"key\":\"features\",\"success\":false,\"rows\":0,\"responseBytes\":0,\"durationMs\":0}}"
    );
    std::process::exit(1);
}

#[cfg(all(feature = "postgres", not(feature = "desktop")))]
#[tokio::main]
async fn main() {
    use futures_util::FutureExt;
    // A panic must not print a SQL error, a local path or a report payload.
    std::panic::set_hook(Box::new(|_| {}));
    let result = std::panic::AssertUnwindSafe(verify::run())
        .catch_unwind()
        .await;
    if !matches!(result, Ok(Ok(true))) {
        verify::failure();
        std::process::exit(1);
    }
}

#[cfg(all(feature = "postgres", not(feature = "desktop")))]
mod verify {
    use flate2::{Compression, write::GzEncoder};
    use futures_util::stream;
    use personal_macro_desktop_lib::{
        cloud_public::{
            atlas_readers,
            cache::{
                Artifact, ArtifactKind, DownloadDescriptor, Encoding, LoadedShard,
                MAX_MANIFEST_BYTES, MAX_TRANSFER_BYTES, Manifest, PublicCacheLoader,
            },
            readers, schema,
        },
        world_atlas,
    };
    use serde_json::{Value, json};
    use sha2::{Digest, Sha256};
    use std::{
        collections::HashSet,
        ffi::OsString,
        fs::{File, Metadata, OpenOptions},
        io::{Read, Write},
        path::{Component, Path, PathBuf},
        time::{Duration, Instant},
    };

    type Result<T> = std::result::Result<T, ()>;
    // Match the gateway/cloud response limit; incoming commands remain 2 MiB.
    const MAX_RESPONSE_BYTES: u64 = 4 * 1024 * 1024;

    pub fn failure() {
        emit("validation", "manifest", false, 0, 0, 0);
    }
    fn emit(kind: &str, key: &str, success: bool, rows: u64, bytes: u64, ms: u128) {
        println!(
            "{}",
            json!({"kind":kind,"key":key,"success":success,
            "rows":rows,"responseBytes":bytes,"durationMs":ms})
        );
    }
    fn parse_arguments(mut args: impl Iterator<Item = OsString>) -> Result<PathBuf> {
        if args.next().as_deref() != Some(std::ffi::OsStr::new("--manifest")) {
            return Err(());
        }
        let path = PathBuf::from(args.next().ok_or(())?);
        if args.next().is_some() || !path.is_absolute() {
            return Err(());
        }
        Ok(path)
    }
    fn linked(metadata: &Metadata) -> bool {
        if metadata.file_type().is_symlink() {
            return true;
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return true;
            }
        }
        false
    }
    fn outside_repository(path: &Path) -> Result<()> {
        let repository = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../..")
            .canonicalize()
            .map_err(|_| ())?;
        if path.starts_with(&repository) {
            return Err(());
        }
        // Disallow active application data, including backups, and Codex input
        // attachments. This verifier accepts only an explicit export directory.
        if path.components().any(|part| {
            part.as_os_str().to_str().is_some_and(|s| {
                [
                    "personalmacro",
                    "com.personal-macro.app",
                    "codex-remote-attachments",
                ]
                .iter()
                .any(|name| s.eq_ignore_ascii_case(name))
            })
        }) {
            return Err(());
        }
        Ok(())
    }
    fn checked_path(path: &Path, parent: Option<&Path>) -> Result<PathBuf> {
        if !path.is_absolute() || path.components().any(|c| matches!(c, Component::ParentDir)) {
            return Err(());
        }
        for ancestor in path.ancestors() {
            if linked(&std::fs::symlink_metadata(ancestor).map_err(|_| ())?) {
                return Err(());
            }
        }
        let canonical = path.canonicalize().map_err(|_| ())?;
        outside_repository(&canonical)?;
        if parent.is_some_and(|expected| canonical.parent() != Some(expected)) {
            return Err(());
        }
        if !std::fs::metadata(&canonical).map_err(|_| ())?.is_file() {
            return Err(());
        }
        Ok(canonical)
    }
    fn one_link(file: &File) -> Result<()> {
        #[cfg(windows)]
        {
            use std::os::windows::io::AsRawHandle;
            use windows_sys::Win32::Storage::FileSystem::{
                BY_HANDLE_FILE_INFORMATION, GetFileInformationByHandle,
            };
            let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
            if unsafe { GetFileInformationByHandle(file.as_raw_handle() as _, &mut info) } == 0
                || info.nNumberOfLinks != 1
                || info.dwFileAttributes & 0x400 != 0
            {
                return Err(());
            }
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if file.metadata().map_err(|_| ())?.nlink() != 1 {
                return Err(());
            }
        }
        Ok(())
    }
    fn open_file(path: &Path, parent: Option<&Path>) -> Result<(File, Metadata)> {
        let canonical = checked_path(path, parent)?;
        let mut options = OpenOptions::new();
        options.read(true);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            options.share_mode(1).custom_flags(0x0020_0000); // read sharing; do not follow reparse points
        }
        let file = options.open(&canonical).map_err(|_| ())?;
        one_link(&file)?;
        let metadata = file.metadata().map_err(|_| ())?;
        if !metadata.is_file() || linked(&metadata) {
            return Err(());
        }
        Ok((file, metadata))
    }
    fn unchanged(file: &File, before: &Metadata) -> Result<()> {
        let after = file.metadata().map_err(|_| ())?;
        if before.len() != after.len() || before.modified().ok() != after.modified().ok() {
            return Err(());
        }
        one_link(file)
    }
    struct BoundedBytes {
        bytes: Vec<u8>,
        maximum: usize,
    }
    impl Write for BoundedBytes {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            if buf.len() > self.maximum.saturating_sub(self.bytes.len()) {
                return Err(std::io::Error::other("limit"));
            }
            self.bytes.extend_from_slice(buf);
            Ok(buf.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    fn local_transport(root: &Path, artifact: &Artifact) -> Result<Vec<u8>> {
        let path = root.join(&artifact.file_name);
        for suffix in ["-wal", "-shm", "-journal"] {
            if std::fs::symlink_metadata(root.join(format!("{}{suffix}", artifact.file_name)))
                .is_ok()
            {
                return Err(());
            }
        }
        let (mut file, before) = open_file(&path, Some(root))?;
        if before.len() != artifact.size_bytes {
            return Err(());
        }
        let mut encoder = GzEncoder::new(
            BoundedBytes {
                bytes: Vec::new(),
                maximum: MAX_TRANSFER_BYTES as usize,
            },
            Compression::default(),
        );
        let mut hash = Sha256::new();
        let mut length = 0_u64;
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            let count = file.read(&mut buffer).map_err(|_| ())?;
            if count == 0 {
                break;
            }
            length = length.checked_add(count as u64).ok_or(())?;
            if length > artifact.size_bytes {
                return Err(());
            }
            hash.update(&buffer[..count]);
            encoder.write_all(&buffer[..count]).map_err(|_| ())?;
        }
        unchanged(&file, &before)?;
        if length != artifact.size_bytes || hex(&hash.finalize()) != artifact.sha256 {
            return Err(());
        }
        Ok(encoder.finish().map_err(|_| ())?.bytes)
    }
    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    struct Scratch(PathBuf);
    impl Drop for Scratch {
        fn drop(&mut self) {
            // Never recursively remove a directory that could still be owned
            // by a loader worker after cancellation or a failed open.
            let _ = std::fs::remove_dir(self.0.join("leases"));
            let _ = std::fs::remove_dir(&self.0);
        }
    }
    async fn finish_scratch(root: &Path) -> Result<()> {
        for _ in 0..200 {
            let mut entries = std::fs::read_dir(root.join("leases")).map_err(|_| ())?;
            if entries.next().is_none() {
                return Ok(());
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        Err(())
    }

    pub async fn run() -> Result<bool> {
        let started = Instant::now();
        let requested = parse_arguments(std::env::args_os().skip(1))?;
        let manifest_path = checked_path(&requested, None)?;
        if manifest_path.file_name().and_then(|s| s.to_str()) != Some("manifest.json") {
            return Err(());
        }
        let source_root = manifest_path.parent().ok_or(())?.to_owned();
        let (mut file, before) = open_file(&manifest_path, Some(&source_root))?;
        if before.len() > MAX_MANIFEST_BYTES as u64 {
            return Err(());
        }
        let mut bytes = Vec::new();
        (&mut file)
            .take(MAX_MANIFEST_BYTES as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| ())?;
        unchanged(&file, &before)?;
        let manifest = Manifest::parse(&bytes).map_err(|_| ())?;
        let mut names = HashSet::new();
        if manifest
            .artifacts
            .iter()
            .any(|a| !names.insert(a.file_name.clone()))
        {
            return Err(());
        }
        // A fresh external temporary directory is owned only by this verifier.
        let temporary = tempfile::Builder::new()
            .prefix("personal-macro-shard-verifier-")
            .tempdir()
            .map_err(|_| ())?;
        let temporary_path = temporary.path().canonicalize().map_err(|_| ())?;
        outside_repository(&temporary_path)?;
        let _scratch = Scratch(temporary.keep());
        let loader = PublicCacheLoader::new(temporary_path.join("leases")).map_err(|_| ())?;
        let analysis_key = manifest
            .artifacts
            .iter()
            .find(|a| a.kind == ArtifactKind::SeasonalitySymbol && a.key == "eodhd:EURUSD.FOREX")
            .or_else(|| {
                manifest
                    .artifacts
                    .iter()
                    .find(|a| a.kind == ArtifactKind::SeasonalitySymbol)
            })
            .map(|a| a.key.clone());
        let mut success = true;
        // Deliberately serial: one numerical job and one lease, below the same
        // loader's production maximum of two; no detached jobs on a timeout.
        for artifact in &manifest.artifacts {
            let clock = Instant::now();
            let result = verify_artifact(
                &loader,
                &source_root,
                &manifest.generation,
                artifact,
                analysis_key.as_deref() == Some(&artifact.key),
            )
            .await;
            let (valid, bytes) = result.unwrap_or((false, 0));
            success &= valid;
            let kind = serde_json::to_value(artifact.kind).map_err(|_| ())?;
            emit(
                kind.as_str().ok_or(())?,
                &artifact.key,
                valid,
                artifact.rows,
                bytes,
                clock.elapsed().as_millis(),
            );
        }
        if finish_scratch(&temporary_path).await.is_err() {
            success = false;
        }
        emit(
            "summary",
            "manifest",
            success,
            manifest.artifacts.len() as u64,
            0,
            started.elapsed().as_millis(),
        );
        Ok(success)
    }

    async fn verify_artifact(
        loader: &PublicCacheLoader,
        root: &Path,
        generation: &str,
        artifact: &Artifact,
        analysis: bool,
    ) -> Result<(bool, u64)> {
        let compressed = local_transport(root, artifact)?;
        let descriptor = DownloadDescriptor {
            generation: generation.into(),
            object_generation: generation.into(),
            artifact: artifact.clone(),
            encoding: Encoding::Gzip,
            transfer_bytes: compressed.len() as u64,
            transfer_sha256: hex(&Sha256::digest(&compressed)),
        };
        descriptor.validate().map_err(|_| ())?;
        let chunks = compressed.chunks(64 * 1024).map(|part| Ok(part.to_vec()));
        let shard = loader
            .load_stream(&descriptor, stream::iter(chunks))
            .await
            .map_err(|_| ())?;
        let handle = tokio::runtime::Handle::current();
        // Retain the shard inside the numerical worker until every reader ends.
        // Await actual completion; no timeout may detach work or lose cleanup.
        tokio::task::spawn_blocking(move || {
            handle.block_on(async move {
                let result = check_readers(&shard, analysis).await;
                shard.close().await;
                result
            })
        })
        .await
        .map_err(|_| ())?
    }

    type Check = (String, Value);
    fn check(command: &str, args: Value) -> Check {
        (command.into(), args)
    }
    async fn checks(shard: &LoadedShard, analysis: bool) -> Result<Vec<Check>> {
        let mut checks = Vec::new();
        match shard.artifact.kind {
            ArtifactKind::Macro => {
                for command in [
                    "get_eodhd_fundamentals_dashboard",
                    "get_eodhd_feed_status",
                    "list_eodhd_mapping_candidates",
                ] {
                    checks.push(check(command, json!({})));
                }
                let pair: Option<(String, String)> = sqlx::query_as("SELECT currency,canonical_key FROM eodhd_indicator_series WHERE enabled=1 ORDER BY CASE WHEN currency='USD' THEN 0 ELSE 1 END,canonical_key LIMIT 1")
                    .fetch_optional(shard.pool()).await.map_err(|_| ())?;
                let (currency, key) = pair.unwrap_or(("USD".into(), "cpi_yoy".into()));
                checks.push(check(
                    "get_eodhd_indicator_history",
                    json!({"input":{"currency":currency,"canonicalKey":key,"months":24}}),
                ));
                checks.push(check("get_economic_calendar", json!({"input":{"range":"currentWeek","timezoneOffsetMinutes":-120,"timezone":"Europe/Berlin"}})));
            }
            ArtifactKind::Cot => {
                checks.push(check("get_cot_dashboard", json!({})));
                let symbol: Option<String> = sqlx::query_scalar("SELECT symbol FROM cot_contracts WHERE is_active=1 ORDER BY CASE WHEN symbol='EUR' THEN 0 ELSE 1 END,sort_order,symbol LIMIT 1")
                    .fetch_optional(shard.pool()).await.map_err(|_| ())?;
                checks.push(check(
                    "get_cot_asset_detail",
                    json!({"input":{"symbol":symbol.ok_or(())?,"lookbackWeeks":156}}),
                ));
            }
            ArtifactKind::Technicals => checks.push(check("get_pair_technical_signals", json!({}))),
            ArtifactKind::Regime => {
                for timeframe in ["D1", "W1"] {
                    checks.push(check(
                        "get_aud_china_cpi_regime",
                        json!({"input":{"timeframe":timeframe}}),
                    ));
                }
            }
            ArtifactKind::Atlas => {
                let geography = atlas_geography(shard).await?;
                checks.push(atlas_check(&shard.artifact.key, &geography)?);
            }
            ArtifactKind::Bonds => {
                checks.push(check("get_government_bonds", json!({})));
                checks.push(check(
                    "get_government_bond_detail",
                    json!({"input":{"countryId":"DEU","comparisonId":"USA","maturityMonths":120}}),
                ));
            }
            ArtifactKind::CentralBankReports => {
                checks.push(check("get_central_bank_reports", json!({})));
                let id: Option<String> = sqlx::query_scalar("SELECT id FROM central_bank_reports ORDER BY COALESCE(published_at,discovered_at) DESC,id LIMIT 1")
                    .fetch_optional(shard.pool()).await.map_err(|_| ())?;
                checks.push(check(
                    "get_central_bank_report",
                    json!({"id":id.ok_or(())?}),
                ));
            }
            ArtifactKind::Rates => checks.push(check("get_policy_rates", json!({}))),
            ArtifactKind::SeasonalityIndex => {
                checks.push(check("get_seasonality", json!({})));
                checks.push(check("get_seasonality_forex_pairs", json!({})));
            }
            ArtifactKind::SeasonalitySymbol => {
                let symbol: String = sqlx::query_scalar("SELECT display_symbol FROM seasonality_provider_instruments WHERE provider='eodhd'")
                    .fetch_one(shard.pool()).await.map_err(|_| ())?;
                checks.push(check(
                    "get_seasonality_asset_detail",
                    json!({"symbol":symbol}),
                ));
                if analysis {
                    checks.push(check(
                        "analyze_seasonality",
                        json!({"input":{"symbol":symbol,"yearFilter":{},"windowTradingDays":20}}),
                    ));
                }
            }
        }
        Ok(checks)
    }
    async fn atlas_geography(shard: &LoadedShard) -> Result<String> {
        let catalog = world_atlas::catalog::catalog().map_err(|_| ())?;
        let definition =
            schema::definition(shard.artifact.kind, &shard.artifact.key).map_err(|_| ())?;
        let mut present = HashSet::<String>::new();
        for name in definition.tables.keys() {
            // Table names are from compile-time schemas, never CLI input.
            let exists: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM pragma_table_info(?) WHERE name='geography_id'",
            )
            .bind(name)
            .fetch_one(shard.pool())
            .await
            .map_err(|_| ())?;
            if exists != 0 {
                let ids: Vec<String> =
                    sqlx::query_scalar(&format!("SELECT DISTINCT geography_id FROM {name}"))
                        .fetch_all(shard.pool())
                        .await
                        .map_err(|_| ())?;
                present.extend(ids);
            }
        }
        catalog
            .geographies
            .iter()
            .find(|row| row.iso3 == "DEU" && present.contains(&row.id))
            .or_else(|| {
                catalog
                    .geographies
                    .iter()
                    .find(|row| !row.iso3.is_empty() && present.contains(&row.id))
            })
            .or_else(|| catalog.geographies.iter().find(|row| row.iso3 == "DEU"))
            .map(|row| row.id.clone())
            .ok_or(())
    }
    fn atlas_check(key: &str, geography: &str) -> Result<Check> {
        atlas_readers::schema_family(ArtifactKind::Atlas, key).map_err(|_| ())?;
        world_atlas::catalog::geography(geography).map_err(|_| ())?;
        if let Some(id) = key.strip_prefix("atlas:series:") {
            return Ok(check(
                "get_atlas_series",
                json!({"input":{"seriesId":id,"geographyId":geography}}),
            ));
        }
        for (prefix, command, field) in [
            ("atlas:market:", "get_atlas_market", "proxyId"),
            ("atlas:valuation:", "get_atlas_valuation", "datasetId"),
            ("atlas:public:", "get_atlas_public_source", "sourceId"),
        ] {
            if let Some(id) = key.strip_prefix(prefix) {
                let mut args = json!({(field):id});
                if command == "get_atlas_public_source" {
                    args["geographyId"] = json!(geography);
                }
                return Ok(check(command, args));
            }
        }
        let family = key.strip_prefix("atlas:").ok_or(())?;
        let command = format!("get_atlas_{family}");
        let args = if matches!(family, "catalog" | "commodities") {
            json!({})
        } else {
            json!({"geographyId":geography})
        };
        atlas_readers::validate(&command, &args).map_err(|_| ())?;
        Ok(check(&command, args))
    }
    #[derive(Default)]
    struct CountBytes(u64);
    impl Write for CountBytes {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            self.0 = self
                .0
                .checked_add(buf.len() as u64)
                .ok_or_else(|| std::io::Error::other("limit"))?;
            Ok(buf.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    async fn check_readers(shard: &LoadedShard, analysis: bool) -> Result<(bool, u64)> {
        let mut success = true;
        let mut maximum = 0;
        for (command, args) in checks(shard, analysis).await? {
            let started = Instant::now();
            match readers::read(&command, &args, shard).await {
                Ok(response) => {
                    let mut count = CountBytes::default();
                    serde_json::to_writer(&mut count, &response).map_err(|_| ())?;
                    maximum = maximum.max(count.0);
                    success &= count.0 <= MAX_RESPONSE_BYTES;
                }
                Err(_) => success = false,
            }
            // Match the production reader's numerical deadline while awaiting
            // actual completion so timed-out work never survives this check.
            success &= started.elapsed() <= Duration::from_secs(50);
        }
        Ok((success, maximum))
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use personal_macro_desktop_lib::cloud_public::macro_readers;
        #[test]
        fn requires_exact_explicit_absolute_manifest_argument() {
            for args in [
                vec![],
                vec!["--manifest", "manifest.json"],
                vec!["--manifest"],
                vec!["--env-file", "secret"],
                vec!["--manifest", "/file", "extra"],
            ] {
                assert!(parse_arguments(args.into_iter().map(OsString::from)).is_err());
            }
            let path = std::env::temp_dir().join("manifest.json");
            assert!(
                parse_arguments([OsString::from("--manifest"), path.into_os_string()].into_iter())
                    .is_ok()
            );
        }
        #[test]
        fn bounded_transport_refuses_overflow_without_partial_append() {
            let mut output = BoundedBytes {
                bytes: Vec::new(),
                maximum: 4,
            };
            output.write_all(b"123").unwrap();
            assert!(output.write_all(b"45").is_err());
            assert_eq!(output.bytes, b"123");
        }
        #[test]
        fn repository_files_and_hard_links_are_rejected() {
            let file = Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
            assert!(checked_path(&file, None).is_err());
            let temp = tempfile::tempdir().unwrap();
            let source = temp.path().join("manifest.json");
            std::fs::write(&source, b"{}").unwrap();
            std::fs::hard_link(&source, temp.path().join("linked.json")).unwrap();
            assert!(open_file(&source, None).is_err());
        }
        #[test]
        fn atlas_checks_use_valid_catalog_arguments() {
            for key in ["atlas:catalog", "atlas:health", "atlas:commodities"] {
                let (command, args) = atlas_check(key, "m49:276").unwrap();
                atlas_readers::validate(&command, &args).unwrap();
            }
            assert!(atlas_check("atlas:unknown", "m49:276").is_err());
        }
        #[test]
        fn response_byte_count_is_exact_and_does_not_hide_oversize() {
            let value = json!({"text":"ä".repeat(MAX_RESPONSE_BYTES as usize / 2)});
            let mut counter = CountBytes::default();
            serde_json::to_writer(&mut counter, &value).unwrap();
            assert_eq!(counter.0, serde_json::to_vec(&value).unwrap().len() as u64);
            assert!(counter.0 > MAX_RESPONSE_BYTES);
        }
        #[test]
        fn representative_macro_commands_cover_the_public_contract() {
            let commands = [
                "get_eodhd_fundamentals_dashboard",
                "get_eodhd_feed_status",
                "list_eodhd_mapping_candidates",
                "get_eodhd_indicator_history",
                "get_economic_calendar",
                "get_cot_dashboard",
                "get_cot_asset_detail",
                "get_pair_technical_signals",
                "get_aud_china_cpi_regime",
            ];
            assert_eq!(commands.len(), macro_readers::COMMANDS.len());
            assert!(
                macro_readers::COMMANDS
                    .iter()
                    .all(|command| commands.contains(command))
            );
        }
    }
}
