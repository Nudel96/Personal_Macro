//! Cost reservations precede network I/O. Interrupted calls retain their full
//! reservation; a duplicate request with an uncertain outcome cannot run again.
//! Nothing here stores credentials, journal data or raw provider error bodies.
use crate::errors::AppError;
use chrono::Utc;
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use uuid::Uuid;

pub const MAX_OUTPUT_TOKENS: i64 = 8_000;
// Each independent desktop/cloud store can spend at most $0.50 per UTC month.
// This is an OpenAI sub-budget, not a claim about total hosting/Marketplace bills.
pub const MONTHLY_USD_MICROS: i64 = 500_000;
const PRICE_VERSION: &str = "gpt-5-mini-standard-2026-09-30";

#[derive(Clone)]
pub(crate) enum BudgetStore {
    Sqlite(SqlitePool),
    #[cfg(feature = "postgres")]
    Postgres {
        pool: sqlx::PgPool,
        schema: String,
    },
}

pub(crate) enum Ticket {
    Cached(String),
    Reserved(String),
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ReportAiBudget {
    pub month: String,
    pub currency: String,
    pub limit_micros: i64,
    pub spent_micros: i64,
    pub held_micros: i64,
    pub requests: i64,
    pub uncertain_requests: i64,
    pub input_tokens: i64,
    pub cached_tokens: i64,
    pub output_tokens: i64,
    pub reasoning_tokens: i64,
    pub price_version: String,
}

#[derive(Debug)]
pub(crate) struct Usage {
    pub input: i64,
    pub cached: i64,
    pub output: i64,
    pub reasoning: i64,
    pub cost: i64,
    pub response_id: Option<String>,
}

pub(crate) fn priced_model(model: &str) -> bool {
    matches!(model, "gpt-5-mini" | "gpt-5-mini-2025-08-07")
}

fn unavailable() -> AppError {
    AppError::Conflict("Das KI-Budget ist ausgeschöpft oder eine gleiche Anfrage ist noch ungeklärt. Der Originalbericht bleibt verfügbar.".into())
}
fn cost(input: i64, cached: i64, output: i64) -> i64 {
    // USD micro-units. Standard tariff per 1M tokens: .25 / .025 / 2 USD.
    // Reasoning is already part of output_tokens and must not be charged twice.
    ((input - cached) * 250 + cached * 25 + output * 2_000 + 999) / 1_000
}

pub(crate) fn usage(value: &Value) -> Option<Usage> {
    if !priced_model(value.get("model")?.as_str()?) {
        return None;
    }
    let usage = value.get("usage")?;
    let input = usage.get("input_tokens")?.as_i64()?;
    let output = usage.get("output_tokens")?.as_i64()?;
    let cached = usage
        .pointer("/input_tokens_details/cached_tokens")?
        .as_i64()?;
    let reasoning = usage
        .pointer("/output_tokens_details/reasoning_tokens")?
        .as_i64()?;
    if !(0..=400_000).contains(&input)
        || !(0..=input).contains(&cached)
        || !(0..=MAX_OUTPUT_TOKENS).contains(&output)
        || !(0..=output).contains(&reasoning)
        || usage.get("total_tokens")?.as_i64()? != input + output
    {
        return None;
    }
    Some(Usage {
        input,
        cached,
        output,
        reasoning,
        cost: cost(input, cached, output),
        response_id: value
            .get("id")
            .and_then(Value::as_str)
            .filter(|v| v.len() <= 128 && v.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_'))
            .map(str::to_owned),
    })
}

impl BudgetStore {
    pub(crate) async fn reserve(&self, payload: &Value) -> Result<Ticket, AppError> {
        self.reserve_month(payload, &Utc::now().format("%Y-%m").to_string())
            .await
    }
    async fn reserve_month(&self, payload: &Value, month: &str) -> Result<Ticket, AppError> {
        let model = payload
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if !priced_model(model)
            || payload.get("max_output_tokens").and_then(Value::as_i64) != Some(MAX_OUTPUT_TOKENS)
            || payload.get("store").and_then(Value::as_bool) != Some(false)
        {
            return Err(AppError::Validation(
                "Für dieses Modell ist kein geprüfter KI-Kostentarif hinterlegt.".into(),
            ));
        }
        let serialized = payload.to_string();
        // A byte upper bound, not the common chars/4 estimate. An extra 8K covers
        // message/schema framing. Reserve output/reasoning up to the API limit.
        let input_bound = serialized.len() as i64 + 8_192;
        if input_bound > 400_000 {
            return Err(AppError::Validation(
                "Der Briefing-Quelltext überschreitet die Kostengrenze.".into(),
            ));
        }
        let reserved = cost(input_bound, 0, MAX_OUTPUT_TOKENS);
        let request_key = Sha256::digest(serialized.as_bytes())
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        match self {
            Self::Sqlite(pool) => {
                let cached: Option<String> = sqlx::query_scalar("SELECT summary_json FROM report_ai_usage WHERE request_key=? AND status='complete' AND summary_json IS NOT NULL ORDER BY created_at DESC LIMIT 1")
                    .bind(&request_key).fetch_optional(pool).await?;
                if let Some(cached) = cached {
                    return Ok(Ticket::Cached(cached));
                }
                sqlx::query("INSERT INTO report_ai_months(month) VALUES(?) ON CONFLICT DO NOTHING")
                    .bind(month)
                    .execute(pool)
                    .await?;
                // One conditional write is atomic even across independent processes.
                let inserted = sqlx::query("INSERT INTO report_ai_usage(id,month,request_key,model,price_version,status,reserved_usd_micros,created_at) SELECT ?,?,?,?,?,'reserved',?,? WHERE (SELECT COALESCE(SUM(COALESCE(spent_usd_micros,reserved_usd_micros)),0) FROM report_ai_usage WHERE month=?)+?<=? AND NOT EXISTS(SELECT 1 FROM report_ai_usage WHERE request_key=? AND status IN ('reserved','uncertain'))")
                    .bind(&id).bind(month).bind(&request_key).bind(model).bind(PRICE_VERSION).bind(reserved).bind(now)
                    .bind(month).bind(reserved).bind(MONTHLY_USD_MICROS).bind(&request_key).execute(pool).await?.rows_affected();
                if inserted != 1 {
                    return Err(unavailable());
                }
            }
            #[cfg(feature = "postgres")]
            Self::Postgres { pool, schema } => {
                let mut tx = pool.begin().await?;
                scope(&mut tx, schema).await?;
                sqlx::query(
                    "INSERT INTO report_ai_months(month) VALUES($1) ON CONFLICT DO NOTHING",
                )
                .bind(month)
                .execute(&mut *tx)
                .await?;
                sqlx::query("SELECT month FROM report_ai_months WHERE month=$1 FOR UPDATE")
                    .bind(month)
                    .fetch_one(&mut *tx)
                    .await?;
                let cached: Option<String> = sqlx::query_scalar("SELECT summary_json FROM report_ai_usage WHERE request_key=$1 AND status='complete' AND summary_json IS NOT NULL ORDER BY created_at DESC LIMIT 1")
                    .bind(&request_key).fetch_optional(&mut *tx).await?;
                if let Some(cached) = cached {
                    tx.rollback().await?;
                    return Ok(Ticket::Cached(cached));
                }
                let inserted = sqlx::query("INSERT INTO report_ai_usage(id,month,request_key,model,price_version,status,reserved_usd_micros,created_at) SELECT $1,$2,$3,$4,$5,'reserved',$6,$7 WHERE (SELECT COALESCE(SUM(COALESCE(spent_usd_micros,reserved_usd_micros)),0) FROM report_ai_usage WHERE month=$2)+$6<=$8 AND NOT EXISTS(SELECT 1 FROM report_ai_usage WHERE request_key=$3 AND status IN ('reserved','uncertain'))")
                    .bind(&id).bind(month).bind(&request_key).bind(model).bind(PRICE_VERSION).bind(reserved).bind(now).bind(MONTHLY_USD_MICROS)
                    .execute(&mut *tx).await?.rows_affected();
                if inserted != 1 {
                    return Err(unavailable());
                }
                tx.commit().await?;
            }
        }
        Ok(Ticket::Reserved(id))
    }

    pub(crate) async fn settle(
        &self,
        id: &str,
        usage: Option<&Usage>,
        summary: Option<&str>,
        rejected: bool,
    ) -> Result<(), AppError> {
        if summary.is_some_and(|s| s.len() > 128_000) {
            return Err(AppError::Validation("Das Briefing ist zu groß.".into()));
        }
        let status = if usage.is_some() {
            "complete"
        } else if rejected {
            "failed"
        } else {
            "uncertain"
        };
        let spent = usage
            .map(|u| u.cost)
            .or(if rejected { Some(0) } else { None });
        let input = usage.map(|u| u.input);
        let cached = usage.map(|u| u.cached);
        let output = usage.map(|u| u.output);
        let reasoning = usage.map(|u| u.reasoning);
        let response_id = usage.and_then(|u| u.response_id.as_deref());
        let now = Utc::now().to_rfc3339();
        let affected = match self {
            Self::Sqlite(pool) => sqlx::query("UPDATE report_ai_usage SET status=?,spent_usd_micros=?,input_tokens=?,cached_tokens=?,output_tokens=?,reasoning_tokens=?,response_id=?,summary_json=?,completed_at=? WHERE id=? AND status='reserved'")
                .bind(status).bind(spent).bind(input).bind(cached).bind(output).bind(reasoning).bind(response_id).bind(summary).bind(now).bind(id).execute(pool).await?.rows_affected(),
            #[cfg(feature = "postgres")]
            Self::Postgres { pool, schema } => {
                let mut tx = pool.begin().await?;scope(&mut tx,schema).await?;
                let affected=sqlx::query("UPDATE report_ai_usage SET status=$1,spent_usd_micros=$2,input_tokens=$3,cached_tokens=$4,output_tokens=$5,reasoning_tokens=$6,response_id=$7,summary_json=$8,completed_at=$9 WHERE id=$10 AND status='reserved'")
                    .bind(status).bind(spent).bind(input).bind(cached).bind(output).bind(reasoning).bind(response_id).bind(summary).bind(now).bind(id).execute(&mut *tx).await?.rows_affected();
                tx.commit().await?;affected
            }
        };
        if affected != 1 {
            return Err(unavailable());
        }
        Ok(())
    }

    pub(crate) async fn status(&self) -> Result<ReportAiBudget, AppError> {
        let month = Utc::now().format("%Y-%m").to_string();
        let sql = "SELECT COALESCE(SUM(COALESCE(spent_usd_micros,0)),0),COALESCE(SUM(CASE WHEN spent_usd_micros IS NULL THEN reserved_usd_micros ELSE 0 END),0),COUNT(*),COALESCE(SUM(CASE WHEN status IN ('reserved','uncertain') THEN 1 ELSE 0 END),0),COALESCE(SUM(input_tokens),0),COALESCE(SUM(cached_tokens),0),COALESCE(SUM(output_tokens),0),COALESCE(SUM(reasoning_tokens),0) FROM report_ai_usage WHERE month=?";
        type Totals = (i64, i64, i64, i64, i64, i64, i64, i64);
        let totals: Totals = match self {
            Self::Sqlite(pool) => sqlx::query_as(sql).bind(&month).fetch_one(pool).await?,
            #[cfg(feature = "postgres")]
            Self::Postgres { pool, schema } => {
                let mut tx = pool.begin().await?;
                scope(&mut tx, schema).await?;
                // PostgreSQL SUM(bigint) returns numeric; cast the bounded ledger totals.
                let sql = "SELECT COALESCE(SUM(COALESCE(spent_usd_micros,0)),0)::bigint,COALESCE(SUM(CASE WHEN spent_usd_micros IS NULL THEN reserved_usd_micros ELSE 0 END),0)::bigint,COUNT(*),COALESCE(SUM(CASE WHEN status IN ('reserved','uncertain') THEN 1 ELSE 0 END),0)::bigint,COALESCE(SUM(input_tokens),0)::bigint,COALESCE(SUM(cached_tokens),0)::bigint,COALESCE(SUM(output_tokens),0)::bigint,COALESCE(SUM(reasoning_tokens),0)::bigint FROM report_ai_usage WHERE month=$1";
                let result = sqlx::query_as(sql).bind(&month).fetch_one(&mut *tx).await?;
                tx.rollback().await?;
                result
            }
        };
        Ok(ReportAiBudget {
            month,
            currency: "USD".into(),
            limit_micros: MONTHLY_USD_MICROS,
            spent_micros: totals.0,
            held_micros: totals.1,
            requests: totals.2,
            uncertain_requests: totals.3,
            input_tokens: totals.4,
            cached_tokens: totals.5,
            output_tokens: totals.6,
            reasoning_tokens: totals.7,
            price_version: PRICE_VERSION.into(),
        })
    }
}

#[cfg(feature = "postgres")]
async fn scope(conn: &mut sqlx::PgConnection, schema: &str) -> Result<(), AppError> {
    if !schema.starts_with("macro_")
        || schema.len() > 63
        || !schema
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_')
    {
        return Err(AppError::Validation(
            "Ungültiger privater Budgetbereich.".into(),
        ));
    }
    sqlx::query("SELECT set_config('search_path',$1,true)")
        .bind(schema)
        .execute(conn)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    async fn store() -> BudgetStore {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql(include_str!("../../migrations/0051_report_ai_budget.sql"))
            .execute(&pool)
            .await
            .unwrap();
        BudgetStore::Sqlite(pool)
    }
    fn payload(n: usize) -> Value {
        json!({"model":"gpt-5-mini","max_output_tokens":MAX_OUTPUT_TOKENS,"store":false,"input":format!("Synthetic public text {n}")})
    }
    #[cfg(feature = "postgres")]
    #[tokio::test]
    #[ignore = "Requires MACRO_TEST_ENV_FILE; a disposable Neon schema, no provider calls"]
    async fn report_cloud_budget_serializes_workers_and_reuses_only_settled_valid_outputs() {
        use futures_util::FutureExt;
        let db = crate::cloud_postgres::test_support::TestDatabase::open().await;
        let result=std::panic::AssertUnwindSafe(async {
            let store=BudgetStore::Postgres {pool:db.pool.clone(),schema:db.schema.clone()};
            let results=futures_util::future::join_all((0..60).map(|n|{let store=store.clone();async move{(n,store.reserve(&payload(n)).await)}})).await;
            let accepted=results.iter().filter(|(_,r)|r.is_ok()).count();
            assert!(accepted>0&&accepted<60);
            let status=store.status().await.unwrap();
            assert_eq!(status.requests,accepted as i64);assert!(status.held_micros<=MONTHLY_USD_MICROS);
            let (n,id)=results.into_iter().find_map(|(n,r)|match r {Ok(Ticket::Reserved(id))=>Some((n,id)),_=>None}).unwrap();
            let used=usage(&json!({"model":"gpt-5-mini","usage":{"input_tokens":1000,"output_tokens":800,"total_tokens":1800,"input_tokens_details":{"cached_tokens":500},"output_tokens_details":{"reasoning_tokens":600}}})).unwrap();
            store.settle(&id,Some(&used),Some("{\"public\":\"validated\"}"),false).await.unwrap();
            assert!(store.settle(&id,Some(&used),None,false).await.is_err());
            assert!(matches!(store.reserve(&payload(n)).await.unwrap(),Ticket::Cached(_)));
            let status=store.status().await.unwrap();assert_eq!(status.requests,accepted as i64);
            assert_eq!((status.spent_micros,status.output_tokens,status.reasoning_tokens),(1738,800,600));
            let Ticket::Reserved(id)=store.reserve(&payload(100)).await.unwrap() else{panic!()};
            store.settle(&id,None,None,false).await.unwrap();
            let restarted=BudgetStore::Postgres {pool:db.pool.clone(),schema:db.schema.clone()};
            assert!(restarted.reserve(&payload(100)).await.is_err());
            let revision:i64=sqlx::query_scalar("SELECT revision FROM cloud_workspace WHERE id=1").fetch_one(&db.pool).await.unwrap();
            assert_eq!(revision,0);
        }).catch_unwind().await;
        db.close().await;
        if let Err(panic) = result {
            std::panic::resume_unwind(panic)
        }
    }
    #[test]
    fn charges_cached_and_reasoning_tokens_once_and_rejects_inconsistent_usage() {
        let mut value = json!({"id":"resp_synthetic","model":"gpt-5-mini-2025-08-07","usage":{"input_tokens":1000,"output_tokens":800,"total_tokens":1800,"input_tokens_details":{"cached_tokens":500},"output_tokens_details":{"reasoning_tokens":600}}});
        let used = usage(&value).unwrap();
        assert_eq!(used.cost, 1738);
        value["usage"]["input_tokens_details"]["cached_tokens"] = 1001.into();
        assert!(usage(&value).is_none());
        value["model"] = "unknown-priced-model".into();
        assert!(usage(&value).is_none());
    }
    #[tokio::test]
    async fn concurrent_reservations_never_exceed_the_monthly_limit_or_duplicate_uncertain_work() {
        let store = store().await;
        let results = futures_util::future::join_all((0..60).map(|n| {
            let store = store.clone();
            async move { store.reserve(&payload(n)).await }
        }))
        .await;
        let accepted = results.iter().filter(|r| r.is_ok()).count();
        assert!(accepted > 0 && accepted < 60);
        let status = store.status().await.unwrap();
        assert_eq!(status.requests, accepted as i64);
        assert!(status.held_micros <= MONTHLY_USD_MICROS);
        assert!(store.reserve(&payload(0)).await.is_err());
        let next = store.reserve_month(&payload(99), "2100-01").await;
        assert!(next.is_ok());
    }
    #[tokio::test]
    async fn a_process_restart_retains_unsettled_costs_and_blocks_the_same_request() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("budget.sqlite");
        let options = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(&path)
            .create_if_missing(true);
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options.clone())
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../../migrations/0051_report_ai_budget.sql"))
            .execute(&pool)
            .await
            .unwrap();
        let store = BudgetStore::Sqlite(pool.clone());
        assert!(matches!(
            store.reserve(&payload(1)).await.unwrap(),
            Ticket::Reserved(_)
        ));
        let held = store.status().await.unwrap().held_micros;
        pool.close().await;
        let restarted = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap();
        let store = BudgetStore::Sqlite(restarted.clone());
        assert_eq!(store.status().await.unwrap().held_micros, held);
        assert!(store.reserve(&payload(1)).await.is_err());
        restarted.close().await;
    }
    #[tokio::test]
    async fn failed_and_incomplete_answers_are_accounted_and_only_valid_summaries_are_reused() {
        let store = store().await;
        let Ticket::Reserved(id) = store.reserve(&payload(1)).await.unwrap() else {
            panic!()
        };
        store.settle(&id, None, None, false).await.unwrap();
        assert!(store.reserve(&payload(1)).await.is_err());
        assert_eq!(store.status().await.unwrap().uncertain_requests, 1);
        let Ticket::Reserved(id) = store.reserve(&payload(2)).await.unwrap() else {
            panic!()
        };
        let used = Usage {
            input: 10,
            cached: 0,
            output: 10,
            reasoning: 3,
            cost: 23,
            response_id: None,
        };
        store
            .settle(
                &id,
                Some(&used),
                Some("{\"public\":\"validated summary\"}"),
                false,
            )
            .await
            .unwrap();
        assert!(matches!(
            store.reserve(&payload(2)).await.unwrap(),
            Ticket::Cached(_)
        ));
        let status = store.status().await.unwrap();
        assert_eq!(status.spent_micros, 23);
        assert_eq!(status.output_tokens, 10);
        assert_eq!(status.reasoning_tokens, 3);
    }
}
