//! Real PostgreSQL transactions and the production SQLite loader, with synthetic
//! public bytes only. No OpenAI, bank, journal mutation or Blob network requests.
use super::*;
use crate::cloud_postgres::test_support::TestDatabase;
use crate::cloud_public::{
    cache::{Manifest, PublicCacheLoader},
    manifest::UploadDescriptor,
};
use futures_util::FutureExt;
use std::panic::{AssertUnwindSafe, resume_unwind};

async fn public_report(file: &std::path::Path, title: &str) -> Vec<u8> {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            sqlx::sqlite::SqliteConnectOptions::new()
                .filename(file)
                .create_if_missing(true),
        )
        .await
        .unwrap();
    let schema: Value =
        serde_json::from_str(include_str!("../cloud_public/report_schema.json")).unwrap();
    sqlx::query(
        schema["central-bank-reports"]["tables"]["central_bank_reports"]["ddl"]
            .as_str()
            .unwrap(),
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO central_bank_reports(id,bank_code,currency,report_type,title,source_url,discovered_at,language,extraction_status,summary_status,extracted_text) VALUES('report-1','FED','USD','decision',?,'https://www.federalreserve.gov/report.htm','2026-09-01T00:00:00Z','en','complete','pending','[Absatz 1]\nThe policy rate remains unchanged.')").bind(title).execute(&pool).await.unwrap();
    pool.close().await;
    std::fs::read(file).unwrap()
}
fn stage(previous: String, raw: &[u8]) -> (Stage, Vec<u8>) {
    let hash = hex(&Sha256::digest(raw));
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(raw).unwrap();
    let bytes = encoder.finish().unwrap();
    (
        Stage {
            previous,
            generation: Uuid::new_v4().to_string(),
            created_at: Utc::now().to_rfc3339(),
            artifact: Artifact {
                kind: ArtifactKind::CentralBankReports,
                key: "official:central-bank-reports".into(),
                sha256: hash.clone(),
                size_bytes: raw.len() as u64,
                rows: 1,
                file_name: format!("{hash}.sqlite"),
                format: "sqlite".into(),
                schema_version: 1,
            },
            transport: Transport {
                kind: ArtifactKind::CentralBankReports,
                key: "official:central-bank-reports".into(),
                encoding: Encoding::Gzip,
                transfer_bytes: bytes.len() as u64,
                transfer_sha256: hex(&Sha256::digest(&bytes)),
                object_generation: None,
            },
            pending: vec!["report-1".into()],
            source_id: Some(cloud::sources().next().unwrap().into()),
            source_state: Some(SourceSnapshot {
                etag: None,
                last_modified: None,
                last_checked_at: Some(Utc::now().to_rfc3339()),
                last_success_at: Some(Utc::now().to_rfc3339()),
                next_check_at: None,
                last_status: Some("success".into()),
                error_message: None,
            }),
            catchup: true,
        },
        bytes,
    )
}
async fn publish(db: &TestDatabase, descriptor: UploadDescriptor, previous: Option<&str>) {
    let mut tx = db.pool.begin().await.unwrap();
    manifest::publish(&mut tx, descriptor, previous)
        .await
        .unwrap();
    tx.commit().await.unwrap();
}
#[tokio::test]
#[ignore = "Requires MACRO_TEST_ENV_FILE; disposable Neon schema and synthetic public bytes only"]
async fn report_cloud_publication_fences_leases_cas_and_duplicates_without_changing_the_journal() {
    let db = TestDatabase::open().await;
    let root = tempfile::tempdir().unwrap();
    let result=AssertUnwindSafe(async {
        let raw=public_report(&root.path().join("before.sqlite"),"Before synthetic release").await;
        let (initial,_)=stage(Uuid::new_v4().to_string(),&raw);
        let first=initial.generation.clone();
        let other=Artifact {kind:ArtifactKind::Rates,key:"eodhd:policy-rates".into(),sha256:"b".repeat(64),size_bytes:4096,rows:0,file_name:format!("{}.sqlite","b".repeat(64)),format:"sqlite".into(),schema_version:1};
        publish(&db,UploadDescriptor {version:1,complete:true,manifest:Manifest {schema_version:1,generation:first.clone(),created_at:Utc::now().to_rfc3339(),artifacts:vec![initial.artifact,other]},transports:vec![initial.transport,Transport {kind:ArtifactKind::Rates,key:"eodhd:policy-rates".into(),encoding:Encoding::Gzip,transfer_bytes:128,transfer_sha256:"c".repeat(64),object_generation:None}]},None).await;
        let raw=public_report(&root.path().join("after.sqlite"),"After synthetic release").await;
        let (mut next,bytes)=stage(first.clone(),&raw);
        let bytes=Arc::new(bytes);let loader=Arc::new(PublicCacheLoader::new(root.path().join("loader")).unwrap());
        let test_loader:market::TestLoader=Arc::new(move |descriptor| {
            let bytes=bytes.clone();let loader=loader.clone();
            async move {loader.load_stream(&descriptor,futures_util::stream::iter([Ok(bytes.as_ref().clone())])).await}.boxed()
        });
        let mut server=CloudServer::from_pool(db.pool.clone(),db.schema.clone(),db.workspace_id.clone(),[73;32]).await.unwrap();
        let runtime=Arc::get_mut(&mut server).unwrap();runtime.reports_enabled=true;
        runtime.market=Some(market::MarketRuntime::with_test_loader(test_loader,root.path().join("runtime")).unwrap());
        let id=Uuid::new_v4().to_string();let lease=Uuid::new_v4().to_string();let now=Utc::now().timestamp();
        sqlx::query("INSERT INTO cloud_provider_jobs(id,task_key,kind,payload_json,due_at,retry_at,expires_at,status,lease_id,lease_until,attempts,stage_json) VALUES($1,$1,'report-discover',$2,$3,$3,$4,'staged',$5,$6,1,$7)")
            .bind(&id).bind(json!({"sourceId":next.source_id,"catchup":false}).to_string()).bind(now-1).bind(now+86400).bind(&lease).bind(now+240).bind(serde_json::to_string(&next).unwrap()).execute(&db.pool).await.unwrap();
        assert!(server.report_complete(&id,&Uuid::new_v4().to_string()).await.is_err());
        sqlx::query("UPDATE cloud_provider_jobs SET lease_until=$2 WHERE id=$1").bind(&id).bind(now-1).execute(&db.pool).await.unwrap();
        assert!(server.report_complete(&id,&lease).await.is_err());
        sqlx::query("UPDATE cloud_provider_jobs SET lease_until=$2 WHERE id=$1").bind(&id).bind(now+240).execute(&db.pool).await.unwrap();
        // Another provider wins the generation race. The staged report must not
        // overwrite it or leave a source status/completion receipt behind.
        let mut tx=db.pool.begin().await.unwrap();let active=manifest::load_active(&mut tx).await.unwrap().unwrap();tx.rollback().await.unwrap();
        let intervening=Uuid::new_v4().to_string();
        publish(&db,active.reusable_descriptor(intervening.clone(),Utc::now().to_rfc3339()).unwrap(),Some(&first)).await;
        assert!(server.report_complete(&id,&lease).await.is_err());
        assert_eq!(server.provider_job(&id).await.unwrap().status,"staged");
        let sources:i64=sqlx::query_scalar("SELECT COUNT(*) FROM cloud_report_sources").fetch_one(&db.pool).await.unwrap();assert_eq!(sources,0);
        next.previous=intervening;
        sqlx::query("UPDATE cloud_provider_jobs SET stage_json=$2 WHERE id=$1").bind(&id).bind(serde_json::to_string(&next).unwrap()).execute(&db.pool).await.unwrap();
        assert_eq!(server.report_complete(&id,&lease).await.unwrap()["status"],"complete");
        assert_eq!(server.report_complete(&id,&lease).await.unwrap()["status"],"already-complete");
        let mut tx=db.pool.begin().await.unwrap();let active=manifest::load_active(&mut tx).await.unwrap().unwrap();tx.rollback().await.unwrap();
        assert_eq!(active.manifest.generation,next.generation);
        assert_eq!(active.descriptor(ArtifactKind::Rates,"eodhd:policy-rates").unwrap().object_generation,first);
        let kinds:Vec<String>=sqlx::query_scalar("SELECT kind FROM cloud_provider_jobs ORDER BY kind").fetch_all(&db.pool).await.unwrap();
        assert_eq!(kinds,["report-discover","report-discover","report-summary"]);
        assert_eq!(server.revision().await.unwrap(),0);
    }).catch_unwind().await;
    db.close().await;
    if let Err(error) = result {
        resume_unwind(error)
    }
}
