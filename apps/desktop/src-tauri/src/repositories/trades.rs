use chrono::Utc;
use rust_decimal::Decimal;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::{
    domain::models::{PagedTrades, TradeDetail, TradeFilter, TradeInput, TradeSummary},
    errors::AppError,
    metrics::MetricTrade,
};

const TRADE_DETAIL_COLUMNS: &str = r#"
  id, account_id, strategy_id, setup_id, status, instrument, asset_class, direction,
  session, timeframe, opened_at, closed_at, display_timezone, planned_entry, actual_entry,
  initial_stop_loss, actual_exit, take_profit, quantity, planned_risk_minor, gross_pnl_minor,
  fees_minor, commission_minor, swap_minor, net_pnl_minor, calculated_r, r_override,
  r_override_reason, mae_r, mfe_r, followed_plan, followed_risk_rules,
  followed_entry_rules, followed_exit_rules, impulse_trade, process_score, execution_score,
  setup_quality, confidence_before, focus_before, stress_before, energy_before,
  satisfaction_after, reviewed_at, thesis_html, execution_notes_html, review_notes_html,
  lessons_html, source_metadata_json, created_at, updated_at
"#;

fn validate_trade(input: &TradeInput) -> Result<(), AppError> {
    let instrument = input.instrument.trim();
    if instrument.is_empty() || instrument.len() > 32 {
        return Err(AppError::Validation(
            "Instrument muss zwischen 1 und 32 Zeichen enthalten.".into(),
        ));
    }
    if !matches!(input.direction.as_str(), "long" | "short") {
        return Err(AppError::Validation(
            "Richtung muss Long oder Short sein.".into(),
        ));
    }
    let status = input.status.as_deref().unwrap_or("draft");
    if !matches!(
        status,
        "draft" | "planned" | "open" | "closed" | "cancelled" | "archived"
    ) {
        return Err(AppError::Validation("Ungültiger Trade-Status.".into()));
    }
    if status == "closed" && input.closed_at.is_none() {
        return Err(AppError::Validation(
            "Ein geschlossener Trade benötigt ein Ausstiegsdatum.".into(),
        ));
    }
    for (label, value) in [
        ("Prozess-Score", input.process_score),
        ("Ausführungs-Score", input.execution_score),
        ("Setup-Qualität", input.setup_quality),
        ("Konfidenz", input.confidence_before),
        ("Fokus", input.focus_before),
        ("Stress", input.stress_before),
        ("Energie", input.energy_before),
        ("Zufriedenheit", input.satisfaction_after),
    ] {
        if value.is_some_and(|score| !(1..=10).contains(&score)) {
            return Err(AppError::Validation(format!(
                "{label} muss zwischen 1 und 10 liegen."
            )));
        }
    }
    if input.r_override.is_some()
        && input
            .r_override_reason
            .as_deref()
            .unwrap_or("")
            .trim()
            .is_empty()
    {
        return Err(AppError::Validation(
            "Ein manueller R-Override benötigt eine Begründung.".into(),
        ));
    }
    Ok(())
}

fn computed_values(input: &TradeInput) -> (Option<i64>, Option<String>) {
    let fees = input.fees_minor.unwrap_or(0);
    let commission = input.commission_minor.unwrap_or(0);
    let swap = input.swap_minor.unwrap_or(0);
    let net_pnl = input.net_pnl_minor.or_else(|| {
        input
            .gross_pnl_minor
            .map(|gross| gross - fees - commission - swap)
    });
    let calculated_r = match (net_pnl, input.planned_risk_minor) {
        (Some(net), Some(risk)) if risk > 0 => Some(
            (Decimal::from(net) / Decimal::from(risk))
                .round_dp(4)
                .normalize()
                .to_string(),
        ),
        _ => None,
    };
    (net_pnl, calculated_r)
}

pub async fn create(db: &SqlitePool, input: TradeInput) -> Result<TradeDetail, AppError> {
    validate_trade(&input)?;
    let now = Utc::now().to_rfc3339();
    let id = input
        .id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let instrument = input.instrument.trim().to_uppercase();
    let status = input.status.as_deref().unwrap_or("draft");
    let (net_pnl, calculated_r) = computed_values(&input);

    sqlx::query(
        r#"INSERT INTO trades (
          id, account_id, strategy_id, setup_id, status, instrument, asset_class, direction,
          session, timeframe, opened_at, closed_at, display_timezone, planned_entry, actual_entry,
          initial_stop_loss, actual_exit, take_profit, quantity, planned_risk_minor, gross_pnl_minor,
          fees_minor, commission_minor, swap_minor, net_pnl_minor, calculated_r, r_override,
          r_override_reason, mae_r, mfe_r, followed_plan, followed_risk_rules, followed_entry_rules,
          followed_exit_rules, impulse_trade, process_score, execution_score, setup_quality,
          confidence_before, focus_before, stress_before, energy_before, satisfaction_after,
          reviewed_at, thesis_html, execution_notes_html, review_notes_html, lessons_html,
          source_metadata_json, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )"#,
    )
    .bind(&id)
    .bind(&input.account_id)
    .bind(&input.strategy_id)
    .bind(&input.setup_id)
    .bind(status)
    .bind(instrument)
    .bind(input.asset_class.as_deref().unwrap_or("forex"))
    .bind(&input.direction)
    .bind(&input.session)
    .bind(&input.timeframe)
    .bind(&input.opened_at)
    .bind(&input.closed_at)
    .bind(input.display_timezone.as_deref().unwrap_or("Europe/Berlin"))
    .bind(&input.planned_entry)
    .bind(&input.actual_entry)
    .bind(&input.initial_stop_loss)
    .bind(&input.actual_exit)
    .bind(&input.take_profit)
    .bind(&input.quantity)
    .bind(input.planned_risk_minor)
    .bind(input.gross_pnl_minor)
    .bind(input.fees_minor.unwrap_or(0))
    .bind(input.commission_minor.unwrap_or(0))
    .bind(input.swap_minor.unwrap_or(0))
    .bind(net_pnl)
    .bind(calculated_r)
    .bind(&input.r_override)
    .bind(&input.r_override_reason)
    .bind(&input.mae_r)
    .bind(&input.mfe_r)
    .bind(input.followed_plan)
    .bind(input.followed_risk_rules)
    .bind(input.followed_entry_rules)
    .bind(input.followed_exit_rules)
    .bind(input.impulse_trade)
    .bind(input.process_score)
    .bind(input.execution_score)
    .bind(input.setup_quality)
    .bind(input.confidence_before)
    .bind(input.focus_before)
    .bind(input.stress_before)
    .bind(input.energy_before)
    .bind(input.satisfaction_after)
    .bind(&input.reviewed_at)
    .bind(&input.thesis_html)
    .bind(&input.execution_notes_html)
    .bind(&input.review_notes_html)
    .bind(&input.lessons_html)
    .bind(input.source_metadata_json.as_deref().unwrap_or("{}"))
    .bind(&now)
    .bind(&now)
    .execute(db)
    .await
    .map_err(|error| match &error {
        sqlx::Error::Database(database_error) if database_error.is_unique_violation() => {
            AppError::Conflict("Ein Trade mit dieser ID existiert bereits.".into())
        }
        _ => AppError::Database(error),
    })?;

    get(db, &id).await
}

pub async fn update(db: &SqlitePool, id: &str, input: TradeInput) -> Result<TradeDetail, AppError> {
    validate_trade(&input)?;
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM trades WHERE id = ? AND is_deleted = 0)")
            .bind(id)
            .fetch_one(db)
            .await?;
    if !exists {
        return Err(AppError::NotFound(format!("Trade {id}")));
    }
    let now = Utc::now().to_rfc3339();
    let instrument = input.instrument.trim().to_uppercase();
    let status = input.status.as_deref().unwrap_or("draft");
    let (net_pnl, calculated_r) = computed_values(&input);

    sqlx::query(
        r#"UPDATE trades SET
          account_id=?, strategy_id=?, setup_id=?, status=?, instrument=?, asset_class=?, direction=?,
          session=?, timeframe=?, opened_at=?, closed_at=?, display_timezone=?, planned_entry=?, actual_entry=?,
          initial_stop_loss=?, actual_exit=?, take_profit=?, quantity=?, planned_risk_minor=?, gross_pnl_minor=?,
          fees_minor=?, commission_minor=?, swap_minor=?, net_pnl_minor=?, calculated_r=?, r_override=?,
          r_override_reason=?, mae_r=?, mfe_r=?, followed_plan=?, followed_risk_rules=?, followed_entry_rules=?,
          followed_exit_rules=?, impulse_trade=?, process_score=?, execution_score=?, setup_quality=?,
          confidence_before=?, focus_before=?, stress_before=?, energy_before=?, satisfaction_after=?, reviewed_at=?,
          thesis_html=?, execution_notes_html=?, review_notes_html=?, lessons_html=?, source_metadata_json=?, updated_at=?
        WHERE id=? AND is_deleted=0"#,
    )
    .bind(&input.account_id).bind(&input.strategy_id).bind(&input.setup_id).bind(status)
    .bind(instrument).bind(input.asset_class.as_deref().unwrap_or("forex")).bind(&input.direction)
    .bind(&input.session).bind(&input.timeframe).bind(&input.opened_at).bind(&input.closed_at)
    .bind(input.display_timezone.as_deref().unwrap_or("Europe/Berlin"))
    .bind(&input.planned_entry).bind(&input.actual_entry).bind(&input.initial_stop_loss)
    .bind(&input.actual_exit).bind(&input.take_profit).bind(&input.quantity)
    .bind(input.planned_risk_minor).bind(input.gross_pnl_minor)
    .bind(input.fees_minor.unwrap_or(0)).bind(input.commission_minor.unwrap_or(0)).bind(input.swap_minor.unwrap_or(0))
    .bind(net_pnl).bind(calculated_r).bind(&input.r_override).bind(&input.r_override_reason)
    .bind(&input.mae_r).bind(&input.mfe_r).bind(input.followed_plan).bind(input.followed_risk_rules)
    .bind(input.followed_entry_rules).bind(input.followed_exit_rules).bind(input.impulse_trade)
    .bind(input.process_score).bind(input.execution_score).bind(input.setup_quality)
    .bind(input.confidence_before).bind(input.focus_before).bind(input.stress_before)
    .bind(input.energy_before).bind(input.satisfaction_after).bind(&input.reviewed_at)
    .bind(&input.thesis_html).bind(&input.execution_notes_html).bind(&input.review_notes_html)
    .bind(&input.lessons_html).bind(input.source_metadata_json.as_deref().unwrap_or("{}")).bind(&now).bind(id)
    .execute(db)
    .await?;
    get(db, id).await
}

pub async fn get(db: &SqlitePool, id: &str) -> Result<TradeDetail, AppError> {
    let query =
        format!("SELECT {TRADE_DETAIL_COLUMNS} FROM trades WHERE id = ? AND is_deleted = 0");
    sqlx::query_as::<_, TradeDetail>(&query)
        .bind(id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Trade {id}")))
}

fn serialized(values: &Option<Vec<String>>) -> Option<String> {
    values
        .as_ref()
        .filter(|items| !items.is_empty())
        .and_then(|items| serde_json::to_string(items).ok())
}

fn array_filter_clause(column: &str) -> String {
    format!("(? IS NULL OR {column} IN (SELECT value FROM json_each(?)))")
}

pub async fn list(db: &SqlitePool, filter: TradeFilter) -> Result<PagedTrades, AppError> {
    let page = filter.page.unwrap_or(1).max(1);
    let page_size = filter.page_size.unwrap_or(50).clamp(1, 250);
    let offset = (page - 1) * page_size;
    let bindings = TradeFilterBindings {
        search: filter
            .search
            .as_ref()
            .map(|value| format!("%{}%", value.trim())),
        accounts: serialized(&filter.account_ids),
        setups: serialized(&filter.setup_ids),
        instruments: serialized(&filter.instruments),
        directions: serialized(&filter.directions),
        statuses: serialized(&filter.statuses),
        rule_violation: filter.has_rule_violation.map(i64::from),
    };

    let predicates = format!(
        r#"t.is_deleted = 0
        AND (? IS NULL OR t.instrument LIKE ? COLLATE NOCASE OR COALESCE(s.name, '') LIKE ? COLLATE NOCASE)
        AND {}
        AND {}
        AND {}
        AND {}
        AND {}
        AND (? IS NULL OR COALESCE(t.closed_at, t.opened_at, t.created_at) >= ?)
        AND (? IS NULL OR COALESCE(t.closed_at, t.opened_at, t.created_at) <= ?)
        AND (? IS NULL OR t.process_score >= ?)
        AND (? IS NULL OR (? = 1 AND (t.followed_plan = 0 OR t.followed_risk_rules = 0 OR t.followed_entry_rules = 0 OR t.followed_exit_rules = 0)) OR (? = 0 AND NOT (t.followed_plan = 0 OR t.followed_risk_rules = 0 OR t.followed_entry_rules = 0 OR t.followed_exit_rules = 0)))"#,
        array_filter_clause("t.account_id"),
        array_filter_clause("t.setup_id"),
        array_filter_clause("t.instrument"),
        array_filter_clause("t.direction"),
        array_filter_clause("t.status")
    );

    let sort_column = match filter.sort_by.as_deref() {
        Some("instrument") => "t.instrument",
        Some("netPnlMinor") => "t.net_pnl_minor",
        Some("calculatedR") => "CAST(t.calculated_r AS REAL)",
        Some("processScore") => "t.process_score",
        Some("openedAt") => "t.opened_at",
        _ => "COALESCE(t.closed_at, t.opened_at, t.created_at)",
    };
    let sort_direction = if filter.sort_direction.as_deref() == Some("asc") {
        "ASC"
    } else {
        "DESC"
    };

    let list_query = format!(
        r#"SELECT t.id, t.status, t.instrument, t.asset_class, t.direction,
          a.name AS account_name, s.name AS setup_name, t.session, t.timeframe,
          t.opened_at, t.closed_at, t.actual_entry, t.actual_exit, t.quantity,
          t.net_pnl_minor, t.calculated_r, t.process_score, t.followed_plan,
          t.reviewed_at, t.created_at, t.updated_at
        FROM trades t
        LEFT JOIN accounts a ON a.id = t.account_id
        LEFT JOIN setups s ON s.id = t.setup_id
        WHERE {predicates}
        ORDER BY {sort_column} {sort_direction}, t.id {sort_direction}
        LIMIT ? OFFSET ?"#
    );

    let mut query = sqlx::query_as::<_, TradeSummary>(&list_query);
    query = bind_filters(query, &bindings, &filter)
        .bind(page_size as i64)
        .bind(offset as i64);
    let items = query.fetch_all(db).await?;

    let count_query = format!(
        r#"SELECT COUNT(*) FROM trades t
        LEFT JOIN setups s ON s.id = t.setup_id
        WHERE {predicates}"#
    );
    let count = sqlx::query_as::<_, (i64,)>(&count_query);
    let total = bind_filters(count, &bindings, &filter)
        .fetch_one(db)
        .await?
        .0;
    let total_pages = if total == 0 {
        0
    } else {
        (total as u32).div_ceil(page_size)
    };

    Ok(PagedTrades {
        items,
        total,
        page,
        page_size,
        total_pages,
    })
}

struct TradeFilterBindings {
    search: Option<String>,
    accounts: Option<String>,
    setups: Option<String>,
    instruments: Option<String>,
    directions: Option<String>,
    statuses: Option<String>,
    rule_violation: Option<i64>,
}

fn bind_filters<'q, O>(
    query: sqlx::query::QueryAs<'q, sqlx::Sqlite, O, sqlx::sqlite::SqliteArguments<'q>>,
    bindings: &'q TradeFilterBindings,
    filter: &'q TradeFilter,
) -> sqlx::query::QueryAs<'q, sqlx::Sqlite, O, sqlx::sqlite::SqliteArguments<'q>> {
    query
        .bind(&bindings.search)
        .bind(&bindings.search)
        .bind(&bindings.search)
        .bind(&bindings.accounts)
        .bind(&bindings.accounts)
        .bind(&bindings.setups)
        .bind(&bindings.setups)
        .bind(&bindings.instruments)
        .bind(&bindings.instruments)
        .bind(&bindings.directions)
        .bind(&bindings.directions)
        .bind(&bindings.statuses)
        .bind(&bindings.statuses)
        .bind(&filter.date_from)
        .bind(&filter.date_from)
        .bind(&filter.date_to)
        .bind(&filter.date_to)
        .bind(filter.min_process_score)
        .bind(filter.min_process_score)
        .bind(bindings.rule_violation)
        .bind(bindings.rule_violation)
        .bind(bindings.rule_violation)
}

pub async fn metric_trades(
    db: &SqlitePool,
    filter: &TradeFilter,
) -> Result<Vec<MetricTrade>, AppError> {
    #[derive(sqlx::FromRow)]
    struct Row {
        id: String,
        opened_at: Option<String>,
        closed_at: String,
        net_pnl_minor: i64,
        planned_risk_minor: Option<i64>,
        fees_minor: i64,
        commission_minor: i64,
        swap_minor: i64,
        calculated_r: Option<String>,
        r_override: Option<String>,
        process_score: Option<i64>,
        execution_score: Option<i64>,
        setup_quality: Option<i64>,
        followed_plan: Option<bool>,
        followed_risk_rules: Option<bool>,
        followed_entry_rules: Option<bool>,
        followed_exit_rules: Option<bool>,
        reviewed_at: Option<String>,
    }

    let rows = sqlx::query_as::<_, Row>(
        r#"SELECT id, opened_at, closed_at, net_pnl_minor, planned_risk_minor, fees_minor, commission_minor, swap_minor,
          calculated_r, r_override, process_score, execution_score, setup_quality, followed_plan,
          followed_risk_rules, followed_entry_rules, followed_exit_rules, reviewed_at
        FROM trades
        WHERE is_deleted = 0 AND status = 'closed' AND closed_at IS NOT NULL AND net_pnl_minor IS NOT NULL
          AND (? IS NULL OR closed_at >= ?)
          AND (? IS NULL OR closed_at <= ?)
          AND (? IS NULL OR account_id IN (SELECT value FROM json_each(?)))
          AND (? IS NULL OR setup_id IN (SELECT value FROM json_each(?)))
          AND (? IS NULL OR instrument IN (SELECT value FROM json_each(?)))
          AND (? IS NULL OR direction IN (SELECT value FROM json_each(?)))
        ORDER BY closed_at ASC, id ASC"#,
    )
    .bind(&filter.date_from).bind(&filter.date_from)
    .bind(&filter.date_to).bind(&filter.date_to)
    .bind(serialized(&filter.account_ids)).bind(serialized(&filter.account_ids))
    .bind(serialized(&filter.setup_ids)).bind(serialized(&filter.setup_ids))
    .bind(serialized(&filter.instruments)).bind(serialized(&filter.instruments))
    .bind(serialized(&filter.directions)).bind(serialized(&filter.directions))
    .fetch_all(db)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| MetricTrade {
            id: row.id,
            opened_at: row.opened_at,
            closed_at: row.closed_at,
            net_pnl_minor: row.net_pnl_minor,
            planned_risk_minor: row.planned_risk_minor,
            total_costs_minor: row.fees_minor + row.commission_minor + row.swap_minor,
            realized_r: row
                .calculated_r
                .or(row.r_override)
                .and_then(|value| value.parse::<f64>().ok()),
            process_score: row.process_score.map(|value| value as f64),
            execution_score: row.execution_score.map(|value| value as f64),
            setup_quality: row.setup_quality.map(|value| value as f64),
            followed_plan: row.followed_plan,
            followed_risk_rules: row.followed_risk_rules,
            followed_entry_rules: row.followed_entry_rules,
            followed_exit_rules: row.followed_exit_rules,
            reviewed_at: row.reviewed_at,
        })
        .collect())
}

pub async fn trash(db: &SqlitePool, id: &str) -> Result<(), AppError> {
    let mut transaction = db.begin().await?;
    let now = Utc::now().to_rfc3339();
    let display_name: Option<String> =
        sqlx::query_scalar("SELECT instrument FROM trades WHERE id = ? AND is_deleted = 0")
            .bind(id)
            .fetch_optional(&mut *transaction)
            .await?;
    let display_name = display_name.ok_or_else(|| AppError::NotFound(format!("Trade {id}")))?;
    sqlx::query("UPDATE trades SET is_deleted = 1, status = 'trashed', deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(&now).bind(&now).bind(id).execute(&mut *transaction).await?;
    sqlx::query("INSERT OR REPLACE INTO deleted_items (id, entity_type, entity_id, display_name, payload_json, deleted_at) VALUES (?, 'trade', ?, ?, '{}', ?)")
        .bind(Uuid::new_v4().to_string()).bind(id).bind(display_name).bind(&now)
        .execute(&mut *transaction).await?;
    transaction.commit().await?;
    Ok(())
}

pub async fn restore(db: &SqlitePool, id: &str) -> Result<TradeDetail, AppError> {
    let mut transaction = db.begin().await?;
    let now = Utc::now().to_rfc3339();
    let result = sqlx::query("UPDATE trades SET is_deleted = 0, status = CASE WHEN closed_at IS NOT NULL THEN 'closed' WHEN opened_at IS NOT NULL THEN 'open' ELSE 'draft' END, deleted_at = NULL, updated_at = ? WHERE id = ? AND is_deleted = 1")
        .bind(&now).bind(id).execute(&mut *transaction).await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Gelöschter Trade {id}")));
    }
    sqlx::query("DELETE FROM deleted_items WHERE entity_type = 'trade' AND entity_id = ?")
        .bind(id)
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await?;
    get(db, id).await
}

pub async fn duplicate(db: &SqlitePool, id: &str) -> Result<TradeDetail, AppError> {
    let original = get(db, id).await?;
    let duplicated = create(
        db,
        TradeInput {
            id: None,
            account_id: original.account_id,
            strategy_id: original.strategy_id,
            setup_id: original.setup_id,
            status: Some("draft".into()),
            instrument: original.instrument,
            asset_class: Some(original.asset_class),
            direction: original.direction,
            session: original.session,
            timeframe: original.timeframe,
            opened_at: None,
            closed_at: None,
            display_timezone: Some(original.display_timezone),
            planned_entry: original.planned_entry,
            actual_entry: None,
            initial_stop_loss: original.initial_stop_loss,
            actual_exit: None,
            take_profit: original.take_profit,
            quantity: original.quantity,
            planned_risk_minor: original.planned_risk_minor,
            gross_pnl_minor: None,
            fees_minor: Some(0),
            commission_minor: Some(0),
            swap_minor: Some(0),
            net_pnl_minor: None,
            r_override: None,
            r_override_reason: None,
            mae_r: None,
            mfe_r: None,
            followed_plan: None,
            followed_risk_rules: None,
            followed_entry_rules: None,
            followed_exit_rules: None,
            impulse_trade: None,
            process_score: None,
            execution_score: None,
            setup_quality: original.setup_quality,
            confidence_before: None,
            focus_before: None,
            stress_before: None,
            energy_before: None,
            satisfaction_after: None,
            reviewed_at: None,
            thesis_html: original.thesis_html,
            execution_notes_html: None,
            review_notes_html: None,
            lessons_html: None,
            source_metadata_json: Some(original.source_metadata_json),
        },
    )
    .await?;
    sqlx::query("INSERT INTO trade_tags (trade_id, tag_id) SELECT ?, tag_id FROM trade_tags WHERE trade_id = ?")
        .bind(&duplicated.id).bind(id).execute(db).await?;
    sqlx::query("INSERT INTO trade_checklist_items (id, trade_id, template_item_id, label_snapshot, category_snapshot, is_required, is_checked, note, sort_order) SELECT lower(hex(randomblob(16))), ?, template_item_id, label_snapshot, category_snapshot, is_required, NULL, note, sort_order FROM trade_checklist_items WHERE trade_id = ?")
        .bind(&duplicated.id).bind(id).execute(db).await?;
    Ok(duplicated)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;

    async fn test_database() -> SqlitePool {
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
        pool
    }

    fn input() -> TradeInput {
        TradeInput {
            id: None,
            account_id: None,
            strategy_id: None,
            setup_id: None,
            status: Some("closed".into()),
            instrument: "eurusd".into(),
            asset_class: Some("forex".into()),
            direction: "long".into(),
            session: Some("London".into()),
            timeframe: Some("H1".into()),
            opened_at: Some("2026-01-01T08:00:00Z".into()),
            closed_at: Some("2026-01-01T12:00:00Z".into()),
            display_timezone: Some("Europe/Berlin".into()),
            planned_entry: Some("1.1".into()),
            actual_entry: Some("1.1".into()),
            initial_stop_loss: Some("1.09".into()),
            actual_exit: Some("1.12".into()),
            take_profit: Some("1.12".into()),
            quantity: Some("1".into()),
            planned_risk_minor: Some(5_000),
            gross_pnl_minor: Some(10_000),
            fees_minor: Some(500),
            commission_minor: Some(100),
            swap_minor: Some(50),
            net_pnl_minor: None,
            r_override: None,
            r_override_reason: None,
            mae_r: None,
            mfe_r: None,
            followed_plan: Some(true),
            followed_risk_rules: Some(true),
            followed_entry_rules: Some(true),
            followed_exit_rules: Some(true),
            impulse_trade: Some(false),
            process_score: Some(9),
            execution_score: Some(8),
            setup_quality: Some(9),
            confidence_before: Some(8),
            focus_before: Some(9),
            stress_before: Some(3),
            energy_before: Some(8),
            satisfaction_after: Some(9),
            reviewed_at: None,
            thesis_html: None,
            execution_notes_html: None,
            review_notes_html: None,
            lessons_html: None,
            source_metadata_json: None,
        }
    }

    #[tokio::test]
    async fn trade_round_trip_calculates_net_pnl_and_r() {
        let db = test_database().await;
        let created = create(&db, input()).await.unwrap();
        assert_eq!(created.instrument, "EURUSD");
        assert_eq!(created.net_pnl_minor, Some(9_350));
        assert_eq!(created.calculated_r.as_deref(), Some("1.87"));
        let page = list(&db, TradeFilter::default()).await.unwrap();
        assert_eq!(page.total, 1);
    }

    #[tokio::test]
    async fn trash_and_restore_round_trip() {
        let db = test_database().await;
        let created = create(&db, input()).await.unwrap();
        trash(&db, &created.id).await.unwrap();
        assert!(get(&db, &created.id).await.is_err());
        let restored = restore(&db, &created.id).await.unwrap();
        assert_eq!(restored.status, "closed");
    }

    #[tokio::test]
    async fn paginated_trade_list_handles_ten_thousand_rows() {
        let db = test_database().await;
        sqlx::query(
            r#"WITH RECURSIVE sequence(value) AS (
              SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < 10000
            )
            INSERT INTO trades (id, status, instrument, asset_class, direction, opened_at, closed_at, gross_pnl_minor, net_pnl_minor, calculated_r, created_at, updated_at)
            SELECT printf('perf-%05d', value), 'closed', CASE value % 4 WHEN 0 THEN 'EURUSD' WHEN 1 THEN 'XAUUSD' WHEN 2 THEN 'BTCUSD' ELSE 'ES' END,
              CASE value % 4 WHEN 0 THEN 'forex' WHEN 1 THEN 'metals' WHEN 2 THEN 'crypto' ELSE 'futures' END,
              CASE value % 2 WHEN 0 THEN 'long' ELSE 'short' END,
              '2026-01-01T08:00:00Z', '2026-01-01T12:00:00Z', (value % 21 - 10) * 1000, (value % 21 - 10) * 1000,
              printf('%.2f', CAST(value % 21 - 10 AS REAL) / 5.0), '2026-01-01T12:00:00Z', '2026-01-01T12:00:00Z'
            FROM sequence"#,
        )
        .execute(&db)
        .await
        .unwrap();
        let started = std::time::Instant::now();
        let page = list(
            &db,
            TradeFilter {
                search: Some("USD".into()),
                page_size: Some(50),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        assert_eq!(page.items.len(), 50);
        assert_eq!(page.total, 7_500);
        assert!(started.elapsed() < std::time::Duration::from_secs(5));
    }
}
