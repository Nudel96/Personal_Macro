//! PostgreSQL trade and analytics adapter. The caller owns the transaction.
//! Native domain contracts, validation, derived P&L/R and metric engine are shared.
use chrono::Utc;
use serde_json::Value;
use sqlx::{PgConnection, Postgres, postgres::PgArguments};
use uuid::Uuid;

use super::{
    CloudError, CloudResult,
    common::{argument, encoded, require_active_account, scope_trade_filter},
};
use crate::{
    commands::{DashboardResponse, DeletedTrade, GroupPerformance},
    domain::models::{
        CalendarDay, PagedTrades, TradeDetail, TradeFilter, TradeInput, TradeSummary,
    },
    errors::AppError,
    metrics::{self, MetricTrade},
    repositories::trades::{TRADE_DETAIL_COLUMNS, computed_values, validate_trade},
};

pub(super) const COMMANDS: &[(&str, bool)] = &[
    ("list_trades", false),
    ("get_trade", false),
    ("create_trade", true),
    ("update_trade", true),
    ("trash_trade", true),
    ("restore_trade", true),
    ("duplicate_trade", true),
    ("list_deleted_trades", false),
    ("calculate_dashboard", false),
    ("calculate_calendar", false),
];

pub(super) async fn dispatch(
    connection: &mut PgConnection,
    name: &str,
    args: &Value,
) -> CloudResult<Value> {
    if matches!(name, "create_trade" | "update_trade") {
        let mut input: TradeInput = argument(args, "input")?;
        input.account_id = input.account_id.trim().to_owned();
        require_active_account(&mut *connection, &input.account_id).await?;
        return if name == "create_trade" {
            encoded(create(connection, input).await?)
        } else {
            encoded(update(connection, &argument::<String>(args, "id")?, input).await?)
        };
    }
    let account_id: String = argument(args, "accountId")?;
    require_active_account(&mut *connection, &account_id).await?;
    let account_id = account_id.trim();
    match name {
        "list_trades" => encoded(
            list(
                connection,
                scope_trade_filter(account_id, argument(args, "filter")?),
            )
            .await?,
        ),
        "get_trade" => {
            encoded(get(connection, &argument::<String>(args, "id")?, account_id).await?)
        }
        "duplicate_trade" => {
            encoded(duplicate(connection, &argument::<String>(args, "id")?, account_id).await?)
        }
        "trash_trade" => {
            encoded(trash(connection, &argument::<String>(args, "id")?, account_id).await?)
        }
        "restore_trade" => {
            encoded(restore(connection, &argument::<String>(args, "id")?, account_id).await?)
        }
        "list_deleted_trades" => encoded(list_deleted(connection, account_id).await?),
        "calculate_dashboard" => encoded(
            dashboard(
                connection,
                scope_trade_filter(account_id, argument(args, "filter")?),
            )
            .await?,
        ),
        "calculate_calendar" => encoded(
            calendar_data(
                connection,
                &scope_trade_filter(account_id, argument(args, "filter")?),
            )
            .await?,
        ),
        _ => Err(CloudError::new(
            "COMMAND_UNAVAILABLE",
            "Diese Funktion ist im privaten Browser noch nicht verfügbar.",
        )),
    }
}

fn validate_input(input: &TradeInput) -> CloudResult<()> {
    validate_trade(input)?;
    // Reject out-of-range arithmetic before calling the unchanged native helper.
    if input.net_pnl_minor.is_none()
        && let Some(gross) = input.gross_pnl_minor
    {
        gross
            .checked_sub(input.fees_minor.unwrap_or(0))
            .and_then(|net| net.checked_sub(input.commission_minor.unwrap_or(0)))
            .and_then(|net| net.checked_sub(input.swap_minor.unwrap_or(0)))
            .ok_or_else(|| {
                CloudError::validation("Die Geldbeträge überschreiten den zulässigen Bereich.")
            })?;
    }
    Ok(())
}

pub(super) async fn create(
    connection: &mut PgConnection,
    input: TradeInput,
) -> CloudResult<TradeDetail> {
    validate_input(&input)?;
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
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
          $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51
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
    .execute(&mut *connection)
    .await
    .map_err(|error| match &error {
        sqlx::Error::Database(database_error) if database_error.is_unique_violation() => {
            AppError::Conflict("Ein Trade mit dieser ID existiert bereits.".into())
        }
        _ => AppError::Database(error),
    })?;

    sqlx::query_as::<_, TradeDetail>(&format!(
        "SELECT {TRADE_DETAIL_COLUMNS} FROM trades WHERE id = $1 AND account_id = $2 AND is_deleted = FALSE"
    ))
    .bind(&id)
    .bind(&input.account_id)
    .fetch_one(&mut *connection)
    .await
    .map_err(CloudError::from)
}

async fn update(db: &mut PgConnection, id: &str, input: TradeInput) -> CloudResult<TradeDetail> {
    validate_input(&input)?;
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM trades WHERE id = $1 AND account_id = $2 AND is_deleted = FALSE)",
    )
    .bind(id)
    .bind(&input.account_id)
    .fetch_one(&mut *db)
    .await?;
    if !exists {
        return Err(CloudError::new(
            "NOT_FOUND",
            "Trade wurde in diesem Konto nicht gefunden.",
        ));
    }
    let now = Utc::now().to_rfc3339();
    let instrument = input.instrument.trim().to_uppercase();
    let status = input.status.as_deref().unwrap_or("draft");
    let (net_pnl, calculated_r) = computed_values(&input);

    sqlx::query(
        r#"UPDATE trades SET
          account_id=$1, strategy_id=$2, setup_id=$3, status=$4, instrument=$5, asset_class=$6, direction=$7,
          session=$8, timeframe=$9, opened_at=$10, closed_at=$11, display_timezone=$12, planned_entry=$13, actual_entry=$14,
          initial_stop_loss=$15, actual_exit=$16, take_profit=$17, quantity=$18, planned_risk_minor=$19, gross_pnl_minor=$20,
          fees_minor=$21, commission_minor=$22, swap_minor=$23, net_pnl_minor=$24, calculated_r=$25, r_override=$26,
          r_override_reason=$27, mae_r=$28, mfe_r=$29, followed_plan=$30, followed_risk_rules=$31, followed_entry_rules=$32,
          followed_exit_rules=$33, impulse_trade=$34, process_score=$35, execution_score=$36, setup_quality=$37,
          confidence_before=$38, focus_before=$39, stress_before=$40, energy_before=$41, satisfaction_after=$42, reviewed_at=$43,
          thesis_html=$44, execution_notes_html=$45, review_notes_html=$46, lessons_html=$47, source_metadata_json=$48, updated_at=$49
        WHERE id=$50 AND account_id=$51 AND is_deleted = FALSE"#,
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
    .bind(&input.lessons_html).bind(input.source_metadata_json.as_deref().unwrap_or("{}")).bind(&now).bind(id).bind(&input.account_id)
    .execute(&mut *db)
    .await?;
    get(db, id, &input.account_id).await
}

async fn get(db: &mut PgConnection, id: &str, account_id: &str) -> CloudResult<TradeDetail> {
    let query = format!(
        "SELECT {TRADE_DETAIL_COLUMNS} FROM trades WHERE id = $1 AND account_id = $2 AND is_deleted = FALSE"
    );
    sqlx::query_as::<_, TradeDetail>(&query)
        .bind(id)
        .bind(account_id)
        .fetch_optional(&mut *db)
        .await?
        .ok_or_else(|| CloudError::new("NOT_FOUND", "Trade wurde in diesem Konto nicht gefunden."))
}

async fn duplicate(db: &mut PgConnection, id: &str, account_id: &str) -> CloudResult<TradeDetail> {
    let original = get(&mut *db, id, account_id).await?;
    let duplicated = create(
        &mut *db,
        TradeInput {
            id: None,
            account_id: account_id.to_owned(),
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
    sqlx::query("INSERT INTO trade_tags (trade_id, tag_id) SELECT $1, tag_id FROM trade_tags WHERE trade_id = $2")
        .bind(&duplicated.id).bind(id).execute(&mut *db).await?;
    // Generate IDs in Rust: the cloud database does not require pgcrypto.
    #[derive(sqlx::FromRow)]
    struct ChecklistCopy {
        template_item_id: Option<String>,
        label_snapshot: String,
        category_snapshot: Option<String>,
        is_required: bool,
        note: Option<String>,
        sort_order: i64,
    }
    let checklist = sqlx::query_as::<_, ChecklistCopy>("SELECT template_item_id, label_snapshot, category_snapshot, is_required, note, sort_order FROM trade_checklist_items WHERE trade_id=$1")
        .bind(id).fetch_all(&mut *db).await?;
    for item in checklist {
        sqlx::query("INSERT INTO trade_checklist_items (id, trade_id, template_item_id, label_snapshot, category_snapshot, is_required, is_checked, note, sort_order) VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,$8)")
            .bind(Uuid::new_v4().simple().to_string()).bind(&duplicated.id)
            .bind(item.template_item_id).bind(item.label_snapshot).bind(item.category_snapshot)
            .bind(item.is_required).bind(item.note).bind(item.sort_order)
            .execute(&mut *db).await?;
    }
    Ok(duplicated)
}

async fn trash(db: &mut PgConnection, id: &str, account_id: &str) -> CloudResult<()> {
    let now = Utc::now().to_rfc3339();
    let name: Option<String> = sqlx::query_scalar(
        "SELECT instrument FROM trades WHERE id=$1 AND account_id=$2 AND NOT is_deleted",
    )
    .bind(id)
    .bind(account_id)
    .fetch_optional(&mut *db)
    .await?;
    let name = name.ok_or_else(|| {
        CloudError::new("NOT_FOUND", "Trade wurde in diesem Konto nicht gefunden.")
    })?;
    sqlx::query("UPDATE trades SET is_deleted=TRUE, status='trashed', deleted_at=$1, updated_at=$1 WHERE id=$2 AND account_id=$3")
        .bind(&now).bind(id).bind(account_id).execute(&mut *db).await?;
    sqlx::query("INSERT INTO deleted_items (id,entity_type,entity_id,display_name,payload_json,deleted_at) VALUES ($1,'trade',$2,$3,'{}',$4) ON CONFLICT (entity_type,entity_id) DO UPDATE SET id=EXCLUDED.id, display_name=EXCLUDED.display_name, payload_json=EXCLUDED.payload_json, deleted_at=EXCLUDED.deleted_at, purge_after=NULL")
        .bind(Uuid::new_v4().to_string()).bind(id).bind(name).bind(now).execute(&mut *db).await?;
    Ok(())
}

async fn restore(db: &mut PgConnection, id: &str, account_id: &str) -> CloudResult<TradeDetail> {
    let now = Utc::now().to_rfc3339();
    let result = sqlx::query("UPDATE trades SET is_deleted=FALSE, status=CASE WHEN closed_at IS NOT NULL THEN 'closed' WHEN opened_at IS NOT NULL THEN 'open' ELSE 'draft' END, deleted_at=NULL, updated_at=$1 WHERE id=$2 AND account_id=$3 AND is_deleted")
        .bind(now).bind(id).bind(account_id).execute(&mut *db).await?;
    if result.rows_affected() == 0 {
        return Err(CloudError::new(
            "NOT_FOUND",
            "Gelöschter Trade wurde in diesem Konto nicht gefunden.",
        ));
    }
    sqlx::query("DELETE FROM deleted_items WHERE entity_type='trade' AND entity_id=$1")
        .bind(id)
        .execute(&mut *db)
        .await?;
    get(db, id, account_id).await
}

async fn list_deleted(db: &mut PgConnection, account_id: &str) -> CloudResult<Vec<DeletedTrade>> {
    Ok(sqlx::query_as::<_, DeletedTrade>("SELECT id,instrument,direction,deleted_at,net_pnl_minor FROM trades WHERE is_deleted AND account_id=$1 ORDER BY deleted_at DESC NULLS LAST")
        .bind(account_id).fetch_all(db).await?)
}

fn nonempty(values: &Option<Vec<String>>) -> Option<&[String]> {
    values.as_deref().filter(|values| !values.is_empty())
}

// Repeated placeholders are typed explicitly so PostgreSQL accepts absent filters.
// Three-valued nullable rule flags deliberately match the desktop query.
const LIST_PREDICATES: &str = r#"NOT t.is_deleted
    AND ($1::text IS NULL OR t.instrument COLLATE "C" ILIKE $1 ESCAPE '' OR COALESCE(s.name,'') COLLATE "C" ILIKE $1 ESCAPE '')
    AND ($2::text[] IS NULL OR t.account_id=ANY($2))
    AND ($3::text[] IS NULL OR t.setup_id=ANY($3))
    AND ($4::text[] IS NULL OR t.instrument=ANY($4))
    AND ($5::text[] IS NULL OR t.direction=ANY($5))
    AND ($6::text[] IS NULL OR t.status=ANY($6))
    AND ($7::text IS NULL OR COALESCE(t.closed_at,t.opened_at,t.created_at)>=$7)
    AND ($8::text IS NULL OR COALESCE(t.closed_at,t.opened_at,t.created_at)<=$8)
    AND ($9::bigint IS NULL OR t.process_score>=$9)
    AND ($10::boolean IS NULL OR ($10 AND (NOT t.followed_plan OR NOT t.followed_risk_rules OR NOT t.followed_entry_rules OR NOT t.followed_exit_rules))
      OR (NOT $10 AND NOT (NOT t.followed_plan OR NOT t.followed_risk_rules OR NOT t.followed_entry_rules OR NOT t.followed_exit_rules)))"#;

fn bind_list<'q, O>(
    query: sqlx::query::QueryAs<'q, Postgres, O, PgArguments>,
    search: &'q Option<String>,
    filter: &'q TradeFilter,
) -> sqlx::query::QueryAs<'q, Postgres, O, PgArguments> {
    query
        .bind(search)
        .bind(nonempty(&filter.account_ids))
        .bind(nonempty(&filter.setup_ids))
        .bind(nonempty(&filter.instruments))
        .bind(nonempty(&filter.directions))
        .bind(nonempty(&filter.statuses))
        .bind(&filter.date_from)
        .bind(&filter.date_to)
        .bind(filter.min_process_score)
        .bind(filter.has_rule_violation)
}

fn page_spec(filter: &TradeFilter) -> (u32, u32, i64) {
    let page = filter.page.unwrap_or(1).max(1);
    let size = filter.page_size.unwrap_or(50).clamp(1, 250);
    // Multiplication in i64 keeps very high valid u32 page inputs from wrapping.
    (page, size, i64::from(page - 1) * i64::from(size))
}

fn sort_spec(filter: &TradeFilter) -> (&'static str, &'static str, &'static str) {
    let column = match filter.sort_by.as_deref() {
        Some("instrument") => "t.instrument COLLATE \"C\"",
        Some("netPnlMinor") => "t.net_pnl_minor",
        Some("calculatedR") => "CAST(t.calculated_r AS DOUBLE PRECISION)",
        Some("processScore") => "t.process_score",
        Some("openedAt") => "t.opened_at COLLATE \"C\"",
        _ => "COALESCE(t.closed_at,t.opened_at,t.created_at) COLLATE \"C\"",
    };
    if filter.sort_direction.as_deref() == Some("asc") {
        (column, "ASC", "NULLS FIRST")
    } else {
        (column, "DESC", "NULLS LAST")
    }
}

async fn list(db: &mut PgConnection, filter: TradeFilter) -> CloudResult<PagedTrades> {
    let (page, page_size, offset) = page_spec(&filter);
    let search = filter
        .search
        .as_ref()
        .map(|value| format!("%{}%", value.trim()));
    let (column, direction, nulls) = sort_spec(&filter);
    let query = format!(
        r#"SELECT t.id,t.status,t.instrument,t.asset_class,t.direction,
        a.name AS account_name,s.name AS setup_name,t.session,t.timeframe,
        t.opened_at,t.closed_at,t.actual_entry,t.actual_exit,t.quantity,
        t.net_pnl_minor,t.calculated_r,t.process_score,t.followed_plan,
        t.reviewed_at,t.created_at,t.updated_at
        FROM trades t LEFT JOIN accounts a ON a.id=t.account_id LEFT JOIN setups s ON s.id=t.setup_id
        WHERE {LIST_PREDICATES} ORDER BY {column} {direction} {nulls},t.id COLLATE "C" {direction}
        LIMIT $11 OFFSET $12"#
    );
    let items = bind_list(sqlx::query_as::<_, TradeSummary>(&query), &search, &filter)
        .bind(i64::from(page_size))
        .bind(offset)
        .fetch_all(&mut *db)
        .await?;
    let query = format!(
        "SELECT COUNT(*) FROM trades t LEFT JOIN setups s ON s.id=t.setup_id WHERE {LIST_PREDICATES}"
    );
    let total = bind_list(sqlx::query_as::<_, (i64,)>(&query), &search, &filter)
        .fetch_one(&mut *db)
        .await?
        .0;
    let size = i64::from(page_size);
    let total_pages = u32::try_from(total / size + i64::from(total % size != 0)).map_err(|_| {
        CloudError::new(
            "DATABASE_ERROR",
            "Die Ergebnismenge überschreitet den zulässigen Bereich.",
        )
    })?;
    Ok(PagedTrades {
        items,
        total,
        page,
        page_size,
        total_pages,
    })
}

fn money_range_error() -> CloudError {
    CloudError::validation("Die Geldbeträge überschreiten den zulässigen Bereich.")
}

// The native analytics intentionally use date/account/setup/instrument/direction,
// not list-only search, status, process-score or pagination filters.
const ANALYTICS_PREDICATES: &str = r#"NOT t.is_deleted AND t.status='closed'
    AND t.closed_at IS NOT NULL AND t.net_pnl_minor IS NOT NULL
    AND ($1::text IS NULL OR t.closed_at >= $1)
    AND ($2::text IS NULL OR t.closed_at <= $2)
    AND ($3::text[] IS NULL OR t.account_id=ANY($3))
    AND ($4::text[] IS NULL OR t.setup_id=ANY($4))
    AND ($5::text[] IS NULL OR t.instrument=ANY($5))
    AND ($6::text[] IS NULL OR t.direction=ANY($6))"#;

fn bind_analytics<'q, O>(
    query: sqlx::query::QueryAs<'q, Postgres, O, PgArguments>,
    filter: &'q TradeFilter,
) -> sqlx::query::QueryAs<'q, Postgres, O, PgArguments> {
    query
        .bind(&filter.date_from)
        .bind(&filter.date_to)
        .bind(nonempty(&filter.account_ids))
        .bind(nonempty(&filter.setup_ids))
        .bind(nonempty(&filter.instruments))
        .bind(nonempty(&filter.directions))
}

async fn calendar_data(
    db: &mut PgConnection,
    filter: &TradeFilter,
) -> CloudResult<Vec<CalendarDay>> {
    let sql = format!(
        r#"SELECT substr(t.closed_at,1,10) AS date,
        COALESCE(SUM(t.net_pnl_minor),0)::bigint AS net_pnl_minor,
        COALESCE(SUM(t.calculated_r::double precision),0.0)::double precision AS total_r,
        COUNT(*) AS trades,
        SUM(CASE WHEN t.net_pnl_minor>0 THEN 1 ELSE 0 END)::bigint AS wins,
        SUM(CASE WHEN t.net_pnl_minor<0 THEN 1 ELSE 0 END)::bigint AS losses
        FROM trades t WHERE {ANALYTICS_PREDICATES}
        GROUP BY substr(t.closed_at,1,10) ORDER BY substr(t.closed_at,1,10) COLLATE "C""#
    );
    Ok(
        bind_analytics(sqlx::query_as::<_, CalendarDay>(&sql), filter)
            .fetch_all(db)
            .await?,
    )
}

async fn group_performance(
    db: &mut PgConnection,
    filter: &TradeFilter,
    group: &str,
) -> CloudResult<Vec<GroupPerformance>> {
    let (key, label, join) = match group {
        "setup" => (
            "COALESCE(t.setup_id,'unassigned')",
            "COALESCE(s.name,'Ohne Setup')",
            "LEFT JOIN setups s ON s.id=t.setup_id",
        ),
        "weekday" => (
            "EXTRACT(DOW FROM (t.closed_at::timestamptz AT TIME ZONE 'UTC'))::integer::text",
            "CASE EXTRACT(DOW FROM (t.closed_at::timestamptz AT TIME ZONE 'UTC'))::integer WHEN 0 THEN 'So' WHEN 1 THEN 'Mo' WHEN 2 THEN 'Di' WHEN 3 THEN 'Mi' WHEN 4 THEN 'Do' WHEN 5 THEN 'Fr' ELSE 'Sa' END",
            "",
        ),
        "session" => (
            "COALESCE(t.session,'unknown')",
            "COALESCE(t.session,'Unbekannt')",
            "",
        ),
        "timeframe" => (
            "COALESCE(t.timeframe,'unknown')",
            "COALESCE(t.timeframe,'Unbekannt')",
            "",
        ),
        "instrument" => ("t.instrument", "t.instrument", ""),
        "direction" => (
            "t.direction",
            "CASE t.direction WHEN 'long' THEN 'Long' ELSE 'Short' END",
            "",
        ),
        "asset_class" => ("t.asset_class", "t.asset_class", ""),
        "account" => (
            "COALESCE(t.account_id,'unassigned')",
            "COALESCE(a.name,'Ohne Konto')",
            "LEFT JOIN accounts a ON a.id=t.account_id",
        ),
        _ => return Err(CloudError::validation("Unbekannte Gruppierung.")),
    };
    // SUM(bigint) is PostgreSQL NUMERIC; explicit BIGINT preserves the wire contract.
    let sql = format!(
        r#"SELECT {key} AS key,{label} AS label,COUNT(*) AS trades,
        SUM(CASE WHEN t.net_pnl_minor>0 THEN 1 ELSE 0 END)::bigint AS wins,
        COALESCE(SUM(t.net_pnl_minor),0)::bigint AS net_pnl_minor,
        COALESCE(SUM(t.calculated_r::double precision),0.0)::double precision AS total_r,
        AVG(t.calculated_r::double precision) AS average_r,
        SUM(CASE WHEN t.net_pnl_minor>0 THEN 1 ELSE 0 END)::double precision/COUNT(*) AS win_rate
        FROM trades t {join} WHERE {ANALYTICS_PREDICATES}
        GROUP BY {key},{label} ORDER BY net_pnl_minor DESC"#
    );
    Ok(
        bind_analytics(sqlx::query_as::<_, GroupPerformance>(&sql), filter)
            .fetch_all(db)
            .await?,
    )
}

async fn dashboard(db: &mut PgConnection, filter: TradeFilter) -> CloudResult<DashboardResponse> {
    let trades = metric_trades(&mut *db, &filter).await?;
    Ok(DashboardResponse {
        metrics: metrics::calculate_dashboard(&trades),
        calendar: calendar_data(&mut *db, &filter).await?,
        setup_performance: group_performance(&mut *db, &filter, "setup").await?,
        weekday_performance: group_performance(&mut *db, &filter, "weekday").await?,
        session_performance: group_performance(&mut *db, &filter, "session").await?,
        timeframe_performance: group_performance(&mut *db, &filter, "timeframe").await?,
        instrument_performance: group_performance(&mut *db, &filter, "instrument").await?,
        direction_performance: group_performance(&mut *db, &filter, "direction").await?,
        account_performance: group_performance(&mut *db, &filter, "account").await?,
        asset_class_performance: group_performance(&mut *db, &filter, "asset_class").await?,
        generated_at: Utc::now().to_rfc3339(),
        filter,
    })
}

async fn metric_trades(
    db: &mut PgConnection,
    filter: &TradeFilter,
) -> CloudResult<Vec<MetricTrade>> {
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

    let sql = format!(
        r#"SELECT t.id, t.opened_at, t.closed_at, t.net_pnl_minor, t.planned_risk_minor, t.fees_minor, t.commission_minor, t.swap_minor,
          t.calculated_r, t.r_override, t.process_score, t.execution_score, t.setup_quality, t.followed_plan,
          t.followed_risk_rules, t.followed_entry_rules, t.followed_exit_rules, t.reviewed_at
        FROM trades t WHERE {ANALYTICS_PREDICATES}
        ORDER BY t.closed_at COLLATE "C" ASC, t.id COLLATE "C" ASC"#
    );
    let rows = bind_analytics(sqlx::query_as::<_, Row>(&sql), filter)
        .fetch_all(db)
        .await?;
    // The canonical engine sums i64 values. Check all intermediate totals before it runs.
    let mut costs = 0_i64;
    let mut positive = 0_i64;
    let mut negative = 0_i64;
    for row in &rows {
        let cost = row
            .fees_minor
            .checked_add(row.commission_minor)
            .and_then(|value| value.checked_add(row.swap_minor));
        costs = cost
            .and_then(|value| costs.checked_add(value))
            .ok_or_else(money_range_error)?;
        if row.net_pnl_minor >= 0 {
            positive = positive
                .checked_add(row.net_pnl_minor)
                .ok_or_else(money_range_error)?;
        } else {
            negative = negative
                .checked_add(row.net_pnl_minor)
                .ok_or_else(money_range_error)?;
        }
    }
    // Peak-to-trough subtraction must remain representable too.
    positive
        .checked_sub(negative)
        .ok_or_else(money_range_error)?;

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

#[cfg(test)]
#[path = "trades_tests.rs"]
mod tests;
