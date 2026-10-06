//! Publication-only integration fixtures. Object validation belongs to the real
//! cache/native-reader tests; these synthetic rows never access Blob or CFTC.
use super::*;
use crate::{
    cloud_postgres::test_support::TestDatabase,
    cloud_public::{cache::Manifest, manifest::UploadDescriptor},
};
use futures_util::FutureExt;
use std::panic::{AssertUnwindSafe, resume_unwind};

fn initial_descriptor() -> UploadDescriptor {
    let artifacts: Vec<_> = [
        (ArtifactKind::Rates, "eodhd:policy-rates", 'a'),
        (ArtifactKind::Cot, "cftc:legacy", 'b'),
    ]
    .into_iter()
    .map(|(kind, key, digit)| {
        let sha256 = digit.to_string().repeat(64);
        Artifact {
            kind,
            key: key.into(),
            file_name: format!("{sha256}.sqlite"),
            sha256,
            size_bytes: 4096,
            rows: 0,
            format: "sqlite".into(),
            schema_version: 1,
        }
    })
    .collect();
    UploadDescriptor {
        version: 1,
        complete: true,
        transports: artifacts
            .iter()
            .map(|artifact| Transport {
                kind: artifact.kind,
                key: artifact.key.clone(),
                encoding: Encoding::Gzip,
                transfer_bytes: 512,
                transfer_sha256: "d".repeat(64),
                object_generation: None,
            })
            .collect(),
        manifest: Manifest {
            schema_version: 1,
            generation: Uuid::new_v4().to_string(),
            created_at: Utc::now().to_rfc3339(),
            artifacts,
        },
    }
}

async fn setup(db: &TestDatabase) -> (Arc<CloudServer>, Stage, String, Job) {
    let server = CloudServer::from_pool(
        db.pool.clone(),
        db.schema.clone(),
        db.workspace_id.clone(),
        [77; 32],
    )
    .await
    .unwrap();
    let descriptor = initial_descriptor();
    let previous_generation = descriptor.manifest.generation.clone();
    let mut artifact = descriptor.manifest.artifacts[1].clone();
    artifact.sha256 = "c".repeat(64);
    artifact.file_name = format!("{}.sqlite", artifact.sha256);
    let mut transport = descriptor.transports[1].clone();
    transport.transfer_sha256 = "e".repeat(64);
    let stage = Stage {
        previous_generation,
        generation: Uuid::new_v4().to_string(),
        created_at: Utc::now().to_rfc3339(),
        artifact,
        transport,
    };
    stage.descriptor().unwrap();
    let mut tx = db.pool.begin().await.unwrap();
    manifest::publish(&mut tx, descriptor, None).await.unwrap();
    tx.commit().await.unwrap();
    let lease = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    sqlx::query("INSERT INTO cloud_cot_jobs(release_date,report_date,due_at,retry_at,status,attempts,lease_id,lease_until,stage_json) VALUES('2026-09-25','2026-09-22',$1,$1,'staged',1,$2,$3,$4)")
        .bind(now-60).bind(&lease).bind(now+LEASE_SECONDS)
        .bind(serde_json::to_string(&stage).unwrap()).execute(&db.pool).await.unwrap();
    let job = server.cot_job("2026-09-25").await.unwrap().unwrap();
    (server, stage, lease, job)
}

async fn assert_state(db: &TestDatabase, generation: &str, status: &str, count: i64) {
    let active: String =
        sqlx::query_scalar("SELECT generation FROM cloud_public_active WHERE id=1")
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(active, generation);
    let saved: String =
        sqlx::query_scalar("SELECT status FROM cloud_cot_jobs WHERE release_date='2026-09-25'")
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(saved, status);
    let generations: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cloud_public_generations")
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(generations, count);
    let revision: i64 = sqlx::query_scalar("SELECT revision FROM cloud_workspace WHERE id=1")
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(revision, 0);
}

#[tokio::test]
#[ignore = "Requires MACRO_TEST_ENV_FILE; disposable PostgreSQL schema and synthetic metadata only"]
async fn cot_publication_and_release_receipt_commit_or_rollback_together() {
    let db = TestDatabase::open().await;
    let result = AssertUnwindSafe(async {
        let (server, stage, lease, job) = setup(&db).await;
        // Force the last receipt UPDATE to fail after manifest publication. The
        // earlier generation rows and pointer must roll back as part of that TX.
        sqlx::query("ALTER TABLE cloud_cot_jobs ADD CONSTRAINT cot_test_block_receipt CHECK(published_generation IS NULL)")
            .execute(&db.pool).await.unwrap();
        assert!(server.cot_publish(&job, &lease, stage.clone()).await.is_err());
        assert_state(&db, &stage.previous_generation, "staged", 1).await;
        sqlx::query("ALTER TABLE cloud_cot_jobs DROP CONSTRAINT cot_test_block_receipt")
            .execute(&db.pool).await.unwrap();
        let value = server.cot_publish(&job, &lease, stage.clone()).await.unwrap();
        assert_eq!(value["status"], "complete");
        assert_state(&db, &stage.generation, "complete", 2).await;
        let receipt: (Option<String>, Option<i64>, Option<String>, i64) =
            sqlx::query_as("SELECT published_generation,completed_at,stage_json,lease_until FROM cloud_cot_jobs WHERE release_date='2026-09-25'")
                .fetch_one(&db.pool).await.unwrap();
        assert_eq!(receipt.0.as_deref(), Some(stage.generation.as_str()));
        assert!(receipt.1.is_some());
        assert!(receipt.2.is_none());
        assert_eq!(receipt.3, 0);
        let mut connection = db.pool.acquire().await.unwrap();
        let active = manifest::load_active(&mut connection).await.unwrap().unwrap();
        let rates = active.descriptor(ArtifactKind::Rates, "eodhd:policy-rates").unwrap();
        assert_eq!(rates.generation, stage.generation);
        assert_eq!(rates.object_generation, stage.previous_generation);
        let cot = active.descriptor(ArtifactKind::Cot, "cftc:legacy").unwrap();
        assert_eq!(cot.generation, stage.generation);
        assert_eq!(cot.object_generation, stage.generation);
        drop(connection);
        // Redelivery after an uncertain successful commit reads the receipt;
        // it creates no generation and performs no additional publication.
        assert_eq!(server.cot_complete(&job.release_date, &lease).await.unwrap()["status"], "already-complete");
        assert_state(&db, &stage.generation, "complete", 2).await;
    }).catch_unwind().await;
    db.close().await;
    if let Err(error) = result {
        resume_unwind(error);
    }
}

#[tokio::test]
#[ignore = "Requires MACRO_TEST_ENV_FILE; disposable PostgreSQL schema and synthetic metadata only"]
async fn cot_publication_rejects_stale_lease_and_changed_active_generation() {
    let db = TestDatabase::open().await;
    let result = AssertUnwindSafe(async {
        let (server, stage, lease, job) = setup(&db).await;
        let newer_lease = Uuid::new_v4().to_string();
        sqlx::query("UPDATE cloud_cot_jobs SET lease_id=$1 WHERE release_date='2026-09-25'")
            .bind(&newer_lease)
            .execute(&db.pool)
            .await
            .unwrap();
        assert!(
            server
                .cot_publish(&job, &lease, stage.clone())
                .await
                .is_err()
        );
        assert_state(&db, &stage.previous_generation, "staged", 1).await;
        let saved: String = sqlx::query_scalar(
            "SELECT lease_id FROM cloud_cot_jobs WHERE release_date='2026-09-25'",
        )
        .fetch_one(&db.pool)
        .await
        .unwrap();
        assert_eq!(saved, newer_lease);
        let current_job = server.cot_job(&job.release_date).await.unwrap().unwrap();
        let competing = initial_descriptor();
        let competing_id = competing.manifest.generation.clone();
        let mut tx = db.pool.begin().await.unwrap();
        manifest::publish(&mut tx, competing, Some(&stage.previous_generation))
            .await
            .unwrap();
        tx.commit().await.unwrap();
        // Simulate a publisher winning after the worker verified its Blob.
        assert!(
            server
                .cot_publish(&current_job, &newer_lease, stage)
                .await
                .is_err()
        );
        assert_state(&db, &competing_id, "staged", 2).await;
    })
    .catch_unwind()
    .await;
    db.close().await;
    if let Err(error) = result {
        resume_unwind(error);
    }
}
