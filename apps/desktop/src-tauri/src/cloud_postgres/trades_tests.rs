use super::*;
use serde_json::json;

fn input() -> TradeInput {
    serde_json::from_value(json!({
        "accountId":"trade-parity-a", "instrument":"eurusd", "direction":"long",
        "status":"closed", "closedAt":"2026-01-05T00:30:00+02:00",
        "grossPnlMinor":10000, "feesMinor":500, "commissionMinor":100,
        "swapMinor":50, "plannedRiskMinor":5000
    }))
    .unwrap()
}

#[test]
fn shared_computation_preserves_gross_net_missing_and_r_rounding() {
    let mut trade = input();
    assert_eq!(computed_values(&trade), (Some(9350), Some("1.87".into())));
    trade.net_pnl_minor = Some(0);
    assert_eq!(computed_values(&trade), (Some(0), Some("0".into())));
    trade.net_pnl_minor = Some(-5000);
    assert_eq!(computed_values(&trade), (Some(-5000), Some("-1".into())));
    trade.net_pnl_minor = Some(1);
    trade.planned_risk_minor = Some(3);
    assert_eq!(computed_values(&trade), (Some(1), Some("0.3333".into())));
    trade.planned_risk_minor = Some(0);
    assert_eq!(computed_values(&trade), (Some(1), None));
    trade.net_pnl_minor = None;
    trade.gross_pnl_minor = None;
    assert_eq!(computed_values(&trade), (None, None));
}

#[test]
fn cloud_validation_retains_native_status_score_override_and_account_rules() {
    let base = input();
    for status in [
        "draft",
        "planned",
        "open",
        "closed",
        "cancelled",
        "archived",
    ] {
        let mut trade = base.clone();
        trade.status = Some(status.into());
        assert!(validate_input(&trade).is_ok());
    }
    let mut bad = Vec::new();
    let mut trade = base.clone();
    trade.account_id.clear();
    bad.push(trade);
    let mut trade = base.clone();
    trade.instrument = "x".repeat(33);
    bad.push(trade);
    let mut trade = base.clone();
    trade.direction = "buy".into();
    bad.push(trade);
    let mut trade = base.clone();
    trade.status = Some("trashed".into());
    bad.push(trade);
    let mut trade = base.clone();
    trade.closed_at = None;
    bad.push(trade);
    let mut trade = base.clone();
    trade.process_score = Some(0);
    bad.push(trade);
    let mut trade = base.clone();
    trade.execution_score = Some(11);
    bad.push(trade);
    let mut trade = base.clone();
    trade.r_override = Some("2".into());
    bad.push(trade);
    for trade in bad {
        assert!(validate_trade(&trade).is_err());
        assert_eq!(validate_input(&trade).unwrap_err().code, "VALIDATION_ERROR");
    }
}

#[test]
fn cloud_rejects_money_overflow_before_native_arithmetic() {
    let mut trade = input();
    trade.gross_pnl_minor = Some(i64::MIN);
    assert!(validate_input(&trade).is_err());
    trade.net_pnl_minor = Some(1);
    assert!(validate_input(&trade).is_ok()); // explicit net never subtracts costs again
}

#[test]
fn pagination_sort_and_empty_filters_preserve_desktop_contract() {
    assert_eq!(page_spec(&TradeFilter::default()), (1, 50, 0));
    let filter = TradeFilter {
        page: Some(0),
        page_size: Some(0),
        ..Default::default()
    };
    assert_eq!(page_spec(&filter), (1, 1, 0));
    let filter = TradeFilter {
        page: Some(u32::MAX),
        page_size: Some(1000),
        ..Default::default()
    };
    assert_eq!(page_spec(&filter), (u32::MAX, 250, 1_073_741_823_500));
    assert_eq!(sort_spec(&filter).2, "NULLS LAST");
    assert_eq!(
        sort_spec(&TradeFilter {
            sort_direction: Some("asc".into()),
            ..Default::default()
        })
        .2,
        "NULLS FIRST"
    );
    assert!(nonempty(&Some(vec![])).is_none());
    assert!(nonempty(&None).is_none());
    assert_eq!(
        nonempty(&Some(vec!["x".into()])),
        Some(["x".to_owned()].as_slice())
    );
}

fn normalized(mut value: Value) -> Value {
    match &mut value {
        Value::Object(object) => {
            object.remove("createdAt");
            object.remove("updatedAt");
            object.remove("generatedAt");
            object.remove("deletedAt");
            for value in object.values_mut() {
                *value = normalized(value.take());
            }
        }
        Value::Array(values) => {
            for value in values.iter_mut() {
                *value = normalized(value.take());
            }
            if values
                .first()
                .is_some_and(|value| value.get("key").is_some())
            {
                values.sort_by_key(|value| value["key"].to_string());
            }
        }
        _ => {}
    }
    value
}

async fn cloud(db: &mut PgConnection, command: &str, args: Value) -> CloudResult<Value> {
    dispatch(db, command, &args).await
}

/// The integration harness supplies an isolated PostgreSQL transaction.
/// The independent desktop oracle lives only in an in-memory SQLite database.
async fn assert_postgres_parity(db: &mut PgConnection) -> CloudResult<()> {
    use crate::repositories::trades as native;
    let sqlite = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await?;
    sqlx::migrate!("./migrations")
        .run(&sqlite)
        .await
        .map_err(|_| {
            CloudError::new(
                "TEST_SETUP",
                "Temporäre SQLite-Testdatenbank konnte nicht erstellt werden.",
            )
        })?;
    let now = "2026-01-01T00:00:00Z";
    for account in ["trade-parity-a", "trade-parity-b"] {
        sqlx::query("INSERT INTO accounts(id,name,created_at,updated_at) VALUES($1,$1,$2,$2)")
            .bind(account)
            .bind(now)
            .execute(&mut *db)
            .await?;
        sqlx::query("INSERT INTO accounts(id,name,created_at,updated_at) VALUES(?,?,?,?)")
            .bind(account)
            .bind(account)
            .bind(now)
            .bind(now)
            .execute(&sqlite)
            .await?;
    }
    sqlx::query("INSERT INTO accounts(id,name,is_archived,created_at,updated_at) VALUES('trade-parity-archived','Archived',TRUE,$1,$1)")
        .bind(now).execute(&mut *db).await?;
    for (id, name) in [
        ("parity-setup", "Range Setup"),
        ("parity-setup-2", "Überblick"),
    ] {
        sqlx::query("INSERT INTO setups(id,name,created_at,updated_at) VALUES($1,$2,$3,$3)")
            .bind(id)
            .bind(name)
            .bind(now)
            .execute(&mut *db)
            .await?;
        sqlx::query("INSERT INTO setups(id,name,created_at,updated_at) VALUES(?,?,?,?)")
            .bind(id)
            .bind(name)
            .bind(now)
            .bind(now)
            .execute(&sqlite)
            .await?;
    }
    let mut fixtures = Vec::new();
    let mut win = input();
    win.id = Some("parity-win".into());
    win.setup_id = Some("parity-setup".into());
    win.followed_plan = Some(true);
    win.followed_risk_rules = Some(true);
    win.followed_entry_rules = Some(true);
    win.followed_exit_rules = Some(true);
    win.process_score = Some(8);
    win.session = Some("London".into());
    fixtures.push(win);
    let mut loss = input();
    loss.id = Some("parity-loss".into());
    loss.net_pnl_minor = Some(-5000);
    loss.direction = "short".into();
    loss.followed_plan = Some(false);
    loss.instrument = "GBPUSD".into();
    loss.opened_at = Some("2026-01-05T08:00:00Z".into());
    loss.closed_at = Some("2026-01-05T12:00:00Z".into());
    loss.r_override = Some("99".into());
    loss.r_override_reason = Some("Override context".into());
    fixtures.push(loss);
    let mut zero = input();
    zero.id = Some("parity-zero".into());
    zero.net_pnl_minor = Some(0);
    zero.planned_risk_minor = None;
    zero.setup_id = Some("parity-setup-2".into());
    fixtures.push(zero);
    let mut missing = input();
    missing.id = Some("parity-missing".into());
    missing.gross_pnl_minor = None;
    fixtures.push(missing);
    let mut open = input();
    open.id = Some("parity-open".into());
    open.status = Some("open".into());
    open.closed_at = None;
    open.net_pnl_minor = Some(900);
    fixtures.push(open);
    let mut draft = input();
    draft.id = Some("parity-draft".into());
    draft.status = Some("draft".into());
    fixtures.push(draft);
    let mut other = input();
    other.id = Some("parity-other".into());
    other.account_id = "trade-parity-b".into();
    fixtures.push(other);
    let mut big = input();
    big.id = Some("parity-big".into());
    big.net_pnl_minor = Some(3_000_000_000);
    big.closed_at = Some("2026-02-02T12:00:00Z".into());
    fixtures.push(big);
    for trade in fixtures {
        let actual = create(&mut *db, trade.clone()).await?;
        let expected = native::create(&sqlite, trade).await?;
        assert_eq!(normalized(encoded(actual)?), normalized(encoded(expected)?));
    }
    let base = scope_trade_filter("trade-parity-a", None);
    let mut filters = vec![base.clone()];
    for search in ["usd", "range", "%", "_", "\\", "über", "ÜBER"] {
        filters.push(TradeFilter {
            search: Some(search.into()),
            ..base.clone()
        });
    }
    for sort in [
        "instrument",
        "netPnlMinor",
        "calculatedR",
        "processScore",
        "openedAt",
        "closedAt",
        "invalid",
    ] {
        for direction in ["asc", "desc"] {
            filters.push(TradeFilter {
                sort_by: Some(sort.into()),
                sort_direction: Some(direction.into()),
                ..base.clone()
            });
        }
    }
    for violation in [true, false] {
        filters.push(TradeFilter {
            has_rule_violation: Some(violation),
            ..base.clone()
        });
    }
    filters.push(TradeFilter {
        setup_ids: Some(vec!["parity-setup".into()]),
        directions: Some(vec!["long".into()]),
        statuses: Some(vec!["closed".into()]),
        min_process_score: Some(5),
        ..base.clone()
    });
    filters.push(TradeFilter {
        instruments: Some(vec!["GBPUSD".into()]),
        ..base.clone()
    });
    filters.push(TradeFilter {
        date_from: Some("2026-02-01".into()),
        date_to: Some("2026-02-28".into()),
        ..base.clone()
    });
    filters.push(TradeFilter {
        setup_ids: Some(vec![]),
        instruments: Some(vec![]),
        page: Some(2),
        page_size: Some(2),
        ..base.clone()
    });
    for filter in filters {
        let actual = list(&mut *db, filter.clone()).await?;
        let expected = native::list(&sqlite, filter).await?;
        assert_eq!(normalized(encoded(actual)?), normalized(encoded(expected)?));
    }
    let scoped = cloud(
        &mut *db,
        "list_trades",
        json!({"accountId":"trade-parity-a","filter":{"accountIds":["trade-parity-b"]}}),
    )
    .await?;
    assert_eq!(scoped["total"], 7);
    for account in ["", "trade-parity-archived", "missing"] {
        assert!(
            cloud(&mut *db, "list_trades", json!({"accountId":account}))
                .await
                .is_err()
        );
    }
    for command in [
        "get_trade",
        "trash_trade",
        "restore_trade",
        "duplicate_trade",
    ] {
        let error = cloud(
            &mut *db,
            command,
            json!({"accountId":"trade-parity-a","id":"parity-other"}),
        )
        .await
        .unwrap_err();
        assert_eq!(error.code, "NOT_FOUND");
    }
    let mut update_input = input();
    update_input.net_pnl_minor = Some(11_111);
    let actual = update(&mut *db, "parity-win", update_input.clone()).await?;
    let expected = native::update(&sqlite, "parity-win", update_input).await?;
    assert_eq!(normalized(encoded(actual)?), normalized(encoded(expected)?));
    let mut wrong = input();
    wrong.account_id = "trade-parity-b".into();
    assert_eq!(
        update(&mut *db, "parity-win", wrong)
            .await
            .unwrap_err()
            .code,
        "NOT_FOUND"
    );

    // Duplicate copies tags/checklist requirements but resets results and checks.
    sqlx::query("INSERT INTO tags(id,name,created_at) VALUES('parity-tag','Tag',$1)")
        .bind(now)
        .execute(&mut *db)
        .await?;
    sqlx::query("INSERT INTO trade_tags(trade_id,tag_id) VALUES('parity-win','parity-tag')")
        .execute(&mut *db)
        .await?;
    sqlx::query("INSERT INTO trade_checklist_items(id,trade_id,label_snapshot,is_required,is_checked,note,sort_order) VALUES('parity-check','parity-win','Rule',TRUE,TRUE,'Context',4)").execute(&mut *db).await?;
    let copy = duplicate(&mut *db, "parity-win", "trade-parity-a").await?;
    assert_eq!(copy.status, "draft");
    assert_eq!(copy.net_pnl_minor, None);
    assert_eq!(copy.opened_at, None);
    assert_eq!(copy.closed_at, None);
    let checked:(bool,Option<bool>,Option<String>,i64)=sqlx::query_as("SELECT is_required,is_checked,note,sort_order FROM trade_checklist_items WHERE trade_id=$1")
        .bind(&copy.id).fetch_one(&mut *db).await?;
    assert_eq!(checked, (true, None, Some("Context".into()), 4));
    let tag_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM trade_tags WHERE trade_id=$1")
        .bind(&copy.id)
        .fetch_one(&mut *db)
        .await?;
    assert_eq!(tag_count, 1);
    trash(&mut *db, &copy.id, "trade-parity-a").await?;

    trash(&mut *db, "parity-loss", "trade-parity-a").await?;
    native::trash(&sqlite, "parity-loss", "trade-parity-a").await?;
    assert!(
        get(&mut *db, "parity-loss", "trade-parity-a")
            .await
            .is_err()
    );
    assert!(list_deleted(&mut *db, "trade-parity-b").await?.is_empty());
    let deleted = list_deleted(&mut *db, "trade-parity-a").await?;
    assert!(deleted.iter().any(|trade| trade.id == "parity-loss"));
    let actual = restore(&mut *db, "parity-loss", "trade-parity-a").await?;
    let expected = native::restore(&sqlite, "parity-loss", "trade-parity-a").await?;
    assert_eq!(normalized(encoded(actual)?), normalized(encoded(expected)?));

    for filter in [
        None,
        Some(TradeFilter {
            date_from: Some("2026-02-01".into()),
            ..Default::default()
        }),
        Some(TradeFilter {
            statuses: Some(vec!["draft".into()]),
            search: Some("missing".into()),
            ..Default::default()
        }),
    ] {
        let actual = dashboard(
            &mut *db,
            scope_trade_filter("trade-parity-a", filter.clone()),
        )
        .await?;
        let expected =
            crate::commands::calculate_dashboard_for_pool(&sqlite, "trade-parity-a", filter)
                .await
                .map_err(|_| {
                    CloudError::new(
                        "TEST_ORACLE",
                        "Die lokale Testberechnung ist fehlgeschlagen.",
                    )
                })?;
        assert_eq!(normalized(encoded(actual)?), normalized(encoded(expected)?));
    }
    let actual = cloud(
        &mut *db,
        "calculate_calendar",
        json!({"accountId":"trade-parity-a"}),
    )
    .await?;
    let expected = crate::commands::calculate_calendar_for_pool(&sqlite, "trade-parity-a", None)
        .await
        .map_err(|_| {
            CloudError::new("TEST_ORACLE", "Der lokale Testkalender ist fehlgeschlagen.")
        })?;
    assert_eq!(actual, encoded(expected)?);
    sqlite.close().await;
    Ok(())
}

#[tokio::test]
#[ignore = "Requires explicit MACRO_TEST_ENV_FILE; creates and removes its own isolated Neon schema"]
async fn postgres_trade_and_analytics_match_sqlite_contract() {
    use futures_util::FutureExt;
    let fixture = crate::cloud_postgres::test_support::TestDatabase::open().await;
    let mut transaction = fixture
        .pool
        .begin()
        .await
        .unwrap_or_else(|_| panic!("Could not open isolated test transaction"));
    let result = std::panic::AssertUnwindSafe(assert_postgres_parity(&mut transaction))
        .catch_unwind()
        .await;
    transaction
        .rollback()
        .await
        .unwrap_or_else(|_| panic!("Could not roll back isolated test transaction"));
    fixture.close().await;
    match result {
        Ok(result) => result.unwrap(),
        Err(panic) => std::panic::resume_unwind(panic),
    }
}
