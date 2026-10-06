//! Reuse native discovery/extraction on an isolated public work shard. No native
//! settings, read markers, journal tables or credentials enter that shard.
use super::*;
use crate::database::AppPaths;
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use std::sync::{Arc, LazyLock};

static PDF_WORK: LazyLock<Arc<tokio::sync::Semaphore>> =
    LazyLock::new(|| Arc::new(tokio::sync::Semaphore::new(1)));
pub(super) fn pdf_permit() -> Result<tokio::sync::OwnedSemaphorePermit, AppError> {
    PDF_WORK
        .clone()
        .try_acquire_owned()
        .map_err(|_| AppError::Conflict("Eine PDF-Extraktion läuft bereits.".into()))
}
pub(crate) fn sources() -> impl Iterator<Item = &'static str> {
    SOURCES.iter().map(|s| s.id)
}
pub(crate) fn source_bank(id: &str) -> Option<&'static str> {
    SOURCES.iter().find(|s| s.id == id).map(|s| s.bank_code)
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SourceSnapshot {
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub last_checked_at: Option<String>,
    pub last_success_at: Option<String>,
    pub next_check_at: Option<String>,
    pub last_status: Option<String>,
    pub error_message: Option<String>,
}
pub(crate) fn source_status(id: &str, snapshot: SourceSnapshot) -> Option<CentralBankSourceStatus> {
    let source = SOURCES.iter().find(|s| s.id == id)?;
    Some(CentralBankSourceStatus {
        id: id.into(),
        bank_code: source.bank_code.into(),
        bank_name: source.bank_name.into(),
        currency: source.currency.into(),
        source_url: source.url.into(),
        last_checked_at: snapshot.last_checked_at,
        last_success_at: snapshot.last_success_at,
        last_status: snapshot.last_status,
        error_message: snapshot.error_message,
    })
}
pub(crate) struct Discovery {
    pub state: SourceSnapshot,
    pub changed: bool,
    pub pending: Vec<String>,
}

pub(crate) async fn prepare_working_copy(db: &SqlitePool) -> Result<(), AppError> {
    sqlx::raw_sql(r#"
ALTER TABLE central_bank_reports ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
ALTER TABLE central_bank_reports ADD COLUMN local_path TEXT;
ALTER TABLE central_bank_reports ADD COLUMN read_at TEXT;
ALTER TABLE central_bank_reports ADD COLUMN extraction_error TEXT;
ALTER TABLE central_bank_reports ADD COLUMN sha256 TEXT;
ALTER TABLE central_bank_reports ADD COLUMN byte_size INTEGER;
ALTER TABLE central_bank_reports ADD COLUMN summary_version INTEGER NOT NULL DEFAULT 0;
UPDATE central_bank_reports SET updated_at=COALESCE(summarized_at,discovered_at),
  summary_version=CASE WHEN json_valid(summary_json) THEN COALESCE(json_extract(summary_json,'$.quality.version'),0) ELSE 0 END;
CREATE UNIQUE INDEX report_source_identity ON central_bank_reports(source_url);
CREATE TABLE central_bank_report_source_state(source_id TEXT PRIMARY KEY,bank_code TEXT,source_url TEXT,etag TEXT,last_modified TEXT,last_checked_at TEXT,last_success_at TEXT,next_check_at TEXT,last_status TEXT,error_message TEXT);
"#).execute(db).await?;
    Ok(())
}
fn state(db: &SqlitePool, root: &Path) -> AppState {
    AppState {
        db: db.clone(),
        paths: AppPaths {
            root: root.into(),
            database: root.join("work.sqlite"),
            media: root.join("unused-media"),
            exports: root.join("unused-exports"),
            backups: root.join("unused-backups"),
            logs: root.join("unused-logs"),
            settings: root.join("unused-settings"),
            central_bank_reports: root.join("unused-originals"),
        },
    }
}
pub(crate) async fn discover(
    db: &SqlitePool,
    root: &Path,
    source_id: &str,
    saved: Option<SourceSnapshot>,
) -> Result<Discovery, AppError> {
    let source = SOURCES
        .iter()
        .find(|s| s.id == source_id)
        .ok_or_else(|| AppError::Validation("Unbekannte Zentralbankquelle.".into()))?;
    if let Some(saved) = saved {
        let serialized = serde_json::to_string(&saved)
            .map_err(|_| AppError::Validation("Ungültiger Quellenstand.".into()))?;
        if serialized.len() > 8192 {
            return Err(AppError::Validation("Ungültiger Quellenstand.".into()));
        }
        sqlx::query("INSERT INTO central_bank_report_source_state(source_id,bank_code,source_url,etag,last_modified,last_checked_at,last_success_at,next_check_at,last_status,error_message) VALUES(?,?,?,?,?,?,?,?,?,?)")
            .bind(source.id).bind(source.bank_code).bind(source.url).bind(saved.etag).bind(saved.last_modified)
            .bind(saved.last_checked_at).bind(saved.last_success_at).bind(saved.next_check_at).bind(saved.last_status).bind(saved.error_message).execute(db).await?;
    }
    // A bank-specific redirect policy also rejects cross-bank redirects.
    let bank = source.bank_code;
    let client = Client::builder()
        .tls_backend_rustls()
        .timeout(StdDuration::from_secs(15))
        .redirect(reqwest::redirect::Policy::custom(move |attempt| {
            if attempt.previous().len() >= 4
                || !crate::cloud_public::report_readers::official_source(
                    bank,
                    attempt.url().as_str(),
                )
            {
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|_| {
            AppError::Initialization("Der Quellenabruf konnte nicht vorbereitet werden.".into())
        })?;
    let state = state(db, root);
    let mut counts = SyncCounts::default();
    sync_source(&state, &client, source, &mut counts, true).await?;
    if !counts.errors.is_empty() {
        return Err(AppError::DataTransfer(
            "Die offizielle Quelle konnte nicht vollständig übernommen werden.".into(),
        ));
    }
    let mut snapshot:SourceSnapshot=sqlx::query_as("SELECT etag,last_modified,last_checked_at,last_success_at,next_check_at,last_status,error_message FROM central_bank_report_source_state WHERE source_id=?")
        .bind(source.id).fetch_one(db).await?;
    // Do not let a 304 hide the second release in the bounded catch-up step.
    if counts.reports_discovered > 0 {
        snapshot.etag = None;
        snapshot.last_modified = None;
    }
    Ok(Discovery {
        state: snapshot,
        changed: counts.reports_discovered > 0,
        pending: pending(db).await?,
    })
}
pub(crate) async fn pending(db: &SqlitePool) -> Result<Vec<String>, AppError> {
    // Upgrade only the latest public briefing in each bank/document family.
    // Retain the archive as-is; no automatic full-archive paid backfill.
    Ok(sqlx::query_scalar("SELECT id FROM (SELECT id,extraction_status,extracted_text,summary_status,summary_version,ROW_NUMBER() OVER(PARTITION BY bank_code,report_type ORDER BY COALESCE(published_at,discovered_at) DESC,id) AS position FROM central_bank_reports) WHERE position=1 AND extraction_status IN ('complete','partial') AND LENGTH(TRIM(COALESCE(extracted_text,'')))>0 AND (summary_status<>'complete' OR summary_version<?) ORDER BY id LIMIT 36")
        .bind(SUMMARY_VERSION).fetch_all(db).await?)
}
pub(crate) async fn summarize(
    db: &SqlitePool,
    root: &Path,
    id: &str,
    budget: &BudgetStore,
) -> Result<bool, AppError> {
    let row:LocalSummaryRow=sqlx::query_as("SELECT id,bank_code,report_type,title,source_url,published_at,extracted_text FROM central_bank_reports WHERE id=? AND extraction_status IN ('complete','partial') AND LENGTH(TRIM(COALESCE(extracted_text,'')))>0")
        .bind(id).fetch_optional(db).await?.ok_or_else(||AppError::NotFound("Zentralbankbericht".into()))?;
    if !crate::cloud_public::report_readers::official_source(&row.bank_code, &row.source_url) {
        return Err(AppError::Validation(
            "Ungültige offizielle Berichtquelle.".into(),
        ));
    }
    let version: i64 = sqlx::query_scalar(
        "SELECT summary_version FROM central_bank_reports WHERE id=? AND summary_status='complete'",
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .unwrap_or(0);
    if version >= SUMMARY_VERSION {
        return Ok(false);
    }
    let key = std::env::var("OPENAI_API_KEY")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| {
            AppError::Validation(
                "Die neue Cloud-Modellanbindung ist noch nicht eingerichtet.".into(),
            )
        })?;
    let model =
        std::env::var("OPENAI_REPORT_MODEL").unwrap_or_else(|_| DEFAULT_OPENAI_MODEL.into());
    let source = SOURCES
        .iter()
        .find(|s| s.bank_code == row.bank_code)
        .ok_or_else(|| AppError::Validation("Unbekannte Zentralbank.".into()))?;
    let candidate = Candidate {
        title: row.title.clone(),
        url: row.source_url.clone(),
        published_at: row.published_at.clone(),
        report_type: row.report_type.clone(),
    };
    let state = state(db, root);
    let chunks = parse_stored_chunks(&row.extracted_text);
    let chunks =
        summary_chunks_with_previous(&state, id, &row.bank_code, &row.report_type, &chunks).await?;
    let summary = summarize_with_openai(
        &report_client()?,
        &key,
        &model,
        source,
        &candidate,
        &chunks,
        budget,
        StdDuration::from_secs(60),
    )
    .await?;
    let json = serde_json::to_string(&summary).map_err(|_| {
        AppError::DataTransfer("Das Briefing konnte nicht gespeichert werden.".into())
    })?;
    if json.len() > 128_000 {
        return Err(AppError::Validation("Das Briefing ist zu groß.".into()));
    }
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE central_bank_reports SET summary_status='complete',summary_json=?,summary_provider='openai',summary_model=?,summary_version=?,summarized_at=?,updated_at=? WHERE id=?")
        .bind(json).bind(model).bind(SUMMARY_VERSION).bind(&now).bind(&now).bind(id).execute(db).await?;
    Ok(true)
}
pub(crate) async fn export(db: &SqlitePool, destination: &Path) -> Result<u64, AppError> {
    if !destination.is_absolute() || destination.exists() {
        return Err(AppError::Validation(
            "Ein neuer öffentlicher Ausgabepfad ist erforderlich.".into(),
        ));
    }
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)?;
    let schema: Value = serde_json::from_str(include_str!("../../cloud_public/report_schema.json"))
        .expect("reviewed report schema");
    let definition = &schema["central-bank-reports"]["tables"]["central_bank_reports"];
    let mut conn = db.acquire().await?;
    sqlx::query("ATTACH DATABASE ? AS exported")
        .bind(destination.to_string_lossy().as_ref())
        .execute(&mut *conn)
        .await?;
    let result=async {
        let ddl=definition["ddl"].as_str().expect("reviewed DDL").replacen("CREATE TABLE central_bank_reports","CREATE TABLE exported.central_bank_reports",1);
        sqlx::query(&ddl).execute(&mut *conn).await?;
        let columns=sqlx::query("PRAGMA exported.table_info(central_bank_reports)").fetch_all(&mut *conn).await?
            .iter().map(|r|r.get::<String,_>("name")).collect::<Vec<_>>().join(",");
        let oversized:i64=sqlx::query_scalar("SELECT COUNT(*) FROM central_bank_reports WHERE length(CAST(extracted_text AS BLOB))>1000000 OR length(CAST(summary_json AS BLOB))>128000").fetch_one(&mut *conn).await?;
        if oversized>0 {return Err(AppError::Validation("Ein Bericht überschreitet die Cloud-Lesegrenze.".into()))}
        let count=sqlx::query(&format!("INSERT INTO exported.central_bank_reports({columns}) SELECT {columns} FROM main.central_bank_reports")).execute(&mut *conn).await?.rows_affected();
        if count>definition["maxRows"].as_u64().expect("reviewed row limit") {
            return Err(AppError::Validation("Das Berichtspaket überschreitet die freigegebene Größe.".into()));
        }
        Ok(count)
    }.await;
    sqlx::query("DETACH DATABASE exported")
        .execute(&mut *conn)
        .await?;
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn new_export_excludes_work_columns_source_state_and_cost_ledger() {
        let directory = tempfile::tempdir().unwrap();
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(directory.path().join("work.sqlite"))
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        let schema: Value =
            serde_json::from_str(include_str!("../../cloud_public/report_schema.json")).unwrap();
        sqlx::query(
            schema["central-bank-reports"]["tables"]["central_bank_reports"]["ddl"]
                .as_str()
                .unwrap(),
        )
        .execute(&pool)
        .await
        .unwrap();
        prepare_working_copy(&pool).await.unwrap();
        sqlx::raw_sql(include_str!(
            "../../../migrations/0051_report_ai_budget.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO central_bank_reports(id,bank_code,currency,report_type,title,source_url,discovered_at,language,extraction_status,summary_status,extracted_text,local_path,read_at) VALUES('synthetic-report','FED','USD','decision','Public title','https://www.federalreserve.gov/report.htm','2026-09-01','en','complete','pending','[Absatz 1]\nPublic original text','private-path','private-marker')").execute(&pool).await.unwrap();
        let file = directory.path().join("export.sqlite");
        assert_eq!(export(&pool, &file).await.unwrap(), 1);
        let exported = sqlx::sqlite::SqlitePoolOptions::new()
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(&file)
                    .read_only(true),
            )
            .await
            .unwrap();
        let names: Vec<String> =
            sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type='table'")
                .fetch_all(&exported)
                .await
                .unwrap();
        assert_eq!(names, ["central_bank_reports"]);
        let columns = sqlx::query("PRAGMA table_info(central_bank_reports)")
            .fetch_all(&exported)
            .await
            .unwrap();
        assert!(columns.iter().all(|r| {
            !["local_path", "read_at", "sha256", "summary_version"]
                .contains(&r.get::<String, _>("name").as_str())
        }));
        exported.close().await;
        pool.close().await;
    }
}
