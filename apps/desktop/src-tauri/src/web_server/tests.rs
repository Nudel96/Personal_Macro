use super::*;
use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use tower::ServiceExt;

async fn fixture() -> (tempfile::TempDir, Arc<PrivateServer>) {
    let temp = tempfile::tempdir().unwrap();
    let server = PrivateServer::open(ServerConfig {
        data_root: temp.path().to_owned(),
        workspace_id: "test-workspace".into(),
        gateway_secret: [42; 32],
    })
    .await
    .unwrap();
    (temp, server)
}

fn signed(method: &str, path: &str, body: &[u8], timestamp: i64, nonce: &str) -> Request<Body> {
    let timestamp = timestamp.to_string();
    let mut mac = Hmac::<Sha256>::new_from_slice(&[42; 32]).unwrap();
    mac.update(canonical(&timestamp, nonce, method, path, body).as_bytes());
    Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json")
        .header("x-macro-timestamp", &timestamp)
        .header("x-macro-nonce", nonce)
        .header("x-macro-signature", hex(&mac.finalize().into_bytes()))
        .body(Body::from(body.to_vec()))
        .unwrap()
}

async fn call(server: &Arc<PrivateServer>, value: Value) -> (StatusCode, Value) {
    let mut value = value;
    if value.get("workspaceId").is_none() {
        value["workspaceId"] = "test-workspace".into();
    }
    let body = value.to_string();
    let request = signed(
        "POST",
        "/commands",
        body.as_bytes(),
        chrono::Utc::now().timestamp(),
        &Uuid::new_v4().to_string(),
    );
    decode(router(server.clone()).oneshot(request).await.unwrap()).await
}

async fn decode(response: Response) -> (StatusCode, Value) {
    let status = response.status();
    assert_eq!(response.headers().get("cache-control").unwrap(), "no-store");
    let bytes = to_bytes(response.into_body(), BODY_LIMIT).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap())
}

#[tokio::test]
async fn authentication_rejects_missing_tampered_expired_and_replayed_signatures() {
    let (_temp, server) = fixture().await;
    let request = Request::builder()
        .uri("/session")
        .body(Body::empty())
        .unwrap();
    assert_eq!(
        router(server.clone())
            .oneshot(request)
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let now = chrono::Utc::now().timestamp();
    for timestamp in [now - 61, now + 61] {
        let request = signed(
            "GET",
            "/session",
            b"",
            timestamp,
            &Uuid::new_v4().to_string(),
        );
        assert_eq!(
            router(server.clone())
                .oneshot(request)
                .await
                .unwrap()
                .status(),
            StatusCode::UNAUTHORIZED
        );
    }
    let nonce = Uuid::new_v4().to_string();
    let mut head = signed("GET", "/session", b"", now, &Uuid::new_v4().to_string());
    *head.method_mut() = axum::http::Method::HEAD;
    assert_eq!(
        router(server.clone()).oneshot(head).await.unwrap().status(),
        StatusCode::UNAUTHORIZED
    );
    let request = signed("GET", "/session", b"", now, &nonce);
    let (status, session) = decode(router(server.clone()).oneshot(request).await.unwrap()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(session["workspaceId"], "test-workspace");
    assert!(
        session["capabilities"]
            .as_array()
            .unwrap()
            .iter()
            .all(|command| !command.as_str().unwrap().contains("restore_backup"))
    );
    let replay = signed("GET", "/session", b"", now, &nonce);
    assert_eq!(
        router(server.clone())
            .oneshot(replay)
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let mut tampered = signed("POST", "/commands", b"{}", now, &Uuid::new_v4().to_string());
    *tampered.body_mut() = Body::from("{\"other\":true}");
    assert_eq!(
        router(server.clone())
            .oneshot(tampered)
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let mut wrong_path = signed("GET", "/session", b"", now, &Uuid::new_v4().to_string());
    *wrong_path.uri_mut() = "/session?changed=1".parse().unwrap();
    assert_eq!(
        router(server).oneshot(wrong_path).await.unwrap().status(),
        StatusCode::UNAUTHORIZED
    );
}

#[tokio::test]
async fn idempotent_write_survives_restart_and_stale_device_cannot_overwrite() {
    let (temp, server) = fixture().await;
    let operation = json!({"command":"create_tag","args":{"input":{"name":"Mobile tag","color":"#ffffff"}},"operationId":Uuid::new_v4(),"expectedRevision":0});
    let (status, first) = call(&server, operation.clone()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(first["ok"], true, "{first}");
    assert_eq!(first["revision"], 1);
    let (_, repeated) = call(&server, operation.clone()).await;
    assert_eq!(first, repeated);
    let stale = json!({"command":"create_tag","args":{"input":{"name":"Stale tag","color":"#ffffff"}},"operationId":Uuid::new_v4(),"expectedRevision":0});
    let (status, conflict) = call(&server, stale).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(conflict["error"]["code"], "REVISION_CONFLICT");
    let mut changed_operation = operation.clone();
    changed_operation["args"]["input"]["name"] = "Changed payload".into();
    assert_eq!(
        call(&server, changed_operation).await.1["error"]["code"],
        "OPERATION_CONFLICT"
    );
    server.app.db.close().await;
    server.control.close().await;
    drop(server);
    let reopened = PrivateServer::open(ServerConfig {
        data_root: temp.path().to_owned(),
        workspace_id: "test-workspace".into(),
        gateway_secret: [42; 32],
    })
    .await
    .unwrap();
    assert_eq!(call(&reopened, operation).await.1, first);
    let (_, bootstrap) = call(&reopened, json!({"command":"get_bootstrap_data","args":{}})).await;
    assert_eq!(bootstrap["revision"], 1);
    assert_eq!(
        bootstrap["data"]["tags"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|t| t["name"] == "Mobile tag")
            .count(),
        1
    );
    assert!(
        bootstrap["data"]["tags"]
            .as_array()
            .unwrap()
            .iter()
            .all(|t| t["name"] != "Stale tag")
    );
    assert_eq!(bootstrap["data"]["databasePath"], "");
    assert_eq!(bootstrap["data"]["appDataPath"], "");
}

#[tokio::test]
async fn concurrent_devices_have_exactly_one_winner_and_failed_mutations_consume_revision() {
    let (_temp, server) = fixture().await;
    let a = json!({"command":"create_tag","args":{"input":{"name":"A"}},"operationId":Uuid::new_v4(),"expectedRevision":0});
    let b = json!({"command":"create_tag","args":{"input":{"name":"B"}},"operationId":Uuid::new_v4(),"expectedRevision":0});
    let (a, b) = tokio::join!(call(&server, a), call(&server, b));
    assert_eq!(
        [a.0, b.0].iter().filter(|s| **s == StatusCode::OK).count(),
        1
    );
    assert_eq!(
        [a.0, b.0]
            .iter()
            .filter(|s| **s == StatusCode::CONFLICT)
            .count(),
        1
    );
    let failed = json!({"command":"create_tag","args":{"input":{"name":""}},"operationId":Uuid::new_v4(),"expectedRevision":1});
    let (_, error) = call(&server, failed).await;
    assert_eq!(error["ok"], false);
    assert_eq!(error["revision"], 2);
}

#[tokio::test]
async fn native_commands_secrets_and_arbitrary_settings_are_inaccessible() {
    let (_temp, server) = fixture().await;
    sqlx::query("INSERT INTO app_settings(key,value_json,updated_at) VALUES ('private_secret','\"do-not-return\"','now')").execute(&server.app.db).await.unwrap();
    for command in [
        "import_media_file",
        "stage_backup_restore",
        "open_central_bank_report_file",
        "start_myfxbook_sync",
        "not_a_command",
    ] {
        assert_eq!(
            call(
                &server,
                json!({"command":command,"args":{"path":"/etc/passwd"}})
            )
            .await
            .0,
            StatusCode::NOT_FOUND
        );
    }
    let (_, settings) = call(&server, json!({"command":"get_settings","args":{}})).await;
    assert!(!settings.to_string().contains("do-not-return"));
    let (_, forbidden) = call(&server, json!({"command":"update_setting","args":{"input":{"key":"private_secret","value":{"x":true}}},"expectedRevision":0,"operationId":Uuid::new_v4()})).await;
    assert_eq!(forbidden["ok"], false);
    let value: String =
        sqlx::query_scalar("SELECT value_json FROM app_settings WHERE key='private_secret'")
            .fetch_one(&server.app.db)
            .await
            .unwrap();
    assert_eq!(value, "\"do-not-return\"");
    assert_eq!(
        call(
            &server,
            json!({"workspaceId":"wrong-workspace","command":"get_bootstrap_data","args":{}})
        )
        .await
        .1["error"]["code"],
        "WORKSPACE_CONFLICT"
    );
}

#[tokio::test]
async fn one_process_per_volume_and_uncertain_operations_never_reexecute() {
    let (temp, server) = fixture().await;
    assert!(
        PrivateServer::open(ServerConfig {
            data_root: temp.path().to_owned(),
            workspace_id: "test-workspace".into(),
            gateway_secret: [42; 32]
        })
        .await
        .is_err()
    );
    let id = Uuid::new_v4().to_string();
    let args = json!({"input":{"name":"Never replay"}});
    let hash = hex(&Sha256::digest(
        json!({"command":"create_tag","args":args,"expectedRevision":0})
            .to_string()
            .as_bytes(),
    ));
    sqlx::query("INSERT INTO operations(id,request_hash,revision) VALUES (?,?,1)")
        .bind(&id)
        .bind(hash)
        .execute(&server.control)
        .await
        .unwrap();
    sqlx::query("UPDATE workspace SET revision=1 WHERE id=1")
        .execute(&server.control)
        .await
        .unwrap();
    let (status, error) = call(
        &server,
        json!({"command":"create_tag","args":args,"expectedRevision":0,"operationId":id}),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(error["error"]["code"], "OPERATION_UNCERTAIN");
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tags WHERE name='Never replay'")
        .fetch_one(&server.app.db)
        .await
        .unwrap();
    assert_eq!(count, 0);
}

#[tokio::test]
async fn partial_workspace_and_desktop_restore_fail_closed() {
    for file in [
        "private-server.sqlite",
        "database/journal.sqlite",
        "settings/pending-restore.json",
    ] {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join(file);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, b"").unwrap();
        let config = ServerConfig {
            data_root: temp.path().to_owned(),
            workspace_id: "test-workspace".into(),
            gateway_secret: [42; 32],
        };
        assert!(
            PrivateServer::open(config).await.is_err(),
            "must reject {file}"
        );
    }
    let temp = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(temp.path().join("database")).unwrap();
    for file in ["private-server.sqlite", "database/journal.sqlite"] {
        std::fs::write(temp.path().join(file), b"").unwrap();
    }
    assert!(
        PrivateServer::open(ServerConfig {
            data_root: temp.path().to_owned(),
            workspace_id: "test-workspace".into(),
            gateway_secret: [42; 32]
        })
        .await
        .is_err()
    );
}

#[test]
fn hmac_matches_node_crypto_fixture() {
    // Known expected output generated with the gateway's Node crypto code.
    let text = canonical(
        "1700000000",
        "00000000-0000-4000-8000-000000000001",
        "POST",
        "/commands",
        b"{}",
    );
    assert_eq!(
        text,
        "v1\n1700000000\n00000000-0000-4000-8000-000000000001\nPOST\n/commands\n44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"
    );
    let mut mac = Hmac::<Sha256>::new_from_slice(&[42; 32]).unwrap();
    mac.update(text.as_bytes());
    assert_eq!(
        hex(&mac.finalize().into_bytes()),
        "f77ed92f286c5b8b4ee5bd050c233da77678c0ce609835635e7e03bb6e9f25c1"
    );
}
