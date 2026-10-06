//! Browser transfer uses fixed tables and the caller's revision transaction.
//! Backup originals stay immutable in private Blob; references remain server-only.
use super::{
    CloudError, CloudResult,
    common::{argument, encoded, require_active_account},
};
use crate::domain::models::TradeInput;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::PgConnection;
use uuid::Uuid;

pub(super) const COMMANDS: &[(&str, bool)] = &[
    ("import_trades_batch", true),
    ("list_cloud_backups", false),
    ("create_cloud_backup", true),
    ("get_cloud_backup", false),
    ("restore_cloud_backup", true),
    ("get_learning_progress", false),
    ("save_learning_progress", true),
];
// Parent-first order; restoration deletes in reverse. No provider credentials,
// public caches, costs, workspace identities, leases or operation receipts.
const TABLES: &[&str] = &[
    "accounts",
    "app_settings",
    "strategies",
    "tags",
    "emotions",
    "mistakes",
    "checklist_templates",
    "custom_fields",
    "goals",
    "saved_views",
    "atlas_notebook_entries",
    "atlas_personal_preferences",
    "account_cashflows",
    "broker_account_connections",
    "checklist_template_items",
    "setups",
    "setup_versions",
    "trades",
    "trade_legs",
    "trade_tags",
    "trade_checklist_items",
    "trade_emotions",
    "trade_mistakes",
    "custom_field_values",
    "reviews",
    "goal_progress",
    "media_files",
    "cloud_media_objects",
    "trade_media",
    "media_annotations",
    "deleted_items",
    "cloud_report_reads",
    "cloud_learning_progress",
];
const MAX_BACKUP_BYTES: usize = 16 * 1024 * 1024;
const MAX_STORED_BYTES: i64 = 32 * 1024 * 1024;

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct BackupRecord {
    id: String,
    created_at: String,
    source_revision: i64,
    sha256: String,
    size_bytes: i64,
    safety_copy: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BatchInput {
    account_id: String,
    trades: Vec<TradeInput>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RestoreInput {
    id: String,
    confirmation: String,
}

fn hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
fn backup_id(id: &str) -> CloudResult<()> {
    if Uuid::parse_str(id).is_ok_and(|uuid| uuid.to_string() == id) {
        Ok(())
    } else {
        Err(CloudError::validation(
            "Die Sicherungskennung ist ungültig.",
        ))
    }
}
async fn capture(db: &mut PgConnection) -> CloudResult<Value> {
    let mut tables = serde_json::Map::new();
    for table in TABLES {
        let filter = if *table == "app_settings" {
            " WHERE key IN ('appearance','analytics')"
        } else {
            ""
        };
        let mut rows: Vec<Value> = sqlx::query_scalar(&format!(
            "SELECT to_jsonb(r) FROM \"{table}\" r{filter} ORDER BY to_jsonb(r)::text"
        ))
        .fetch_all(&mut *db)
        .await?;
        if *table == "app_settings" {
            for row in &mut rows {
                let key = row["key"]
                    .as_str()
                    .ok_or_else(|| CloudError::validation("Die Einstellung ist ungültig."))?;
                let value = serde_json::from_str(
                    row["value_json"]
                        .as_str()
                        .ok_or_else(|| CloudError::validation("Die Einstellung ist ungültig."))?,
                )?;
                row["value_json"] =
                    json!(super::system::safe_setting_value(key, value)?.to_string());
            }
        }
        if *table == "broker_account_connections" {
            for row in &mut rows {
                row["credential_ref"] = Value::Null;
            }
        }
        tables.insert((*table).to_owned(), json!(rows));
        if serde_json::to_vec(&tables)?.len() > MAX_BACKUP_BYTES {
            return Err(CloudError::validation(
                "Die Sicherung überschreitet 16 MiB. Der Datenstand bleibt unverändert.",
            ));
        }
    }
    Ok(json!({"format":"personal-macro-cloud-v1", "tables":tables}))
}
async fn create_backup(db: &mut PgConnection, safety: bool) -> CloudResult<BackupRecord> {
    let payload = serde_json::to_string(&capture(&mut *db).await?)?;
    let occupied: i64 =
        sqlx::query_scalar("SELECT COALESCE(SUM(size_bytes),0)::bigint FROM cloud_journal_backups")
            .fetch_one(&mut *db)
            .await?;
    if occupied + payload.len() as i64 > MAX_STORED_BYTES {
        return Err(CloudError::validation(
            "Der Sicherungsspeicher von 32 MiB ist ausgeschöpft. Es wurde keine Sicherung gelöscht.",
        ));
    }
    let id = Uuid::new_v4().to_string();
    let digest = hash(payload.as_bytes());
    let revision: i64 = sqlx::query_scalar("SELECT revision FROM cloud_workspace WHERE id=1")
        .fetch_one(&mut *db)
        .await?;
    sqlx::query("INSERT INTO cloud_journal_backups(id,created_at,source_revision,payload_json,sha256,size_bytes,safety_copy) VALUES($1,$2,$3,$4,$5,$6,$7)")
        .bind(&id).bind(Utc::now().to_rfc3339()).bind(revision).bind(&payload)
        .bind(digest).bind(payload.len() as i64).bind(safety).execute(&mut *db).await?;
    sqlx::query_as("SELECT id,created_at,source_revision,sha256,size_bytes,safety_copy FROM cloud_journal_backups WHERE id=$1")
        .bind(id).fetch_one(db).await.map_err(Into::into)
}
async fn load_backup(db: &mut PgConnection, id: &str) -> CloudResult<Value> {
    backup_id(id)?;
    let (payload, digest, bytes): (String, String, i64) = sqlx::query_as(
        "SELECT payload_json,sha256,size_bytes FROM cloud_journal_backups WHERE id=$1",
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| CloudError::new("NOT_FOUND", "Die Sicherung wurde nicht gefunden."))?;
    if payload.len() as i64 != bytes || hash(payload.as_bytes()) != digest {
        return Err(CloudError::validation(
            "Die Prüfsumme der Sicherung stimmt nicht. Es wurden keine Daten geändert.",
        ));
    }
    let data: Value = serde_json::from_str(&payload)?;
    if data.get("format").and_then(Value::as_str) != Some("personal-macro-cloud-v1")
        || data
            .get("tables")
            .and_then(Value::as_object)
            .is_none_or(|tables| {
                tables.len() != TABLES.len()
                    || TABLES
                        .iter()
                        .any(|table| !tables.get(*table).is_some_and(Value::is_array))
            })
    {
        return Err(CloudError::validation(
            "Der Sicherungsvertrag ist unvollständig.",
        ));
    }
    Ok(data)
}
async fn restore(db: &mut PgConnection, input: RestoreInput) -> CloudResult<Value> {
    if input.confirmation != "WIEDERHERSTELLEN" {
        return Err(CloudError::validation(
            "Bitte die Wiederherstellung ausdrücklich bestätigen.",
        ));
    }
    let data = load_backup(&mut *db, &input.id).await?;
    // Provider mappings cannot be rewound independently from their credentials,
    // queued imports and before-images. Disconnect first rather than corrupt them.
    let connected: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM myfxbook_connections) OR EXISTS(SELECT 1 FROM cloud_myfxbook_previews)")
        .fetch_one(&mut *db).await?;
    if connected {
        return Err(CloudError::validation(
            "Trenne Myfxbook und warte auf das Ende offener Vorschauen, bevor du den Journalstand wiederherstellst.",
        ));
    }
    let accounts = data["tables"]["accounts"].as_array().unwrap();
    if !accounts
        .iter()
        .any(|row| row.get("is_archived") == Some(&Value::Bool(false)))
    {
        return Err(CloudError::validation(
            "Die Sicherung enthält kein aktives Konto.",
        ));
    }
    let safety = create_backup(&mut *db, true).await?;
    for table in TABLES.iter().rev().filter(|table| **table != "accounts") {
        let filter = if *table == "app_settings" {
            " WHERE key IN ('appearance','analytics')"
        } else {
            ""
        };
        sqlx::query(&format!("DELETE FROM \"{table}\"{filter}"))
            .execute(&mut *db)
            .await?;
    }
    // Retain account identities referenced by immutable provider audit history.
    // Accounts created after the backup become archived; existing IDs are restored.
    sqlx::query("UPDATE accounts SET is_archived=TRUE")
        .execute(&mut *db)
        .await?;
    for table in TABLES {
        let conflict = if *table == "accounts" {
            " ON CONFLICT(id) DO UPDATE SET name=excluded.name,broker=excluded.broker,account_type=excluded.account_type,base_currency=excluded.base_currency,initial_balance_minor=excluded.initial_balance_minor,is_archived=excluded.is_archived,created_at=excluded.created_at,updated_at=excluded.updated_at,default_risk_percent=excluded.default_risk_percent"
        } else {
            ""
        };
        sqlx::query(&format!("INSERT INTO \"{table}\" SELECT * FROM jsonb_populate_recordset(NULL::\"{table}\",$1::jsonb){conflict}"))
            .bind(&data["tables"][*table]).execute(&mut *db).await?;
    }
    Ok(json!({"safetyBackupId":safety.id,"restoredBackupId":input.id}))
}

pub(super) async fn dispatch(
    db: &mut PgConnection,
    name: &str,
    args: &Value,
) -> CloudResult<Value> {
    match name {
        "import_trades_batch" => {
            let batch: BatchInput = argument(args, "input")?;
            require_active_account(&mut *db, &batch.account_id).await?;
            if batch.trades.is_empty() || batch.trades.len() > 250 || batch.trades.iter().any(|t| t.account_id != batch.account_id || t.id.is_some()) {
                return Err(CloudError::validation("Ein Import benötigt 1 bis 250 neue Trades im ausgewählten Konto."));
            }
            let count = batch.trades.len();
            for trade in batch.trades { super::trades::create(&mut *db, trade).await?; }
            Ok(json!({"imported":count}))
        }
        "list_cloud_backups" => encoded(sqlx::query_as::<_, BackupRecord>("SELECT id,created_at,source_revision,sha256,size_bytes,safety_copy FROM cloud_journal_backups ORDER BY created_at DESC,id DESC")
            .fetch_all(db).await?),
        "create_cloud_backup" => encoded(create_backup(db, false).await?),
        "get_cloud_backup" => {
            let mut data = load_backup(db, &argument::<String>(args,"id")?).await?;
            let tables = data["tables"].as_object_mut().unwrap();
            tables.remove("cloud_media_objects");
            for row in tables.get_mut("broker_account_connections").unwrap().as_array_mut().unwrap() {
                row.as_object_mut().unwrap().remove("credential_ref");
            }
            for row in tables.get_mut("media_files").unwrap().as_array_mut().unwrap() {
                row["relative_path"] = json!(format!("/api/media?id={}",row["id"].as_str().unwrap_or_default()));
                row["thumbnail_relative_path"] = Value::Null;
            }
            for row in tables.get_mut("media_annotations").unwrap().as_array_mut().unwrap() { row["preview_relative_path"] = Value::Null; }
            Ok(data)
        }
        "restore_cloud_backup" => restore(db,argument(args,"input")?).await,
        "get_learning_progress" => {
            let value: Option<String> = sqlx::query_scalar("SELECT value_json FROM cloud_learning_progress WHERE id=1").fetch_optional(db).await?;
            Ok(value.map(|value| serde_json::from_str(&value)).transpose()?.unwrap_or(json!({"version":1,"known":[],"saved":[],"notes":{},"last":null})))
        }
        "save_learning_progress" => {
            let value: Value = argument(args,"input")?;
            validate_learning(&value)?;
            sqlx::query("INSERT INTO cloud_learning_progress(id,value_json,updated_at) VALUES(1,$1,$2) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at")
                .bind(value.to_string()).bind(Utc::now().to_rfc3339()).execute(db).await?;
            Ok(Value::Null)
        }
        _ => Err(CloudError::new("COMMAND_UNAVAILABLE", "Diese Datenfunktion ist nicht verfügbar.")),
    }
}
fn validate_learning(value: &Value) -> CloudResult<()> {
    let valid_id = |id: &str| {
        !id.is_empty()
            && id.len() <= 100
            && id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
    };
    let valid_ids = |name: &str| {
        value[name].as_array().is_some_and(|ids| {
            ids.len() <= 512 && ids.iter().all(|v| v.as_str().is_some_and(valid_id))
        })
    };
    let valid_notes = value["notes"].as_object().is_some_and(|notes| {
        notes.len() <= 512
            && notes.iter().all(|(id, note)| {
                valid_id(id) && note.as_str().is_some_and(|s| s.chars().count() <= 2000)
            })
    });
    let last = &value["last"];
    if value.as_object().is_none_or(|o| o.len() != 5)
        || value["version"] != json!(1)
        || !valid_ids("known")
        || !valid_ids("saved")
        || !valid_notes
        || !(last.is_null()
            || (last.as_object().is_some_and(|o| o.len() == 2)
                && last["lesson"].as_str().is_some_and(valid_id)
                && last["step"].as_u64().is_some_and(|step| step <= 5)))
        || value.to_string().len() > 300_000
    {
        return Err(CloudError::validation(
            "Der Lernstand ist ungültig oder zu umfangreich.",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn transfer_contract_excludes_secrets_and_unknown_tables() {
        assert!(!TABLES.iter().any(|t| t.contains("credential")
            || t.contains("budget")
            || t.contains("provider")
            || t.contains("public")));
        assert_eq!(
            TABLES.len(),
            TABLES
                .iter()
                .collect::<std::collections::HashSet<_>>()
                .len()
        );
        assert!(backup_id("../journal.sqlite").is_err());
        assert!(validate_learning(&json!({"version":1,"known":["test"],"saved":[],"notes":{"test":"note"},"last":{"lesson":"test","step":5}})).is_ok());
        assert!(
            validate_learning(
                &json!({"version":1,"known":[],"saved":[],"notes":{},"last":null,"secret":"no"})
            )
            .is_err()
        );
    }

    #[tokio::test]
    #[ignore = "Requires MACRO_TEST_ENV_FILE; uses a disposable isolated schema"]
    async fn postgres_transfer_backup_restore_and_batch_are_atomic() {
        use futures_util::FutureExt;
        use std::panic::{AssertUnwindSafe, resume_unwind};
        let fixture = super::super::test_support::TestDatabase::open().await;
        let result = AssertUnwindSafe(async {
            let mut tx = fixture.pool.begin().await.unwrap();
            let account = super::super::system::dispatch(&mut tx,"save_account",&json!({"input":{"name":"Synthetic transfer fixture","accountType":"demo","baseCurrency":"EUR","initialBalanceMinor":10000,"defaultRiskPercent":1}})).await.unwrap();
            let id = account["id"].as_str().unwrap().to_owned();
            let trade = json!({"accountId":id,"instrument":"EURUSD","direction":"long","status":"closed","closedAt":"2026-10-06T00:00:00Z","netPnlMinor":1234});
            dispatch(&mut tx,"import_trades_batch",&json!({"input":{"accountId":id,"trades":[trade.clone()]}})).await.unwrap();
            let backup = create_backup(&mut tx,false).await.unwrap();
            let read = dispatch(&mut tx,"get_cloud_backup",&json!({"id":backup.id})).await.unwrap();
            assert!(read["tables"].get("cloud_media_objects").is_none());
            assert!(read["tables"].get("report_ai_usage").is_none());
            dispatch(&mut tx,"save_learning_progress",&json!({"input":{"version":1,"known":["cad"],"saved":[],"notes":{"cad":"Synthetic note"},"last":null}})).await.unwrap();
            dispatch(&mut tx,"import_trades_batch",&json!({"input":{"accountId":id,"trades":[trade]}})).await.unwrap();
            assert!(restore(&mut tx,RestoreInput{id:backup.id.clone(),confirmation:"wrong".into()}).await.is_err());
            assert_eq!(sqlx::query_scalar::<_,i64>("SELECT COUNT(*) FROM trades").fetch_one(&mut *tx).await.unwrap(),2);
            let restored = restore(&mut tx,RestoreInput{id:backup.id.clone(),confirmation:"WIEDERHERSTELLEN".into()}).await.unwrap();
            assert!(restored["safetyBackupId"].is_string());
            assert_eq!(sqlx::query_scalar::<_,i64>("SELECT COUNT(*) FROM trades").fetch_one(&mut *tx).await.unwrap(),1);
            assert_eq!(sqlx::query_scalar::<_,i64>("SELECT net_pnl_minor FROM trades").fetch_one(&mut *tx).await.unwrap(),1234);
            assert_eq!(sqlx::query_scalar::<_,i64>("SELECT COUNT(*) FROM cloud_learning_progress").fetch_one(&mut *tx).await.unwrap(),0);
            assert_eq!(sqlx::query_scalar::<_,i64>("SELECT COUNT(*) FROM cloud_journal_backups").fetch_one(&mut *tx).await.unwrap(),2);
            tx.commit().await.unwrap();
            let mut failed = fixture.pool.begin().await.unwrap();
            let good=json!({"accountId":id,"instrument":"EURUSD","direction":"long","status":"draft"});
            let bad=json!({"accountId":id,"instrument":"","direction":"long","status":"draft"});
            assert!(dispatch(&mut failed,"import_trades_batch",&json!({"input":{"accountId":id,"trades":[good,bad]}})).await.is_err());
            failed.rollback().await.unwrap();
            assert_eq!(sqlx::query_scalar::<_,i64>("SELECT COUNT(*) FROM trades").fetch_one(&fixture.pool).await.unwrap(),1);
        }).catch_unwind().await;
        fixture.close().await;
        if let Err(panic) = result {
            resume_unwind(panic);
        }
    }
}
