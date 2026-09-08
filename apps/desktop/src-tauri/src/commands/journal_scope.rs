use sqlx::SqlitePool;

use crate::{
    domain::models::TradeFilter,
    errors::{CommandError, CommandResult},
};

pub(crate) async fn require_active_account(db: &SqlitePool, account_id: &str) -> CommandResult<()> {
    let account_id = account_id.trim();
    if account_id.is_empty() {
        return Err(CommandError {
            code: "ACCOUNT_REQUIRED".into(),
            message: "Ein aktives Konto ist erforderlich.".into(),
            details: None,
        });
    }

    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM accounts WHERE id = ? AND is_archived = 0)",
    )
    .bind(account_id)
    .fetch_one(db)
    .await?;
    if exists {
        Ok(())
    } else {
        Err(CommandError {
            code: "ACCOUNT_NOT_FOUND".into(),
            message: "Das ausgewählte Konto ist nicht verfügbar.".into(),
            details: None,
        })
    }
}

pub(crate) async fn require_trade_in_account(
    db: &SqlitePool,
    account_id: &str,
    trade_id: &str,
) -> CommandResult<()> {
    let account_id = account_id.trim();
    require_active_account(db, account_id).await?;
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM trades WHERE id = ? AND account_id = ? AND is_deleted = 0)",
    )
    .bind(trade_id.trim())
    .bind(account_id)
    .fetch_one(db)
    .await?;
    if exists {
        Ok(())
    } else {
        Err(CommandError {
            code: "NOT_FOUND".into(),
            message: "Trade wurde in diesem Konto nicht gefunden.".into(),
            details: None,
        })
    }
}

pub(crate) fn scope_trade_filter(account_id: &str, filter: Option<TradeFilter>) -> TradeFilter {
    let mut filter = filter.unwrap_or_default();
    filter.account_ids = Some(vec![account_id.trim().to_owned()]);
    filter
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;

    #[test]
    fn account_scope_replaces_client_supplied_account_filters() {
        let filter = scope_trade_filter(
            " account-a ",
            Some(TradeFilter {
                account_ids: Some(vec!["account-b".into(), "account-c".into()]),
                ..Default::default()
            }),
        );

        assert_eq!(filter.account_ids, Some(vec!["account-a".into()]));
    }

    #[tokio::test]
    async fn trade_child_account_scope_requires_an_active_owner_and_live_trade() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::from_str("sqlite::memory:")
                    .unwrap()
                    .foreign_keys(true),
            )
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        for (id, archived) in [
            ("account-a", 0_i64),
            ("account-b", 0_i64),
            ("account-archived", 1_i64),
        ] {
            sqlx::query("INSERT INTO accounts (id, name, is_archived, created_at, updated_at) VALUES (?, ?, ?, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')")
                .bind(id)
                .bind(id)
                .bind(archived)
                .execute(&pool)
                .await
                .unwrap();
        }
        for (id, account_id, is_deleted) in [
            ("trade-a", Some("account-a"), 0_i64),
            ("trade-b", Some("account-b"), 0_i64),
            ("trade-a-deleted", Some("account-a"), 1_i64),
            ("trade-legacy", None, 0_i64),
        ] {
            sqlx::query("INSERT INTO trades (id, account_id, status, instrument, asset_class, direction, display_timezone, is_deleted, created_at, updated_at) VALUES (?, ?, 'closed', 'EURUSD', 'forex', 'long', 'Europe/Berlin', ?, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')")
                .bind(id)
                .bind(account_id)
                .bind(is_deleted)
                .execute(&pool)
                .await
                .unwrap();
        }

        require_trade_in_account(&pool, " account-a ", "trade-a")
            .await
            .unwrap();

        for (account_id, trade_id, expected_code) in [
            (" ", "trade-a", "ACCOUNT_REQUIRED"),
            ("missing", "trade-a", "ACCOUNT_NOT_FOUND"),
            ("account-archived", "trade-a", "ACCOUNT_NOT_FOUND"),
            ("account-a", "missing", "NOT_FOUND"),
            ("account-a", "trade-b", "NOT_FOUND"),
            ("account-a", "trade-a-deleted", "NOT_FOUND"),
            ("account-a", "trade-legacy", "NOT_FOUND"),
        ] {
            let error = require_trade_in_account(&pool, account_id, trade_id)
                .await
                .unwrap_err();
            assert_eq!(error.code, expected_code, "{account_id}/{trade_id}");
        }
    }
}
