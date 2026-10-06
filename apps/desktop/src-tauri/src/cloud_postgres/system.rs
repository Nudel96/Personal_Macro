use super::{
    CloudError, CloudResult,
    common::{argument, encoded, require_active_account},
};
use crate::{
    commands::{
        AccountCashflow, AccountCashflowInput, AccountInput, AccountJournal, SettingInput,
        SettingsResponse,
    },
    domain::models::{
        Account, BootstrapData, EmotionItem, MistakeItem, NamedEntityInput, TaxonomyItem,
    },
    metrics::{
        CALCULATION_VERSION,
        account_journal::{CapitalEvent, capital_curve},
    },
};
use chrono::Utc;
use serde_json::{Value, json};
use sqlx::PgConnection;
use uuid::Uuid;

pub(super) const COMMANDS: &[(&str, bool)] = &[
    ("get_bootstrap_data", false),
    ("get_settings", false),
    ("update_setting", true),
    ("get_account_journal", false),
    ("save_account", true),
    ("archive_account", true),
    ("list_account_cashflows", false),
    ("add_account_cashflow", true),
    ("create_strategy", true),
    ("create_setup", true),
    ("create_tag", true),
];

const ACCOUNT_COLUMNS: &str = "a.id, a.name, a.broker, a.account_type, a.base_currency, a.initial_balance_minor, a.default_risk_percent, a.is_archived, COALESCE((SELECT c.balance_minor FROM broker_account_connections c WHERE c.local_account_id=a.id AND c.balance_minor IS NOT NULL LIMIT 1), (a.initial_balance_minor::numeric + COALESCE((SELECT SUM(ac.amount_minor) FROM account_cashflows ac WHERE ac.account_id=a.id),0) + COALESCE((SELECT SUM(t.net_pnl_minor) FROM trades t WHERE t.account_id=a.id AND t.status='closed' AND NOT t.is_deleted),0))::bigint) AS current_balance_minor";

pub(super) async fn dispatch(
    connection: &mut PgConnection,
    name: &str,
    args: &Value,
) -> CloudResult<Value> {
    match name {
        "get_bootstrap_data" => encoded(bootstrap(connection).await?),
        "get_settings" => encoded(settings(connection).await?),
        "update_setting" => {
            update_setting(connection, argument(args, "input")?).await?;
            Ok(Value::Null)
        }
        "get_account_journal" => {
            encoded(account_journal(connection, &argument::<String>(args, "accountId")?).await?)
        }
        "save_account" => encoded(save_account(connection, argument(args, "input")?).await?),
        "archive_account" => {
            archive_account(connection, &argument::<String>(args, "id")?).await?;
            Ok(Value::Null)
        }
        "list_account_cashflows" => {
            encoded(cashflows(connection, &argument::<String>(args, "accountId")?).await?)
        }
        "add_account_cashflow" => {
            encoded(add_cashflow(connection, argument(args, "input")?).await?)
        }
        "create_strategy" => {
            encoded(create_taxonomy(connection, "strategies", argument(args, "input")?).await?)
        }
        "create_setup" => {
            encoded(create_taxonomy(connection, "setups", argument(args, "input")?).await?)
        }
        "create_tag" => {
            encoded(create_taxonomy(connection, "tags", argument(args, "input")?).await?)
        }
        _ => Err(CloudError::new(
            "COMMAND_UNAVAILABLE",
            "Diese Funktion ist nicht verfügbar.",
        )),
    }
}

async fn bootstrap(connection: &mut PgConnection) -> CloudResult<BootstrapData> {
    let accounts = sqlx::query_as::<_, Account>(&format!(
        "SELECT {ACCOUNT_COLUMNS} FROM accounts a WHERE NOT a.is_archived ORDER BY a.name"
    ))
    .fetch_all(&mut *connection)
    .await?;
    let strategies = sqlx::query_as::<_, TaxonomyItem>(
        "SELECT id,name,color FROM strategies WHERE NOT is_archived ORDER BY name",
    )
    .fetch_all(&mut *connection)
    .await?;
    let setups = sqlx::query_as::<_, TaxonomyItem>(
        "SELECT id,name,color FROM setups WHERE NOT is_archived ORDER BY name",
    )
    .fetch_all(&mut *connection)
    .await?;
    let tags = sqlx::query_as::<_, TaxonomyItem>("SELECT id,name,color FROM tags ORDER BY name")
        .fetch_all(&mut *connection)
        .await?;
    let emotions = sqlx::query_as::<_, EmotionItem>(
        "SELECT id,name,valence,color FROM emotions ORDER BY name",
    )
    .fetch_all(&mut *connection)
    .await?;
    let mistakes = sqlx::query_as::<_, MistakeItem>("SELECT id,name,category,color,severity_default FROM mistakes WHERE NOT is_archived ORDER BY name")
        .fetch_all(&mut *connection).await?;
    Ok(BootstrapData {
        accounts,
        strategies,
        setups,
        tags,
        emotions,
        mistakes,
        database_path: String::new(),
        app_data_path: String::new(),
        calculation_version: CALCULATION_VERSION.into(),
    })
}

fn validate_account(input: &AccountInput) -> CloudResult<()> {
    if input.name.trim().is_empty()
        || input.base_currency.trim().len() != 3
        || !input
            .base_currency
            .trim()
            .bytes()
            .all(|c| c.is_ascii_alphabetic())
        || !(0..=9_007_199_254_740_991).contains(&input.initial_balance_minor)
    {
        return Err(CloudError::validation(
            "Kontoname, dreistellige Basiswährung und ein gültiges Startkapital ab 0 sind erforderlich.",
        ));
    }
    if !input.default_risk_percent.is_finite()
        || input.default_risk_percent <= 0.0
        || input.default_risk_percent > 25.0
    {
        return Err(CloudError::validation(
            "Das Standardrisiko muss zwischen 0 und 25 Prozent liegen.",
        ));
    }
    Ok(())
}

async fn save_account(connection: &mut PgConnection, input: AccountInput) -> CloudResult<Account> {
    validate_account(&input)?;
    if let Some(id) = &input.id {
        require_active_account(&mut *connection, id).await?;
        let currency: String = sqlx::query_scalar("SELECT base_currency FROM accounts WHERE id=$1")
            .bind(id)
            .fetch_one(&mut *connection)
            .await?;
        if currency != input.base_currency.trim().to_uppercase() {
            return Err(CloudError::validation(
                "Die Währung eines bestehenden Kontos bleibt erhalten.",
            ));
        }
    }
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO accounts(id,name,broker,account_type,base_currency,initial_balance_minor,default_risk_percent,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) ON CONFLICT(id) DO UPDATE SET name=excluded.name,broker=excluded.broker,account_type=excluded.account_type,base_currency=excluded.base_currency,initial_balance_minor=excluded.initial_balance_minor,default_risk_percent=excluded.default_risk_percent,updated_at=excluded.updated_at")
        .bind(&id).bind(input.name.trim()).bind(input.broker).bind(input.account_type)
        .bind(input.base_currency.trim().to_uppercase()).bind(input.initial_balance_minor)
        .bind(input.default_risk_percent).bind(now).execute(&mut *connection).await?;
    Ok(sqlx::query_as::<_, Account>(&format!(
        "SELECT {ACCOUNT_COLUMNS} FROM accounts a WHERE a.id=$1"
    ))
    .bind(id)
    .fetch_one(connection)
    .await?)
}

async fn archive_account(connection: &mut PgConnection, id: &str) -> CloudResult<()> {
    require_active_account(&mut *connection, id).await?;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM accounts WHERE NOT is_archived")
        .fetch_one(&mut *connection)
        .await?;
    if count <= 1 {
        return Err(CloudError::validation(
            "Mindestens ein aktives Konto muss erhalten bleiben.",
        ));
    }
    sqlx::query("UPDATE accounts SET is_archived=TRUE,updated_at=$1 WHERE id=$2")
        .bind(Utc::now().to_rfc3339())
        .bind(id)
        .execute(connection)
        .await?;
    Ok(())
}

async fn cashflows(
    connection: &mut PgConnection,
    account_id: &str,
) -> CloudResult<Vec<AccountCashflow>> {
    require_active_account(&mut *connection, account_id).await?;
    Ok(sqlx::query_as::<_, AccountCashflow>("SELECT id,account_id,occurred_at,amount_minor,kind,note,created_at FROM account_cashflows WHERE account_id=$1 ORDER BY occurred_at DESC,id DESC")
        .bind(account_id).fetch_all(connection).await?)
}

fn validate_cashflow(input: &AccountCashflowInput) -> CloudResult<()> {
    let valid_amount = match input.kind.as_str() {
        "deposit" => input.amount_minor > 0,
        "withdrawal" => input.amount_minor < 0,
        "adjustment" => input.amount_minor != 0,
        _ => false,
    };
    if !valid_amount
        || input.amount_minor.unsigned_abs() > 9_007_199_254_740_991
        || chrono::DateTime::parse_from_rfc3339(&input.occurred_at).is_err()
    {
        return Err(CloudError::validation(
            "Bitte Buchungsart, Datum und Betrag prüfen.",
        ));
    }
    Ok(())
}

async fn add_cashflow(
    connection: &mut PgConnection,
    input: AccountCashflowInput,
) -> CloudResult<AccountCashflow> {
    validate_cashflow(&input)?;
    require_active_account(&mut *connection, &input.account_id).await?;
    let occurred_at = chrono::DateTime::parse_from_rfc3339(&input.occurred_at)
        .map_err(|_| CloudError::validation("Bitte das Buchungsdatum prüfen."))?
        .with_timezone(&Utc)
        .to_rfc3339();
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    Ok(sqlx::query_as::<_, AccountCashflow>("INSERT INTO account_cashflows(id,account_id,occurred_at,amount_minor,kind,note,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,account_id,occurred_at,amount_minor,kind,note,created_at")
        .bind(id).bind(input.account_id).bind(occurred_at).bind(input.amount_minor)
        .bind(input.kind).bind(input.note).bind(now).fetch_one(connection).await?)
}

async fn account_journal(
    connection: &mut PgConnection,
    account_id: &str,
) -> CloudResult<AccountJournal> {
    require_active_account(&mut *connection, account_id).await?;
    let (currency, initial): (String, i64) = sqlx::query_as(
        "SELECT base_currency,initial_balance_minor FROM accounts WHERE id=$1 AND NOT is_archived",
    )
    .bind(account_id)
    .fetch_one(&mut *connection)
    .await?;
    let (closed, open, missing): (i64, i64, i64) = sqlx::query_as("SELECT COUNT(*) FILTER(WHERE status='closed'),COUNT(*) FILTER(WHERE status='open'),COUNT(*) FILTER(WHERE status='closed' AND net_pnl_minor IS NULL) FROM trades WHERE account_id=$1 AND NOT is_deleted")
        .bind(account_id).fetch_one(&mut *connection).await?;
    let events = sqlx::query_as::<_, CapitalEvent>("SELECT id,occurred_at,kind,CASE kind WHEN 'deposit' THEN 'Einzahlung' WHEN 'withdrawal' THEN 'Auszahlung' ELSE 'Korrektur' END AS label,amount_minor FROM account_cashflows WHERE account_id=$1 UNION ALL SELECT id,COALESCE(closed_at,opened_at,created_at) AS occurred_at,'trade' AS kind,instrument AS label,net_pnl_minor AS amount_minor FROM trades WHERE account_id=$1 AND status='closed' AND NOT is_deleted AND net_pnl_minor IS NOT NULL")
        .bind(account_id).fetch_all(&mut *connection).await?;
    // Protect the unchanged shared i64 metric engine from overflow and the JSON
    // consumer from an integer that cannot be represented exactly in JavaScript.
    let absolute_bound = events
        .iter()
        .try_fold(i128::from(initial).abs(), |sum, event| {
            sum.checked_add(i128::from(event.amount_minor).abs())
        });
    if absolute_bound.is_none_or(|bound| bound > 9_007_199_254_740_991) {
        return Err(CloudError::validation(
            "Die Kapitalhistorie überschreitet den exakt darstellbaren Zahlenbereich.",
        ));
    }
    let broker_balance: Option<i64> = sqlx::query_scalar::<_, Option<i64>>(
        "SELECT balance_minor FROM broker_account_connections WHERE local_account_id=$1 LIMIT 1",
    )
    .bind(account_id)
    .fetch_optional(&mut *connection)
    .await?
    .flatten();
    let curve = capital_curve(initial, events);
    let last = curve
        .last()
        .expect("capital curve includes initial balance");
    let journal_balance = last.balance_minor;
    let net_pnl = last.cumulative_pnl_minor;
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

async fn create_taxonomy(
    connection: &mut PgConnection,
    table: &str,
    input: NamedEntityInput,
) -> CloudResult<TaxonomyItem> {
    let name = input.name.trim();
    if name.is_empty() || name.len() > 80 {
        return Err(CloudError::validation(
            "Name muss zwischen 1 und 80 Zeichen enthalten.",
        ));
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let color = input.color.unwrap_or_else(|| "#3b82f6".into());
    match table {
        "strategies" => {
            sqlx::query("INSERT INTO strategies(id,name,description,color,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5)")
            .bind(&id).bind(name).bind(input.description).bind(&color).bind(&now).execute(connection).await?;
        }
        "setups" => {
            sqlx::query("INSERT INTO setups(id,strategy_id,name,description,color,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$6)")
            .bind(&id).bind(input.strategy_id).bind(name).bind(input.description).bind(&color).bind(&now).execute(connection).await?;
        }
        "tags" => {
            sqlx::query("INSERT INTO tags(id,name,color,created_at) VALUES($1,$2,$3,$4)")
                .bind(&id)
                .bind(name)
                .bind(&color)
                .bind(&now)
                .execute(connection)
                .await?;
        }
        _ => return Err(CloudError::validation("Unbekannte Taxonomie.")),
    }
    Ok(TaxonomyItem {
        id,
        name: name.into(),
        color,
    })
}

pub(super) fn safe_setting_value(key: &str, value: Value) -> CloudResult<Value> {
    let object = value
        .as_object()
        .ok_or_else(|| CloudError::validation("Die Einstellung muss ein Objekt sein."))?;
    if value.to_string().len() > 16_384 {
        return Err(CloudError::validation(
            "Die Einstellung ist zu umfangreich.",
        ));
    }
    match key {
        "appearance" => {
            let theme = match object.get("theme") {
                None => "dark",
                Some(value) => value
                    .as_str()
                    .ok_or_else(|| CloudError::validation("Die Theme-Einstellung ist ungültig."))?,
            };
            let density = match object.get("density") {
                None => "comfortable",
                Some(value) => value
                    .as_str()
                    .ok_or_else(|| CloudError::validation("Die Dichteeinstellung ist ungültig."))?,
            };
            if !matches!(theme, "dark" | "light" | "system")
                || !matches!(density, "comfortable" | "compact")
            {
                return Err(CloudError::validation(
                    "Darstellung und Dichte sind ungültig.",
                ));
            }
            let collapsed = match object.get("sidebarCollapsed") {
                None => false,
                Some(value) => value.as_bool().ok_or_else(|| {
                    CloudError::validation("Die Seitenleisteneinstellung ist ungültig.")
                })?,
            };
            Ok(json!({"theme":theme,"density":density,"sidebarCollapsed":collapsed}))
        }
        "analytics" => {
            let mut result = serde_json::Map::new();
            for (name, default, minimum) in [
                ("minimumRankingSample", 10, 1),
                ("minimumCorrelationSample", 20, 5),
                ("rollingWindow", 20, 5),
            ] {
                let number = match object.get(name) {
                    None => default,
                    Some(value) => value
                        .as_u64()
                        .filter(|n| *n >= minimum && *n <= 100_000)
                        .ok_or_else(|| {
                            CloudError::validation("Die Analytics-Einstellung ist ungültig.")
                        })?,
                };
                result.insert(name.into(), json!(number));
            }
            Ok(Value::Object(result))
        }
        _ => Err(CloudError::validation(
            "Diese Einstellung kann im Browser nicht geändert werden.",
        )),
    }
}

async fn settings(connection: &mut PgConnection) -> CloudResult<SettingsResponse> {
    let rows: Vec<(String, String)> = sqlx::query_as("SELECT key,value_json FROM app_settings WHERE key IN ('appearance','analytics') ORDER BY key")
        .fetch_all(connection).await?;
    let mut settings = serde_json::Map::new();
    for (key, json) in rows {
        settings.insert(
            key.clone(),
            safe_setting_value(&key, serde_json::from_str(&json)?)?,
        );
    }
    Ok(SettingsResponse { settings })
}

async fn update_setting(connection: &mut PgConnection, input: SettingInput) -> CloudResult<()> {
    let value = safe_setting_value(&input.key, input.value)?;
    sqlx::query("INSERT INTO app_settings(key,value_json,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at")
        .bind(input.key).bind(value.to_string()).bind(Utc::now().to_rfc3339()).execute(connection).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::FutureExt;
    use std::panic::{AssertUnwindSafe, resume_unwind};

    #[test]
    fn settings_allow_only_known_properties_and_valid_types() {
        let safe = safe_setting_value("appearance", json!({"theme":"dark","density":"compact","apiKey":"never-return","nested":{"password":"hidden"}})).unwrap();
        assert_eq!(
            safe,
            json!({"theme":"dark","density":"compact","sidebarCollapsed":false})
        );
        assert!(safe_setting_value("backup", json!({"automatic":true})).is_err());
        assert!(safe_setting_value("analytics", json!({"rollingWindow":0})).is_err());
        assert!(safe_setting_value("appearance", json!({"theme":"unexpected"})).is_err());
    }

    #[test]
    fn cashflows_require_sign_date_and_exact_integer_bounds() {
        let mut input = AccountCashflowInput {
            account_id: "a".into(),
            occurred_at: "2026-09-24T12:00:00Z".into(),
            amount_minor: 100,
            kind: "deposit".into(),
            note: None,
        };
        assert!(validate_cashflow(&input).is_ok());
        input.kind = "withdrawal".into();
        assert!(validate_cashflow(&input).is_err());
        input.amount_minor = -100;
        assert!(validate_cashflow(&input).is_ok());
        input.occurred_at = "invalid".into();
        assert!(validate_cashflow(&input).is_err());
    }

    #[tokio::test]
    #[ignore = "Requires MACRO_TEST_ENV_FILE; creates and removes an isolated Neon schema"]
    async fn cloud_account_journal_matches_sqlite_and_settings_remain_private() {
        let fixture = super::super::test_support::TestDatabase::open().await;
        let result = AssertUnwindSafe(async {
        let sqlite = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&sqlite).await.unwrap();
        let scenario = r#"
            INSERT INTO accounts(id,name,base_currency,initial_balance_minor,created_at,updated_at)
              VALUES('a','Fixture A','EUR',100000,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
                    ('b','Fixture B','USD',500000,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z');
            INSERT INTO account_cashflows(id,account_id,occurred_at,amount_minor,kind,created_at)
              VALUES('deposit','a','2026-09-02T12:00:00Z',50000,'deposit','2026-09-02T12:00:00Z');
            INSERT INTO trades(id,account_id,status,instrument,direction,opened_at,closed_at,net_pnl_minor,is_deleted,created_at,updated_at)
              VALUES('closed-a','a','closed','EURUSD','long',NULL,'2026-09-01T12:00:00Z',4075,FALSE,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
                    ('closed-b','a','closed','EURUSD','long',NULL,'2026-09-03T12:00:00Z',3459,FALSE,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
                    ('missing','a','closed','EURUSD','long',NULL,'2026-09-03T12:00:00Z',NULL,FALSE,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
                    ('deleted','a','closed','EURUSD','long',NULL,'2026-09-03T12:00:00Z',99999,TRUE,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
                    ('other','b','closed','EURUSD','long',NULL,'2026-09-03T12:00:00Z',80000,FALSE,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
                    ('open','a','open','EURUSD','long',NULL,NULL,1200,FALSE,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z');
            INSERT INTO broker_account_connections(id,local_account_id,platform,external_account_id,balance_minor,created_at,updated_at)
              VALUES('broker','a','mt5','fixture',900000,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z');
        "#;
        sqlx::raw_sql(scenario).execute(&sqlite).await.unwrap();
        sqlx::raw_sql(scenario)
            .execute(&fixture.pool)
            .await
            .unwrap();
        let mut transaction = fixture.pool.begin().await.unwrap();
        let cloud = account_journal(&mut transaction, "a").await.unwrap();
        let native = crate::commands::account_journal_for_pool(&sqlite, "a")
            .await
            .unwrap();
        let cloud = serde_json::to_value(cloud).unwrap();
        let native = serde_json::to_value(native).unwrap();
        let data = bootstrap(&mut transaction).await.unwrap();
        update_setting(
            &mut transaction,
            SettingInput {
                key: "appearance".into(),
                value: json!({"theme":"dark","apiKey":"private-fixture-secret"}),
            },
        )
        .await
        .unwrap();
        sqlx::query("INSERT INTO app_settings(key,value_json) VALUES('providerToken','\"private-fixture-secret\"')")
            .execute(&mut *transaction).await.unwrap();
        let response = serde_json::to_string(&settings(&mut transaction).await.unwrap()).unwrap();
        transaction.rollback().await.unwrap();
        sqlite.close().await;
        assert_eq!(cloud, native);
        assert_eq!(cloud["journalBalanceMinor"], 157534);
        assert_eq!(cloud["netPnlMinor"], 7534);
        assert_eq!(cloud["brokerBalanceMinor"], 900000);
        assert!(data.database_path.is_empty() && data.app_data_path.is_empty());
        assert!(!response.contains("private-fixture-secret"));
        assert!(!response.contains("providerToken"));
        }).catch_unwind().await;
        fixture.close().await;
        if let Err(error) = result {
            resume_unwind(error);
        }
    }

    #[tokio::test]
    #[ignore = "Requires MACRO_TEST_ENV_FILE; creates and removes an isolated Neon schema"]
    async fn cloud_system_commands_persist_and_keep_account_currency() {
        let fixture = super::super::test_support::TestDatabase::open().await;
        let result = AssertUnwindSafe(async {
            let mut tx = fixture.pool.begin().await.unwrap();
            let created = save_account(
                &mut tx,
                AccountInput {
                    id: None,
                    name: "Fixture".into(),
                    broker: None,
                    account_type: "personal".into(),
                    base_currency: "eur".into(),
                    initial_balance_minor: 12345,
                    default_risk_percent: 1.0,
                },
            )
            .await
            .unwrap();
            let mismatch = save_account(
                &mut tx,
                AccountInput {
                    id: Some(created.id.clone()),
                    name: "Changed".into(),
                    broker: None,
                    account_type: "personal".into(),
                    base_currency: "usd".into(),
                    initial_balance_minor: 12345,
                    default_risk_percent: 1.0,
                },
            )
            .await;
            let final_account = archive_account(&mut tx, &created.id).await;
            let flow = add_cashflow(
                &mut tx,
                AccountCashflowInput {
                    account_id: created.id.clone(),
                    occurred_at: "2026-09-24T14:00:00+02:00".into(),
                    amount_minor: 55,
                    kind: "deposit".into(),
                    note: None,
                },
            )
            .await
            .unwrap();
            let setup = create_taxonomy(
                &mut tx,
                "setups",
                NamedEntityInput {
                    name: "Example".into(),
                    color: None,
                    description: None,
                    strategy_id: None,
                },
            )
            .await
            .unwrap();
            tx.commit().await.unwrap();
            let mut next = fixture.pool.begin().await.unwrap();
            let journal = account_journal(&mut next, &created.id).await.unwrap();
            let flows = cashflows(&mut next, &created.id).await.unwrap();
            let data = bootstrap(&mut next).await.unwrap();
            next.rollback().await.unwrap();
            assert_eq!(created.base_currency, "EUR");
            assert!(mismatch.is_err());
            assert!(final_account.is_err());
            assert_eq!(flow.occurred_at, "2026-09-24T12:00:00+00:00");
            assert_eq!(journal.journal_balance_minor, 12400);
            assert_eq!(flows.len(), 1);
            assert_eq!(data.setups[0].id, setup.id);
        })
        .catch_unwind()
        .await;
        fixture.close().await;
        if let Err(error) = result {
            resume_unwind(error);
        }
    }
}
