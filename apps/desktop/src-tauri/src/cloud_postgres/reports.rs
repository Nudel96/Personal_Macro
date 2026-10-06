//! Personal report read markers. The cloud dispatcher owns revision and receipt
//! atomicity; original report text remains in immutable public-data artifacts.
use super::{CloudError, CloudResult};
use serde_json::{Value, json};
use sqlx::PgConnection;

pub async fn read_markers(connection: &mut PgConnection) -> CloudResult<Value> {
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT report_id,read_at FROM cloud_report_reads ORDER BY report_id LIMIT 10000",
    )
    .fetch_all(connection)
    .await?;
    Ok(json!(
        rows.into_iter()
            .map(|(id, read_at)| json!({"id":id,"readAt":read_at}))
            .collect::<Vec<_>>()
    ))
}

pub async fn mark_read(connection: &mut PgConnection, args: &Value) -> CloudResult<Value> {
    let object = args
        .as_object()
        .ok_or_else(|| CloudError::validation("Die Berichtsauswahl ist ungültig."))?;
    if object.keys().any(|key| key != "id") {
        return Err(CloudError::validation("Die Berichtsauswahl ist ungültig."));
    }
    let id = object
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| CloudError::validation("Die Berichtsauswahl ist ungültig."))?;
    if id.is_empty()
        || id.len() > 80
        || !id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    {
        return Err(CloudError::validation("Die Berichtsauswahl ist ungültig."));
    }
    // Only published report IDs should reach this mutation; the caller validates
    // membership against its pinned reports shard before entering dispatch.
    let at = chrono::Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO cloud_report_reads(report_id,read_at) VALUES($1,$2) ON CONFLICT(report_id) DO NOTHING")
        .bind(id).bind(at).execute(connection).await?;
    Ok(Value::Null)
}
