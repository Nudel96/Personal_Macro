use crate::runtime::State;
use crate::{
    database::AppState,
    errors::CommandResult,
    metrics::account_journal::{CapitalEvent, CapitalPoint, capital_curve},
};
use serde::Serialize;
use sqlx::SqlitePool;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountJournal {
    pub account_id: String,
    pub currency: String,
    pub initial_balance_minor: i64,
    pub cashflow_minor: i64,
    pub net_pnl_minor: i64,
    pub journal_balance_minor: i64,
    pub closed_trades: i64,
    pub open_trades: i64,
    pub missing_pnl_trades: i64,
    pub broker_balance_minor: Option<i64>,
    pub capital_curve: Vec<CapitalPoint>,
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_account_journal(
    state: State<'_, AppState>,
    account_id: String,
) -> CommandResult<AccountJournal> {
    account_journal_for_pool(&state.db, &account_id).await
}

pub(crate) async fn account_journal_for_pool(
    db: &SqlitePool,
    account_id: &str,
) -> CommandResult<AccountJournal> {
    super::journal_scope::require_active_account(db, account_id).await?;
    let mut tx = db.begin().await?;
    let (currency, initial): (String, i64) = sqlx::query_as("SELECT base_currency, initial_balance_minor FROM accounts WHERE id = ? AND is_archived = 0").bind(account_id).fetch_one(&mut *tx).await?;
    let (closed, open, missing): (i64, i64, i64) = sqlx::query_as("SELECT COALESCE(SUM(status = 'closed'), 0), COALESCE(SUM(status = 'open'), 0), COALESCE(SUM(status = 'closed' AND net_pnl_minor IS NULL), 0) FROM trades WHERE account_id = ? AND is_deleted = 0").bind(account_id).fetch_one(&mut *tx).await?;
    let events = sqlx::query_as::<_, CapitalEvent>(
        "SELECT id, occurred_at, kind, CASE kind WHEN 'deposit' THEN 'Einzahlung' WHEN 'withdrawal' THEN 'Auszahlung' ELSE 'Korrektur' END AS label, amount_minor FROM account_cashflows WHERE account_id = ? UNION ALL SELECT id, COALESCE(closed_at, opened_at, created_at) AS occurred_at, 'trade' AS kind, instrument AS label, net_pnl_minor AS amount_minor FROM trades WHERE account_id = ? AND status = 'closed' AND is_deleted = 0 AND net_pnl_minor IS NOT NULL"
    ).bind(account_id).bind(account_id).fetch_all(&mut *tx).await?;
    let broker_balance: Option<i64> = sqlx::query_scalar::<_, Option<i64>>(
        "SELECT balance_minor FROM broker_account_connections WHERE local_account_id = ? LIMIT 1",
    )
    .bind(account_id)
    .fetch_optional(&mut *tx)
    .await?
    .flatten();
    let curve = capital_curve(initial, events);
    let last = curve.last().expect("initial capital point");
    let journal_balance = last.balance_minor;
    let net_pnl = last.cumulative_pnl_minor;
    tx.commit().await?;
    Ok(AccountJournal {
        account_id: account_id.into(),
        currency,
        initial_balance_minor: initial,
        cashflow_minor: journal_balance - initial - net_pnl,
        net_pnl_minor: net_pnl,
        journal_balance_minor: journal_balance,
        closed_trades: closed,
        open_trades: open,
        missing_pnl_trades: missing,
        broker_balance_minor: broker_balance,
        capital_curve: curve,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn account_journal_separates_funding_profit_missing_and_foreign_trades() {
        let db = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::raw_sql("CREATE TABLE accounts(id TEXT PRIMARY KEY, base_currency TEXT, initial_balance_minor INTEGER, is_archived INTEGER); CREATE TABLE trades(id TEXT, account_id TEXT, instrument TEXT, status TEXT, is_deleted INTEGER, net_pnl_minor INTEGER, closed_at TEXT, opened_at TEXT, created_at TEXT); CREATE TABLE account_cashflows(id TEXT, account_id TEXT, occurred_at TEXT, kind TEXT, amount_minor INTEGER); CREATE TABLE broker_account_connections(local_account_id TEXT, balance_minor INTEGER);").execute(&db).await.unwrap();
        sqlx::raw_sql("INSERT INTO accounts VALUES ('a', 'EUR', 100000, 0), ('b', 'USD', 500000, 0); INSERT INTO account_cashflows VALUES ('d','a','2026-09-02T12:00:00Z','deposit',50000); INSERT INTO trades VALUES ('t1','a','EURUSD','closed',0,4075,'2026-09-01T12:00:00Z',NULL,NULL), ('t2','a','EURUSD','closed',0,3459,'2026-09-03T12:00:00Z',NULL,NULL), ('missing','a','EURUSD','closed',0,NULL,'2026-09-03T12:00:00Z',NULL,NULL), ('deleted','a','EURUSD','closed',1,99999,'2026-09-03T12:00:00Z',NULL,NULL), ('other','b','EURUSD','closed',0,80000,'2026-09-03T12:00:00Z',NULL,NULL), ('open','a','EURUSD','open',0,1200,NULL,NULL,NULL); INSERT INTO broker_account_connections VALUES ('a', 900000);").execute(&db).await.unwrap();
        let result = account_journal_for_pool(&db, "a").await.unwrap();
        assert_eq!(result.net_pnl_minor, 7534);
        assert_eq!(result.journal_balance_minor, 157534);
        assert_eq!(result.cashflow_minor, 50000);
        assert_eq!(result.missing_pnl_trades, 1);
        assert_eq!(result.open_trades, 1);
        assert_eq!(result.broker_balance_minor, Some(900000));
        assert_eq!(result.capital_curve.len(), 4);
        assert!(account_journal_for_pool(&db, "unknown").await.is_err());
        db.close().await;
    }
}
