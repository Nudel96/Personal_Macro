use super::*;
use crate::cloud_postgres::test_support::TestDatabase;
use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use futures_util::FutureExt;
use tower::ServiceExt;

fn request(workspace: &str, command: &str, args: Value, revision: Option<i64>) -> CommandRequest {
    CommandRequest {
        workspace_id: workspace.into(),
        command: command.into(),
        args,
        operation_id: revision.map(|_| Uuid::new_v4().to_string()),
        expected_revision: revision,
    }
}

fn account(name: &str) -> Value {
    json!({"input":{"name":name,"accountType":"demo","baseCurrency":"EUR","initialBalanceMinor":100_000,"defaultRiskPercent":1.0}})
}

fn signed(
    secret: &[u8; 32],
    method: Method,
    path: &str,
    body: Vec<u8>,
    nonce: &str,
) -> Request<Body> {
    let timestamp = chrono::Utc::now().timestamp().to_string();
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).unwrap();
    mac.update(canonical(&timestamp, nonce, method.as_str(), path, &body).as_bytes());
    Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json")
        .header("x-macro-timestamp", timestamp)
        .header("x-macro-nonce", nonce)
        .header("x-macro-signature", hex(&mac.finalize().into_bytes()))
        .body(Body::from(body))
        .unwrap()
}

fn command_bytes(request: &CommandRequest) -> Vec<u8> {
    serde_json::to_vec(&json!({
        "workspaceId": request.workspace_id,
        "command": request.command,
        "args": request.args,
        "operationId": request.operation_id,
        "expectedRevision": request.expected_revision,
    }))
    .unwrap()
}

async fn private_json(response: Response) -> (StatusCode, Value) {
    let status = response.status();
    assert_eq!(response.headers()["cache-control"], "private, no-store");
    assert_eq!(response.headers()["x-content-type-options"], "nosniff");
    let body = to_bytes(response.into_body(), MAX_RESPONSE_BYTES)
        .await
        .unwrap();
    (status, serde_json::from_slice(&body).unwrap())
}

fn media_registration(workspace: &str) -> (CommandRequest, String, String) {
    let id = Uuid::new_v4().to_string();
    let sha256 = "a".repeat(64);
    let pathname = format!("media/v1/{id}/{sha256}.png");
    let command = request(
        workspace,
        "register_private_media",
        json!({"input": {
            "id": id, "blobPathname": pathname, "originalFilename": "synthetic.png",
            "mimeType": "image/png", "sizeBytes": 128, "sha256": sha256,
            "width": 1, "height": 1
        }}),
        Some(0),
    );
    (command, id, pathname)
}

#[test]
fn private_schema_and_workspace_identifiers_are_bounded() {
    assert!(validate_scope("macro_private", "my_workspace-1").is_ok());
    for bad in [
        "public",
        "macro_x; DROP SCHEMA public",
        "macro_X",
        "macro_a.b",
        "",
    ] {
        assert!(validate_scope(bad, "workspace").is_err());
    }
    assert!(validate_scope("macro_private", "../outside").is_err());
    assert!(validate_scope("macro_private", &"a".repeat(129)).is_err());
}

#[test]
fn signed_canonical_message_binds_method_path_body_and_nonce() {
    let base = canonical("1", "nonce", "POST", "/commands", b"body");
    for alternative in [
        canonical("1", "nonce", "GET", "/commands", b"body"),
        canonical("1", "nonce", "POST", "/session", b"body"),
        canonical("1", "other", "POST", "/commands", b"body"),
        canonical("1", "nonce", "POST", "/commands", b"changed"),
    ] {
        assert_ne!(base, alternative);
    }
    assert!(!canonical_uuid("../../bad"));
    assert_eq!(decode_hex::<2>("00ff"), Some([0, 255]));
    assert_eq!(decode_hex::<2>("éé"), None);
}

#[tokio::test]
#[ignore = "Requires MACRO_TEST_ENV_FILE; uses a new disposable Neon schema only"]
async fn neon_http_public_and_internal_media_commands_are_segregated() {
    let fixture = TestDatabase::open().await;
    let outcome = std::panic::AssertUnwindSafe(async {
        let secret = [91; 32];
        let server = CloudServer::from_pool(
            fixture.pool.clone(), fixture.schema.clone(), fixture.workspace_id.clone(), secret,
        ).await.unwrap();
        let api = router(server.clone());
        let (registration, id, pathname) = media_registration(&fixture.workspace_id);
        let registration_body = command_bytes(&registration);

        // Even a correctly signed public request must not reach registration.
        let denied = private_json(api.clone().oneshot(signed(
            &secret, Method::POST, "/commands", registration_body.clone(), &Uuid::new_v4().to_string(),
        )).await.unwrap()).await;
        assert_eq!(denied.0, StatusCode::NOT_FOUND);
        assert_eq!(denied.1["error"]["code"], "COMMAND_UNAVAILABLE");
        assert!(denied.1.get("revision").is_none());
        let untouched: (i64, i64, i64) = sqlx::query_as(
            "SELECT revision,(SELECT COUNT(*) FROM media_files),(SELECT COUNT(*) FROM cloud_operations) FROM cloud_workspace WHERE id=1",
        ).fetch_one(&fixture.pool).await.unwrap();
        assert_eq!(untouched, (0, 0, 0));

        // The identical operation succeeds on the internal route. No Blob
        // requests occur: this fixture registers only synthetic metadata.
        let registered = private_json(api.clone().oneshot(signed(
            &secret, Method::POST, "/media/commands", registration_body.clone(), &Uuid::new_v4().to_string(),
        )).await.unwrap()).await;
        assert_eq!(registered.0, StatusCode::OK);
        assert_eq!(registered.1["ok"], true);
        assert_eq!(registered.1["revision"], 1);
        assert_eq!(registered.1["data"]["id"], id);
        assert!(!registered.1.to_string().contains(&pathname));

        let lookup = command_bytes(&request(
            &fixture.workspace_id, "get_private_media_object", json!({"id": id}), None,
        ));
        // Existing private objects and already committed registration receipts
        // must remain inaccessible through the public command dispatcher.
        for body in [lookup.clone(), registration_body] {
            let denied = private_json(api.clone().oneshot(signed(
                &secret, Method::POST, "/commands", body, &Uuid::new_v4().to_string(),
            )).await.unwrap()).await;
            assert_eq!(denied.0, StatusCode::NOT_FOUND);
            assert_eq!(denied.1["error"]["code"], "COMMAND_UNAVAILABLE");
            assert!(denied.1.get("data").is_none());
            assert!(denied.1.get("revision").is_none());
            assert!(!denied.1.to_string().contains(&pathname));
        }
        let object = private_json(api.clone().oneshot(signed(
            &secret, Method::POST, "/media/commands", lookup, &Uuid::new_v4().to_string(),
        )).await.unwrap()).await;
        assert_eq!(object.0, StatusCode::OK);
        assert_eq!(object.1["ok"], true);
        assert_eq!(object.1["data"]["blobPathname"], pathname);

        // The internal endpoint is not an alternate entry point for either
        // public reads, public writes, or public media commands.
        for command in [
            request(&fixture.workspace_id, "get_bootstrap_data", json!({}), None),
            request(&fixture.workspace_id, "list_media", json!({}), None),
            request(&fixture.workspace_id, "create_tag", json!({"input":{"name":"Must not exist"}}), Some(1)),
        ] {
            let denied = private_json(api.clone().oneshot(signed(
                &secret, Method::POST, "/media/commands", command_bytes(&command), &Uuid::new_v4().to_string(),
            )).await.unwrap()).await;
            assert_eq!(denied.0, StatusCode::NOT_FOUND);
            assert_eq!(denied.1["error"]["code"], "COMMAND_UNAVAILABLE");
            assert!(denied.1.get("data").is_none());
            assert!(denied.1.get("revision").is_none());
        }
        let public_list = private_json(api.oneshot(signed(
            &secret, Method::POST, "/commands",
            command_bytes(&request(&fixture.workspace_id, "list_media", json!({}), None)),
            &Uuid::new_v4().to_string(),
        )).await.unwrap()).await;
        assert_eq!(public_list.0, StatusCode::OK);
        assert_eq!(public_list.1["data"].as_array().unwrap().len(), 1);
        assert_eq!(public_list.1["data"][0]["absolutePath"], format!("/api/media?id={id}"));
        assert!(!public_list.1.to_string().contains(&pathname));
        let persisted: (i64, i64, i64, i64, i64) = sqlx::query_as(
            "SELECT revision,(SELECT COUNT(*) FROM media_files),(SELECT COUNT(*) FROM cloud_media_objects),(SELECT COUNT(*) FROM tags),(SELECT COUNT(*) FROM cloud_operations) FROM cloud_workspace WHERE id=1",
        ).fetch_one(&fixture.pool).await.unwrap();
        assert_eq!(persisted, (1, 1, 1, 0, 1));
    }).catch_unwind().await;
    fixture.close().await;
    if let Err(panic) = outcome {
        std::panic::resume_unwind(panic);
    }
}

#[tokio::test]
#[ignore = "Requires MACRO_TEST_ENV_FILE; uses a new disposable Neon schema only"]
async fn neon_http_media_signatures_cannot_cross_methods_or_paths() {
    let fixture = TestDatabase::open().await;
    let outcome = std::panic::AssertUnwindSafe(async {
        let secret = [92; 32];
        let server = CloudServer::from_pool(
            fixture.pool.clone(), fixture.schema.clone(), fixture.workspace_id.clone(), secret,
        ).await.unwrap();
        let api = router(server.clone());
        let (registration, id, _) = media_registration(&fixture.workspace_id);
        let registered = private_json(api.clone().oneshot(signed(
            &secret, Method::POST, "/media/commands", command_bytes(&registration), &Uuid::new_v4().to_string(),
        )).await.unwrap()).await;
        assert_eq!(registered.1["ok"], true);
        let private_body = command_bytes(&request(
            &fixture.workspace_id, "get_private_media_object", json!({"id": id}), None,
        ));
        let public_body = command_bytes(&request(
            &fixture.workspace_id, "list_media", json!({}), None,
        ));

        // Transfer a valid signature between the two dispatchers, add a query
        // string, or sign another method before sending POST. Rejection must
        // happen before dispatch AND before consuming the valid nonce.
        for (signed_method, signed_path, actual_path, body, retry_path) in [
            (Method::POST, "/media/commands", "/commands", private_body.clone(), "/media/commands"),
            (Method::POST, "/commands", "/media/commands", public_body.clone(), "/commands"),
            (Method::POST, "/media/commands", "/media/commands?changed=1", private_body.clone(), "/media/commands"),
            (Method::POST, "/commands", "/commands?changed=1", public_body.clone(), "/commands"),
            (Method::GET, "/media/commands", "/media/commands", private_body.clone(), "/media/commands"),
            (Method::GET, "/commands", "/commands", public_body.clone(), "/commands"),
        ] {
            let nonce = Uuid::new_v4().to_string();
            let mut altered = signed(&secret, signed_method, signed_path, body.clone(), &nonce);
            *altered.method_mut() = Method::POST;
            *altered.uri_mut() = actual_path.parse().unwrap();
            let denied = private_json(api.clone().oneshot(altered).await.unwrap()).await;
            assert_eq!(denied.0, StatusCode::UNAUTHORIZED);
            assert_eq!(denied.1["error"]["code"], "UNAUTHORIZED");
            assert!(denied.1.get("data").is_none());
            assert!(denied.1.get("revision").is_none());
            let consumed: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM cloud_nonces WHERE nonce=$1)")
                .bind(&nonce).fetch_one(&fixture.pool).await.unwrap();
            assert!(!consumed);

            let accepted = private_json(api.clone().oneshot(signed(
                &secret, Method::POST, retry_path, body.clone(), &nonce,
            )).await.unwrap()).await;
            assert_eq!(accepted.0, StatusCode::OK);
            assert_eq!(accepted.1["ok"], true);
            // A correctly authenticated retry consumes the nonce exactly once.
            let replay = private_json(api.clone().oneshot(signed(
                &secret, Method::POST, retry_path, body, &nonce,
            )).await.unwrap()).await;
            assert_eq!(replay.0, StatusCode::UNAUTHORIZED);
        }
        for path in ["/commands", "/media/commands"] {
            let denied = api.clone().oneshot(signed(
                &secret, Method::GET, path, public_body.clone(), &Uuid::new_v4().to_string(),
            )).await.unwrap();
            assert_eq!(denied.status(), StatusCode::METHOD_NOT_ALLOWED);
        }
        let persisted: (i64, i64) = sqlx::query_as(
            "SELECT revision,(SELECT COUNT(*) FROM cloud_operations) FROM cloud_workspace WHERE id=1",
        ).fetch_one(&fixture.pool).await.unwrap();
        assert_eq!(persisted, (1, 1));
    }).catch_unwind().await;
    fixture.close().await;
    if let Err(panic) = outcome {
        std::panic::resume_unwind(panic);
    }
}

#[tokio::test]
#[ignore = "Requires MACRO_TEST_ENV_FILE; uses a new disposable Neon schema only"]
async fn neon_report_marker_receipt_replay_survives_failed_membership_preflight() {
    let fixture = TestDatabase::open().await;
    let outcome = std::panic::AssertUnwindSafe(async {
        let server = CloudServer::from_pool(
            fixture.pool.clone(),
            fixture.schema.clone(),
            fixture.workspace_id.clone(),
            [76; 32],
        )
        .await
        .unwrap();
        let missing_membership = || {
            Some(failure(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "Der veröffentlichte Bericht wurde nicht gefunden.",
                None,
            ))
        };
        // Inject only the synthetic membership result at the private transaction
        // boundary; the fixture never downloads a report or contacts Blob.
        let unknown = request(
            &fixture.workspace_id,
            "mark_central_bank_report_read",
            json!({"id":"synthetic-unknown-report"}),
            Some(0),
        );
        let rejected = server
            .transaction(unknown, true, false, missing_membership())
            .await
            .unwrap();
        assert_eq!(rejected.0, StatusCode::BAD_REQUEST);
        assert_eq!(rejected.1["error"]["code"], "VALIDATION_ERROR");
        assert_eq!(server.revision().await.unwrap(), 0);
        for table in ["cloud_report_reads", "cloud_operations"] {
            let count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
                .fetch_one(&fixture.pool)
                .await
                .unwrap();
            assert_eq!(count, 0);
        }

        let mark = request(
            &fixture.workspace_id,
            "mark_central_bank_report_read",
            json!({"id":"synthetic-published-report"}),
            Some(0),
        );
        let first = server
            .transaction(mark.clone(), true, false, None)
            .await
            .unwrap();
        assert_eq!(first.0, StatusCode::OK);
        assert_eq!(first.1["ok"], true);
        assert_eq!(first.1["revision"], 1);
        let read_at: String = sqlx::query_scalar(
            "SELECT read_at FROM cloud_report_reads WHERE report_id='synthetic-published-report'",
        )
        .fetch_one(&fixture.pool)
        .await
        .unwrap();

        // A later generation may omit the report. The original operation and
        // even its now-stale expected revision still replay the exact receipt.
        assert_eq!(
            server
                .transaction(mark.clone(), true, false, missing_membership())
                .await
                .unwrap(),
            first
        );
        // Exercise the real execute path after a restart with no market runtime.
        // Its preflight fails, but that cannot invalidate the committed receipt.
        let restarted = CloudServer::from_pool(
            fixture.pool.clone(),
            fixture.schema.clone(),
            fixture.workspace_id.clone(),
            [76; 32],
        )
        .await
        .unwrap();
        assert_eq!(restarted.execute(mark.clone()).await, first);

        let mut changed = mark.clone();
        changed.args = json!({"id":"synthetic-different-report"});
        let conflict = restarted.execute(changed).await;
        assert_eq!(conflict.0, StatusCode::CONFLICT);
        assert_eq!(conflict.1["error"]["code"], "OPERATION_CONFLICT");
        let new_unknown = request(
            &fixture.workspace_id,
            "mark_central_bank_report_read",
            json!({"id":"synthetic-new-unknown-report"}),
            Some(1),
        );
        assert_eq!(
            server
                .transaction(new_unknown, true, false, missing_membership())
                .await
                .unwrap()
                .0,
            StatusCode::BAD_REQUEST
        );
        assert_eq!(server.revision().await.unwrap(), 1);
        for table in ["cloud_report_reads", "cloud_operations"] {
            let count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
                .fetch_one(&fixture.pool)
                .await
                .unwrap();
            assert_eq!(count, 1);
        }
        let replayed_read_at: String = sqlx::query_scalar(
            "SELECT read_at FROM cloud_report_reads WHERE report_id='synthetic-published-report'",
        )
        .fetch_one(&fixture.pool)
        .await
        .unwrap();
        assert_eq!(replayed_read_at, read_at);
    })
    .catch_unwind()
    .await;
    fixture.close().await;
    if let Err(panic) = outcome {
        std::panic::resume_unwind(panic);
    }
}

#[tokio::test]
#[ignore = "Requires MACRO_TEST_ENV_FILE; uses a new disposable Neon schema only"]
async fn neon_atomic_commands_concurrency_rollback_receipts_and_authentication() {
    let fixture = TestDatabase::open().await;
    let outcome = std::panic::AssertUnwindSafe(async {
    let secret=[73;32];
    let server=CloudServer::from_pool(fixture.pool.clone(),fixture.schema.clone(),fixture.workspace_id.clone(),secret).await.unwrap();
    let second=CloudServer::from_pool(fixture.pool.clone(),fixture.schema.clone(),fixture.workspace_id.clone(),secret).await.unwrap();

    let create=request(&fixture.workspace_id,"save_account",account("Synthetic first"),Some(0));
    let first=server.execute(create.clone()).await;
    assert_eq!(first.0,StatusCode::OK);
    assert_eq!(first.1["ok"],true);
    assert_eq!(first.1["revision"],1);
    let account_id=first.1["data"]["id"].as_str().unwrap().to_owned();
    assert_eq!(second.execute(create.clone()).await.1,first.1);
    let mut changed=create.clone(); changed.args=account("Synthetic altered");
    assert_eq!(second.execute(changed).await.0,StatusCode::CONFLICT);

    let (one,two)=tokio::join!(server.execute(request(&fixture.workspace_id,"save_account",account("Synthetic second"),Some(1))),
        second.execute(request(&fixture.workspace_id,"save_account",account("Synthetic third"),Some(1))));
    assert_eq!([one.0,two.0].iter().filter(|&&status|status==StatusCode::OK).count(),1);
    assert_eq!([one.0,two.0].iter().filter(|&&status|status==StatusCode::CONFLICT).count(),1);
    assert_eq!(server.revision().await.unwrap(),2);
    let bootstrap=server.execute(request(&fixture.workspace_id,"get_bootstrap_data",json!({}),None)).await;
    assert_eq!(bootstrap.1["data"]["accounts"].as_array().unwrap().len(),2);
    assert_eq!(bootstrap.1["data"]["databasePath"],"");

    let trade=server.execute(request(&fixture.workspace_id,"create_trade",json!({"input":{"accountId":account_id,"instrument":"EURUSD","direction":"long","status":"draft"}}),Some(2))).await;
    assert_eq!(trade.1["ok"],true,"synthetic draft creation");
    let trade_id=trade.1["data"]["id"].as_str().unwrap().to_owned();
    let tag=server.execute(request(&fixture.workspace_id,"create_tag",json!({"input":{"name":"Synthetic tag"}}),Some(3))).await;
    assert_eq!(tag.1["ok"],true);
    let tag_id=tag.1["data"]["id"].as_str().unwrap();
    let context=|tags:Value| json!({"accountId":account_id,"input":{"tradeId":trade_id,"tagIds":tags,"legs":[],"checklistItems":[],"emotions":[],"customValues":[]}});
    let good=server.execute(request(&fixture.workspace_id,"save_trade_context",context(json!([tag_id])),Some(4))).await;
    assert_eq!(good.1["ok"],true);
    let bad=request(&fixture.workspace_id,"save_trade_context",context(json!(["synthetic-missing-tag"])),Some(5));
    let failed=server.execute(bad.clone()).await;
    assert_eq!(failed.1["ok"],false);
    assert_eq!(failed.1["revision"],5);
    assert_eq!(second.execute(bad).await.1,failed.1);
    let preserved=server.execute(request(&fixture.workspace_id,"get_trade_context",json!({"accountId":account_id,"tradeId":trade_id}),None)).await;
    assert_eq!(preserved.1["data"]["tags"].as_array().unwrap().len(),1);
    assert_eq!(preserved.1["data"]["tags"][0]["id"],tag_id);
    let after_failure=server.execute(request(&fixture.workspace_id,"create_strategy",json!({"input":{"name":"After rollback"}}),Some(5))).await;
    assert_eq!(after_failure.1["ok"],true);
    assert_eq!(after_failure.1["revision"],6);

    let nonce=Uuid::new_v4().to_string();
    let api=router(server.clone());
    let authorized=api.clone().oneshot(signed(&secret,Method::GET,"/session",vec![],&nonce)).await.unwrap();
    assert_eq!(authorized.status(),StatusCode::OK);
    let session:Value=serde_json::from_slice(&to_bytes(authorized.into_body(),MAX_RESPONSE_BYTES).await.unwrap()).unwrap();
    assert_eq!(session["revision"],6);
    assert_eq!(session["capabilities"].as_array().unwrap().len(),56);
    assert!(session["capabilities"].as_array().unwrap().iter().any(|v|v=="get_provider_automation_status"));
    assert!(!session["capabilities"].as_array().unwrap().iter().any(|v|v=="myfxbook_activate"));
    assert!(session["capabilities"].as_array().unwrap().iter().any(|v|v=="upload_private_media"));
    assert!(!session["capabilities"].as_array().unwrap().iter().any(|v|v=="register_private_media"||v=="get_private_media_object"));
    // Another service instance/restart sees the durable nonce and receipt.
    let restarted=router(second);
    assert_eq!(restarted.oneshot(signed(&secret,Method::GET,"/session",vec![],&nonce)).await.unwrap().status(),StatusCode::UNAUTHORIZED);
    assert_eq!(api.clone().oneshot(Request::builder().uri("/session").body(Body::empty()).unwrap()).await.unwrap().status(),StatusCode::UNAUTHORIZED);
    assert_eq!(api.clone().oneshot(signed(&secret,Method::HEAD,"/session",vec![],&Uuid::new_v4().to_string())).await.unwrap().status(),StatusCode::UNAUTHORIZED);

    // Exercise the real signed POST path, not only the transaction dispatcher.
    let operation=Uuid::new_v4().to_string();
    let body=serde_json::to_vec(&json!({
        "workspaceId":fixture.workspace_id,"command":"create_tag",
        "args":{"input":{"name":"HTTP Prüfung Ä"}},
        "operationId":operation,"expectedRevision":6
    })).unwrap();
    let http=api.clone().oneshot(signed(&secret,Method::POST,"/commands",body.clone(),&Uuid::new_v4().to_string())).await.unwrap();
    assert_eq!(http.status(),StatusCode::OK);
    assert_eq!(http.headers()["cache-control"],"private, no-store");
    assert!(http.headers()["content-type"].to_str().unwrap().starts_with("application/json"));
    let http_value:Value=serde_json::from_slice(&to_bytes(http.into_body(),MAX_RESPONSE_BYTES).await.unwrap()).unwrap();
    assert_eq!(http_value["ok"],true);
    assert_eq!(http_value["revision"],7);
    assert_eq!(http_value["data"]["name"],"HTTP Prüfung Ä");
    assert!(http_value["data"]["id"].is_string());
    let repeated=api.clone().oneshot(signed(&secret,Method::POST,"/commands",body.clone(),&Uuid::new_v4().to_string())).await.unwrap();
    assert_eq!(repeated.status(),StatusCode::OK);
    let repeated_value:Value=serde_json::from_slice(&to_bytes(repeated.into_body(),MAX_RESPONSE_BYTES).await.unwrap()).unwrap();
    assert_eq!(repeated_value,http_value);

    let mut wrong_type=signed(&secret,Method::POST,"/commands",body,&Uuid::new_v4().to_string());
    wrong_type.headers_mut().insert("content-type","text/plain".parse().unwrap());
    let rejected=api.clone().oneshot(wrong_type).await.unwrap();
    assert_eq!(rejected.status(),StatusCode::UNSUPPORTED_MEDIA_TYPE);
    let invalid_json=api.clone().oneshot(signed(&secret,Method::POST,"/commands",b"{".to_vec(),&Uuid::new_v4().to_string())).await.unwrap();
    assert_eq!(invalid_json.status(),StatusCode::BAD_REQUEST);
    let invalid_args=serde_json::to_vec(&json!({"workspaceId":fixture.workspace_id,"command":"create_tag","args":[]})).unwrap();
    let rejected=api.clone().oneshot(signed(&secret,Method::POST,"/commands",invalid_args,&Uuid::new_v4().to_string())).await.unwrap();
    assert_eq!(rejected.status(),StatusCode::BAD_REQUEST);
    assert_eq!(server.revision().await.unwrap(),7);
    let read_body=serde_json::to_vec(&json!({"workspaceId":fixture.workspace_id,"command":"get_bootstrap_data","args":{}})).unwrap();
    let read=api.oneshot(signed(&secret,Method::POST,"/commands",read_body,&Uuid::new_v4().to_string())).await.unwrap();
    assert_eq!(read.status(),StatusCode::OK);
    let read_value:Value=serde_json::from_slice(&to_bytes(read.into_body(),MAX_RESPONSE_BYTES).await.unwrap()).unwrap();
    assert_eq!(read_value["ok"],true);
    assert_eq!(read_value["revision"],7);
    assert_eq!(read_value["data"]["tags"].as_array().unwrap().len(),2);

    // Simulate the post-COMMIT recovery lookup. This tests its conservative
    // result contract without pretending to inject a network disconnect.
    let before:i64=sqlx::query_scalar("SELECT COUNT(*) FROM cloud_operations")
        .fetch_one(&fixture.pool).await.unwrap_or_else(|_|panic!("Could not count isolated receipts"));
    let original_operation=create.operation_id.as_deref().unwrap();
    let hash=request_hash(&create);
    assert_eq!(server.resolve_commit(original_operation,&hash).await,first);
    for (operation,hash) in [
        (original_operation.to_owned(),"0".repeat(64)),
        (Uuid::new_v4().to_string(),hash),
    ] {
        let recovered=server.resolve_commit(&operation,&hash).await;
        assert_eq!(recovered.0,StatusCode::CONFLICT);
        assert_eq!(recovered.1["ok"],false);
        assert_eq!(recovered.1["error"]["code"],"OPERATION_UNCERTAIN");
        assert!(recovered.1.get("revision").is_none());
    }
    let after:i64=sqlx::query_scalar("SELECT COUNT(*) FROM cloud_operations")
        .fetch_one(&fixture.pool).await.unwrap_or_else(|_|panic!("Could not count isolated receipts"));
    assert_eq!(before,after);
    assert_eq!(server.revision().await.unwrap(),7);
    drop(server);
    }).catch_unwind().await;
    fixture.close().await;
    if let Err(panic) = outcome {
        std::panic::resume_unwind(panic);
    }
}

fn pooled_test_options() -> PgConnectOptions {
    let path = std::env::var("MACRO_TEST_ENV_FILE")
        .unwrap_or_else(|_| panic!("Set MACRO_TEST_ENV_FILE explicitly for isolated Neon tests"));
    let entries = dotenvy::from_path_iter(path)
        .unwrap_or_else(|_| panic!("The explicit test configuration could not be read"));
    let mut database_url = None;
    for entry in entries {
        let (key, value) =
            entry.unwrap_or_else(|_| panic!("The explicit test configuration is invalid"));
        if key == "DATABASE_URL" {
            database_url = Some(value);
        }
    }
    let database_url =
        database_url.unwrap_or_else(|| panic!("The pooled test database connection is required"));
    let parsed = url::Url::parse(&database_url)
        .unwrap_or_else(|_| panic!("The pooled test database connection is invalid"));
    assert!(
        parsed
            .host_str()
            .is_some_and(|host| host.contains("-pooler.")),
        "This test requires the actual Neon pooled endpoint"
    );
    PgConnectOptions::from_str(&database_url)
        .unwrap_or_else(|_| panic!("The pooled test database connection is invalid"))
        .ssl_mode(PgSslMode::VerifyFull)
        .disable_statement_logging()
}

#[tokio::test]
#[ignore = "Requires MACRO_TEST_ENV_FILE and pooled DATABASE_URL; uses a new disposable Neon schema only"]
async fn neon_pooled_transactions_override_wrong_default_search_path() {
    // This pool deliberately does not use the fixture's correct-schema hook.
    // The only session-level setting is the wrong pg_catalog-only search path.
    // The real service must scope each transaction through the Neon pooler.
    let pooled = PgPoolOptions::new()
        .max_connections(2)
        .acquire_timeout(Duration::from_secs(20))
        .after_connect(|connection, _| {
            Box::pin(async move {
                sqlx::query("SELECT set_config('search_path','pg_catalog',false)")
                    .execute(connection)
                    .await?;
                Ok(())
            })
        })
        .connect_with(pooled_test_options())
        .await
        .unwrap_or_else(|_| panic!("The isolated pooled test connection is unavailable"));
    let fixture = TestDatabase::open().await;
    let outcome=std::panic::AssertUnwindSafe(async {
        let initial:Vec<String>=sqlx::query_scalar("SELECT current_schemas(false)::text[]")
            .fetch_one(&pooled).await.unwrap_or_else(|_|panic!("Could not inspect pooled test scope"));
        assert!(!initial.contains(&fixture.schema));
        let server=CloudServer::from_pool(pooled.clone(),fixture.schema.clone(),fixture.workspace_id.clone(),[84;32])
            .await.unwrap_or_else(|_|panic!("The server did not select its explicit test schema"));
        for revision in 0..3_i64 {
            let mutation=request(&fixture.workspace_id,"save_account",account(&format!("Pooled synthetic {revision}")),Some(revision));
            let outcome=server.execute(mutation.clone()).await;
            assert_eq!(outcome.0,StatusCode::OK);
            assert_eq!(outcome.1["ok"],true);
            assert_eq!(outcome.1["revision"],revision+1);
            assert_eq!(server.execute(mutation).await.1,outcome.1);
            let read=server.execute(request(&fixture.workspace_id,"get_bootstrap_data",json!({}),None)).await;
            assert_eq!(read.1["ok"],true);
            assert_eq!(read.1["revision"],revision+1);
            assert_eq!(read.1["data"]["accounts"].as_array().unwrap().len(),(revision+1) as usize);
            assert_eq!(server.revision().await.unwrap(),revision+1);
        }
        let nonce=Uuid::new_v4().to_string();
        let api=router(server.clone());
        assert_eq!(api.clone().oneshot(signed(&[84;32],Method::GET,"/session",vec![],&nonce)).await.unwrap().status(),StatusCode::OK);
        assert_eq!(api.oneshot(signed(&[84;32],Method::GET,"/session",vec![],&nonce)).await.unwrap().status(),StatusCode::UNAUTHORIZED);
        // SET LOCAL must not leave the private schema selected after a commit
        // or rollback, even while the application-side pool reuses connections.
        let outside:Vec<String>=sqlx::query_scalar("SELECT current_schemas(false)::text[]")
            .fetch_one(&pooled).await.unwrap_or_else(|_|panic!("Could not inspect pooled test scope"));
        assert!(!outside.contains(&fixture.schema));
        let (revision,accounts,operations):(i64,i64,i64)=sqlx::query_as("SELECT revision,(SELECT COUNT(*) FROM accounts),(SELECT COUNT(*) FROM cloud_operations) FROM cloud_workspace WHERE id=1")
            .fetch_one(&fixture.pool).await.unwrap_or_else(|_|panic!("Could not inspect isolated committed test data"));
        assert_eq!((revision,accounts,operations),(3,3,3));
    }).catch_unwind().await;
    pooled.close().await;
    fixture.close().await;
    if let Err(panic) = outcome {
        std::panic::resume_unwind(panic);
    }
}
