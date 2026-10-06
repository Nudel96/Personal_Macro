//! Refresh an isolated copy of the public Macro shard with the native mapper
//! and scoring engine, then export only the reviewed public columns again.
use super::{eodhd, eodhd_fundamentals};
use crate::{
    database::{AppPaths, AppState},
    errors::AppError,
};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use std::path::Path;

pub const CURRENCIES: [&str; 9] = [
    "AUD", "CAD", "CHF", "CNY", "EUR", "GBP", "JPY", "NZD", "USD",
];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Release {
    pub currency: String,
    pub released_at: i64,
    pub due_at: i64,
}

// These extra work columns never leave the temporary directory. In particular,
// no journal database, credentials or native app settings are copied here.
pub async fn prepare_working_copy(db: &SqlitePool) -> Result<(), AppError> {
    sqlx::raw_sql(r#"
ALTER TABLE eodhd_indicator_profiles ADD COLUMN mapping_rank INTEGER DEFAULT 0;
ALTER TABLE eodhd_events ADD COLUMN event_identity TEXT;
ALTER TABLE eodhd_events ADD COLUMN mapping_confidence INTEGER DEFAULT 0;
ALTER TABLE eodhd_events ADD COLUMN first_seen_at TEXT;
UPDATE eodhd_events SET event_identity=substr(id,7);
CREATE UNIQUE INDEX cloud_event_identity ON eodhd_events(event_identity);
ALTER TABLE eodhd_event_revisions ADD COLUMN event_identity TEXT;
ALTER TABLE eodhd_event_revisions ADD COLUMN actual_value TEXT;
ALTER TABLE eodhd_event_revisions ADD COLUMN forecast_value TEXT;
ALTER TABLE eodhd_event_revisions ADD COLUMN previous_value TEXT;
ALTER TABLE eodhd_event_revisions ADD COLUMN observed_at TEXT;
ALTER TABLE eodhd_fundamental_snapshots ADD COLUMN input_fingerprint TEXT;
ALTER TABLE eodhd_fundamental_snapshots ADD COLUMN status TEXT;
ALTER TABLE eodhd_fundamental_evaluations ADD COLUMN id TEXT;
ALTER TABLE eodhd_fundamental_evaluations ADD COLUMN event_id TEXT;
ALTER TABLE eodhd_fundamental_evaluations ADD COLUMN factor TEXT;
ALTER TABLE eodhd_fundamental_evaluations ADD COLUMN direction INTEGER;
CREATE UNIQUE INDEX cloud_candidate_identity ON eodhd_mapping_candidates(currency,provider_type,comparison);
CREATE TABLE eodhd_release_jobs(id TEXT PRIMARY KEY,event_id TEXT,scheduled_for TEXT,status TEXT,created_at TEXT, UNIQUE(event_id,scheduled_for));
"#).execute(db).await?;
    Ok(())
}

pub async fn refresh(
    db: &SqlitePool,
    root: &Path,
    currency: &str,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    now: DateTime<Utc>,
) -> Result<Vec<Release>, AppError> {
    if !CURRENCIES.contains(&currency) || to < from || to - from > Duration::days(22) {
        return Err(AppError::Validation(
            "Ungültiges Wirtschaftsrelease-Fenster.".into(),
        ));
    }
    let key = super::eodhd_prices::api_key()
        .ok_or_else(|| AppError::Validation("EODHD-Zugang fehlt.".into()))?;
    let events = eodhd::fetch_events_for_currencies(&key, &[currency], from, to).await?;
    apply_events(db, root, currency, events, now).await
}

/// Compare source values, excluding fetch timestamps and rebuilt snapshot IDs.
/// An incomplete retry with identical data must not upload another full shard.
pub async fn source_fingerprint(db: &SqlitePool, currency: &str) -> Result<String, AppError> {
    use sha2::{Digest, Sha256};
    let rows: Vec<String> = sqlx::query_scalar("SELECT json_array(id,actual_value,forecast_value,previous_value,frequency,canonical_key,mapping_status) FROM eodhd_events WHERE currency=? ORDER BY id")
        .bind(currency).fetch_all(db).await?;
    let mut digest = Sha256::new();
    for row in rows {
        digest.update((row.len() as u64).to_le_bytes());
        digest.update(row.as_bytes());
    }
    Ok(digest
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

pub async fn apply_events(
    db: &SqlitePool,
    root: &Path,
    currency: &str,
    mut events: Vec<eodhd::EconomicEvent>,
    now: DateTime<Utc>,
) -> Result<Vec<Release>, AppError> {
    // A planning fetch may return an Actual early. The requested one-hour delay
    // applies to import as well as scheduling, including catch-up runs.
    for event in &mut events {
        if eodhd::parse_release_time(&event.date).is_none_or(|at| at + Duration::hours(1) > now) {
            event.actual = None;
        }
    }
    let state = AppState {
        db: db.clone(),
        paths: AppPaths {
            root: root.into(),
            database: root.join("work.sqlite"),
            media: root.join("unused-media"),
            exports: root.join("unused-exports"),
            backups: root.join("unused-backups"),
            logs: root.join("unused-logs"),
            settings: root.join("unused-settings"),
            central_bank_reports: root.join("unused-reports"),
        },
    };
    eodhd_fundamentals::ingest_events(&state, &events).await?;
    eodhd_fundamentals::rebuild_snapshot_at(&state, now).await?;
    let times: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT e.released_at FROM eodhd_events e JOIN eodhd_indicator_series s ON s.currency=e.currency AND s.provider_type=e.provider_type AND LOWER(COALESCE(s.comparison,''))=LOWER(COALESCE(e.comparison,'')) AND s.enabled=1 WHERE e.currency=? AND e.released_at>=? AND e.released_at<=? AND (e.released_at>? OR e.actual_value IS NULL OR e.forecast_value IS NULL) ORDER BY e.released_at"
    ).bind(currency).bind((now-Duration::days(7)).to_rfc3339()).bind((now+Duration::days(15)).to_rfc3339()).bind(now.to_rfc3339()).fetch_all(db).await?;
    let mut releases = Vec::new();
    for value in times {
        let at = DateTime::parse_from_rfc3339(&value)
            .map_err(|_| AppError::Validation("Ungültiger Veröffentlichungstermin.".into()))?
            .timestamp();
        releases.push(Release {
            currency: currency.into(),
            released_at: at,
            due_at: at + 3600,
        });
    }
    sqlx::query("DELETE FROM eodhd_sync_runs")
        .execute(db)
        .await?;
    sqlx::query("INSERT INTO eodhd_sync_runs(completed_at,status) VALUES(?,'complete')")
        .bind(now.to_rfc3339())
        .execute(db)
        .await?;
    Ok(releases)
}

/// New output file, built from an embedded allowlist; never remove personal
/// tables from a copied journal. The input contains only public market data.
pub async fn export(db: &SqlitePool, destination: &Path) -> Result<u64, AppError> {
    if destination.exists() || !destination.is_absolute() {
        return Err(AppError::Validation(
            "Ein neuer öffentlicher Ausgabepfad ist erforderlich.".into(),
        ));
    }
    // Production opens the existing work copy without SQLITE_OPEN_CREATE.
    // ATTACH inherits that flag, so create the new destination explicitly first.
    // create_new also rejects a pathname substituted between validation and use.
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .map_err(|_| {
            AppError::DataTransfer(
                "Das neue Wirtschaftsdatenpaket konnte nicht angelegt werden.".into(),
            )
        })?;
    let schema: serde_json::Value =
        serde_json::from_str(include_str!("../cloud_public/macro_schema.json"))
            .expect("reviewed embedded schema");
    let tables = schema["macro"]["tables"]
        .as_object()
        .expect("reviewed schema");
    let mut conn = db.acquire().await?;
    sqlx::query("ATTACH DATABASE ? AS exported")
        .bind(destination.to_string_lossy().as_ref())
        .execute(&mut *conn)
        .await?;
    let mut total = 0u64;
    let result = async {
        for (name, def) in tables {
            let ddl = def["ddl"].as_str().expect("reviewed DDL");
            let qualified = ddl.replacen(&format!("CREATE TABLE {name}"), &format!("CREATE TABLE exported.{name}"), 1);
            sqlx::query(&qualified).execute(&mut *conn).await?;
            let info = sqlx::query(&format!("PRAGMA exported.table_info({name})")).fetch_all(&mut *conn).await?;
            let cols = info.iter().map(|row| row.get::<String,_>("name")).collect::<Vec<_>>().join(",");
            let suffix = match name.as_str() {
                "eodhd_fundamental_snapshots" => " ORDER BY built_at DESC,id DESC LIMIT 1",
                "eodhd_fundamental_evaluations" => " WHERE snapshot_id=(SELECT id FROM eodhd_fundamental_snapshots ORDER BY built_at DESC,id DESC LIMIT 1)",
                _ => "",
            };
            let count=sqlx::query(&format!("INSERT INTO exported.{name}({cols}) SELECT {cols} FROM main.{name}{suffix}")).execute(&mut *conn).await?.rows_affected();
            if count > def["maxRows"].as_u64().expect("reviewed limit") {
                return Err(AppError::Validation("Das Wirtschaftsdatenpaket überschreitet die freigegebene Größe.".into()));
            }
            total += count;
        }
        Ok(total)
    }.await;
    sqlx::query("DETACH DATABASE exported")
        .execute(&mut *conn)
        .await?;
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn time(value: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(value)
            .unwrap()
            .with_timezone(&Utc)
    }
    fn event(date: &str, actual: Option<f64>, forecast: Option<f64>) -> eodhd::EconomicEvent {
        eodhd::EconomicEvent {
            event_type: "Unemployment Rate".into(),
            comparison: None,
            period: Some(date[..10].into()),
            country: Some("US".into()),
            date: date.into(),
            actual: actual.map(|v| json!(v)),
            previous: Some(json!(4.0)),
            estimate: forecast.map(|v| json!(v)),
        }
    }
    #[tokio::test]
    #[ignore = "Requires MACRO_TEST_PUBLIC_PACKAGE and configured EODHD access; reads public data only"]
    async fn live_public_package_refresh_and_export() {
        use sha2::{Digest, Sha256};
        let source = std::path::PathBuf::from(std::env::var("MACRO_TEST_PUBLIC_PACKAGE").unwrap());
        let bytes = std::fs::read(&source).unwrap();
        let digest = |bytes: &[u8]| {
            Sha256::digest(bytes)
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>()
        };
        let hash = digest(&bytes);
        assert_eq!(source.file_stem().unwrap().to_str().unwrap(), hash);
        let root = tempfile::tempdir().unwrap();
        let work = root.path().join("work.sqlite");
        std::fs::write(&work, bytes).unwrap();
        let db = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(&work)
                    .create_if_missing(false)
                    .journal_mode(sqlx::sqlite::SqliteJournalMode::Delete),
            )
            .await
            .unwrap();
        let schema: serde_json::Value =
            serde_json::from_str(include_str!("../cloud_public/macro_schema.json")).unwrap();
        let tables: Vec<String> =
            sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                .fetch_all(&db)
                .await
                .unwrap();
        assert_eq!(
            tables,
            schema["macro"]["tables"]
                .as_object()
                .unwrap()
                .keys()
                .cloned()
                .collect::<Vec<_>>()
        );
        prepare_working_copy(&db)
            .await
            .expect("Public source must prepare without collisions");
        let now = Utc::now();
        let mut scheduled = 0;
        for currency in CURRENCIES {
            let releases = refresh(
                &db,
                root.path(),
                currency,
                now - Duration::days(7),
                now + Duration::days(7),
                now,
            )
            .await
            .map_err(|_| "Public provider refresh failed")
            .unwrap();
            assert!(releases.iter().all(|r| r.due_at == r.released_at + 3600));
            scheduled += releases.len();
        }
        let rows = export(&db, &root.path().join("export.sqlite"))
            .await
            .unwrap();
        assert!(rows > 50000);
        println!(
            "Public refresh: {} currencies, {rows} public rows, {scheduled} release jobs; source unchanged",
            CURRENCIES.len()
        );
        db.close().await;
        assert_eq!(digest(&std::fs::read(source).unwrap()), hash);
    }
    #[tokio::test]
    async fn public_work_copy_delays_actuals_retries_missing_forecasts_and_exports_only_public_schema()
     {
        let root =
            std::env::temp_dir().join(format!("macro-economic-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let db = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(root.join("work.sqlite"))
                    .create_if_missing(true)
                    .journal_mode(sqlx::sqlite::SqliteJournalMode::Delete),
            )
            .await
            .unwrap();
        let schema: serde_json::Value =
            serde_json::from_str(include_str!("../cloud_public/macro_schema.json")).unwrap();
        for spec in schema["macro"]["tables"].as_object().unwrap().values() {
            sqlx::query(spec["ddl"].as_str().unwrap())
                .execute(&db)
                .await
                .unwrap();
        }
        sqlx::query("INSERT INTO eodhd_indicator_profiles VALUES('USD','unemployment_rate','Unemployment Rate','growth',-1,'%',60,NULL,'Monthly',1)").execute(&db).await.unwrap();
        sqlx::query("INSERT INTO eodhd_indicator_series VALUES('usd-unemployment','USD','unemployment_rate','Unemployment Rate',NULL,10,'%','Monthly',1)").execute(&db).await.unwrap();
        prepare_working_copy(&db).await.unwrap();
        let before = time("2026-09-25T13:29:59Z");
        let current = event("2026-09-25 12:30:00", Some(3.8), Some(4.0));
        let prior = event("2026-08-28 12:30:00", Some(4.1), Some(4.0));
        let releases = apply_events(&db, &root, "USD", vec![prior, current.clone()], before)
            .await
            .unwrap();
        let unchanged = source_fingerprint(&db, "USD").await.unwrap();
        apply_events(&db, &root, "USD", vec![current.clone()], before)
            .await
            .unwrap();
        assert_eq!(
            source_fingerprint(&db, "USD").await.unwrap(),
            unchanged,
            "A repeated incomplete fetch changes no source values"
        );
        assert_eq!(releases.len(), 1);
        assert_eq!(releases[0].due_at, time("2026-09-25T13:30:00Z").timestamp());
        let actual: Option<String> = sqlx::query_scalar(
            "SELECT actual_value FROM eodhd_events ORDER BY released_at DESC LIMIT 1",
        )
        .fetch_one(&db)
        .await
        .unwrap();
        assert_eq!(actual, None);
        let score: i64 = sqlx::query_scalar(
            "SELECT score FROM eodhd_fundamental_evaluations ORDER BY rowid DESC LIMIT 1",
        )
        .fetch_one(&db)
        .await
        .unwrap();
        assert_eq!(
            score, -1,
            "Last complete release remains active; Previous is not a substitute"
        );
        let releases = apply_events(
            &db,
            &root,
            "USD",
            vec![current.clone()],
            time("2026-09-25T13:30:00Z"),
        )
        .await
        .unwrap();
        assert_ne!(
            source_fingerprint(&db, "USD").await.unwrap(),
            unchanged,
            "New actual values must publish"
        );
        assert!(releases.is_empty());
        apply_events(
            &db,
            &root,
            "USD",
            vec![current],
            time("2026-09-25T13:31:00Z"),
        )
        .await
        .unwrap();
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM eodhd_events")
            .fetch_one(&db)
            .await
            .unwrap();
        assert_eq!(
            count, 2,
            "Repeated release delivery must not duplicate events"
        );
        let pending = event("2026-09-28 12:30:00", Some(3.7), None);
        let releases = apply_events(
            &db,
            &root,
            "USD",
            vec![pending],
            time("2026-09-28T13:30:00Z"),
        )
        .await
        .unwrap();
        assert_eq!(releases.len(), 1, "No forecast requires a later retry");
        let score: i64 = sqlx::query_scalar(
            "SELECT score FROM eodhd_fundamental_evaluations ORDER BY rowid DESC LIMIT 1",
        )
        .fetch_one(&db)
        .await
        .unwrap();
        assert_eq!(score, 1);
        export(&db, &root.join("export.sqlite")).await.unwrap();
        let output =
            SqlitePool::connect(&format!("sqlite:{}", root.join("export.sqlite").display()))
                .await
                .unwrap();
        let tables: Vec<String> =
            sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                .fetch_all(&output)
                .await
                .unwrap();
        assert_eq!(
            tables,
            schema["macro"]["tables"]
                .as_object()
                .unwrap()
                .keys()
                .cloned()
                .collect::<Vec<_>>()
        );
        let cols: Vec<String> = sqlx::query("PRAGMA table_info(eodhd_events)")
            .fetch_all(&output)
            .await
            .unwrap()
            .iter()
            .map(|r| r.get("name"))
            .collect();
        assert!(!cols.iter().any(|c| c == "event_identity"));
        let snapshots: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM eodhd_fundamental_snapshots")
            .fetch_one(&output)
            .await
            .unwrap();
        assert_eq!(snapshots, 1);
        output.close().await;
        db.close().await;
        std::fs::remove_file(root.join("work.sqlite")).unwrap();
        std::fs::remove_file(root.join("export.sqlite")).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
}
