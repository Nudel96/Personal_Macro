use super::cache::*;
use crate::{
    database::{AppPaths, AppState},
    runtime::State,
};
use chrono::{Datelike, NaiveDate, TimeZone, Utc};
use futures_util::stream;
use sha2::{Digest, Sha256};
use sqlx::{
    SqlitePool,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};
use std::{
    io::Write,
    path::Path,
    sync::{Arc, OnceLock},
};
use tokio::sync::{Mutex, MutexGuard};
use uuid::Uuid;

const RATES_SQL: &str = "CREATE TABLE eodhd_events(currency TEXT,provider_type TEXT,released_at TEXT,actual_value TEXT,forecast_value TEXT,source_url TEXT,updated_at TEXT,canonical_key TEXT,mapping_status TEXT) STRICT;
CREATE TABLE eodhd_sync_runs(started_at TEXT,completed_at TEXT,status TEXT,error_message TEXT) STRICT;";
const SEASONAL_SQL: &str = "CREATE TABLE seasonality_provider_instruments(provider TEXT,provider_symbol TEXT,display_symbol TEXT,category TEXT,description TEXT,base_currency TEXT,quote_currency TEXT,native_timezone TEXT,PRIMARY KEY(provider,provider_symbol)) STRICT;
CREATE TABLE seasonality_provider_profiles(provider TEXT,provider_symbol TEXT,calculated_at TEXT,complete_years INTEGER,quality_status TEXT,missing_days INTEGER,profile_json TEXT,PRIMARY KEY(provider,provider_symbol)) STRICT;
CREATE TABLE seasonality_provider_daily_candles(provider TEXT,provider_symbol TEXT,candle_time INTEGER,mid_close REAL,PRIMARY KEY(provider,provider_symbol,candle_time)) STRICT;";
const INDEX_SQL: &str = "CREATE TABLE seasonality_provider_instruments(provider TEXT,provider_symbol TEXT,display_symbol TEXT,category TEXT,description TEXT,base_currency TEXT,quote_currency TEXT,native_timezone TEXT,PRIMARY KEY(provider,provider_symbol)) STRICT;
CREATE TABLE seasonality_provider_profiles(provider TEXT,provider_symbol TEXT,calculated_at TEXT,complete_years INTEGER,quality_status TEXT,missing_days INTEGER,profile_json TEXT,PRIMARY KEY(provider,provider_symbol)) STRICT;
CREATE TABLE seasonality_provider_sync_runs(provider TEXT,started_at TEXT,completed_at TEXT,status TEXT,error_message TEXT) STRICT;";

async fn serial() -> MutexGuard<'static, ()> {
    static GATE: OnceLock<Mutex<()>> = OnceLock::new();
    GATE.get_or_init(|| Mutex::new(())).lock().await
}

async fn database(path: &Path, schema: &str) -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(path)
                .create_if_missing(true),
        )
        .await
        .unwrap();
    sqlx::raw_sql(schema).execute(&pool).await.unwrap();
    pool
}

fn manifest(bytes: &[u8], kind: ArtifactKind, rows: u64) -> Manifest {
    let hash = lowercase_hex(&Sha256::digest(bytes));
    Manifest {
        schema_version: 1,
        generation: Uuid::new_v4().to_string(),
        created_at: Utc::now().to_rfc3339(),
        artifacts: vec![Artifact {
            kind,
            key: match kind {
                ArtifactKind::Rates => "eodhd:policy-rates",
                ArtifactKind::SeasonalityIndex => "eodhd:seasonality",
                ArtifactKind::SeasonalitySymbol => "eodhd:EURUSD.FOREX",
                _ => panic!("This fixture only describes the original rates/seasonality schemas"),
            }
            .into(),
            sha256: hash.clone(),
            size_bytes: bytes.len() as u64,
            rows,
            file_name: format!("{hash}.sqlite"),
            format: "sqlite".into(),
            schema_version: 1,
        }],
    }
}

fn descriptor(manifest: &Manifest) -> DownloadDescriptor {
    DownloadDescriptor::identity(
        manifest,
        manifest.artifacts[0].kind,
        &manifest.artifacts[0].key,
    )
    .unwrap()
}

fn chunks(bytes: &[u8]) -> impl futures_util::Stream<Item = Result<Vec<u8>, CacheError>> + use<> {
    stream::iter(
        bytes
            .chunks(197)
            .map(|bytes| Ok(bytes.to_vec()))
            .collect::<Vec<_>>(),
    )
}

async fn empty_rates(root: &Path) -> (Vec<u8>, Manifest) {
    let path = root.join(format!("fixture-{}.sqlite", Uuid::new_v4()));
    database(&path, RATES_SQL).await.close().await;
    let bytes = std::fs::read(path).unwrap();
    let manifest = manifest(&bytes, ArtifactKind::Rates, 0);
    (bytes, manifest)
}

#[tokio::test]
async fn updater_copy_is_verified_create_new_and_leaves_original_read_only() {
    let _guard = serial().await;
    let temp = tempfile::tempdir().unwrap();
    let (bytes, manifest) = empty_rates(temp.path()).await;
    let loader = PublicCacheLoader::new(temp.path().join("cache")).unwrap();
    let shard = loader
        .load_stream(&descriptor(&manifest), chunks(&bytes))
        .await
        .unwrap();
    let target = temp.path().join("fresh-update.sqlite");
    shard.copy_sqlite_to_new_file(&target).unwrap();
    assert_eq!(std::fs::read(&target).unwrap(), bytes);
    assert!(shard.copy_sqlite_to_new_file(&target).is_err());
    assert!(
        shard
            .copy_sqlite_to_new_file(Path::new("relative.sqlite"))
            .is_err()
    );
    assert_eq!(std::fs::read(&target).unwrap(), bytes);
    assert_eq!(
        std::fs::read(shard.directory().join("data.sqlite")).unwrap(),
        bytes
    );
    assert!(
        sqlx::query("INSERT INTO eodhd_sync_runs VALUES('now','now','success',NULL)")
            .execute(shard.pool())
            .await
            .is_err()
    );
    shard.close().await;
}

#[tokio::test]
async fn rates_reader_keeps_decimal_contract_and_never_writes_sqlite() {
    let _guard = serial().await;
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("rates.sqlite");
    let pool = database(&source, RATES_SQL).await;
    sqlx::query("INSERT INTO eodhd_events VALUES('EUR','ECB Main refinancing rate','2020-01-01T00:00:00Z','-0.10',NULL,'https://eodhd.com/api/economic-events','2020-01-01T00:00:00Z','interest_rates','approved')")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO eodhd_sync_runs VALUES('2020-01-01T00:00:00Z','2020-01-01T00:00:00Z','running','synthetic private failure text')").execute(&pool).await.unwrap();
    let paths = AppPaths::from_root(temp.path().join("native-state")).unwrap();
    let native = crate::commands::get_policy_rates(State::new(&AppState {
        db: pool.clone(),
        paths: paths.clone(),
    }))
    .await
    .unwrap();
    pool.close().await;
    let bytes = std::fs::read(&source).unwrap();
    let manifest = manifest(&bytes, ArtifactKind::Rates, 2);
    let loader = PublicCacheLoader::new(temp.path().join("cache")).unwrap();
    let shard = loader
        .load_stream(&descriptor(&manifest), chunks(&bytes))
        .await
        .unwrap();
    let directory = shard.directory().to_owned();
    let loaded = crate::commands::get_policy_rates(State::new(&AppState {
        db: shard.pool().clone(),
        paths,
    }))
    .await
    .unwrap();
    assert_eq!(
        serde_json::to_value(&native).unwrap(),
        serde_json::to_value(loaded).unwrap()
    );
    let mut expected_cloud = serde_json::to_value(native).unwrap();
    expected_cloud["automation"]["enabled"] = serde_json::json!(false);
    expected_cloud["automation"]["nextRefreshAt"] = serde_json::Value::Null;
    expected_cloud["automation"]["errorMessage"] = serde_json::Value::Null;
    expected_cloud["automation"]["lastStatus"] = serde_json::json!("failed");
    let cloud = super::readers::read("get_policy_rates", &serde_json::json!({}), &shard)
        .await
        .unwrap();
    assert_eq!(cloud, expected_cloud);
    assert!(
        super::readers::read(
            "get_policy_rates",
            &serde_json::json!({"apiKey":"synthetic"}),
            &shard
        )
        .await
        .is_err()
    );
    assert!(
        sqlx::query("UPDATE eodhd_events SET actual_value='42'")
            .execute(shard.pool())
            .await
            .is_err()
    );
    assert_eq!(std::fs::read(directory.join("data.sqlite")).unwrap(), bytes);
    assert_eq!(std::fs::read_dir(&directory).unwrap().count(), 1);
    shard.close().await;
    assert!(!directory.exists());
    assert_eq!(std::fs::read(source).unwrap(), bytes);
}

#[tokio::test]
async fn seasonality_selected_years_and_windows_match_native_reader() {
    let _guard = serial().await;
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("symbol.sqlite");
    let pool = database(&path, SEASONAL_SQL).await;
    sqlx::query("INSERT INTO seasonality_provider_instruments VALUES('eodhd','EURUSD.FOREX','EURUSD','Forex','Synthetic Euro/USD','EUR','USD','provider-native')").execute(&pool).await.unwrap();
    let profile = serde_json::json!({"symbol":"EURUSD","category":"Forex","description":"Synthetic Euro/USD","baseCurrency":"EUR","quoteCurrency":"USD","calculatedAt":"2024-01-01T00:00:00Z","historyStart":"2014-01-01","historyEnd":"2023-12-31","completeYears":10,"qualityStatus":"available","qualityReason":"synthetic fixture","annualCurve":[],"months":[],"quarters":[],"forwardReturns":[],"similarYears":[],"heatmapSignal":1,"dataSource":"EODHD Historical Market Data","dataSourceUrl":"https://eodhd.com/financial-apis/api-for-historical-data-and-volumes","nativeTimezone":"provider-native","missingDays":0});
    sqlx::query("INSERT INTO seasonality_provider_profiles VALUES('eodhd','EURUSD.FOREX','2024-01-01T00:00:00Z',10,'available',0,?)").bind(profile.to_string()).execute(&pool).await.unwrap();
    let mut date = NaiveDate::from_ymd_opt(2014, 1, 1).unwrap();
    let mut count = 0;
    let mut transaction = pool.begin().await.unwrap();
    while date.year() < 2024 {
        let time = Utc
            .from_utc_datetime(&date.and_hms_opt(0, 0, 0).unwrap())
            .timestamp_millis();
        let close =
            1.0 + f64::from(date.ordinal()) / 10_000.0 + f64::from(date.year() - 2014) / 100.0;
        sqlx::query(
            "INSERT INTO seasonality_provider_daily_candles VALUES('eodhd','EURUSD.FOREX',?,?)",
        )
        .bind(time)
        .bind(close)
        .execute(&mut *transaction)
        .await
        .unwrap();
        date = date.succ_opt().unwrap();
        count += 1;
    }
    transaction.commit().await.unwrap();
    let input = serde_json::json!({"symbol":"EURUSD", "referenceDate":"09-24","windowStart":"10-01","windowTradingDays":20,"yearFilter":{"startYear":2020,"endYear":2023,"excludeYears":[2022]}});
    let paths = AppPaths::from_root(temp.path().join("native")).unwrap();
    let expected = crate::commands::analyze_seasonality(
        State::new(&AppState {
            db: pool.clone(),
            paths: paths.clone(),
        }),
        serde_json::from_value(input.clone()).unwrap(),
    )
    .await
    .unwrap();
    assert_eq!(expected.selected_years, vec![2020, 2021, 2023]);
    let expected_detail = crate::commands::get_seasonality_asset_detail(
        State::new(&AppState {
            db: pool.clone(),
            paths: paths.clone(),
        }),
        "EURUSD".into(),
    )
    .await
    .unwrap();
    pool.close().await;
    let bytes = std::fs::read(&path).unwrap();
    let manifest = manifest(&bytes, ArtifactKind::SeasonalitySymbol, count + 2);
    let loader = PublicCacheLoader::new(temp.path().join("cache")).unwrap();
    let shard = loader
        .load_stream(&descriptor(&manifest), chunks(&bytes))
        .await
        .unwrap();
    let actual = crate::commands::analyze_seasonality(
        State::new(&AppState {
            db: shard.pool().clone(),
            paths,
        }),
        serde_json::from_value(input.clone()).unwrap(),
    )
    .await
    .unwrap();
    assert_eq!(
        serde_json::to_value(&expected).unwrap(),
        serde_json::to_value(actual).unwrap()
    );
    assert_eq!(
        super::readers::read(
            "analyze_seasonality",
            &serde_json::json!({"input":input,"generation":manifest.generation}),
            &shard
        )
        .await
        .unwrap(),
        serde_json::to_value(expected).unwrap()
    );
    assert_eq!(
        super::readers::read(
            "get_seasonality_asset_detail",
            &serde_json::json!({"symbol":"EURUSD"}),
            &shard
        )
        .await
        .unwrap(),
        serde_json::to_value(expected_detail).unwrap()
    );
    assert!(
        super::readers::read("get_seasonality", &serde_json::json!({}), &shard)
            .await
            .is_err()
    );
    assert_eq!(std::fs::read_dir(shard.directory()).unwrap().count(), 1);
    shard.close().await;
}

#[tokio::test]
async fn gzip_has_both_hashes_exact_size_and_no_trailing_members() {
    let _guard = serial().await;
    let temp = tempfile::tempdir().unwrap();
    let (bytes, manifest) = empty_rates(temp.path()).await;
    let loader = PublicCacheLoader::new(temp.path().join("cache")).unwrap();
    let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    encoder.write_all(&bytes).unwrap();
    let compressed = encoder.finish().unwrap();
    let mut download = descriptor(&manifest);
    download.encoding = Encoding::Gzip;
    download.transfer_bytes = compressed.len() as u64;
    download.transfer_sha256 = lowercase_hex(&Sha256::digest(&compressed));
    loader
        .load_stream(&download, chunks(&compressed))
        .await
        .unwrap()
        .close()
        .await;
    download.artifact.size_bytes -= 1;
    assert!(matches!(
        loader.load_stream(&download, chunks(&compressed)).await,
        Err(CacheError::Limit)
    ));
    download.artifact.size_bytes += 1;
    let mut trailing = compressed.clone();
    trailing.extend_from_slice(&compressed);
    download.transfer_bytes = trailing.len() as u64;
    download.transfer_sha256 = lowercase_hex(&Sha256::digest(&trailing));
    assert!(matches!(
        loader.load_stream(&download, chunks(&trailing)).await,
        Err(CacheError::Integrity)
    ));
}

#[tokio::test]
async fn rejects_bad_hash_truncation_unknown_schema_and_wrong_symbol() {
    let _guard = serial().await;
    let temp = tempfile::tempdir().unwrap();
    let (bytes, manifest) = empty_rates(temp.path()).await;
    let loader = PublicCacheLoader::new(temp.path().join("cache")).unwrap();
    let mut corrupted = bytes.clone();
    corrupted[100] ^= 1;
    assert!(matches!(
        loader
            .load_stream(&descriptor(&manifest), chunks(&corrupted))
            .await,
        Err(CacheError::Integrity)
    ));
    assert!(matches!(
        loader
            .load_stream(&descriptor(&manifest), chunks(&bytes[..bytes.len() - 1]))
            .await,
        Err(CacheError::Integrity)
    ));
    let path = temp.path().join("extra.sqlite");
    let pool = database(&path, RATES_SQL).await;
    sqlx::query("CREATE TABLE trades(notes TEXT) STRICT")
        .execute(&pool)
        .await
        .unwrap();
    pool.close().await;
    let extra = std::fs::read(&path).unwrap();
    let extra_manifest = manifest_for(&extra, ArtifactKind::Rates, 0);
    assert!(matches!(
        loader
            .load_stream(&descriptor(&extra_manifest), chunks(&extra))
            .await,
        Err(CacheError::Schema)
    ));
    let path = temp.path().join("wrong-symbol.sqlite");
    let pool = database(&path, SEASONAL_SQL).await;
    sqlx::query("INSERT INTO seasonality_provider_instruments VALUES('dukascopy','EURUSD.FOREX','EURUSD','Forex',NULL,NULL,NULL,NULL)").execute(&pool).await.unwrap();
    pool.close().await;
    let wrong = std::fs::read(path).unwrap();
    let wrong_manifest = manifest_for(&wrong, ArtifactKind::SeasonalitySymbol, 1);
    assert!(matches!(
        loader
            .load_stream(&descriptor(&wrong_manifest), chunks(&wrong))
            .await,
        Err(CacheError::Integrity)
    ));
}

#[tokio::test]
async fn rejects_unexportable_constraints_missing_metadata_and_wal_headers() {
    let _guard = serial().await;
    let temp = tempfile::tempdir().unwrap();
    let loader = PublicCacheLoader::new(temp.path().join("cache")).unwrap();
    let cases = [
        (
            RATES_SQL.replace(
                "provider_type TEXT",
                "provider_type TEXT CHECK(length(provider_type)<100)",
            ),
            ArtifactKind::Rates,
            CacheError::Schema,
        ),
        (
            SEASONAL_SQL.replace(",PRIMARY KEY(provider,provider_symbol)", ""),
            ArtifactKind::SeasonalitySymbol,
            CacheError::Schema,
        ),
        (
            SEASONAL_SQL.into(),
            ArtifactKind::SeasonalitySymbol,
            CacheError::Integrity,
        ),
    ];
    for (schema, kind, error) in cases {
        let path = temp.path().join(format!("{}.sqlite", Uuid::new_v4()));
        database(&path, &schema).await.close().await;
        let bytes = std::fs::read(path).unwrap();
        let manifest = manifest(&bytes, kind, 0);
        assert!(
            matches!(loader.load_stream(&descriptor(&manifest), chunks(&bytes)).await, Err(actual) if actual == error)
        );
    }
    let (mut bytes, _) = empty_rates(temp.path()).await;
    bytes[18] = 2;
    bytes[19] = 2;
    let manifest = manifest(&bytes, ArtifactKind::Rates, 0);
    assert!(matches!(
        loader
            .load_stream(&descriptor(&manifest), chunks(&bytes))
            .await,
        Err(CacheError::Integrity)
    ));
}

#[tokio::test]
async fn seasonality_index_preserves_native_coverage_and_clears_local_job_errors() {
    let _guard = serial().await;
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("index.sqlite");
    let pool = database(&path, INDEX_SQL).await;
    sqlx::query("INSERT INTO seasonality_provider_instruments VALUES('eodhd','EURUSD.FOREX','EURUSD','Forex','Synthetic Euro/USD','EUR','USD','provider-native')").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO seasonality_provider_instruments VALUES('eodhd','GBPUSD.FOREX','GBPUSD','Forex','Synthetic GBP/USD','GBP','USD','provider-native')").execute(&pool).await.unwrap();
    let profile = serde_json::json!({"symbol":"EURUSD","category":"Forex","description":"Synthetic Euro/USD","baseCurrency":"EUR","quoteCurrency":"USD","calculatedAt":"2024-01-01T00:00:00Z","historyStart":"2014-01-01","historyEnd":"2023-12-31","completeYears":10,"qualityStatus":"available","qualityReason":"synthetic fixture","annualCurve":[],"months":[],"quarters":[],"forwardReturns":[],"similarYears":[],"heatmapSignal":null,"dataSource":"EODHD Historical Market Data","dataSourceUrl":"https://eodhd.com/financial-apis/api-for-historical-data-and-volumes","nativeTimezone":"provider-native","missingDays":0});
    sqlx::query("INSERT INTO seasonality_provider_profiles VALUES('eodhd','EURUSD.FOREX','2024-01-01T00:00:00Z',10,'available',0,?)").bind(profile.to_string()).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO seasonality_provider_sync_runs VALUES('eodhd','2024-01-01T00:00:00Z',NULL,'running','synthetic provider error')").execute(&pool).await.unwrap();
    let paths = AppPaths::from_root(temp.path().join("native")).unwrap();
    let expected = crate::commands::get_seasonality(State::new(&AppState {
        db: pool.clone(),
        paths,
    }))
    .await
    .unwrap();
    assert_eq!(expected.collection_total, 2);
    assert_eq!(expected.collection_completed, 1);
    pool.close().await;
    let bytes = std::fs::read(path).unwrap();
    let manifest = manifest(&bytes, ArtifactKind::SeasonalityIndex, 4);
    let loader = PublicCacheLoader::new(temp.path().join("cache")).unwrap();
    let shard = loader
        .load_stream(&descriptor(&manifest), chunks(&bytes))
        .await
        .unwrap();
    let mut expected = serde_json::to_value(expected).unwrap();
    expected["collectionStatus"] = serde_json::json!("failed");
    expected["collectionError"] = serde_json::Value::Null;
    let actual = super::readers::read("get_seasonality", &serde_json::json!({}), &shard)
        .await
        .unwrap();
    assert_eq!(actual, expected);
    assert!(
        super::readers::read("sync_seasonality", &serde_json::json!({}), &shard)
            .await
            .is_err()
    );
    assert_eq!(std::fs::read_dir(shard.directory()).unwrap().count(), 1);
    shard.close().await;
}

// Avoid a local fixture variable shadowing the manifest builder above.
fn manifest_for(bytes: &[u8], kind: ArtifactKind, rows: u64) -> Manifest {
    manifest(bytes, kind, rows)
}

#[tokio::test]
async fn two_leases_bound_parallelism_and_cancelled_download_cleans_up() {
    let _guard = serial().await;
    let temp = tempfile::tempdir().unwrap();
    let (bytes, manifest) = empty_rates(temp.path()).await;
    let root = temp.path().join("cache");
    let loader = Arc::new(PublicCacheLoader::new(root.clone()).unwrap());
    let first = loader
        .load_stream(&descriptor(&manifest), chunks(&bytes))
        .await
        .unwrap();
    let second = loader
        .load_stream(&descriptor(&manifest), chunks(&bytes))
        .await
        .unwrap();
    assert!(matches!(
        loader
            .load_stream(&descriptor(&manifest), chunks(&bytes))
            .await,
        Err(CacheError::Busy)
    ));
    first.close().await;
    second.close().await;
    let task_loader = loader.clone();
    let description = descriptor(&manifest);
    let task = tokio::spawn(async move {
        task_loader
            .load_stream(&description, stream::pending())
            .await
    });
    for _ in 0..100 {
        if std::fs::read_dir(&root).unwrap().next().is_some() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    assert!(std::fs::read_dir(&root).unwrap().next().is_some());
    task.abort();
    assert!(matches!(task.await, Err(error) if error.is_cancelled()));
    for _ in 0..100 {
        if std::fs::read_dir(&root).unwrap().next().is_none() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    assert!(std::fs::read_dir(&root).unwrap().next().is_none());
    loader
        .load_stream(&descriptor(&manifest), chunks(&bytes))
        .await
        .unwrap()
        .close()
        .await;
}

#[tokio::test]
async fn cancelled_close_retains_disk_lease_until_last_connection_returns() {
    let _guard = serial().await;
    let temp = tempfile::tempdir().unwrap();
    let (bytes, manifest) = empty_rates(temp.path()).await;
    let root = temp.path().join("cache");
    let loader = PublicCacheLoader::new(root.clone()).unwrap();
    let shard = loader
        .load_stream(&descriptor(&manifest), chunks(&bytes))
        .await
        .unwrap();
    let path = shard.directory().to_owned();
    let pool = shard.pool().clone();
    let connection = pool.acquire().await.unwrap();
    let other = loader
        .load_stream(&descriptor(&manifest), chunks(&bytes))
        .await
        .unwrap();
    let close = tokio::spawn(shard.close());
    for _ in 0..100 {
        if pool.is_closed() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    assert!(pool.is_closed());
    close.abort();
    assert!(matches!(close.await, Err(error) if error.is_cancelled()));
    assert!(path.join("data.sqlite").exists());
    assert!(matches!(
        loader
            .load_stream(&descriptor(&manifest), chunks(&bytes))
            .await,
        Err(CacheError::Busy)
    ));
    drop(connection);
    for _ in 0..100 {
        if !path.exists() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    assert!(!path.exists());
    other.close().await;
    assert!(std::fs::read_dir(root).unwrap().next().is_none());
}

#[test]
fn manifest_transport_and_origin_fail_closed_without_network() {
    let bytes = vec![0; 4096];
    let fixture = manifest(&bytes, ArtifactKind::Rates, 0);
    assert!(Manifest::parse(&serde_json::to_vec(&fixture).unwrap()).is_ok());
    let mut duplicate = fixture.clone();
    duplicate.artifacts.push(duplicate.artifacts[0].clone());
    assert!(matches!(
        duplicate.validate(),
        Err(CacheError::InvalidManifest)
    ));
    let mut value = serde_json::to_value(&fixture).unwrap();
    value["sourceUrl"] = serde_json::json!("https://untrusted.invalid/private");
    assert!(matches!(
        Manifest::parse(&serde_json::to_vec(&value).unwrap()),
        Err(CacheError::InvalidManifest)
    ));
    let mut description = descriptor(&fixture);
    description.artifact.file_name = "../../journal.sqlite".into();
    assert!(description.object_path().is_err());
    let mut too_large = descriptor(&fixture);
    too_large.transfer_bytes = MAX_TRANSFER_BYTES + 1;
    assert!(matches!(too_large.validate(), Err(CacheError::Limit)));
    for origin in [
        "http://store.private.blob.vercel-storage.com/",
        "https://evil.invalid/",
        "https://store.private.blob.vercel-storage.com/path",
        "https://store.private.blob.vercel-storage.com/?token=secret",
        "https://user:secret@store.private.blob.vercel-storage.com/",
        "https://store.private.blob.vercel-storage.com:444/",
    ] {
        assert!(matches!(
            PrivateBlobReader::new(origin, "synthetic-token".into()),
            Err(CacheError::Configuration)
        ));
    }
    let reader = PrivateBlobReader::new(
        "https://test-store.private.blob.vercel-storage.com/",
        "synthetic-token".into(),
    )
    .unwrap();
    let url = reader.object_url(&descriptor(&fixture)).unwrap();
    assert_eq!(url.query(), Some("cache=0"));
    assert!(!url.as_str().contains("synthetic-token"));
}

#[test]
fn startup_removes_only_verified_residue_and_never_reinitializes_a_live_root() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("cache");
    let stale = root.join(format!("request-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&stale).unwrap();
    std::fs::write(stale.join("download"), b"partial transfer").unwrap();
    std::fs::write(stale.join("data.sqlite"), b"partial unpacked database").unwrap();
    let _loader = PublicCacheLoader::new(root.clone()).unwrap();
    assert!(std::fs::read_dir(&root).unwrap().next().is_none());
    let active = root.join(format!("request-{}", Uuid::new_v4()));
    std::fs::create_dir(&active).unwrap();
    std::fs::write(active.join("data.sqlite"), b"active data").unwrap();
    assert!(matches!(
        PublicCacheLoader::new(root),
        Err(CacheError::Configuration)
    ));
    assert_eq!(
        std::fs::read(active.join("data.sqlite")).unwrap(),
        b"active data"
    );

    let root = temp.path().join("mixed");
    let valid = root.join(format!("request-{}", Uuid::new_v4()));
    let unknown = root.join("personal-content");
    std::fs::create_dir_all(&valid).unwrap();
    std::fs::write(valid.join("download"), b"residue").unwrap();
    std::fs::write(&unknown, b"do not touch").unwrap();
    assert!(matches!(
        PublicCacheLoader::new(root),
        Err(CacheError::Configuration)
    ));
    assert_eq!(std::fs::read(valid.join("download")).unwrap(), b"residue");
    assert_eq!(std::fs::read(unknown).unwrap(), b"do not touch");

    let root = temp.path().join("unexpected-file");
    let directory = root.join(format!("request-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&directory).unwrap();
    std::fs::write(directory.join("journal.sqlite"), b"do not touch").unwrap();
    assert!(matches!(
        PublicCacheLoader::new(root),
        Err(CacheError::Configuration)
    ));
    assert_eq!(
        std::fs::read(directory.join("journal.sqlite")).unwrap(),
        b"do not touch"
    );
}

#[test]
#[cfg(unix)]
fn startup_rejects_symlinked_residue_without_following_it() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("cache");
    let outside = temp.path().join("outside");
    std::fs::create_dir_all(&root).unwrap();
    std::fs::create_dir(&outside).unwrap();
    std::fs::write(outside.join("data.sqlite"), b"unrelated").unwrap();
    let link = root.join(format!("request-{}", Uuid::new_v4()));
    std::os::unix::fs::symlink(&outside, &link).unwrap();
    assert!(matches!(
        PublicCacheLoader::new(root),
        Err(CacheError::Configuration)
    ));
    assert_eq!(
        std::fs::read(outside.join("data.sqlite")).unwrap(),
        b"unrelated"
    );
    std::fs::remove_file(link).unwrap();
}

#[test]
#[cfg(windows)]
fn startup_rejects_windows_junction_without_following_it() {
    use std::os::windows::process::CommandExt;
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("cache");
    let outside = temp.path().join("outside");
    std::fs::create_dir_all(&root).unwrap();
    std::fs::create_dir(&outside).unwrap();
    std::fs::write(outside.join("data.sqlite"), b"unrelated").unwrap();
    let link = root.join(format!("request-{}", Uuid::new_v4()));
    // A directory junction needs no Windows symlink privilege. The workspace's
    // existing Node runtime creates the fixture using direct argv, never a shell.
    let result = std::process::Command::new("node")
        .creation_flags(0x08000000)
        .args([
            "-e",
            "require('node:fs').symlinkSync(process.argv[1],process.argv[2],'junction')",
        ])
        .arg(&outside)
        .arg(&link)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "could not create synthetic junction fixture"
    );
    assert!(matches!(
        PublicCacheLoader::new(root),
        Err(CacheError::Configuration)
    ));
    assert_eq!(
        std::fs::read(outside.join("data.sqlite")).unwrap(),
        b"unrelated"
    );
    std::fs::remove_dir(link).unwrap();
}

#[test]
fn analysis_validation_rejects_overflow_years_and_unknown_digits_before_loading() {
    let validate = |filter: serde_json::Value| {
        super::readers::validate(
            "analyze_seasonality",
            &serde_json::json!({"input":{"symbol":"EURUSD","yearFilter":filter}}),
        )
    };
    for filter in [
        serde_json::json!({"cycleAnchorYear": i32::MIN, "cycleYears":3}),
        serde_json::json!({"cycleAnchorYear": i32::MAX}),
        serde_json::json!({"startYear":0}),
        serde_json::json!({"endYear":10000}),
        serde_json::json!({"includeYears":[-1]}),
        serde_json::json!({"excludeYears":[10000]}),
        serde_json::json!({"endingDigits":[10]}),
        serde_json::json!({"cycleYears":256}),
    ] {
        assert!(validate(filter).is_err());
    }
    for cycle in [0, 1, 3, 255] {
        assert!(validate(serde_json::json!({"startYear":1,"endYear":9999,"cycleAnchorYear":1,"cycleYears":cycle,"includeYears":[1,9999],"excludeYears":[2000],"endingDigits":[0,9]})).is_ok());
    }
}

#[tokio::test]
async fn index_rejects_ambiguous_case_insensitive_display_and_provider_aliases() {
    let _guard = serial().await;
    let temp = tempfile::tempdir().unwrap();
    let loader = PublicCacheLoader::new(temp.path().join("cache")).unwrap();
    for aliases in [
        [("AAA.FOREX", "DUP"), ("BBB.FOREX", "dup")],
        [("AAA.FOREX", "AAA"), ("BBB.FOREX", "aaa.forex")],
    ] {
        let path = temp.path().join(format!("{}.sqlite", Uuid::new_v4()));
        let pool = database(&path, INDEX_SQL).await;
        for (provider, display) in aliases {
            sqlx::query("INSERT INTO seasonality_provider_instruments VALUES('eodhd',?,?,'Forex',NULL,NULL,NULL,NULL)").bind(provider).bind(display).execute(&pool).await.unwrap();
        }
        pool.close().await;
        let bytes = std::fs::read(path).unwrap();
        let manifest = manifest(&bytes, ArtifactKind::SeasonalityIndex, 2);
        assert!(matches!(
            loader
                .load_stream(&descriptor(&manifest), chunks(&bytes))
                .await,
            Err(CacheError::Integrity)
        ));
    }
    let path = temp.path().join("valid.sqlite");
    let pool = database(&path, INDEX_SQL).await;
    sqlx::query("INSERT INTO seasonality_provider_instruments VALUES('eodhd','AAA.FOREX','aaa.forex','Forex',NULL,NULL,NULL,NULL)").execute(&pool).await.unwrap();
    pool.close().await;
    let bytes = std::fs::read(path).unwrap();
    let manifest = manifest(&bytes, ArtifactKind::SeasonalityIndex, 1);
    loader
        .load_stream(&descriptor(&manifest), chunks(&bytes))
        .await
        .unwrap()
        .close()
        .await;
}
