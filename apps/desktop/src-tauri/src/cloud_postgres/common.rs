use super::{CloudError, CloudResult};
use crate::domain::models::TradeFilter;
use serde::{Serialize, de::DeserializeOwned};
use serde_json::Value;
use sqlx::PgConnection;

pub(super) fn argument<T: DeserializeOwned>(args: &Value, key: &str) -> CloudResult<T> {
    serde_json::from_value(args.get(key).cloned().unwrap_or(Value::Null))
        .map_err(|_| CloudError::validation("Die Eingabe ist unvollständig oder ungültig."))
}

pub(super) fn encoded(value: impl Serialize) -> CloudResult<Value> {
    serde_json::to_value(value).map_err(|_| {
        CloudError::new(
            "SERIALIZATION_ERROR",
            "Die Antwort konnte nicht übertragen werden.",
        )
    })
}

pub(super) async fn require_active_account(
    connection: &mut PgConnection,
    account_id: &str,
) -> CloudResult<()> {
    if account_id.trim().is_empty() {
        return Err(CloudError::new(
            "ACCOUNT_REQUIRED",
            "Ein aktives Konto ist erforderlich.",
        ));
    }
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM accounts WHERE id=$1 AND NOT is_archived)")
            .bind(account_id.trim())
            .fetch_one(connection)
            .await?;
    if exists {
        Ok(())
    } else {
        Err(CloudError::new(
            "ACCOUNT_NOT_FOUND",
            "Das ausgewählte Konto ist nicht verfügbar.",
        ))
    }
}

pub(super) async fn require_trade_in_account(
    connection: &mut PgConnection,
    account_id: &str,
    trade_id: &str,
) -> CloudResult<()> {
    require_active_account(&mut *connection, account_id).await?;
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM trades WHERE id=$1 AND account_id=$2 AND NOT is_deleted)",
    )
    .bind(trade_id.trim())
    .bind(account_id.trim())
    .fetch_one(connection)
    .await?;
    if exists {
        Ok(())
    } else {
        Err(CloudError::new(
            "NOT_FOUND",
            "Trade wurde in diesem Konto nicht gefunden.",
        ))
    }
}

pub(super) fn scope_trade_filter(account_id: &str, filter: Option<TradeFilter>) -> TradeFilter {
    let mut filter = filter.unwrap_or_default();
    filter.account_ids = Some(vec![account_id.trim().to_owned()]);
    filter
}
