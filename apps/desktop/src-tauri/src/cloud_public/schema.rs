//! Shared, compile-time reviewed schema definitions for additional data families.
//! Never accepts SQL, schema definitions or filesystem paths from a request.
use super::cache::{Artifact, ArtifactKind, CacheError};
use serde::Deserialize;
use serde_json::Value;
use sqlx::SqlitePool;
use std::{collections::BTreeMap, sync::LazyLock};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Table {
    ddl: String,
    // Exact previous DDL, only for a reviewed additive schema transition.
    legacy_ddl: Option<String>,
    pub max_rows: u64,
    #[serde(default)]
    min_rows: u64,
    #[serde(default)]
    columns: BTreeMap<String, String>,
    identity: Option<Identity>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Identity {
    column: String,
    value: Option<Value>,
    value_from_key_prefix: Option<String>,
}
#[derive(Deserialize)]
pub struct Definition {
    pub tables: BTreeMap<String, Table>,
}
static MACRO: LazyLock<BTreeMap<String, Definition>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("macro_schema.json")).expect("reviewed macro schema")
});
static ATLAS: LazyLock<BTreeMap<String, Definition>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("atlas_schema.json")).expect("reviewed atlas schema")
});
static REPORTS: LazyLock<BTreeMap<String, Definition>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("report_schema.json")).expect("reviewed report schema")
});

pub fn definition(kind: ArtifactKind, key: &str) -> Result<&'static Definition, CacheError> {
    let name = match (kind, key) {
        (ArtifactKind::Macro, "eodhd:macro") => "macro",
        (ArtifactKind::Cot, "cftc:legacy") => "cot",
        (ArtifactKind::Technicals, "eodhd:technicals") => "technicals",
        (ArtifactKind::Regime, "eodhd:aud-china-cpi") => "regime",
        (ArtifactKind::CentralBankReports, "official:central-bank-reports") => {
            return REPORTS
                .get("central-bank-reports")
                .ok_or(CacheError::InvalidManifest);
        }
        (ArtifactKind::Atlas | ArtifactKind::Bonds, _) => {
            let family = super::atlas_readers::schema_family(kind, key)
                .map_err(|_| CacheError::InvalidManifest)?;
            return ATLAS.get(family).ok_or(CacheError::InvalidManifest);
        }
        _ => return Err(CacheError::InvalidManifest),
    };
    MACRO.get(name).ok_or(CacheError::InvalidManifest)
}
fn normalize(value: &str) -> String {
    value
        .chars()
        .filter(|c| !c.is_ascii_whitespace() && *c != '"')
        .flat_map(char::to_uppercase)
        .collect()
}
fn identifier(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_')
}
pub async fn validate_database(pool: &SqlitePool, artifact: &Artifact) -> Result<(), CacheError> {
    let expected = definition(artifact.kind, &artifact.key)?;
    let objects: Vec<(String,String,Option<String>)> = sqlx::query_as(
        "SELECT name,type,sql FROM sqlite_schema WHERE NOT(type='index' AND name GLOB 'sqlite_autoindex_*' AND sql IS NULL) ORDER BY name"
    ).fetch_all(pool).await.map_err(|_|CacheError::Schema)?;
    if objects.len() != expected.tables.len() {
        return Err(CacheError::Schema);
    }
    let mut total = 0_u64;
    for ((name, kind, ddl), (table, definition)) in objects.iter().zip(&expected.tables) {
        if name != table
            || kind != "table"
            || !identifier(table)
            || !ddl.as_ref().is_some_and(|sql| {
                normalize(sql) == normalize(&definition.ddl)
                    || definition
                        .legacy_ddl
                        .as_ref()
                        .is_some_and(|old| normalize(sql) == normalize(old))
            })
        {
            return Err(CacheError::Schema);
        }
        let strict: i64 = sqlx::query_scalar(
            "SELECT strict FROM pragma_table_list WHERE schema='main' AND name=? AND type='table'",
        )
        .bind(table)
        .fetch_one(pool)
        .await
        .map_err(|_| CacheError::Schema)?;
        let actual: Vec<(String, String, i64)> =
            sqlx::query_as("SELECT name,type,hidden FROM pragma_table_xinfo(?)")
                .bind(table)
                .fetch_all(pool)
                .await
                .map_err(|_| CacheError::Schema)?;
        if strict != 1
            || actual.iter().any(|(_, _, hidden)| *hidden != 0)
            || (!definition.columns.is_empty()
                && (actual.len() != definition.columns.len()
                    || actual
                        .iter()
                        .any(|(name, kind, _)| definition.columns.get(name) != Some(kind))))
        {
            return Err(CacheError::Schema);
        }
        let count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM \"{table}\""))
            .fetch_one(pool)
            .await
            .map_err(|_| CacheError::Integrity)?;
        let count = u64::try_from(count).map_err(|_| CacheError::Integrity)?;
        if count > definition.max_rows || count < definition.min_rows {
            return Err(CacheError::Limit);
        }
        total = total.checked_add(count).ok_or(CacheError::Limit)?;
        if let Some(identity) = &definition.identity {
            if !identifier(&identity.column)
                || !actual.iter().any(|(name, _, _)| name == &identity.column)
            {
                return Err(CacheError::Schema);
            }
            let sql = format!(
                "SELECT COUNT(*) FROM \"{table}\" WHERE \"{}\" IS NOT ?",
                identity.column
            );
            let value = if let Some(prefix) = &identity.value_from_key_prefix {
                Value::String(
                    artifact
                        .key
                        .strip_prefix(prefix)
                        .filter(|v| !v.is_empty())
                        .ok_or(CacheError::Integrity)?
                        .into(),
                )
            } else {
                identity.value.clone().ok_or(CacheError::Schema)?
            };
            let mismatches: i64 = match value {
                Value::String(value) => sqlx::query_scalar(&sql).bind(value).fetch_one(pool).await,
                Value::Number(value) if value.as_i64().is_some() => {
                    sqlx::query_scalar(&sql)
                        .bind(value.as_i64().unwrap())
                        .fetch_one(pool)
                        .await
                }
                _ => return Err(CacheError::Schema),
            }
            .map_err(|_| CacheError::Integrity)?;
            if mismatches != 0 {
                return Err(CacheError::Integrity);
            }
        }
    }
    let check: String = sqlx::query_scalar("PRAGMA quick_check(1)")
        .fetch_one(pool)
        .await
        .map_err(|_| CacheError::Integrity)?;
    if total != artifact.rows || check != "ok" {
        return Err(CacheError::Integrity);
    }
    if matches!(artifact.kind, ArtifactKind::Atlas | ArtifactKind::Bonds) {
        super::atlas_readers::verify_identity(pool, artifact.kind, &artifact.key)
            .await
            .map_err(|_| CacheError::Integrity)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn cot_accepts_only_exact_reviewed_old_and_extended_schemas() {
        let artifact = Artifact {
            kind: ArtifactKind::Cot,
            key: "cftc:legacy".into(),
            sha256: "0".repeat(64),
            size_bytes: 4096,
            rows: 0,
            file_name: "cot.sqlite".into(),
            format: "sqlite".into(),
            schema_version: 1,
        };
        let definition = definition(artifact.kind, &artifact.key).unwrap();
        for legacy in [true, false] {
            let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
            for table in definition.tables.values() {
                let ddl = if legacy {
                    table.legacy_ddl.as_ref().unwrap_or(&table.ddl)
                } else {
                    &table.ddl
                };
                sqlx::query(ddl).execute(&pool).await.unwrap();
            }
            validate_database(&pool, &artifact).await.unwrap();
            sqlx::query("ALTER TABLE cot_legacy_observations ADD COLUMN unreviewed TEXT")
                .execute(&pool)
                .await
                .unwrap();
            assert!(validate_database(&pool, &artifact).await.is_err());
        }
    }
}
