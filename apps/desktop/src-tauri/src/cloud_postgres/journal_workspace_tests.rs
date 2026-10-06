use super::*;
use crate::cloud_postgres::workspace;
use serde_json::json;

fn context_value() -> Value {
    json!({
        "tradeId": "pg-contract-trade-a",
        "tagIds": [],
        "legs": [],
        "checklistItems": [],
        "emotions": [],
        "customValues": []
    })
}

fn context(value: Value) -> TradeContextInput {
    serde_json::from_value(value).unwrap()
}

#[test]
fn context_retains_native_leg_completeness_and_type_validation() {
    for kind in ["entry", "exit"] {
        let mut input = context_value();
        input["legs"] = json!([{
            "legType": kind, "occurredAt": "2026-09-24T12:00:00Z",
            "price": "1.1234567890123456789", "quantity": "0.00001"
        }]);
        assert!(validate_context(&context(input.clone())).is_ok());
        for field in ["occurredAt", "price", "quantity"] {
            let mut invalid = input.clone();
            invalid["legs"][0][field] = json!("  ");
            assert!(validate_context(&context(invalid)).is_err(), "{field}");
        }
        input["legs"][0]["legType"] = json!("withdrawal");
        assert!(validate_context(&context(input)).is_err());
    }
}

#[test]
fn context_emotion_limits_include_both_endpoints_and_all_three_phases() {
    for phase in ["before", "during", "after"] {
        for intensity in [1, 10] {
            let mut input = context_value();
            input["emotions"] = json!([{
                "emotionId": "e", "phase": phase, "intensity": intensity
            }]);
            assert!(validate_context(&context(input)).is_ok());
        }
    }
    for (phase, intensity) in [("before", 0), ("after", 11), ("unknown", 5)] {
        let mut input = context_value();
        input["emotions"] = json!([{
            "emotionId": "e", "phase": phase, "intensity": intensity
        }]);
        assert!(validate_context(&context(input)).is_err());
    }
}

#[test]
fn context_contract_preserves_nullable_checklist_and_decimal_strings() {
    let mut input = context_value();
    input["checklistItems"] = json!([
        {"label": "Unknown", "isChecked": null},
        {"label": "False", "isChecked": false},
        {"label": "True", "isChecked": true}
    ]);
    input["legs"] = json!([{
        "legType": "entry", "occurredAt": "2026-09-24T12:00:00Z",
        "price": "1.1234567890123456789", "quantity": "0.00001", "feesMinor": 0
    }]);
    let parsed = context(input);
    assert_eq!(parsed.checklist_items[0].is_checked, None);
    assert_eq!(parsed.checklist_items[1].is_checked, Some(false));
    assert_eq!(parsed.checklist_items[2].is_checked, Some(true));
    assert_eq!(parsed.legs[0].price, "1.1234567890123456789");
    assert_eq!(parsed.legs[0].fees_minor, Some(0));
}

#[test]
fn journal_and_workspace_allowlists_separate_reads_and_writes() {
    let methods: std::collections::HashMap<_, _> = COMMANDS
        .iter()
        .chain(workspace::COMMANDS)
        .copied()
        .collect();
    assert_eq!(methods.len(), 18);
    assert_eq!(methods.values().filter(|write| **write).count(), 10);
    assert_eq!(methods.get("get_trade_context"), Some(&false));
    assert_eq!(methods.get("save_trade_context"), Some(&true));
    assert_eq!(methods.get("delete_custom_field"), Some(&true));
    assert!(!methods.contains_key("import_legacy_database"));
}

async fn journal_call(db: &mut PgConnection, name: &str, args: Value) -> CloudResult<Value> {
    dispatch(db, name, &args).await
}

async fn workspace_call(db: &mut PgConnection, name: &str, args: Value) -> CloudResult<Value> {
    workspace::dispatch(db, name, &args).await
}

/// Called by the root integration suite inside an isolated test-schema transaction.
/// Deliberately does not acquire a connection, create a schema, or commit anything.
pub(in crate::cloud_postgres) async fn assert_journal_workspace_contract(
    db: &mut PgConnection,
) -> CloudResult<()> {
    let now = "2026-09-24T12:00:00Z";
    for id in ["pg-contract-account-a", "pg-contract-account-b"] {
        sqlx::query(
            "INSERT INTO accounts (id, name, created_at, updated_at) VALUES ($1, $1, $2, $2)",
        )
        .bind(id)
        .bind(now)
        .execute(&mut *db)
        .await?;
    }
    sqlx::query("INSERT INTO setups (id, name, created_at, updated_at) VALUES ('pg-contract-setup', 'PG Contract Setup', $1, $1)")
        .bind(now).execute(&mut *db).await?;
    for (id, account, deleted) in [
        ("pg-contract-trade-a", "pg-contract-account-a", false),
        ("pg-contract-trade-b", "pg-contract-account-b", false),
        ("pg-contract-trade-deleted", "pg-contract-account-a", true),
    ] {
        sqlx::query("INSERT INTO trades (id, account_id, setup_id, status, instrument, asset_class, direction, display_timezone, is_deleted, created_at, updated_at) VALUES ($1, $2, 'pg-contract-setup', 'closed', 'EURUSD', 'forex', 'long', 'UTC', $3, $4, $4)")
            .bind(id).bind(account).bind(deleted).bind(now).execute(&mut *db).await?;
    }
    sqlx::query(
        "INSERT INTO tags (id, name, created_at) VALUES ('pg-contract-tag', 'PG Contract Tag', $1)",
    )
    .bind(now)
    .execute(&mut *db)
    .await?;
    sqlx::query("INSERT INTO emotions (id, name, created_at) VALUES ('pg-contract-emotion', 'PG Contract Emotion', $1)")
        .bind(now).execute(&mut *db).await?;
    for id in ["pg-contract-mistake", "pg-contract-unused"] {
        sqlx::query(
            "INSERT INTO mistakes (id, name, created_at, updated_at) VALUES ($1, $1, $2, $2)",
        )
        .bind(id)
        .bind(now)
        .execute(&mut *db)
        .await?;
    }

    let field = journal_call(
        db,
        "save_custom_field",
        json!({"input": {
            "id": "pg-contract-field", "entityType": "trade", "name": " PG Contract Field ",
            "fieldType": "text", "isRequired": true, "optionsJson": "[]", "sortOrder": 2
        }}),
    )
    .await?;
    assert_eq!(field["name"], "PG Contract Field");
    assert_eq!(field["isRequired"], true);
    let fields = journal_call(db, "list_custom_fields", json!({"entityType": "trade"})).await?;
    assert!(
        fields
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v["id"] == "pg-contract-field")
    );

    let view = journal_call(db, "save_saved_view", json!({"input": {
        "id": "pg-contract-view", "name": " PG Contract View ", "scope": "trades", "stateJson": "{\"unknown\":null,\"zero\":0}"
    }})).await?;
    assert_eq!(view["name"], "PG Contract View");
    let updated = journal_call(db, "save_saved_view", json!({"input": {
        "id": "pg-contract-view", "name": "Changed", "scope": "trades", "stateJson": "{\"zero\":0}"
    }})).await?;
    assert_eq!(updated["createdAt"], view["createdAt"]);
    let views = journal_call(db, "list_saved_views", json!({"scope": "trades"})).await?;
    assert!(
        views
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v["id"] == "pg-contract-view")
    );
    journal_call(db, "delete_saved_view", json!({"id": "pg-contract-view"})).await?;

    let mut input = context_value();
    input["tagIds"] = json!(["pg-contract-tag", "pg-contract-tag"]);
    input["legs"] = json!([{
        "id": "pg-contract-leg", "legType": "entry", "occurredAt": now,
        "price": "1.1234567890123456789", "quantity": "0.00001", "feesMinor": 0
    }]);
    input["checklistItems"] = json!([
        {"label": "Unknown", "isRequired": true, "isChecked": null},
        {"label": "Unchecked", "isChecked": false},
        {"label": "Checked", "isChecked": true},
        {"label": "  ", "isChecked": true}
    ]);
    input["emotions"] = json!([
        {"emotionId": "pg-contract-emotion", "phase": "before", "intensity": 1, "note": "first"},
        {"emotionId": "pg-contract-emotion", "phase": "before", "intensity": 10, "note": "last"}
    ]);
    input["customValues"] = json!([{"customFieldId": "pg-contract-field", "valueJson": "null"}]);
    let stored = journal_call(
        db,
        "save_trade_context",
        json!({"accountId": "pg-contract-account-a", "input": input}),
    )
    .await?;
    assert_eq!(stored["tags"].as_array().unwrap().len(), 1);
    assert_eq!(stored["emotions"].as_array().unwrap().len(), 1);
    assert_eq!(stored["emotions"][0]["intensity"], 10);
    assert_eq!(stored["emotions"][0]["note"], "last");
    assert_eq!(stored["checklistItems"].as_array().unwrap().len(), 3);
    assert!(stored["checklistItems"][0]["isChecked"].is_null());
    assert_eq!(stored["checklistItems"][1]["isChecked"], false);
    assert_eq!(stored["checklistItems"][2]["isChecked"], true);
    assert_eq!(stored["legs"][0]["price"], "1.1234567890123456789");
    let read = journal_call(
        db,
        "get_trade_context",
        json!({"accountId": "pg-contract-account-a", "tradeId": "pg-contract-trade-a"}),
    )
    .await?;
    assert_eq!(read, stored);
    for trade_id in ["pg-contract-trade-b", "pg-contract-trade-deleted"] {
        let denied = journal_call(
            db,
            "get_trade_context",
            json!({"accountId": "pg-contract-account-a", "tradeId": trade_id}),
        )
        .await
        .unwrap_err();
        assert_eq!(denied.code, "NOT_FOUND");
    }
    let denied = journal_call(
        db,
        "save_trade_context",
        json!({"accountId": "pg-contract-account-b", "input": context_value()}),
    )
    .await
    .unwrap_err();
    assert_eq!(denied.code, "NOT_FOUND");
    let preserved = journal_call(
        db,
        "get_trade_context",
        json!({"accountId": "pg-contract-account-a", "tradeId": "pg-contract-trade-a"}),
    )
    .await?;
    assert_eq!(preserved, stored);
    journal_call(
        db,
        "delete_custom_field",
        json!({"id": "pg-contract-field"}),
    )
    .await?;
    let after_delete = journal_call(
        db,
        "get_trade_context",
        json!({"accountId": "pg-contract-account-a", "tradeId": "pg-contract-trade-a"}),
    )
    .await?;
    assert_eq!(after_delete["customValues"], json!([]));

    let review = |id: &str, account: &str| {
        json!({"input": {
            "id": id, "accountId": account, "reviewType": "weekly", "periodStart": "2026-09-21",
            "periodEnd": "2026-09-27", "status": "completed", "metricSnapshot": {"pnl": 0, "r": null}, "processRating": 10
        }})
    };
    let saved_review = workspace_call(
        db,
        "save_review",
        review("pg-contract-review-a", "pg-contract-account-a"),
    )
    .await?;
    assert!(saved_review["completedAt"].is_string());
    workspace_call(
        db,
        "save_review",
        review("pg-contract-review-b", "pg-contract-account-b"),
    )
    .await?;
    let denied = workspace_call(
        db,
        "save_review",
        review("pg-contract-review-a", "pg-contract-account-b"),
    )
    .await
    .unwrap_err();
    assert_eq!(denied.code, "NOT_FOUND");
    let reviews = workspace_call(
        db,
        "list_reviews",
        json!({"accountId": "pg-contract-account-a"}),
    )
    .await?;
    assert_eq!(reviews.as_array().unwrap().len(), 1);
    assert_eq!(reviews[0], saved_review);

    let goal = workspace_call(
        db,
        "save_goal",
        json!({"input": {
            "id": "pg-contract-goal", "name": "PG Contract Goal", "metricKey": "expectancy",
            "targetValue": "0.100000000000000001", "unit": "R", "direction": "at_least",
            "startsAt": now, "status": "active"
        }}),
    )
    .await?;
    assert_eq!(goal["targetValue"], "0.100000000000000001");
    assert!(goal["latestValue"].is_null());
    workspace_call(
        db,
        "record_goal_progress",
        json!({"input": {"goalId": "pg-contract-goal", "value": "-0.250000000000000001"}}),
    )
    .await?;
    let goals = workspace_call(db, "list_goals", json!({})).await?;
    let goal = goals
        .as_array()
        .unwrap()
        .iter()
        .find(|g| g["id"] == "pg-contract-goal")
        .unwrap();
    assert_eq!(goal["latestValue"], "-0.250000000000000001");
    for note in ["v1", "v2"] {
        workspace_call(db, "create_setup_version", json!({"input": {
            "setupId": "pg-contract-setup", "rules": {"entry": "known"}, "checklist": [], "examples": [], "notesHtml": note
        }})).await?;
    }
    for account in [
        None,
        Some("pg-contract-account-a"),
        Some("pg-contract-account-b"),
    ] {
        let playbook = workspace_call(db, "list_playbook", json!({"accountId": account})).await?;
        let setup = playbook
            .as_array()
            .unwrap()
            .iter()
            .find(|s| s["id"] == "pg-contract-setup")
            .unwrap();
        assert_eq!(setup["version"], 2);
        assert_eq!(setup["notesHtml"], "v2");
        assert_eq!(
            setup["tradeCount"],
            if account.is_some() {
                json!(1)
            } else {
                Value::Null
            }
        );
    }
    for (account, trade_id, severity, cost) in [
        ("pg-contract-account-a", "pg-contract-trade-a", 4, None),
        ("pg-contract-account-a", "pg-contract-trade-a", 3, Some(-25)),
        (
            "pg-contract-account-b",
            "pg-contract-trade-b",
            5,
            Some(5000),
        ),
    ] {
        workspace_call(db, "assign_trade_mistake", json!({"accountId": account, "input": {
            "tradeId": trade_id, "mistakeId": "pg-contract-mistake", "severity": severity, "estimatedCostMinor": cost, "note": "unchanged units"
        }})).await?;
    }
    sqlx::query("INSERT INTO trade_mistakes (trade_id, mistake_id, severity, estimated_cost_minor) VALUES ('pg-contract-trade-deleted', 'pg-contract-mistake', 5, 9000)")
        .execute(&mut *db).await?;
    let mistakes = workspace_call(
        db,
        "list_trade_mistakes",
        json!({"accountId": "pg-contract-account-a", "tradeId": "pg-contract-trade-a"}),
    )
    .await?;
    assert_eq!(mistakes[0]["severity"], 3);
    assert_eq!(mistakes[0]["estimatedCostMinor"], -25);
    let denied = workspace_call(
        db,
        "list_trade_mistakes",
        json!({"accountId": "pg-contract-account-a", "tradeId": "pg-contract-trade-b"}),
    )
    .await
    .unwrap_err();
    assert_eq!(denied.code, "NOT_FOUND");
    let analytics = workspace_call(
        db,
        "get_mistake_analytics",
        json!({"accountId": "pg-contract-account-a"}),
    )
    .await?;
    let used = analytics
        .as_array()
        .unwrap()
        .iter()
        .find(|m| m["id"] == "pg-contract-mistake")
        .unwrap();
    assert_eq!(used["occurrences"], 1);
    assert_eq!(used["estimatedCostMinor"], -25);
    assert_eq!(used["averageSeverity"], 3.0);
    let unused = analytics
        .as_array()
        .unwrap()
        .iter()
        .find(|m| m["id"] == "pg-contract-unused")
        .unwrap();
    assert_eq!(unused["occurrences"], 0);
    assert_eq!(unused["estimatedCostMinor"], 0);
    assert!(unused["averageSeverity"].is_null());
    Ok(())
}

/// Run in a fresh outer transaction AFTER the contract fixture was committed.
/// Expect a foreign-key failure; roll back the outer transaction and assert that
/// the original pg-contract-leg/tag/checklist/emotion rows are still present.
pub(in crate::cloud_postgres) async fn fail_after_replacing_context(
    db: &mut PgConnection,
) -> CloudResult<Value> {
    let mut input = context_value();
    input["tagIds"] = json!(["pg-contract-tag-does-not-exist"]);
    journal_call(
        db,
        "save_trade_context",
        json!({"accountId": "pg-contract-account-a", "input": input}),
    )
    .await
}
