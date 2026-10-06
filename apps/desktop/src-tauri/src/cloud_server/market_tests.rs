//! Synthetic market transport only. Opted-in database tests use fresh schemas;
//! none of these fixtures can contact a provider or Vercel Blob.
use super::*;
use crate::cloud_postgres::test_support::TestDatabase;
use crate::cloud_public::{
    cache::{Artifact, ArtifactKind, CacheError, Encoding, Manifest},
    manifest::{Transport, UploadDescriptor, publish},
};
use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use futures_util::FutureExt;
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio::sync::{Notify, mpsc};
use tower::ServiceExt;

fn descriptor(kinds: &[ArtifactKind]) -> UploadDescriptor {
    let artifacts: Vec<Artifact> = kinds
        .iter()
        .enumerate()
        .map(|(index, kind)| {
            let sha256 = format!("{:064x}", index + 1);
            Artifact {
                kind: *kind,
                key: match kind {
                    ArtifactKind::Rates => "eodhd:policy-rates",
                    ArtifactKind::SeasonalityIndex => "eodhd:seasonality",
                    ArtifactKind::SeasonalitySymbol => "eodhd:EURUSD.FOREX",
                    _ => {
                        panic!("This fixture only describes the original rates/seasonality schemas")
                    }
                }
                .into(),
                sha256: sha256.clone(),
                size_bytes: 4096,
                rows: 0,
                file_name: format!("{sha256}.sqlite"),
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
                transfer_bytes: 256,
                transfer_sha256: "a".repeat(64),
                object_generation: None,
            })
            .collect(),
        manifest: Manifest {
            schema_version: 1,
            generation: Uuid::new_v4().to_string(),
            created_at: "2026-09-25T00:00:00Z".into(),
            artifacts,
        },
    }
}

async fn publish_fixture(
    fixture: &TestDatabase,
    descriptor: UploadDescriptor,
    expected: Option<&str>,
) -> String {
    let mut tx = fixture.pool.begin().await.unwrap();
    let generation = publish(&mut tx, descriptor, expected).await.unwrap();
    tx.commit().await.unwrap();
    generation
}

fn command(workspace: &str, name: &str, args: Value) -> CommandRequest {
    CommandRequest {
        workspace_id: workspace.into(),
        command: name.into(),
        args,
        operation_id: None,
        expected_revision: None,
    }
}

fn signed_session(secret: &[u8; 32]) -> Request<Body> {
    let timestamp = chrono::Utc::now().timestamp().to_string();
    let nonce = Uuid::new_v4().to_string();
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).unwrap();
    mac.update(canonical(&timestamp, &nonce, "GET", "/session", b"").as_bytes());
    Request::builder()
        .uri("/session")
        .header("x-macro-timestamp", timestamp)
        .header("x-macro-nonce", nonce)
        .header("x-macro-signature", hex(&mac.finalize().into_bytes()))
        .body(Body::empty())
        .unwrap()
}

async fn session_value(server: Arc<CloudServer>, secret: &[u8; 32]) -> Value {
    let response = router(server)
        .oneshot(signed_session(secret))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["cache-control"], "private, no-store");
    serde_json::from_slice(
        &to_bytes(response.into_body(), MAX_RESPONSE_BYTES)
            .await
            .unwrap(),
    )
    .unwrap()
}

fn assert_no_market_capabilities(session: &Value) {
    let capabilities = session["capabilities"].as_array().unwrap();
    assert!(capabilities.iter().any(|value| value == "create_trade"));
    assert!(
        capabilities
            .iter()
            .any(|value| value == "upload_private_media")
    );
    for command in [
        "get_policy_rates",
        "get_seasonality",
        "get_seasonality_asset_detail",
        "analyze_seasonality",
    ] {
        assert!(!capabilities.iter().any(|value| value == command));
    }
}

fn rejecting_loader(calls: Arc<AtomicUsize>) -> market::TestLoader {
    Arc::new(move |_| {
        calls.fetch_add(1, Ordering::SeqCst);
        async { Err(CacheError::Unavailable) }.boxed()
    })
}

#[tokio::test]
#[ignore = "Requires MACRO_TEST_ENV_FILE; synthetic transport and a disposable Neon schema only"]
async fn neon_market_manifest_without_runtime_never_advertises_or_executes_market_commands() {
    let fixture = TestDatabase::open().await;
    let result = std::panic::AssertUnwindSafe(async {
        let secret = [93; 32];
        let server = CloudServer::from_pool(
            fixture.pool.clone(),
            fixture.schema.clone(),
            fixture.workspace_id.clone(),
            secret,
        )
        .await
        .unwrap();
        let generation = publish_fixture(
            &fixture,
            descriptor(&[
                ArtifactKind::Rates,
                ArtifactKind::SeasonalityIndex,
                ArtifactKind::SeasonalitySymbol,
            ]),
            None,
        )
        .await;
        assert_no_market_capabilities(&session_value(server.clone(), &secret).await);
        for (name, args) in [
            ("get_policy_rates", json!({})),
            ("get_seasonality", json!({})),
            (
                "get_seasonality_asset_detail",
                json!({"symbol":"EUR/USD", "generation":generation}),
            ),
            (
                "analyze_seasonality",
                json!({"input":{"symbol":"EUR/USD"}, "generation":generation}),
            ),
        ] {
            let outcome = server
                .execute(command(&fixture.workspace_id, name, args))
                .await;
            assert_eq!(outcome.0, StatusCode::NOT_FOUND);
            assert_eq!(outcome.1["error"]["code"], "COMMAND_UNAVAILABLE");
            assert!(outcome.1.get("data").is_none());
            assert!(outcome.1.get("revision").is_none());
        }
        // Optional market setup must not disable the already functional journal.
        let journal = server
            .execute(command(
                &fixture.workspace_id,
                "get_bootstrap_data",
                json!({}),
            ))
            .await;
        assert_eq!(journal.0, StatusCode::OK);
        assert_eq!(journal.1["ok"], true);
        assert_eq!(server.revision().await.unwrap(), 0);
    })
    .catch_unwind()
    .await;
    fixture.close().await;
    if let Err(panic) = result {
        std::panic::resume_unwind(panic);
    }
}

#[tokio::test]
#[ignore = "Requires MACRO_TEST_ENV_FILE; synthetic transport and a disposable Neon schema only"]
async fn neon_market_capabilities_require_active_artifacts_and_generation_is_checked_before_download()
 {
    let fixture = TestDatabase::open().await;
    let cache = tempfile::tempdir().unwrap();
    let result = std::panic::AssertUnwindSafe(async {
        let secret = [94; 32];
        let calls = Arc::new(AtomicUsize::new(0));
        let mut server = CloudServer::from_pool(
            fixture.pool.clone(),
            fixture.schema.clone(),
            fixture.workspace_id.clone(),
            secret,
        )
        .await
        .unwrap();
        Arc::get_mut(&mut server).unwrap().market = Some(
            market::MarketRuntime::with_test_loader(
                rejecting_loader(calls.clone()),
                cache.path().join("cache"),
            )
            .unwrap(),
        );
        assert_no_market_capabilities(&session_value(server.clone(), &secret).await);
        let missing = server
            .execute(command(
                &fixture.workspace_id,
                "get_policy_rates",
                json!({}),
            ))
            .await;
        assert_eq!(missing.0, StatusCode::NOT_FOUND);
        assert_eq!(calls.load(Ordering::SeqCst), 0);

        let rates_generation =
            publish_fixture(&fixture, descriptor(&[ArtifactKind::Rates]), None).await;
        let rates_session = session_value(server.clone(), &secret).await;
        assert!(
            rates_session["capabilities"]
                .as_array()
                .unwrap()
                .iter()
                .any(|value| value == "get_policy_rates")
        );
        assert!(
            !rates_session["capabilities"]
                .as_array()
                .unwrap()
                .iter()
                .any(|value| value == "get_seasonality")
        );
        let unavailable = server
            .execute(command(&fixture.workspace_id, "get_seasonality", json!({})))
            .await;
        assert_eq!(unavailable.0, StatusCode::NOT_FOUND);
        assert_eq!(calls.load(Ordering::SeqCst), 0);

        let generation = publish_fixture(
            &fixture,
            descriptor(&[
                ArtifactKind::Rates,
                ArtifactKind::SeasonalityIndex,
                ArtifactKind::SeasonalitySymbol,
            ]),
            Some(&rates_generation),
        )
        .await;
        let active = session_value(server.clone(), &secret).await;
        for name in [
            "get_policy_rates",
            "get_seasonality",
            "get_seasonality_asset_detail",
            "analyze_seasonality",
        ] {
            assert!(
                active["capabilities"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|value| value == name)
            );
            assert!(
                !active["writableCommands"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|value| value == name)
            );
        }
        for name in ["get_seasonality_asset_detail", "analyze_seasonality"] {
            for supplied in [Value::Null, json!(Uuid::new_v4().to_string())] {
                let mut args = if name == "analyze_seasonality" {
                    json!({"input":{"symbol":"EUR/USD"}})
                } else {
                    json!({"symbol":"EUR/USD"})
                };
                if !supplied.is_null() {
                    args["generation"] = supplied;
                }
                let outcome = server
                    .execute(command(&fixture.workspace_id, name, args))
                    .await;
                assert_eq!(outcome.0, StatusCode::OK);
                assert_eq!(outcome.1["error"]["code"], "CONFLICT");
                assert_eq!(outcome.1["revision"], 0);
                assert_eq!(calls.load(Ordering::SeqCst), 0);
            }
        }
        let invalid = server.execute(command(&fixture.workspace_id, "analyze_seasonality", json!({
            "generation":generation,
            "input":{"symbol":"EUR/USD","yearFilter":{"cycleAnchorYear":i32::MIN,"cycleYears":3}}
        }))).await;
        assert_eq!(invalid.1["error"]["code"], "VALIDATION_ERROR");
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        let foreign = server
            .execute(command("another_workspace", "get_policy_rates", json!({})))
            .await;
        assert_eq!(foreign.0, StatusCode::CONFLICT);
        assert!(foreign.1.get("revision").is_none());
        assert_eq!(calls.load(Ordering::SeqCst), 0);

        // Positive control: the same valid selection reaches the synthetic
        // downloader, so preflight assertions cannot pass due to a dead route.
        let available = server
            .execute(command(
                &fixture.workspace_id,
                "get_seasonality_asset_detail",
                json!({
                    "generation":generation,"symbol":"EUR/USD"
                }),
            ))
            .await;
        assert_eq!(available.1["error"]["code"], "COMMAND_FAILED");
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        let operations: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cloud_operations")
            .fetch_one(&fixture.pool)
            .await
            .unwrap();
        assert_eq!(operations, 0);
        assert_eq!(server.revision().await.unwrap(), 0);
    })
    .catch_unwind()
    .await;
    fixture.close().await;
    if let Err(panic) = result {
        std::panic::resume_unwind(panic);
    }
}

#[tokio::test]
#[ignore = "Requires MACRO_TEST_ENV_FILE; synthetic transport and a disposable Neon schema only"]
async fn neon_market_download_releases_single_pg_connection_and_keeps_its_pinned_generation() {
    let fixture = TestDatabase::open().await;
    let cache = tempfile::tempdir().unwrap();
    let one_connection = PgPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(3))
        .connect_lazy_with((*fixture.pool.connect_options()).clone());
    let result = std::panic::AssertUnwindSafe(async {
        let (entered_tx, mut entered_rx) = mpsc::channel(1);
        let resume = Arc::new(Notify::new());
        let resume_download = resume.clone();
        let loader: market::TestLoader = Arc::new(move |descriptor| {
            let entered_tx = entered_tx.clone();
            let resume = resume_download.clone();
            async move {
                entered_tx.send(descriptor).await.unwrap();
                resume.notified().await;
                Err(CacheError::Unavailable)
            }
            .boxed()
        });
        let mut server = CloudServer::from_pool(
            one_connection.clone(),
            fixture.schema.clone(),
            fixture.workspace_id.clone(),
            [95; 32],
        )
        .await
        .unwrap();
        Arc::get_mut(&mut server).unwrap().market = Some(
            market::MarketRuntime::with_test_loader(loader, cache.path().join("cache")).unwrap(),
        );
        let first = publish_fixture(&fixture, descriptor(&[ArtifactKind::Rates]), None).await;
        let read = server.execute(command(
            &fixture.workspace_id,
            "get_policy_rates",
            json!({}),
        ));
        let concurrent_journal = async {
            let download = tokio::time::timeout(Duration::from_secs(10), entered_rx.recv())
                .await
                .unwrap()
                .unwrap();
            assert_eq!(download.generation, first);
            let second =
                publish_fixture(&fixture, descriptor(&[ArtifactKind::Rates]), Some(&first)).await;
            assert_ne!(second, first);
            let mut write = command(
                &fixture.workspace_id,
                "create_tag",
                json!({"input":{"name":"While synthetic download waits"}}),
            );
            write.operation_id = Some(Uuid::new_v4().to_string());
            write.expected_revision = Some(0);
            // If the market reader retains even one PG connection, this pool
            // cannot serve the journal until the blocked downloader resumes.
            let written = tokio::time::timeout(Duration::from_secs(8), server.execute(write)).await;
            resume.notify_one();
            let written = written.unwrap();
            assert_eq!(written.0, StatusCode::OK);
            assert_eq!(written.1["ok"], true);
            assert_eq!(written.1["revision"], 1);
            second
        };
        let (read, second) = tokio::time::timeout(Duration::from_secs(25), async {
            tokio::join!(read, concurrent_journal)
        })
        .await
        .unwrap();
        assert_eq!(read.1["error"]["code"], "COMMAND_FAILED");
        assert_eq!(read.1["revision"], 0);
        assert_eq!(server.revision().await.unwrap(), 1);
        let (revision, manifest) = server.market_snapshot().await.unwrap();
        assert_eq!(revision, 1);
        assert_eq!(manifest.unwrap().manifest.generation, second);
        let operations: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cloud_operations")
            .fetch_one(&fixture.pool)
            .await
            .unwrap();
        assert_eq!(operations, 1);
    })
    .catch_unwind()
    .await;
    one_connection.close().await;
    fixture.close().await;
    if let Err(panic) = result {
        std::panic::resume_unwind(panic);
    }
}
