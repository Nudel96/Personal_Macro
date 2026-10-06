use super::*;
use crate::cloud_postgres::{myfxbook, myfxbook_apply, test_support::TestDatabase};
use crate::commands::myfxbook::{
    provider::{RemoteAccount, Snapshot, parse_records},
    reconcile,
};
use futures_util::FutureExt;
use std::panic::{AssertUnwindSafe, resume_unwind};

fn snapshot(closed: bool) -> Snapshot {
    let field = if closed { "history" } else { "openTrades" };
    let records=parse_records(&json!({field:[{"openTime":"09/16/2026 10:00","closeTime":"09/16/2026 11:00","symbol":"EURUSD","action":"Buy","sizing":{"type":"lots","value":"0.10"},"openPrice":1.1,"closePrice":1.105,"sl":0,"tp":1.11,"profit":5,"interest":0,"commission":0}]}),field,chrono_tz::UTC).unwrap();
    let history_keys: Vec<_> = records
        .iter()
        .filter(|r| r.kind != "open")
        .map(|r| r.key.clone())
        .collect();
    Snapshot {
        account: RemoteAccount {
            id: "123456".into(),
            name: "Synthetic portfolio".into(),
            currency: "USD".into(),
            balance_minor: if closed { 10500 } else { 10000 },
            profit_minor: if closed { 500 } else { 0 },
            capital_minor: 10000,
            updated_at: "09/16/2026 11:05".into(),
        },
        history_count: history_keys.len(),
        history_keys,
        records,
    }
}
async fn job(server: &CloudServer) -> (provider_jobs::Job, String) {
    let id = Uuid::new_v4().to_string();
    let lease = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();
    let mut tx = server.pool.begin().await.unwrap();
    server.scope(&mut tx).await.unwrap();
    sqlx::query("INSERT INTO cloud_provider_jobs(id,task_key,kind,payload_json,due_at,retry_at,expires_at,status,lease_id,lease_until,attempts) VALUES($1,$1,'myfxbook','{\"accountId\":\"test-account\"}',$2,$2,$3,'running',$4,$5,1)").bind(&id).bind(now-1).bind(now+21600).bind(&lease).bind(now+240).execute(&mut *tx).await.unwrap();
    tx.commit().await.unwrap();
    (server.provider_job(&id).await.unwrap(), lease)
}
async fn local(server: &CloudServer) -> reconcile::Local {
    let mut tx = server.pool.begin().await.unwrap();
    server.scope(&mut tx).await.unwrap();
    let result = myfxbook_apply::load(&mut tx, "test-account").await.unwrap();
    tx.rollback().await.unwrap();
    result
}

#[tokio::test]
#[ignore = "Requires explicitly selected isolated PostgreSQL test database"]
async fn provider_account_import_fences_duplicates_conflicts_disconnect_and_preserves_notes() {
    let db = TestDatabase::open().await;
    let result=AssertUnwindSafe(async {
        let server=CloudServer::from_pool(db.pool.clone(),db.schema.clone(),db.workspace_id.clone(),[7;32]).await.unwrap();
        sqlx::query("INSERT INTO accounts(id,name,base_currency,initial_balance_minor,created_at,updated_at) VALUES('test-account','Synthetic account','USD',10000,'2026-09-16T00:00:00Z','2026-09-16T00:00:00Z')").execute(&db.pool).await.unwrap();
        let first=local(&server).await;let open=snapshot(false);let plan=reconcile::plan(&first,&open).unwrap();
        let mut tx=db.pool.begin().await.unwrap();
        myfxbook::commit(&mut tx,&first,&plan,&open,"UTC",true).await.unwrap();tx.commit().await.unwrap();
        sqlx::query("INSERT INTO cloud_myfxbook_credentials VALUES('test-account','synthetic-unread-credential-envelope')").execute(&db.pool).await.unwrap();
        sqlx::query("UPDATE trades SET execution_notes_html='<p>Keep my note</p>',planned_risk_minor=250,updated_at='2026-09-16T10:02:00Z'").execute(&db.pool).await.unwrap();
        let before=local(&server).await;let closed=snapshot(true);let close_plan=reconcile::plan(&before,&closed).unwrap();let (run,lease)=job(&server).await;
        server.myfxbook_finish(&run,&lease,&before,&close_plan,&closed).await.unwrap();
        assert!(server.myfxbook_finish(&run,&lease,&before,&close_plan,&closed).await.is_err());
        let saved:(String,String,i64,i64,String)=sqlx::query_as("SELECT id,execution_notes_html,planned_risk_minor,net_pnl_minor,status FROM trades").fetch_one(&db.pool).await.unwrap();
        assert_eq!(saved,(before.trades[0].id.clone(),"<p>Keep my note</p>".into(),250,500,"closed".into()));
        assert_eq!(server.revision().await.unwrap(),1);
        let fresh=local(&server).await;let noop=reconcile::plan(&fresh,&closed).unwrap();assert!(!myfxbook::changes(&fresh,&noop));
        let (run,lease)=job(&server).await;server.myfxbook_finish(&run,&lease,&fresh,&noop,&closed).await.unwrap();
        assert_eq!(server.revision().await.unwrap(),1,"A repeated provider snapshot changes no journal revision");
        let count:i64=sqlx::query_scalar("SELECT COUNT(*) FROM cloud_myfxbook_imports").fetch_one(&db.pool).await.unwrap();assert_eq!(count,2);
        let stale=local(&server).await;let plan=reconcile::plan(&stale,&closed).unwrap();let (run,lease)=job(&server).await;
        sqlx::query("UPDATE trades SET planned_risk_minor=300,updated_at='2026-09-16T12:00:00Z'").execute(&db.pool).await.unwrap();
        assert_eq!(server.myfxbook_finish(&run,&lease,&stale,&plan,&closed).await.unwrap_err().code,"CONFLICT");
        assert_eq!(server.provider_job(&run.id).await.unwrap().status,"running","A failed transaction leaves no completion receipt");
        let before=local(&server).await;let plan=reconcile::plan(&before,&closed).unwrap();
        let mut tx=db.pool.begin().await.unwrap();myfxbook::dispatch(&mut tx,"myfxbook_disconnect",&json!({"accountId":"test-account"})).await.unwrap();tx.commit().await.unwrap();
        assert_eq!(server.provider_job(&run.id).await.unwrap().status,"cancelled");
        assert!(server.myfxbook_finish(&run,&lease,&before,&plan,&closed).await.is_err());
        let secrets:i64=sqlx::query_scalar("SELECT COUNT(*) FROM cloud_myfxbook_credentials").fetch_one(&db.pool).await.unwrap();assert_eq!(secrets,0);
        let trades:i64=sqlx::query_scalar("SELECT COUNT(*) FROM trades").fetch_one(&db.pool).await.unwrap();assert_eq!(trades,1);
        assert_eq!(server.revision().await.unwrap(),1);
    }).catch_unwind().await;
    db.close().await;
    if let Err(error) = result {
        resume_unwind(error);
    }
}

#[tokio::test]
#[ignore = "Requires explicitly selected isolated PostgreSQL test database"]
async fn provider_unchanged_release_retries_without_upload_and_fences_stale_generations() {
    let db = TestDatabase::open().await;
    let result = AssertUnwindSafe(async {
        let server = CloudServer::from_pool(
            db.pool.clone(),
            db.schema.clone(),
            db.workspace_id.clone(),
            [7; 32],
        )
        .await
        .unwrap();
        let generation = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO cloud_public_generations VALUES($1,'{}','2026-09-26T00:00:00Z')")
            .bind(&generation)
            .execute(&db.pool)
            .await
            .unwrap();
        sqlx::query("UPDATE cloud_public_active SET generation=$1 WHERE id=1")
            .bind(&generation)
            .execute(&db.pool)
            .await
            .unwrap();
        let (run, lease) = job(&server).await;
        sqlx::query("UPDATE cloud_provider_jobs SET kind='macro-release' WHERE id=$1")
            .bind(&run.id)
            .execute(&db.pool)
            .await
            .unwrap();
        let result = server
            .economic_unchanged(&run, &lease, &generation, true)
            .await
            .unwrap();
        assert_eq!(result["status"], "wait");
        let saved = server.provider_job(&run.id).await.unwrap();
        assert_eq!(saved.status, "pending");
        assert_eq!(saved.attempts, 1);
        assert!(saved.retry_at > chrono::Utc::now().timestamp() + 1700);
        assert!(
            server
                .economic_unchanged(&run, &lease, &generation, false)
                .await
                .is_err(),
            "Old delivery cannot commit again"
        );
        let (run, lease) = job(&server).await;
        assert!(
            server
                .economic_unchanged(&run, &lease, &Uuid::new_v4().to_string(), false)
                .await
                .is_err()
        );
        assert_eq!(
            server.provider_job(&run.id).await.unwrap().status,
            "running",
            "Generation mismatch rolls back completion"
        );
        server
            .economic_unchanged(&run, &lease, &generation, false)
            .await
            .unwrap();
        assert_eq!(
            server.provider_job(&run.id).await.unwrap().status,
            "complete"
        );
        let objects: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cloud_provider_objects")
            .fetch_one(&db.pool)
            .await
            .unwrap();
        assert_eq!(objects, 0);
        assert_eq!(server.revision().await.unwrap(), 0);
    })
    .catch_unwind()
    .await;
    db.close().await;
    if let Err(error) = result {
        resume_unwind(error);
    }
}

#[tokio::test]
#[ignore = "Requires explicitly selected isolated PostgreSQL test database"]
async fn provider_retention_keeps_shared_active_objects_and_original_exports() {
    let db = TestDatabase::open().await;
    let result=AssertUnwindSafe(async {
        let server=CloudServer::from_pool(db.pool.clone(),db.schema.clone(),db.workspace_id.clone(),[7;32]).await.unwrap();
        let generations:Vec<_>=(0..11).map(|_|Uuid::new_v4().to_string()).collect();let now=chrono::Utc::now().timestamp();
        for (i,generation) in generations.iter().enumerate() {
            sqlx::query("INSERT INTO cloud_public_generations VALUES($1,'{}',$2)").bind(generation).bind(format!("2026-08-{:02}T00:00:00Z",i+1)).execute(&db.pool).await.unwrap();
            let kind=if i==10{"cot"}else{"macro"};
            sqlx::query("INSERT INTO cloud_public_transports(generation,kind,artifact_key,encoding,transfer_bytes,transfer_sha256) VALUES($1,$2,'synthetic','gzip',100,$3)").bind(generation).bind(kind).bind("a".repeat(64)).execute(&db.pool).await.unwrap();
            let path=format!("public-cache/v1/{generation}/{}.sqlite.gz","a".repeat(64));
            sqlx::query("INSERT INTO cloud_provider_objects(object_path,generation,kind,created_at) VALUES($1,$2,$3,$4)").bind(path).bind(generation).bind(kind).bind(now-2*86400).execute(&db.pool).await.unwrap();
        }
        sqlx::query("UPDATE cloud_public_active SET generation=$1 WHERE id=1").bind(&generations[10]).execute(&db.pool).await.unwrap();
        sqlx::query("INSERT INTO cloud_public_transports(generation,kind,artifact_key,encoding,transfer_bytes,transfer_sha256,object_generation) VALUES($1,'macro','synthetic','gzip',100,$2,$3)").bind(&generations[10]).bind("a".repeat(64)).bind(&generations[0]).execute(&db.pool).await.unwrap();
        let original=Uuid::new_v4().to_string();sqlx::query("INSERT INTO cloud_public_generations VALUES($1,'{}','2026-07-01T00:00:00Z')").bind(&original).execute(&db.pool).await.unwrap();
        let retired=server.provider_retire().await.unwrap();let paths:Vec<String>=serde_json::from_value(retired["paths"].clone()).unwrap();
        assert_eq!(paths.len(),2);
        for index in [1,2] {assert!(paths.iter().any(|p|p.contains(&generations[index])));}
        assert!(!paths.iter().any(|p|p.contains(&generations[0])));
        let original_exists:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM cloud_public_generations WHERE generation=$1)").bind(&original).fetch_one(&db.pool).await.unwrap();assert!(original_exists);
        server.provider_retired(&paths).await.unwrap();
        assert_eq!(server.provider_retire().await.unwrap()["paths"],json!([]));
        assert_eq!(server.revision().await.unwrap(),0);
    }).catch_unwind().await;
    db.close().await;
    if let Err(error) = result {
        resume_unwind(error);
    }
}
