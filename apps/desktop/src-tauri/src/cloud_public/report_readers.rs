//! Official report text and existing briefings from a separately allowlisted
//! immutable shard. Local file paths and personal read markers are not exported.
use super::cache::{ArtifactKind, LoadedShard};
use crate::{
    commands::{CentralBankReportDetail, CentralBankReportListItem, CentralBankReportSummary},
    errors::{CommandError, CommandResult},
};
use serde_json::{Value, json};

const SELECT: &str = "SELECT id,bank_code,currency,report_type,title,source_url,published_at,discovered_at,language,mime_type,NULL AS local_path,extraction_status,summary_status,summary_provider,summary_model,summarized_at,NULL AS read_at FROM central_bank_reports";

pub const COMMANDS: &[&str] = &["get_central_bank_reports", "get_central_bank_report"];
pub fn artifact(command: &str, args: &Value) -> CommandResult<(ArtifactKind, String)> {
    validate(command, args)?;
    Ok((
        ArtifactKind::CentralBankReports,
        "official:central-bank-reports".into(),
    ))
}

pub fn validate(command: &str, args: &Value) -> CommandResult<()> {
    let object = args.as_object().ok_or_else(invalid)?;
    let allowed: &[&str] = match command {
        "get_central_bank_reports" => &["generation"],
        "get_central_bank_report" => &["generation", "id"],
        _ => return Err(invalid()),
    };
    if object.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(invalid());
    }
    if command == "get_central_bank_report" {
        let id = args.get("id").and_then(Value::as_str).ok_or_else(invalid)?;
        if id.is_empty()
            || id.len() > 80
            || !id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
        {
            return Err(invalid());
        }
    }
    Ok(())
}

pub fn official_source(bank: &str, value: &str) -> bool {
    let Ok(url) = url::Url::parse(value) else {
        return false;
    };
    let Some(domain) = (match bank {
        "FED" => Some("federalreserve.gov"),
        "ECB" => Some("ecb.europa.eu"),
        "BOE" => Some("bankofengland.co.uk"),
        "BOJ" => Some("boj.or.jp"),
        "RBA" => Some("rba.gov.au"),
        "RBNZ" => Some("rbnz.govt.nz"),
        "BOC" => Some("bankofcanada.ca"),
        "SNB" => Some("snb.ch"),
        "PBOC" => Some("pbc.gov.cn"),
        _ => None,
    }) else {
        return false;
    };
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && url
            .host_str()
            .is_some_and(|host| host == domain || host.ends_with(&format!(".{domain}")))
}

fn sanitize(item: CentralBankReportListItem) -> CommandResult<CentralBankReportListItem> {
    if !official_source(&item.bank_code, &item.source_url) {
        return Err(unavailable());
    }
    Ok(item)
}

pub async fn read(command: &str, args: &Value, shard: &LoadedShard) -> CommandResult<Value> {
    let (kind, key) = artifact(command, args)?;
    if shard.artifact.kind != kind || shard.artifact.key != key {
        return Err(unavailable());
    }
    match command {
        "get_central_bank_reports" => {
            let rows = sqlx::query_as::<_, CentralBankReportListItem>(&format!(
                "{SELECT} ORDER BY COALESCE(published_at,discovered_at) DESC,id LIMIT 250"
            ))
            .fetch_all(shard.pool())
            .await
            .map_err(|_| unavailable())?;
            let reports = rows
                .into_iter()
                .map(sanitize)
                .collect::<CommandResult<Vec<_>>>()?;
            Ok(json!({"reports":reports,"sources":[],"automation":{
                "enabled":false,"refreshIntervalMinutes":0,"lastAttemptAt":null,"lastSuccessAt":null,
                "lastStatus":"snapshot","errorMessage":null,"nextRefreshAt":null,
                "openaiConfigured":false,"summaryModel":""
            }}))
        }
        "get_central_bank_report" => {
            let id = args["id"].as_str().ok_or_else(invalid)?;
            let report =
                sqlx::query_as::<_, CentralBankReportListItem>(&format!("{SELECT} WHERE id=?"))
                    .bind(id)
                    .fetch_optional(shard.pool())
                    .await
                    .map_err(|_| unavailable())?
                    .ok_or_else(|| CommandError {
                        code: "NOT_FOUND".into(),
                        message: "Der Bericht ist in diesem Datenstand nicht vorhanden.".into(),
                        details: None,
                    })?;
            let report = sanitize(report)?;
            let (text, summary): (Option<String>, Option<String>) = sqlx::query_as(
                "SELECT extracted_text,summary_json FROM central_bank_reports WHERE id=?",
            )
            .bind(id)
            .fetch_one(shard.pool())
            .await
            .map_err(|_| unavailable())?;
            if text.as_ref().is_some_and(|v| v.len() > 1_000_000)
                || summary.as_ref().is_some_and(|v| v.len() > 128_000)
            {
                return Err(unavailable());
            }
            let summary = summary
                .as_deref()
                .map(serde_json::from_str::<CentralBankReportSummary>)
                .transpose()
                .map_err(|_| unavailable())?;
            serde_json::to_value(CentralBankReportDetail {
                report,
                extracted_text: text,
                summary,
            })
            .map_err(|_| unavailable())
        }
        _ => Err(invalid()),
    }
}

fn invalid() -> CommandError {
    CommandError::validation("Die Berichtsauswahl ist ungültig.")
}
fn unavailable() -> CommandError {
    CommandError {
        code: "MARKET_DATA_UNAVAILABLE".into(),
        message: "Der geprüfte Bericht konnte nicht gelesen werden.".into(),
        details: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cloud_public::cache::{Artifact, DownloadDescriptor, Encoding, PublicCacheLoader};
    use sha2::{Digest, Sha256};
    #[test]
    fn sources_are_https_bank_hosts_without_credentials() {
        assert!(official_source(
            "ECB",
            "https://www.ecb.europa.eu/press/report.pdf"
        ));
        for url in [
            "https://ecb.europa.eu.example.com/report",
            "javascript:alert(1)",
            "http://ecb.europa.eu/report",
            "https://token@ecb.europa.eu/report",
            "https://ecb.europa.eu:8443/report",
        ] {
            assert!(!official_source("ECB", url));
        }
        assert!(!official_source("FED", "https://ecb.europa.eu/report"));
    }
    #[test]
    fn report_inputs_never_accept_paths_or_urls() {
        assert!(
            validate(
                "get_central_bank_report",
                &json!({"id":"report-1","generation":"generation"})
            )
            .is_ok()
        );
        assert!(validate("get_central_bank_report", &json!({"id":"../path"})).is_err());
        assert!(validate("get_central_bank_reports", &json!({"path":"local"})).is_err());
    }

    #[tokio::test]
    async fn verified_report_reads_keep_original_text_without_local_paths_or_read_markers() {
        let root = std::env::temp_dir().join(format!("macro-report-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let source = root.join("synthetic.sqlite");
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(&source)
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        let schema: Value = serde_json::from_str(include_str!("report_schema.json")).unwrap();
        sqlx::query(
            schema["central-bank-reports"]["tables"]["central_bank_reports"]["ddl"]
                .as_str()
                .unwrap(),
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO central_bank_reports(id,bank_code,currency,report_type,title,source_url,discovered_at,language,extraction_status,summary_status,extracted_text) VALUES('report-1','FED','USD','decision','Synthetic report','https://www.federalreserve.gov/report.htm','2026-09-01T00:00:00Z','en','complete','pending','Original public text')").execute(&pool).await.unwrap();
        pool.close().await;
        let bytes = std::fs::read(&source).unwrap();
        let hash = Sha256::digest(&bytes)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        let generation = uuid::Uuid::new_v4().to_string();
        let descriptor = DownloadDescriptor {
            generation: generation.clone(),
            object_generation: generation,
            artifact: Artifact {
                kind: ArtifactKind::CentralBankReports,
                key: "official:central-bank-reports".into(),
                sha256: hash.clone(),
                size_bytes: bytes.len() as u64,
                rows: 1,
                file_name: format!("{hash}.sqlite"),
                format: "sqlite".into(),
                schema_version: 1,
            },
            encoding: Encoding::Identity,
            transfer_bytes: bytes.len() as u64,
            transfer_sha256: hash,
        };
        let loader = PublicCacheLoader::new(root.join("cache")).unwrap();
        let shard = loader
            .load_stream(&descriptor, futures_util::stream::iter([Ok(bytes)]))
            .await
            .unwrap();
        let dashboard = read("get_central_bank_reports", &json!({}), &shard)
            .await
            .unwrap();
        assert_eq!(dashboard["reports"].as_array().unwrap().len(), 1);
        assert_eq!(dashboard["automation"]["enabled"], false);
        let report = read("get_central_bank_report", &json!({"id":"report-1"}), &shard)
            .await
            .unwrap();
        assert_eq!(report["extractedText"], "Original public text");
        assert!(report["localPath"].is_null());
        assert!(report["readAt"].is_null());
        shard.close().await;
        assert!(root.starts_with(std::env::temp_dir()));
        std::fs::remove_dir_all(root).unwrap();
    }
}
