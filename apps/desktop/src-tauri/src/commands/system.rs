use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use uuid::Uuid;

use crate::{
    database::AppState,
    domain::models::{
        Account, BootstrapData, EmotionItem, MistakeItem, NamedEntityInput, TaxonomyItem,
    },
    errors::{AppError, CommandResult},
    metrics::CALCULATION_VERSION,
};

#[tauri::command]
pub async fn get_bootstrap_data(state: State<'_, AppState>) -> CommandResult<BootstrapData> {
    let accounts = sqlx::query_as::<_, Account>(
        "SELECT a.id, a.name, a.broker, a.account_type, a.base_currency, a.initial_balance_minor, a.default_risk_percent, a.is_archived, a.initial_balance_minor + COALESCE((SELECT SUM(ac.amount_minor) FROM account_cashflows ac WHERE ac.account_id = a.id), 0) + COALESCE((SELECT SUM(t.net_pnl_minor) FROM trades t WHERE t.account_id = a.id AND t.status = 'closed' AND t.is_deleted = 0), 0) AS current_balance_minor, (SELECT s.balance_minor FROM mt5_accounts m JOIN mt5_account_snapshots s ON s.mt5_account_id=m.id WHERE m.local_account_id=a.id ORDER BY s.observed_at DESC LIMIT 1) AS broker_balance_minor, (SELECT s.equity_minor FROM mt5_accounts m JOIN mt5_account_snapshots s ON s.mt5_account_id=m.id WHERE m.local_account_id=a.id ORDER BY s.observed_at DESC LIMIT 1) AS broker_equity_minor, (SELECT m.last_sync_at FROM mt5_accounts m WHERE m.local_account_id=a.id) AS broker_synced_at, (SELECT m.login FROM mt5_accounts m WHERE m.local_account_id=a.id) AS broker_login, (SELECT m.server FROM mt5_accounts m WHERE m.local_account_id=a.id) AS broker_server FROM accounts a WHERE a.is_archived = 0 ORDER BY a.name",
    )
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    let strategies = sqlx::query_as::<_, TaxonomyItem>(
        "SELECT id, name, color FROM strategies WHERE is_archived = 0 ORDER BY name",
    )
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    let setups = sqlx::query_as::<_, TaxonomyItem>(
        "SELECT id, name, color FROM setups WHERE is_archived = 0 ORDER BY name",
    )
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    let tags = sqlx::query_as::<_, TaxonomyItem>("SELECT id, name, color FROM tags ORDER BY name")
        .fetch_all(&state.db)
        .await
        .map_err(AppError::from)?;
    let emotions = sqlx::query_as::<_, EmotionItem>(
        "SELECT id, name, valence, color FROM emotions ORDER BY name",
    )
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;
    let mistakes = sqlx::query_as::<_, MistakeItem>(
        "SELECT id, name, category, color, severity_default FROM mistakes WHERE is_archived = 0 ORDER BY name",
    )
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)?;

    Ok(BootstrapData {
        accounts,
        strategies,
        setups,
        tags,
        emotions,
        mistakes,
        database_path: state.paths.database.to_string_lossy().into_owned(),
        app_data_path: state.paths.root.to_string_lossy().into_owned(),
        calculation_version: CALCULATION_VERSION.into(),
    })
}

#[tauri::command]
pub async fn create_strategy(
    state: State<'_, AppState>,
    input: NamedEntityInput,
) -> CommandResult<TaxonomyItem> {
    create_taxonomy(&state, "strategies", input).await
}

#[tauri::command]
pub async fn create_setup(
    state: State<'_, AppState>,
    input: NamedEntityInput,
) -> CommandResult<TaxonomyItem> {
    create_taxonomy(&state, "setups", input).await
}

#[tauri::command]
pub async fn create_tag(
    state: State<'_, AppState>,
    input: NamedEntityInput,
) -> CommandResult<TaxonomyItem> {
    create_taxonomy(&state, "tags", input).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInput {
    pub id: Option<String>,
    pub name: String,
    pub broker: Option<String>,
    pub account_type: String,
    pub base_currency: String,
    pub initial_balance_minor: i64,
    #[serde(default = "default_risk_percent")]
    pub default_risk_percent: f64,
}

fn default_risk_percent() -> f64 {
    1.0
}

#[tauri::command]
pub async fn save_account(
    state: State<'_, AppState>,
    input: AccountInput,
) -> CommandResult<Account> {
    if input.name.trim().is_empty() || input.base_currency.trim().len() != 3 {
        return Err(crate::errors::CommandError::validation(
            "Kontoname und dreistellige Basiswährung sind erforderlich.",
        ));
    }
    if !input.default_risk_percent.is_finite()
        || input.default_risk_percent <= 0.0
        || input.default_risk_percent > 25.0
    {
        return Err(crate::errors::CommandError::validation(
            "Das Standardrisiko muss zwischen 0 und 25 Prozent liegen.",
        ));
    }
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO accounts (id, name, broker, account_type, base_currency, initial_balance_minor, default_risk_percent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, broker=excluded.broker, account_type=excluded.account_type, base_currency=excluded.base_currency, initial_balance_minor=excluded.initial_balance_minor, default_risk_percent=excluded.default_risk_percent, updated_at=excluded.updated_at")
        .bind(&id).bind(input.name.trim()).bind(&input.broker).bind(&input.account_type)
        .bind(input.base_currency.trim().to_uppercase()).bind(input.initial_balance_minor).bind(input.default_risk_percent).bind(&now).bind(&now)
        .execute(&state.db).await.map_err(AppError::from)?;
    sqlx::query_as::<_, Account>("SELECT a.id, a.name, a.broker, a.account_type, a.base_currency, a.initial_balance_minor, a.default_risk_percent, a.is_archived, a.initial_balance_minor + COALESCE((SELECT SUM(ac.amount_minor) FROM account_cashflows ac WHERE ac.account_id = a.id), 0) + COALESCE((SELECT SUM(t.net_pnl_minor) FROM trades t WHERE t.account_id = a.id AND t.status = 'closed' AND t.is_deleted = 0), 0) AS current_balance_minor, (SELECT s.balance_minor FROM mt5_accounts m JOIN mt5_account_snapshots s ON s.mt5_account_id=m.id WHERE m.local_account_id=a.id ORDER BY s.observed_at DESC LIMIT 1) AS broker_balance_minor, (SELECT s.equity_minor FROM mt5_accounts m JOIN mt5_account_snapshots s ON s.mt5_account_id=m.id WHERE m.local_account_id=a.id ORDER BY s.observed_at DESC LIMIT 1) AS broker_equity_minor, (SELECT m.last_sync_at FROM mt5_accounts m WHERE m.local_account_id=a.id) AS broker_synced_at, (SELECT m.login FROM mt5_accounts m WHERE m.local_account_id=a.id) AS broker_login, (SELECT m.server FROM mt5_accounts m WHERE m.local_account_id=a.id) AS broker_server FROM accounts a WHERE a.id = ?")
        .bind(id).fetch_one(&state.db).await.map_err(AppError::from).map_err(Into::into)
}

#[tauri::command]
pub async fn archive_account(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    let active_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM accounts WHERE is_archived = 0")
            .fetch_one(&state.db)
            .await
            .map_err(AppError::from)?;
    if active_count <= 1 {
        return Err(crate::errors::CommandError::validation(
            "Mindestens ein aktives Konto muss erhalten bleiben.",
        ));
    }
    sqlx::query("UPDATE accounts SET is_archived = 1, updated_at = ? WHERE id = ?")
        .bind(Utc::now().to_rfc3339())
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(())
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AccountCashflow {
    pub id: String,
    pub account_id: String,
    pub occurred_at: String,
    pub amount_minor: i64,
    pub kind: String,
    pub note: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountCashflowInput {
    pub account_id: String,
    pub occurred_at: String,
    pub amount_minor: i64,
    pub kind: String,
    pub note: Option<String>,
}

#[tauri::command]
pub async fn list_account_cashflows(
    state: State<'_, AppState>,
    account_id: String,
) -> CommandResult<Vec<AccountCashflow>> {
    sqlx::query_as::<_, AccountCashflow>("SELECT id, account_id, occurred_at, amount_minor, kind, note, created_at FROM account_cashflows WHERE account_id = ? ORDER BY occurred_at DESC")
        .bind(account_id).fetch_all(&state.db).await.map_err(AppError::from).map_err(Into::into)
}

#[tauri::command]
pub async fn add_account_cashflow(
    state: State<'_, AppState>,
    input: AccountCashflowInput,
) -> CommandResult<AccountCashflow> {
    if !matches!(input.kind.as_str(), "deposit" | "withdrawal" | "adjustment") {
        return Err(crate::errors::CommandError::validation(
            "Ungültiger Cashflow-Typ.",
        ));
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO account_cashflows (id, account_id, occurred_at, amount_minor, kind, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(&id).bind(&input.account_id).bind(&input.occurred_at).bind(input.amount_minor).bind(&input.kind).bind(&input.note).bind(&now)
        .execute(&state.db).await.map_err(AppError::from)?;
    sqlx::query_as::<_, AccountCashflow>("SELECT id, account_id, occurred_at, amount_minor, kind, note, created_at FROM account_cashflows WHERE id = ?")
        .bind(id).fetch_one(&state.db).await.map_err(AppError::from).map_err(Into::into)
}

async fn create_taxonomy(
    state: &AppState,
    table: &str,
    input: NamedEntityInput,
) -> CommandResult<TaxonomyItem> {
    let name = input.name.trim();
    if name.is_empty() || name.len() > 80 {
        return Err(crate::errors::CommandError::validation(
            "Name muss zwischen 1 und 80 Zeichen enthalten.",
        ));
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let color = input.color.unwrap_or_else(|| "#3b82f6".into());

    let query = match table {
        "strategies" => {
            "INSERT INTO strategies (id, name, description, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
        }
        "setups" => {
            "INSERT INTO setups (id, strategy_id, name, description, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        }
        "tags" => "INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)",
        _ => return Err(AppError::Validation("Unbekannte Taxonomie.".into()).into()),
    };

    let result = match table {
        "strategies" => {
            sqlx::query(query)
                .bind(&id)
                .bind(name)
                .bind(&input.description)
                .bind(&color)
                .bind(&now)
                .bind(&now)
                .execute(&state.db)
                .await
        }
        "setups" => {
            sqlx::query(query)
                .bind(&id)
                .bind(&input.strategy_id)
                .bind(name)
                .bind(&input.description)
                .bind(&color)
                .bind(&now)
                .bind(&now)
                .execute(&state.db)
                .await
        }
        "tags" => {
            sqlx::query(query)
                .bind(&id)
                .bind(name)
                .bind(&color)
                .bind(&now)
                .execute(&state.db)
                .await
        }
        _ => unreachable!(),
    };
    result.map_err(|error| match &error {
        sqlx::Error::Database(db_error) if db_error.is_unique_violation() => {
            AppError::Conflict(format!("„{name}“ existiert bereits."))
        }
        _ => AppError::Database(error),
    })?;

    Ok(TaxonomyItem {
        id,
        name: name.into(),
        color,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsResponse {
    pub settings: serde_json::Map<String, Value>,
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> CommandResult<SettingsResponse> {
    let rows: Vec<(String, String)> =
        sqlx::query_as("SELECT key, value_json FROM app_settings ORDER BY key")
            .fetch_all(&state.db)
            .await
            .map_err(AppError::from)?;
    let mut settings = serde_json::Map::new();
    for (key, json) in rows {
        settings.insert(key, serde_json::from_str(&json).unwrap_or(Value::Null));
    }
    Ok(SettingsResponse { settings })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingInput {
    pub key: String,
    pub value: Value,
}

#[tauri::command]
pub async fn update_setting(state: State<'_, AppState>, input: SettingInput) -> CommandResult<()> {
    if input.key.trim().is_empty() {
        return Err(crate::errors::CommandError::validation(
            "Einstellungsschlüssel fehlt.",
        ));
    }
    sqlx::query(
        "INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
    )
    .bind(input.key)
    .bind(input.value.to_string())
    .bind(Utc::now().to_rfc3339())
    .execute(&state.db)
    .await
    .map_err(AppError::from)?;
    Ok(())
}
