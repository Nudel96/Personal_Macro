use chrono::Utc;
use serde_json::Value;
use sqlx::PgConnection;
use uuid::Uuid;

use super::common::{argument, encoded, require_trade_in_account};
use super::{CloudError, CloudResult};
use crate::commands::{
    CustomFieldInput, CustomFieldRecord, CustomFieldValueRecord, SavedViewInput, SavedViewRecord,
    TradeChecklistRecord, TradeContextInput, TradeContextRecord, TradeEmotionRecord,
    TradeLegRecord, TradeTagRecord,
};
use crate::errors::AppError;

pub(super) const COMMANDS: &[(&str, bool)] = &[
    ("get_trade_context", false),
    ("save_trade_context", true),
    ("list_saved_views", false),
    ("save_saved_view", true),
    ("delete_saved_view", true),
    ("list_custom_fields", false),
    ("save_custom_field", true),
    ("delete_custom_field", true),
];

/// The caller owns the transaction, including the revision and operation receipt.
pub(super) async fn dispatch(
    db: &mut PgConnection,
    name: &str,
    args: &Value,
) -> CloudResult<Value> {
    match name {
        "get_trade_context" => encoded(
            get_trade_context(
                db,
                &argument::<String>(args, "accountId")?,
                &argument::<String>(args, "tradeId")?,
            )
            .await?,
        ),
        "save_trade_context" => encoded(
            save_trade_context(
                db,
                &argument::<String>(args, "accountId")?,
                argument(args, "input")?,
            )
            .await?,
        ),
        "list_saved_views" => encoded(list_saved_views(db, argument(args, "scope")?).await?),
        "save_saved_view" => encoded(save_saved_view(db, argument(args, "input")?).await?),
        "delete_saved_view" => encoded(delete_saved_view(db, argument(args, "id")?).await?),
        "list_custom_fields" => {
            encoded(list_custom_fields(db, argument(args, "entityType")?).await?)
        }
        "save_custom_field" => encoded(save_custom_field(db, argument(args, "input")?).await?),
        "delete_custom_field" => encoded(delete_custom_field(db, argument(args, "id")?).await?),
        _ => Err(CloudError {
            code: "WEB_COMMAND_NOT_ALLOWED".into(),
            message: "Diese Funktion ist im privaten Webzugriff nicht verfügbar.".into(),
        }),
    }
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

pub(super) async fn get_trade_context(
    db: &mut PgConnection,
    account_id: &str,
    trade_id: &str,
) -> CloudResult<TradeContextRecord> {
    require_trade_in_account(db, account_id, trade_id).await?;
    let trade_id = trade_id.trim();
    let legs = sqlx::query_as::<_, TradeLegRecord>("SELECT id, leg_type, occurred_at, price, quantity, fees_minor, note, sort_order FROM trade_legs WHERE trade_id = $1 ORDER BY sort_order, occurred_at")
        .bind(trade_id).fetch_all(&mut *db).await?;
    let tags = sqlx::query_as::<_, TradeTagRecord>("SELECT g.id, g.name, g.color FROM tags g JOIN trade_tags tt ON tt.tag_id = g.id WHERE tt.trade_id = $1 ORDER BY LOWER(g.name)")
        .bind(trade_id).fetch_all(&mut *db).await?;
    let checklist_items = sqlx::query_as::<_, TradeChecklistRecord>("SELECT id, label_snapshot, category_snapshot, is_required, is_checked, note, sort_order FROM trade_checklist_items WHERE trade_id = $1 ORDER BY sort_order")
        .bind(trade_id).fetch_all(&mut *db).await?;
    let emotions = sqlx::query_as::<_, TradeEmotionRecord>("SELECT te.emotion_id, e.name, e.color, te.phase, te.intensity, te.note FROM trade_emotions te JOIN emotions e ON e.id = te.emotion_id WHERE te.trade_id = $1 ORDER BY CASE te.phase WHEN 'before' THEN 0 WHEN 'during' THEN 1 ELSE 2 END")
        .bind(trade_id).fetch_all(&mut *db).await?;
    let custom_values = sqlx::query_as::<_, CustomFieldValueRecord>("SELECT custom_field_id, value_json FROM custom_field_values WHERE entity_type = 'trade' AND entity_id = $1")
        .bind(trade_id).fetch_all(&mut *db).await?;
    Ok(TradeContextRecord {
        legs,
        tags,
        checklist_items,
        emotions,
        custom_values,
    })
}

pub(super) async fn save_trade_context(
    db: &mut PgConnection,
    account_id: &str,
    input: TradeContextInput,
) -> CloudResult<TradeContextRecord> {
    validate_context(&input)?;
    require_trade_in_account(db, account_id, &input.trade_id).await?;
    let guarded_parent = sqlx::query(
        "UPDATE trades SET updated_at = updated_at WHERE id = $1 AND account_id = $2 AND is_deleted = FALSE AND EXISTS (SELECT 1 FROM accounts WHERE id = $3 AND is_archived = FALSE)",
    )
    .bind(input.trade_id.trim())
    .bind(account_id.trim())
    .bind(account_id.trim())
    .execute(&mut *db)
    .await?;
    if guarded_parent.rows_affected() == 0 {
        return Err(AppError::NotFound("Trade".into()).into());
    }
    sqlx::query("DELETE FROM trade_legs WHERE trade_id = $1")
        .bind(&input.trade_id)
        .execute(&mut *db)
        .await?;
    sqlx::query("DELETE FROM trade_tags WHERE trade_id = $1")
        .bind(&input.trade_id)
        .execute(&mut *db)
        .await?;
    sqlx::query("DELETE FROM trade_checklist_items WHERE trade_id = $1")
        .bind(&input.trade_id)
        .execute(&mut *db)
        .await?;
    sqlx::query("DELETE FROM trade_emotions WHERE trade_id = $1")
        .bind(&input.trade_id)
        .execute(&mut *db)
        .await?;
    sqlx::query("DELETE FROM custom_field_values WHERE entity_type = 'trade' AND entity_id = $1")
        .bind(&input.trade_id)
        .execute(&mut *db)
        .await?;
    let now = Utc::now().to_rfc3339();
    for (index, leg) in input.legs.iter().enumerate() {
        sqlx::query("INSERT INTO trade_legs (id, trade_id, leg_type, occurred_at, price, quantity, fees_minor, note, sort_order, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)")
            .bind(leg.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string())).bind(&input.trade_id).bind(&leg.leg_type).bind(&leg.occurred_at).bind(&leg.price).bind(&leg.quantity).bind(leg.fees_minor.unwrap_or(0)).bind(&leg.note).bind(leg.sort_order.unwrap_or(index as i64)).bind(&now).execute(&mut *db).await?;
    }
    for tag_id in &input.tag_ids {
        sqlx::query("INSERT INTO trade_tags (trade_id, tag_id) VALUES ($1, $2) ON CONFLICT (trade_id, tag_id) DO NOTHING")
            .bind(&input.trade_id)
            .bind(tag_id)
            .execute(&mut *db)
            .await?;
    }
    for (index, item) in input.checklist_items.iter().enumerate() {
        if item.label.trim().is_empty() {
            continue;
        }
        sqlx::query("INSERT INTO trade_checklist_items (id, trade_id, label_snapshot, category_snapshot, is_required, is_checked, note, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)")
            .bind(Uuid::new_v4().to_string()).bind(&input.trade_id).bind(item.label.trim()).bind(&item.category).bind(item.is_required.unwrap_or(false)).bind(item.is_checked).bind(&item.note).bind(item.sort_order.unwrap_or(index as i64)).execute(&mut *db).await?;
    }
    for emotion in &input.emotions {
        sqlx::query("INSERT INTO trade_emotions (trade_id, emotion_id, phase, intensity, note) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (trade_id, emotion_id, phase) DO UPDATE SET intensity = EXCLUDED.intensity, note = EXCLUDED.note")
            .bind(&input.trade_id).bind(&emotion.emotion_id).bind(&emotion.phase).bind(emotion.intensity).bind(&emotion.note).execute(&mut *db).await?;
    }
    for value in &input.custom_values {
        if value.value_json.trim().is_empty() {
            continue;
        }
        sqlx::query("INSERT INTO custom_field_values (id, custom_field_id, entity_type, entity_id, value_json, updated_at) VALUES ($1, $2, 'trade', $3, $4, $5)")
            .bind(Uuid::new_v4().to_string()).bind(&value.custom_field_id).bind(&input.trade_id).bind(&value.value_json).bind(&now).execute(&mut *db).await?;
    }
    get_trade_context(db, account_id, &input.trade_id).await
}

pub(super) async fn list_saved_views(
    db: &mut PgConnection,
    scope: String,
) -> CloudResult<Vec<SavedViewRecord>> {
    sqlx::query_as::<_, SavedViewRecord>("SELECT id, name, scope, state_json, created_at, updated_at FROM saved_views WHERE scope = $1 ORDER BY LOWER(name)")
        .bind(scope).fetch_all(&mut *db).await.map_err(CloudError::from)
}

pub(super) async fn save_saved_view(
    db: &mut PgConnection,
    input: SavedViewInput,
) -> CloudResult<SavedViewRecord> {
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
    sqlx::query("INSERT INTO saved_views (id, name, scope, state_json, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT(id) DO UPDATE SET name = excluded.name, scope = excluded.scope, state_json = excluded.state_json, updated_at = excluded.updated_at")
        .bind(&id).bind(input.name.trim()).bind(&input.scope).bind(&input.state_json).bind(&now).bind(&now).execute(&mut *db).await?;
    sqlx::query_as::<_, SavedViewRecord>(
        "SELECT id, name, scope, state_json, created_at, updated_at FROM saved_views WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&mut *db)
    .await
    .map_err(CloudError::from)
}

pub(super) async fn delete_saved_view(db: &mut PgConnection, id: String) -> CloudResult<()> {
    sqlx::query("DELETE FROM saved_views WHERE id = $1")
        .bind(id)
        .execute(&mut *db)
        .await?;
    Ok(())
}

pub(super) async fn list_custom_fields(
    db: &mut PgConnection,
    entity_type: String,
) -> CloudResult<Vec<CustomFieldRecord>> {
    sqlx::query_as::<_, CustomFieldRecord>("SELECT id, entity_type, name, field_type, options_json, is_required, sort_order, created_at, updated_at FROM custom_fields WHERE entity_type = $1 ORDER BY sort_order, LOWER(name)")
        .bind(entity_type).fetch_all(&mut *db).await.map_err(CloudError::from)
}

pub(super) async fn save_custom_field(
    db: &mut PgConnection,
    input: CustomFieldInput,
) -> CloudResult<CustomFieldRecord> {
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
    sqlx::query("INSERT INTO custom_fields (id, entity_type, name, field_type, options_json, is_required, sort_order, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT(id) DO UPDATE SET name = excluded.name, field_type = excluded.field_type, options_json = excluded.options_json, is_required = excluded.is_required, sort_order = excluded.sort_order, updated_at = excluded.updated_at")
        .bind(&id).bind(&input.entity_type).bind(input.name.trim()).bind(&input.field_type).bind(options).bind(input.is_required.unwrap_or(false)).bind(input.sort_order.unwrap_or(0)).bind(&now).bind(&now).execute(&mut *db).await?;
    sqlx::query_as::<_, CustomFieldRecord>("SELECT id, entity_type, name, field_type, options_json, is_required, sort_order, created_at, updated_at FROM custom_fields WHERE id = $1")
        .bind(id).fetch_one(&mut *db).await.map_err(CloudError::from)
}

pub(super) async fn delete_custom_field(db: &mut PgConnection, id: String) -> CloudResult<()> {
    sqlx::query("DELETE FROM custom_fields WHERE id = $1")
        .bind(id)
        .execute(&mut *db)
        .await?;
    Ok(())
}

#[cfg(test)]
#[path = "journal_workspace_tests.rs"]
pub(super) mod tests;
