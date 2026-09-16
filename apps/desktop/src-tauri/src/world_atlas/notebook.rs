//! Personal Atlas notes and frozen chart images in the backed-up journal DB.
//! No public-cache writes, provider requests, image execution or filesystem paths.
use std::collections::BTreeMap;

use base64::{Engine, engine::general_purpose::STANDARD};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use crate::errors::{AppError, CommandError, CommandResult};

const MAX_IMAGE_BYTES: usize = 2 * 1024 * 1024;
const PARAM_KEYS: &[&str] = &[
    "publicSource",
    "publicMetric",
    "publicCompareMetric",
    "publicSince",
    "hhGroup",
    "hhMetric",
    "hhSince",
    "hhRecord",
    "hhCompareRecord",
    "commodityGroup",
    "commodityMetric",
    "commodityCompare",
    "commodityBasis",
    "commoditySince",
    "commoditySearch",
    "commodityPage",
    "findexGroup",
    "findexMetric",
    "findexPopulation",
    "findexSince",
    "laborGroup",
    "laborMetric",
    "laborSince",
    "innovationGroup",
    "innovationMetric",
    "innovationSince",
    "innovationThrough",
    "healthGroup",
    "healthMetric",
    "healthSince",
    "fiscalGroup",
    "fiscalMetric",
    "fiscalSince",
    "jstGroup",
    "jstMetric",
    "jstSince",
    "jstReal",
    "jstCrises",
    "view",
    "region",
    "area",
    "compare",
    "topic",
    "series",
    "perspective",
    "proxy",
    "statDomain",
    "statGroup",
    "statHorizon",
    "coverageDomain",
    "coverageStatus",
    "coverageSearch",
    "valMode",
    "valBasis",
    "valScope",
    "valMetric",
    "valGroup",
    "valSubject",
    "valCompare",
    "valCompareScope",
    "valPage",
    "valSearch",
    "valTopic",
    "hypothesis",
    "cycleStep",
    "fromCycle",
    "fromGuide",
    "map",
    "mapRegion",
    "mapSearch",
    "topicSearch",
    "numbers",
    "demoProjection",
    "demoYear",
    "historySince",
    "historyProportional",
    "energyMeasure",
    "energySince",
    "ratioBasis",
    "agriMode",
    "agriSince",
    "agriGroup",
    "agriItem",
    "agriSearch",
    "agriPage",
    "educationMetric",
    "educationSince",
    "ratioMode",
    "ratioSince",
    "propertyMode",
    "propertyBasis",
    "propertySince",
    "propertyScale",
    "creditMode",
    "creditSince",
    "debtMode",
    "debtSince",
    "capacityTech",
    "capacityGrid",
    "capacitySince",
    "marketHorizon",
    "relativeHorizon",
    "relativeBenchmark",
    "marketsHorizon",
    "marketsGroup",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavedContext {
    pub version: u32,
    pub params: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceReference {
    pub family: String,
    pub label: String,
    pub scope: String,
    pub dataset_id: String,
    pub status: String,
    pub release: Option<String>,
    pub retrieved_at: Option<String>,
    pub recipe: Option<String>,
    pub hashes: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateEntry {
    pub title: String,
    pub note: String,
    pub favorite: bool,
    pub context_label: String,
    pub captured_at: String,
    pub context: SavedContext,
    pub sources: Vec<SourceReference>,
    pub snapshot_base64: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateEntry {
    pub id: String,
    pub revision: i64,
    pub title: String,
    pub note: String,
    pub favorite: bool,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EntrySummary {
    pub id: String,
    pub title: String,
    pub note_preview: String,
    pub favorite: bool,
    pub context_label: String,
    pub has_image: bool,
    pub captured_at: String,
    pub created_at: String,
    pub updated_at: String,
    pub revision: i64,
    pub trashed_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    #[serde(flatten)]
    pub summary: EntrySummary,
    pub note: String,
    pub context: SavedContext,
    pub sources: Vec<SourceReference>,
    pub snapshot_data_url: Option<String>,
    pub snapshot_status: String,
}

fn bounded(text: &str, max: usize) -> bool {
    text.chars().count() <= max && !text.contains('\0')
}

pub fn validate_context(context: &SavedContext) -> CommandResult<()> {
    if context.version != 1
        || context.params.len() > PARAM_KEYS.len()
        || context
            .params
            .iter()
            .any(|(key, value)| !PARAM_KEYS.contains(&key.as_str()) || !bounded(value, 256))
    {
        return Err(CommandError::validation(
            "Dieser Atlas-Ansichtsstand wird nicht unterstützt.",
        ));
    }
    // A context is a map of local query values, never a URL, file path or command.
    for key in ["area", "compare"] {
        if let Some(id) = context.params.get(key).filter(|id| !id.is_empty()) {
            super::catalog::geography(id)?;
        }
    }
    Ok(())
}

fn validate_text(title: &str, note: &str) -> CommandResult<()> {
    if title.trim().is_empty() || !bounded(title.trim(), 160) || !bounded(note, 12000) {
        return Err(CommandError::validation(
            "Bitte einen Namen mit höchstens 160 und eine Notiz mit höchstens 12.000 Zeichen verwenden.",
        ));
    }
    Ok(())
}

fn validate_sources(sources: &[SourceReference]) -> CommandResult<()> {
    if sources.len() > 160
        || sources.iter().any(|s| {
            ![
                "public",
                "worldbank",
                "un",
                "maddison",
                "ember",
                "irena",
                "oecd",
                "uis",
                "fao",
                "jst",
                "ilo",
                "wipo",
                "who",
                "imf",
                "bis",
                "eodhd",
                "damodaran",
                "hypothesis",
            ]
            .contains(&s.family.as_str())
                || [&s.label, &s.scope, &s.dataset_id, &s.status]
                    .iter()
                    .any(|s| !bounded(s, 400))
                || [&s.release, &s.retrieved_at, &s.recipe]
                    .iter()
                    .filter_map(|s| s.as_ref())
                    .any(|s| !bounded(s, 400))
                || s.hashes.len() > 120
                || s.hashes
                    .iter()
                    .any(|hash| hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()))
        })
    {
        return Err(CommandError::validation(
            "Die Quellenreferenzen der Ansicht sind ungültig oder zu umfangreich.",
        ));
    }
    Ok(())
}

fn image_hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn decode_snapshot(input: Option<&str>) -> CommandResult<Option<Vec<u8>>> {
    let Some(input) = input else {
        return Ok(None);
    };
    if input.len() > MAX_IMAGE_BYTES * 4 / 3 + 8 {
        return Err(CommandError::validation(
            "Das gespeicherte Bild darf höchstens 2 MB groß sein.",
        ));
    }
    let bytes = STANDARD
        .decode(input)
        .map_err(|_| CommandError::validation("Das Atlas-Bild konnte nicht gelesen werden."))?;
    // Only inert PNG bytes, bounded before a browser decoder sees them. SVG/HTML
    // is never accepted or rendered. The producer supplies a canvas PNG.
    if bytes.len() < 45
        || bytes.len() > MAX_IMAGE_BYTES
        || !bytes.starts_with(b"\x89PNG\r\n\x1a\n")
        || &bytes[8..16] != b"\0\0\0\rIHDR"
        || !bytes.ends_with(b"\0\0\0\0IEND\xaeB`\x82")
    {
        return Err(CommandError::validation(
            "Bitte einen vollständigen PNG-Bildstand verwenden.",
        ));
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().unwrap());
    let height = u32::from_be_bytes(bytes[20..24].try_into().unwrap());
    if width == 0
        || height == 0
        || width > 1920
        || height > 16000
        || u64::from(width) * u64::from(height) > 16_000_000
    {
        return Err(CommandError::validation(
            "Die Abmessungen des Atlas-Bildstands sind zu groß oder ungültig.",
        ));
    }
    Ok(Some(bytes))
}

const SUMMARY: &str = "id, title, substr(note, 1, 160) AS note_preview, favorite, context_label, snapshot_png IS NOT NULL AS has_image, captured_at, created_at, updated_at, revision, trashed_at";

pub async fn list(db: &SqlitePool, trashed: bool) -> CommandResult<Vec<EntrySummary>> {
    let sql = format!(
        "SELECT {SUMMARY} FROM atlas_notebook_entries WHERE (trashed_at IS NOT NULL) = ? ORDER BY favorite DESC, updated_at DESC, id ASC"
    );
    Ok(sqlx::query_as(&sql).bind(trashed).fetch_all(db).await?)
}

pub async fn get(db: &SqlitePool, id: &str) -> CommandResult<Entry> {
    let mut transaction = db.begin().await?;
    let summary: EntrySummary = sqlx::query_as(&format!(
        "SELECT {SUMMARY} FROM atlas_notebook_entries WHERE id = ?"
    ))
    .bind(id)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or_else(|| AppError::NotFound("Gemerkte Atlasansicht".into()))?;
    let (note, context, sources, image, hash): (String, String, String, Option<Vec<u8>>, Option<String>) = sqlx::query_as(
        "SELECT note, context_json, sources_json, snapshot_png, snapshot_sha256 FROM atlas_notebook_entries WHERE id = ?")
        .bind(id).fetch_one(&mut *transaction).await?;
    transaction.commit().await?;
    let image_valid = image.as_ref().map(|b| image_hash(b)) == hash;
    let snapshot_status = if !image_valid {
        "unreadable"
    } else if image.is_some() {
        "available"
    } else {
        "not_captured"
    }
    .to_string();
    Ok(Entry {
        summary,
        note,
        context: serde_json::from_str(&context)
            .map_err(|_| CommandError::validation("Die gemerkte Ansicht ist nicht lesbar."))?,
        sources: serde_json::from_str(&sources).map_err(|_| {
            CommandError::validation("Die gespeicherten Quellenreferenzen sind nicht lesbar.")
        })?,
        snapshot_data_url: image
            .filter(|_| image_valid)
            .map(|bytes| format!("data:image/png;base64,{}", STANDARD.encode(bytes))),
        snapshot_status,
    })
}

pub async fn create(db: &SqlitePool, input: CreateEntry) -> CommandResult<Entry> {
    validate_text(&input.title, &input.note)?;
    validate_context(&input.context)?;
    validate_sources(&input.sources)?;
    let captured_at = chrono::DateTime::parse_from_rfc3339(&input.captured_at)
        .map_err(|_| CommandError::validation("Der Zeitpunkt des Diagrammstands ist ungültig."))?
        .with_timezone(&Utc)
        .to_rfc3339();
    if !bounded(&input.context_label, 400) {
        return Err(CommandError::validation(
            "Die Bildbeschreibung ist zu lang.",
        ));
    }
    let png = decode_snapshot(input.snapshot_base64.as_deref())?;
    let hash = png.as_ref().map(|b| image_hash(b));
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let context = serde_json::to_string(&input.context)
        .map_err(|_| CommandError::validation("Ansicht ungültig."))?;
    let sources = serde_json::to_string(&input.sources)
        .map_err(|_| CommandError::validation("Quellen ungültig."))?;
    sqlx::query("INSERT INTO atlas_notebook_entries(id, title, note, favorite, context_label, context_json, sources_json, snapshot_png, snapshot_sha256, captured_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id).bind(input.title.trim()).bind(&input.note).bind(input.favorite).bind(input.context_label).bind(context).bind(sources)
        .bind(png).bind(hash).bind(&captured_at).bind(&now).bind(&now).execute(db).await?;
    get(db, &id).await
}

pub async fn update(db: &SqlitePool, input: UpdateEntry) -> CommandResult<Entry> {
    validate_text(&input.title, &input.note)?;
    let changed = sqlx::query("UPDATE atlas_notebook_entries SET title = ?, note = ?, favorite = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ? AND trashed_at IS NULL")
        .bind(input.title.trim()).bind(&input.note).bind(input.favorite).bind(Utc::now().to_rfc3339()).bind(&input.id).bind(input.revision).execute(db).await?.rows_affected();
    if changed != 1 {
        return Err(AppError::Conflict(
            "Diese Notiz wurde inzwischen verändert oder verschoben. Bitte erneut öffnen.".into(),
        )
        .into());
    }
    get(db, &input.id).await
}

pub async fn trash(
    db: &SqlitePool,
    id: &str,
    revision: i64,
    trashed: bool,
) -> CommandResult<Entry> {
    let now = Utc::now().to_rfc3339();
    let changed = sqlx::query("UPDATE atlas_notebook_entries SET trashed_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ?")
        .bind(if trashed {Some(&now)} else {None}).bind(&now).bind(id).bind(revision).execute(db).await?.rows_affected();
    if changed != 1 {
        return Err(AppError::Conflict(
            "Diese Atlasansicht wurde inzwischen verändert. Bitte erneut öffnen.".into(),
        )
        .into());
    }
    get(db, id).await
}

pub async fn last_context(db: &SqlitePool) -> CommandResult<Option<SavedContext>> {
    let value: Option<String> =
        sqlx::query_scalar("SELECT last_context_json FROM atlas_personal_preferences WHERE id = 1")
            .fetch_optional(db)
            .await?;
    value
        .map(|value| {
            serde_json::from_str(&value).map_err(|_| {
                CommandError::validation("Der letzte Atlas-Ansichtsstand ist nicht lesbar.")
            })
        })
        .transpose()
}

pub async fn save_last_context(db: &SqlitePool, context: SavedContext) -> CommandResult<()> {
    validate_context(&context)?;
    let value = serde_json::to_string(&context)
        .map_err(|_| CommandError::validation("Ansicht ungültig."))?;
    sqlx::query("INSERT INTO atlas_personal_preferences(id, last_context_json, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET last_context_json = excluded.last_context_json, updated_at = excluded.updated_at")
        .bind(value).bind(Utc::now().to_rfc3339()).execute(db).await.map_err(|error| {
            // This one autocommit upsert is idempotent. Expose only SQLite BUSY
            // (including extended codes) for the ordered preference retry queue.
            // Other notebook writes and database failures must not be retried blindly.
            if error.as_database_error().and_then(|e| e.code())
                .and_then(|code| code.parse::<i32>().ok())
                .is_some_and(|code| code & 0xff == 5)
            {
                CommandError {
                    code: "ATLAS_PREFERENCES_BUSY".into(),
                    message: "Die letzte Atlasansicht kann nach der laufenden Datenbankaktualisierung gespeichert werden.".into(),
                    details: None,
                }
            } else {
                error.into()
            }
        })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        commands::{create_backup_for_state, preview_backup, stage_backup_restore_for_state},
        database::{apply_pending_restore_for_test, initialize_headless},
    };
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

    #[tokio::test]
    async fn world_atlas_last_context_classifies_real_busy_and_preserves_previous_view() {
        use sqlx::{Connection, sqlite::SqliteJournalMode};
        use std::time::Duration;
        let dir = tempfile::tempdir().unwrap();
        let options = SqliteConnectOptions::new()
            .filename(dir.path().join("preferences.sqlite"))
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            .busy_timeout(Duration::from_millis(40));
        let db = SqlitePoolOptions::new()
            .max_connections(2)
            .connect_with(options.clone())
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&db).await.unwrap();
        let original = input().context;
        save_last_context(&db, original.clone()).await.unwrap();
        let mut next = original.clone();
        next.params.insert("area".into(), "m49:276".into());

        let mut writer = sqlx::SqliteConnection::connect_with(&options)
            .await
            .unwrap();
        sqlx::query("BEGIN IMMEDIATE")
            .execute(&mut writer)
            .await
            .unwrap();
        sqlx::query("INSERT INTO app_settings(key, value_json, updated_at) VALUES ('atlas-lock-test', 'true', '2026-09-09')")
            .execute(&mut writer).await.unwrap();
        let error = save_last_context(&db, next.clone()).await.unwrap_err();
        assert_eq!(error.code, "ATLAS_PREFERENCES_BUSY");
        assert!(error.details.is_none());
        assert_eq!(last_context(&db).await.unwrap(), Some(original));
        sqlx::query("COMMIT").execute(&mut writer).await.unwrap();
        save_last_context(&db, next.clone()).await.unwrap();
        assert_eq!(last_context(&db).await.unwrap(), Some(next.clone()));
        writer.close().await.unwrap();

        let readonly = SqlitePoolOptions::new()
            .connect_with(options.read_only(true).create_if_missing(false))
            .await
            .unwrap();
        assert_eq!(
            save_last_context(&readonly, next.clone())
                .await
                .unwrap_err()
                .code,
            "DATABASE_ERROR"
        );
        assert_eq!(last_context(&db).await.unwrap(), Some(next));
        readonly.close().await;
        db.close().await;
    }

    fn input() -> CreateEntry {
        CreateEntry {
            title: "Indien · Altersstruktur".into(),
            note: "Eigene Beobachtung <b>als Text</b>".into(),
            favorite: true,
            context_label: "Indien / Deutschland · UN-Altersstruktur · 2023".into(),
            captured_at: "2026-09-09T00:00:00Z".into(),
            context: SavedContext {
                version: 1,
                params: BTreeMap::from([
                    ("area".into(), "m49:356".into()),
                    ("compare".into(), "m49:276".into()),
                    ("demoYear".into(), "2023".into()),
                ]),
            },
            sources: vec![SourceReference {
                family: "un".into(),
                label: "UN WPP".into(),
                scope: "Indien".into(),
                dataset_id: "un-wpp-2024".into(),
                status: "available".into(),
                release: Some("2024".into()),
                retrieved_at: Some("2026-09-09T00:00:00Z".into()),
                recipe: None,
                hashes: vec!["a".repeat(64)],
            }],
            snapshot_base64: Some(
                STANDARD.encode(include_bytes!("../../tests/fixtures/trade-ticket.png")),
            ),
        }
    }

    #[tokio::test]
    async fn world_atlas_notebook_preserves_topic_scope_after_reopening() {
        let dir = tempfile::tempdir().unwrap();
        let options = SqliteConnectOptions::new()
            .filename(dir.path().join("notes.sqlite"))
            .create_if_missing(true);
        let db = SqlitePoolOptions::new()
            .connect_with(options.clone())
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&db).await.unwrap();
        let mut request = input();
        request.title = "Chemie · globale Quellenregion".into();
        request.context_label = request.title.clone();
        request.sources.clear();
        request.snapshot_base64 = None;
        request.context.params = BTreeMap::from([
            ("area".into(), "m49:276".into()),
            ("view".into(), "valuation".into()),
            ("valMode".into(), "industries".into()),
            ("valTopic".into(), "industry:chemicals".into()),
            ("valScope".into(), "global".into()),
            ("valCompareScope".into(), "india".into()),
            ("valBasis".into(), "pe".into()),
            ("valSearch".into(), "Spezial".into()),
        ]);
        let expected = request.context.clone();
        let saved = create(&db, request).await.unwrap();
        save_last_context(&db, expected.clone()).await.unwrap();
        db.close().await;
        let reopened = SqlitePoolOptions::new()
            .connect_with(options)
            .await
            .unwrap();
        assert_eq!(
            get(&reopened, &saved.summary.id).await.unwrap().context,
            expected
        );
        assert_eq!(last_context(&reopened).await.unwrap(), Some(expected));
        reopened.close().await;
    }

    #[tokio::test]
    async fn world_atlas_relative_context_survives_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let options = SqliteConnectOptions::new()
            .filename(dir.path().join("relative-notes.sqlite"))
            .create_if_missing(true);
        let db = SqlitePoolOptions::new()
            .connect_with(options.clone())
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&db).await.unwrap();
        let mut request = input();
        request.sources.clear();
        request.snapshot_base64 = None;
        request.context.params = BTreeMap::from([
            ("topic".into(), "market_context:relative_strength".into()),
            ("area".into(), "m49:356".into()),
            ("proxy".into(), "eodhd:INDA.US".into()),
            ("relativeBenchmark".into(), "eodhd:ACWI.US".into()),
            ("relativeHorizon".into(), "10".into()),
        ]);
        let expected = request.context.clone();
        let saved = create(&db, request).await.unwrap();
        save_last_context(&db, expected.clone()).await.unwrap();
        db.close().await;
        let reopened = SqlitePoolOptions::new()
            .connect_with(options)
            .await
            .unwrap();
        assert_eq!(
            get(&reopened, &saved.summary.id).await.unwrap().context,
            expected
        );
        assert_eq!(last_context(&reopened).await.unwrap(), Some(expected));
        reopened.close().await;
    }

    #[tokio::test]
    async fn world_atlas_notebook_preserves_context_guide_after_reopening() {
        let dir = tempfile::tempdir().unwrap();
        let options = SqliteConnectOptions::new()
            .filename(dir.path().join("context-guide.sqlite"))
            .create_if_missing(true);
        let db = SqlitePoolOptions::new()
            .connect_with(options.clone())
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&db).await.unwrap();
        let mut request = input();
        request.title = "Industrialisierung · Beschäftigung".into();
        request.context_label = request.title.clone();
        request.sources.clear();
        request.snapshot_base64 = None;
        request.context.params = BTreeMap::from([
            ("area".into(), "m49:276".into()),
            ("compare".into(), "m49:840".into()),
            ("topic".into(), "labor:employment".into()),
            ("series".into(), "worldbank:2:SL.IND.EMPL.ZS".into()),
            ("perspective".into(), "worldbank".into()),
            (
                "fromGuide".into(),
                "structural_change:industrialization".into(),
            ),
        ]);
        let expected = request.context.clone();
        let saved = create(&db, request).await.unwrap();
        save_last_context(&db, expected.clone()).await.unwrap();
        db.close().await;
        let reopened = SqlitePoolOptions::new()
            .connect_with(options)
            .await
            .unwrap();
        assert_eq!(
            get(&reopened, &saved.summary.id).await.unwrap().context,
            expected
        );
        assert_eq!(last_context(&reopened).await.unwrap(), Some(expected));
        reopened.close().await;
    }

    #[tokio::test]
    async fn world_atlas_notebook_roundtrip_conflicts_trash_and_backup_restore() {
        let state = initialize_headless().await.unwrap();
        let original = create(&state.db, input()).await.unwrap();
        let id = original.summary.id.clone();
        assert_eq!(list(&state.db, false).await.unwrap().len(), 1);
        assert!(original.summary.has_image);
        save_last_context(&state.db, original.context.clone())
            .await
            .unwrap();
        let backup = create_backup_for_state(&state).await.unwrap();
        assert!(preview_backup(backup.path.clone()).await.unwrap().valid);
        let updated = update(
            &state.db,
            UpdateEntry {
                id: id.clone(),
                revision: 1,
                title: "Umbenannt".into(),
                note: "Neue Notiz".into(),
                favorite: false,
            },
        )
        .await
        .unwrap();
        assert_eq!(updated.context, original.context);
        assert_eq!(updated.snapshot_data_url, original.snapshot_data_url);
        assert_eq!(updated.summary.captured_at, original.summary.captured_at);
        assert_eq!(updated.summary.revision, 2);
        assert!(
            update(
                &state.db,
                UpdateEntry {
                    id: id.clone(),
                    revision: 1,
                    title: "Veralteter Entwurf".into(),
                    note: String::new(),
                    favorite: false
                }
            )
            .await
            .is_err()
        );
        let trashed = trash(&state.db, &id, 2, true).await.unwrap();
        assert!(list(&state.db, false).await.unwrap().is_empty());
        assert_eq!(list(&state.db, true).await.unwrap().len(), 1);
        let restored = trash(&state.db, &id, trashed.summary.revision, false)
            .await
            .unwrap();
        assert_eq!(restored.note, "Neue Notiz");
        let staged = stage_backup_restore_for_state(&state, backup.path)
            .await
            .unwrap();
        assert!(std::path::Path::new(&staged.safety_copy_path).exists());
        // Model a restart: hold every connection before closing the pool so no
        // asynchronous on-release ping still owns a Windows SQLite handle.
        let mut connections = Vec::new();
        for _ in 0..4 {
            connections.push(state.db.acquire().await.unwrap());
        }
        let closing = state.db.close();
        for connection in connections {
            connection.close().await.unwrap();
        }
        closing.await;
        apply_pending_restore_for_test(&state.paths).unwrap();
        let db = SqlitePoolOptions::new()
            .connect_with(SqliteConnectOptions::new().filename(&state.paths.database))
            .await
            .unwrap();
        let saved = get(&db, &id).await.unwrap();
        assert_eq!(saved.note, original.note);
        assert_eq!(saved.summary.title, original.summary.title);
        assert_eq!(saved.snapshot_data_url, original.snapshot_data_url);
        assert_eq!(last_context(&db).await.unwrap(), Some(original.context));
        assert!(
            !state.paths.root.join("atlas").exists(),
            "No public cache is needed to restore a personal picture"
        );
        // A corrupt picture must not hide the user's recoverable note text.
        sqlx::query("UPDATE atlas_notebook_entries SET snapshot_sha256 = 'bad' WHERE id = ?")
            .bind(&id)
            .execute(&db)
            .await
            .unwrap();
        let damaged = get(&db, &id).await.unwrap();
        assert_eq!(damaged.snapshot_status, "unreadable");
        assert!(damaged.snapshot_data_url.is_none());
        assert_eq!(damaged.note, original.note);
        db.close().await;
    }

    #[tokio::test]
    async fn world_atlas_notebook_backup_remains_consistent_during_writes() {
        use sqlx::Connection;
        use std::sync::{
            Arc,
            atomic::{AtomicBool, Ordering},
        };
        let state = initialize_headless().await.unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let writer_stop = stop.clone();
        let writer_db = state.db.clone();
        let (started, first_commit) = tokio::sync::oneshot::channel();
        let writer = tokio::spawn(async move {
            let mut started = Some(started);
            let mut sequence = 0_u64;
            while !writer_stop.load(Ordering::SeqCst) {
                sequence += 1;
                let mut tx = writer_db.begin().await.unwrap();
                for key in ["atlas-snapshot-a", "atlas-snapshot-b"] {
                    sqlx::query("INSERT INTO app_settings(key, value_json, updated_at) VALUES (?, ?, '2026-09-09T00:00:00Z') ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json")
                        .bind(key).bind(sequence.to_string()).execute(&mut *tx).await.unwrap();
                    tokio::task::yield_now().await;
                }
                tx.commit().await.unwrap();
                if let Some(started) = started.take() {
                    started.send(()).unwrap();
                }
                tokio::task::yield_now().await;
            }
            sequence
        });
        first_commit.await.unwrap();
        let scratch = tempfile::tempdir().unwrap();
        for n in 0..3 {
            let backup = create_backup_for_state(&state).await.unwrap();
            assert!(preview_backup(backup.path.clone()).await.unwrap().valid);
            let snapshot_path = scratch.path().join(format!("snapshot-{n}.sqlite"));
            {
                let mut archive =
                    zip::ZipArchive::new(std::fs::File::open(backup.path).unwrap()).unwrap();
                let mut source = archive.by_name("database/journal.sqlite").unwrap();
                let mut target = std::fs::File::create(&snapshot_path).unwrap();
                std::io::copy(&mut source, &mut target).unwrap();
            }
            let mut snapshot = sqlx::SqliteConnection::connect_with(
                &SqliteConnectOptions::new()
                    .filename(snapshot_path)
                    .read_only(true),
            )
            .await
            .unwrap();
            let check: String = sqlx::query_scalar("PRAGMA integrity_check")
                .fetch_one(&mut snapshot)
                .await
                .unwrap();
            assert_eq!(check, "ok");
            let values: Vec<String> = sqlx::query_scalar("SELECT value_json FROM app_settings WHERE key IN ('atlas-snapshot-a', 'atlas-snapshot-b') ORDER BY key").fetch_all(&mut snapshot).await.unwrap();
            assert_eq!(values.len(), 2);
            assert_eq!(
                values[0], values[1],
                "The snapshot must contain a complete committed transaction"
            );
            snapshot.close().await.unwrap();
        }
        stop.store(true, Ordering::SeqCst);
        assert!(writer.await.unwrap() > 1);
        assert!(
            !std::fs::read_dir(&state.paths.backups)
                .unwrap()
                .any(|entry| entry
                    .unwrap()
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".database-snapshot-"))
        );
        state.db.close().await;
    }

    #[tokio::test]
    async fn world_atlas_notebook_upgrade_preserves_v46_user_data_and_rejects_invalid_input() {
        let dir = tempfile::tempdir().unwrap();
        let migration_dir = dir.path().join("old-migrations");
        std::fs::create_dir(&migration_dir).unwrap();
        for file in std::fs::read_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/migrations")).unwrap() {
            let file = file.unwrap();
            let name = file.file_name().to_string_lossy().to_string();
            if name.ends_with(".sql") && name[..4].parse::<u32>().unwrap() <= 46 {
                std::fs::copy(file.path(), migration_dir.join(name)).unwrap();
            }
        }
        let db = SqlitePoolOptions::new()
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(dir.path().join("journal.sqlite"))
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        sqlx::migrate::Migrator::new(migration_dir.as_path())
            .await
            .unwrap()
            .run(&db)
            .await
            .unwrap();
        sqlx::query("INSERT INTO app_settings(key, value_json, updated_at) VALUES ('atlas-test-kept', '{\"retained\":true}', '2026-09-09T00:00:00Z')").execute(&db).await.unwrap();
        sqlx::migrate!("./migrations").run(&db).await.unwrap();
        let retained: String =
            sqlx::query_scalar("SELECT value_json FROM app_settings WHERE key = 'atlas-test-kept'")
                .fetch_one(&db)
                .await
                .unwrap();
        assert_eq!(retained, "{\"retained\":true}");
        assert!(last_context(&db).await.unwrap().is_none());
        let mut invalid = input();
        invalid
            .context
            .params
            .insert("redirect".into(), "https://untrusted.invalid".into());
        assert!(create(&db, invalid).await.is_err());
        let mut invalid = input();
        invalid
            .context
            .params
            .insert("area".into(), "../../journal.sqlite".into());
        assert!(create(&db, invalid).await.is_err());
        let mut invalid = input();
        invalid.note = "x".repeat(12001);
        assert!(create(&db, invalid).await.is_err());
        let mut invalid = input();
        invalid.snapshot_base64 = Some(STANDARD.encode(b"<svg onload='alert(1)'/>"));
        assert!(create(&db, invalid).await.is_err());
        let mut invalid = input();
        invalid.snapshot_base64.as_mut().unwrap().truncate(70);
        assert!(create(&db, invalid).await.is_err());
        assert!(list(&db, false).await.unwrap().is_empty());
        db.close().await;
    }
}
