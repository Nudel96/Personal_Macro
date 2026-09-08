use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use tauri::State;
use uuid::Uuid;

use crate::{
    commands::journal_scope::require_trade_in_account,
    database::AppState,
    errors::{AppError, CommandResult},
};

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TradeLegRecord {
    pub id: String,
    pub leg_type: String,
    pub occurred_at: String,
    pub price: String,
    pub quantity: String,
    pub fees_minor: i64,
    pub note: Option<String>,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeLegInput {
    pub id: Option<String>,
    pub leg_type: String,
    pub occurred_at: String,
    pub price: String,
    pub quantity: String,
    pub fees_minor: Option<i64>,
    pub note: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TradeTagRecord {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TradeChecklistRecord {
    pub id: String,
    pub label_snapshot: String,
    pub category_snapshot: Option<String>,
    pub is_required: bool,
    pub is_checked: Option<bool>,
    pub note: Option<String>,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeChecklistInput {
    pub label: String,
    pub category: Option<String>,
    pub is_required: Option<bool>,
    pub is_checked: Option<bool>,
    pub note: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TradeEmotionRecord {
    pub emotion_id: String,
    pub name: String,
    pub color: String,
    pub phase: String,
    pub intensity: i64,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeEmotionInput {
    pub emotion_id: String,
    pub phase: String,
    pub intensity: i64,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CustomFieldRecord {
    pub id: String,
    pub entity_type: String,
    pub name: String,
    pub field_type: String,
    pub options_json: String,
    pub is_required: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomFieldInput {
    pub id: Option<String>,
    pub entity_type: String,
    pub name: String,
    pub field_type: String,
    pub options_json: Option<String>,
    pub is_required: Option<bool>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CustomFieldValueRecord {
    pub custom_field_id: String,
    pub value_json: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomFieldValueInput {
    pub custom_field_id: String,
    pub value_json: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeContextRecord {
    pub legs: Vec<TradeLegRecord>,
    pub tags: Vec<TradeTagRecord>,
    pub checklist_items: Vec<TradeChecklistRecord>,
    pub emotions: Vec<TradeEmotionRecord>,
    pub custom_values: Vec<CustomFieldValueRecord>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeContextInput {
    pub trade_id: String,
    pub tag_ids: Vec<String>,
    pub legs: Vec<TradeLegInput>,
    pub checklist_items: Vec<TradeChecklistInput>,
    pub emotions: Vec<TradeEmotionInput>,
    pub custom_values: Vec<CustomFieldValueInput>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SavedViewRecord {
    pub id: String,
    pub name: String,
    pub scope: String,
    pub state_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedViewInput {
    pub id: Option<String>,
    pub name: String,
    pub scope: String,
    pub state_json: String,
}

fn validate_context(input: &TradeContextInput) -> Result<(), AppError> {
    for leg in &input.legs {
        if !matches!(leg.leg_type.as_str(), "entry" | "exit")
            || leg.occurred_at.trim().is_empty()
            || leg.price.trim().is_empty()
            || leg.quantity.trim().is_empty()
        {
            return Err(AppError::Validation(
                "Teilposition ist unvollständig.".into(),
            ));
        }
    }
    for emotion in &input.emotions {
        if !matches!(emotion.phase.as_str(), "before" | "during" | "after")
            || !(1..=10).contains(&emotion.intensity)
        {
            return Err(AppError::Validation(
                "Emotion oder Intensität ist ungültig.".into(),
            ));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn get_trade_context(
    state: State<'_, AppState>,
    account_id: String,
    trade_id: String,
) -> CommandResult<TradeContextRecord> {
    get_trade_context_for_pool(&state.db, &account_id, &trade_id).await
}

pub(crate) async fn get_trade_context_for_pool(
    db: &SqlitePool,
    account_id: &str,
    trade_id: &str,
) -> CommandResult<TradeContextRecord> {
    require_trade_in_account(db, account_id, trade_id).await?;
    let trade_id = trade_id.trim();
    let legs = sqlx::query_as::<_, TradeLegRecord>("SELECT id, leg_type, occurred_at, price, quantity, fees_minor, note, sort_order FROM trade_legs WHERE trade_id = ? ORDER BY sort_order, occurred_at")
        .bind(trade_id).fetch_all(db).await?;
    let tags = sqlx::query_as::<_, TradeTagRecord>("SELECT g.id, g.name, g.color FROM tags g JOIN trade_tags tt ON tt.tag_id = g.id WHERE tt.trade_id = ? ORDER BY g.name COLLATE NOCASE")
        .bind(trade_id).fetch_all(db).await?;
    let checklist_items = sqlx::query_as::<_, TradeChecklistRecord>("SELECT id, label_snapshot, category_snapshot, is_required, is_checked, note, sort_order FROM trade_checklist_items WHERE trade_id = ? ORDER BY sort_order")
        .bind(trade_id).fetch_all(db).await?;
    let emotions = sqlx::query_as::<_, TradeEmotionRecord>("SELECT te.emotion_id, e.name, e.color, te.phase, te.intensity, te.note FROM trade_emotions te JOIN emotions e ON e.id = te.emotion_id WHERE te.trade_id = ? ORDER BY CASE te.phase WHEN 'before' THEN 0 WHEN 'during' THEN 1 ELSE 2 END")
        .bind(trade_id).fetch_all(db).await?;
    let custom_values = sqlx::query_as::<_, CustomFieldValueRecord>("SELECT custom_field_id, value_json FROM custom_field_values WHERE entity_type = 'trade' AND entity_id = ?")
        .bind(trade_id).fetch_all(db).await?;
    Ok(TradeContextRecord {
        legs,
        tags,
        checklist_items,
        emotions,
        custom_values,
    })
}

#[tauri::command]
pub async fn save_trade_context(
    state: State<'_, AppState>,
    account_id: String,
    input: TradeContextInput,
) -> CommandResult<TradeContextRecord> {
    save_trade_context_for_pool(&state.db, &account_id, input).await
}

pub(crate) async fn save_trade_context_for_pool(
    db: &SqlitePool,
    account_id: &str,
    input: TradeContextInput,
) -> CommandResult<TradeContextRecord> {
    validate_context(&input)?;
    require_trade_in_account(db, account_id, &input.trade_id).await?;
    let mut transaction = db.begin().await?;
    let guarded_parent = sqlx::query(
        "UPDATE trades SET updated_at = updated_at WHERE id = ? AND account_id = ? AND is_deleted = 0 AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND is_archived = 0)",
    )
    .bind(input.trade_id.trim())
    .bind(account_id.trim())
    .bind(account_id.trim())
    .execute(&mut *transaction)
    .await?;
    if guarded_parent.rows_affected() == 0 {
        return Err(AppError::NotFound("Trade".into()).into());
    }
    sqlx::query("DELETE FROM trade_legs WHERE trade_id = ?")
        .bind(&input.trade_id)
        .execute(&mut *transaction)
        .await?;
    sqlx::query("DELETE FROM trade_tags WHERE trade_id = ?")
        .bind(&input.trade_id)
        .execute(&mut *transaction)
        .await?;
    sqlx::query("DELETE FROM trade_checklist_items WHERE trade_id = ?")
        .bind(&input.trade_id)
        .execute(&mut *transaction)
        .await?;
    sqlx::query("DELETE FROM trade_emotions WHERE trade_id = ?")
        .bind(&input.trade_id)
        .execute(&mut *transaction)
        .await?;
    sqlx::query("DELETE FROM custom_field_values WHERE entity_type = 'trade' AND entity_id = ?")
        .bind(&input.trade_id)
        .execute(&mut *transaction)
        .await?;
    let now = Utc::now().to_rfc3339();
    for (index, leg) in input.legs.iter().enumerate() {
        sqlx::query("INSERT INTO trade_legs (id, trade_id, leg_type, occurred_at, price, quantity, fees_minor, note, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(leg.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string())).bind(&input.trade_id).bind(&leg.leg_type).bind(&leg.occurred_at).bind(&leg.price).bind(&leg.quantity).bind(leg.fees_minor.unwrap_or(0)).bind(&leg.note).bind(leg.sort_order.unwrap_or(index as i64)).bind(&now).execute(&mut *transaction).await?;
    }
    for tag_id in &input.tag_ids {
        sqlx::query("INSERT OR IGNORE INTO trade_tags (trade_id, tag_id) VALUES (?, ?)")
            .bind(&input.trade_id)
            .bind(tag_id)
            .execute(&mut *transaction)
            .await?;
    }
    for (index, item) in input.checklist_items.iter().enumerate() {
        if item.label.trim().is_empty() {
            continue;
        }
        sqlx::query("INSERT INTO trade_checklist_items (id, trade_id, label_snapshot, category_snapshot, is_required, is_checked, note, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(Uuid::new_v4().to_string()).bind(&input.trade_id).bind(item.label.trim()).bind(&item.category).bind(item.is_required.unwrap_or(false)).bind(item.is_checked).bind(&item.note).bind(item.sort_order.unwrap_or(index as i64)).execute(&mut *transaction).await?;
    }
    for emotion in &input.emotions {
        sqlx::query("INSERT OR REPLACE INTO trade_emotions (trade_id, emotion_id, phase, intensity, note) VALUES (?, ?, ?, ?, ?)")
            .bind(&input.trade_id).bind(&emotion.emotion_id).bind(&emotion.phase).bind(emotion.intensity).bind(&emotion.note).execute(&mut *transaction).await?;
    }
    for value in &input.custom_values {
        if value.value_json.trim().is_empty() {
            continue;
        }
        sqlx::query("INSERT INTO custom_field_values (id, custom_field_id, entity_type, entity_id, value_json, updated_at) VALUES (?, ?, 'trade', ?, ?, ?)")
            .bind(Uuid::new_v4().to_string()).bind(&value.custom_field_id).bind(&input.trade_id).bind(&value.value_json).bind(&now).execute(&mut *transaction).await?;
    }
    transaction.commit().await?;
    get_trade_context_for_pool(db, account_id, &input.trade_id).await
}

#[tauri::command]
pub async fn list_saved_views(
    state: State<'_, AppState>,
    scope: String,
) -> CommandResult<Vec<SavedViewRecord>> {
    sqlx::query_as::<_, SavedViewRecord>("SELECT id, name, scope, state_json, created_at, updated_at FROM saved_views WHERE scope = ? ORDER BY name COLLATE NOCASE")
        .bind(scope).fetch_all(&state.db).await.map_err(AppError::from).map_err(Into::into)
}

#[tauri::command]
pub async fn save_saved_view(
    state: State<'_, AppState>,
    input: SavedViewInput,
) -> CommandResult<SavedViewRecord> {
    if input.name.trim().is_empty()
        || input.scope.trim().is_empty()
        || serde_json::from_str::<serde_json::Value>(&input.state_json).is_err()
    {
        return Err(
            AppError::Validation("Name, Bereich oder Ansichtsstatus ist ungültig.".into()).into(),
        );
    }
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO saved_views (id, name, scope, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, scope = excluded.scope, state_json = excluded.state_json, updated_at = excluded.updated_at")
        .bind(&id).bind(input.name.trim()).bind(&input.scope).bind(&input.state_json).bind(&now).bind(&now).execute(&state.db).await?;
    sqlx::query_as::<_, SavedViewRecord>(
        "SELECT id, name, scope, state_json, created_at, updated_at FROM saved_views WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(AppError::from)
    .map_err(Into::into)
}

#[tauri::command]
pub async fn delete_saved_view(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    sqlx::query("DELETE FROM saved_views WHERE id = ?")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn list_custom_fields(
    state: State<'_, AppState>,
    entity_type: String,
) -> CommandResult<Vec<CustomFieldRecord>> {
    sqlx::query_as::<_, CustomFieldRecord>("SELECT id, entity_type, name, field_type, options_json, is_required, sort_order, created_at, updated_at FROM custom_fields WHERE entity_type = ? ORDER BY sort_order, name COLLATE NOCASE")
        .bind(entity_type).fetch_all(&state.db).await.map_err(AppError::from).map_err(Into::into)
}

#[tauri::command]
pub async fn save_custom_field(
    state: State<'_, AppState>,
    input: CustomFieldInput,
) -> CommandResult<CustomFieldRecord> {
    if input.name.trim().is_empty()
        || !matches!(
            input.field_type.as_str(),
            "text" | "number" | "boolean" | "date" | "select" | "multiselect"
        )
    {
        return Err(AppError::Validation("Feldname oder Feldtyp ist ungültig.".into()).into());
    }
    let options = input.options_json.unwrap_or_else(|| "[]".into());
    if serde_json::from_str::<serde_json::Value>(&options).is_err() {
        return Err(AppError::Validation("Optionen müssen gültiges JSON sein.".into()).into());
    }
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO custom_fields (id, entity_type, name, field_type, options_json, is_required, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, field_type = excluded.field_type, options_json = excluded.options_json, is_required = excluded.is_required, sort_order = excluded.sort_order, updated_at = excluded.updated_at")
        .bind(&id).bind(&input.entity_type).bind(input.name.trim()).bind(&input.field_type).bind(options).bind(input.is_required.unwrap_or(false)).bind(input.sort_order.unwrap_or(0)).bind(&now).bind(&now).execute(&state.db).await?;
    sqlx::query_as::<_, CustomFieldRecord>("SELECT id, entity_type, name, field_type, options_json, is_required, sort_order, created_at, updated_at FROM custom_fields WHERE id = ?")
        .bind(id).fetch_one(&state.db).await.map_err(AppError::from).map_err(Into::into)
}

#[tauri::command]
pub async fn delete_custom_field(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    sqlx::query("DELETE FROM custom_fields WHERE id = ?")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::{
        SqlitePool,
        sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    };
    use std::str::FromStr;

    async fn trade_child_database() -> SqlitePool {
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
        for id in ["account-a", "account-b"] {
            sqlx::query("INSERT INTO accounts (id, name, created_at, updated_at) VALUES (?, ?, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')")
                .bind(id)
                .bind(id)
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("INSERT INTO trades (id, account_id, status, instrument, asset_class, direction, display_timezone, created_at, updated_at) VALUES (?, ?, 'closed', 'EURUSD', 'forex', 'long', 'Europe/Berlin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')")
                .bind(format!("trade-{}", &id[8..]))
                .bind(id)
                .execute(&pool)
                .await
                .unwrap();
        }
        sqlx::query("INSERT INTO tags (id, name, created_at) VALUES ('tag-b', 'Tag B', '2026-01-01T00:00:00Z')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO emotions (id, name, created_at) VALUES ('emotion-b', 'Emotion B', '2026-01-01T00:00:00Z')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO custom_fields (id, entity_type, name, field_type, created_at, updated_at) VALUES ('field-b', 'trade', 'Field B', 'text', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO trade_legs (id, trade_id, leg_type, occurred_at, price, quantity, fees_minor, note, sort_order, created_at) VALUES ('leg-b', 'trade-b', 'entry', '2026-01-01T01:00:00Z', '1.1', '2', 5, 'original leg', 0, '2026-01-01T00:00:00Z')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO trade_tags (trade_id, tag_id) VALUES ('trade-b', 'tag-b')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO trade_checklist_items (id, trade_id, label_snapshot, is_required, is_checked, note, sort_order) VALUES ('check-b', 'trade-b', 'Original check', 1, 1, 'original checklist', 0)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO trade_emotions (trade_id, emotion_id, phase, intensity, note) VALUES ('trade-b', 'emotion-b', 'before', 4, 'original emotion')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO custom_field_values (id, custom_field_id, entity_type, entity_id, value_json, updated_at) VALUES ('value-b', 'field-b', 'trade', 'trade-b', '\"original\"', '2026-01-01T00:00:00Z')")
            .execute(&pool)
            .await
            .unwrap();
        pool
    }

    async fn child_snapshot(pool: &SqlitePool) -> (i64, i64, i64, i64, i64) {
        sqlx::query_as(
            r#"SELECT
                (SELECT COUNT(*) FROM trade_legs WHERE trade_id = 'trade-b'),
                (SELECT COUNT(*) FROM trade_tags WHERE trade_id = 'trade-b'),
                (SELECT COUNT(*) FROM trade_checklist_items WHERE trade_id = 'trade-b'),
                (SELECT COUNT(*) FROM trade_emotions WHERE trade_id = 'trade-b'),
                (SELECT COUNT(*) FROM custom_field_values WHERE entity_type = 'trade' AND entity_id = 'trade-b')"#,
        )
        .fetch_one(pool)
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn trade_child_account_scope_blocks_foreign_context_reads_and_writes() {
        let pool = trade_child_database().await;
        let before = child_snapshot(&pool).await;

        let read_error = get_trade_context_for_pool(&pool, "account-a", "trade-b")
            .await
            .unwrap_err();
        assert_eq!(read_error.code, "NOT_FOUND");

        let write_error = save_trade_context_for_pool(
            &pool,
            "account-a",
            TradeContextInput {
                trade_id: "trade-b".into(),
                tag_ids: vec![],
                legs: vec![TradeLegInput {
                    id: None,
                    leg_type: "exit".into(),
                    occurred_at: "2026-01-02T01:00:00Z".into(),
                    price: "1.2".into(),
                    quantity: "1".into(),
                    fees_minor: Some(0),
                    note: Some("foreign replacement".into()),
                    sort_order: Some(0),
                }],
                checklist_items: vec![],
                emotions: vec![],
                custom_values: vec![],
            },
        )
        .await
        .unwrap_err();
        assert_eq!(write_error.code, "NOT_FOUND");
        assert_eq!(child_snapshot(&pool).await, before);

        let owned = get_trade_context_for_pool(&pool, "account-b", "trade-b")
            .await
            .unwrap();
        assert_eq!(owned.legs.len(), 1);
        assert_eq!(owned.tags.len(), 1);
        assert_eq!(owned.checklist_items.len(), 1);
        assert_eq!(owned.emotions.len(), 1);
        assert_eq!(owned.custom_values.len(), 1);
        assert_eq!(owned.legs[0].note.as_deref(), Some("original leg"));

        let updated = save_trade_context_for_pool(
            &pool,
            "account-b",
            TradeContextInput {
                trade_id: "trade-b".into(),
                tag_ids: vec!["tag-b".into()],
                legs: vec![TradeLegInput {
                    id: None,
                    leg_type: "entry".into(),
                    occurred_at: "2026-01-03T01:00:00Z".into(),
                    price: "1.3".into(),
                    quantity: "1".into(),
                    fees_minor: Some(0),
                    note: Some("owned update".into()),
                    sort_order: Some(0),
                }],
                checklist_items: vec![],
                emotions: vec![],
                custom_values: vec![],
            },
        )
        .await
        .unwrap();
        assert_eq!(updated.legs[0].note.as_deref(), Some("owned update"));
        assert_eq!(updated.tags.len(), 1);
    }
}
