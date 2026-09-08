use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
};

use chrono::Utc;
use futures_util::{SinkExt, StreamExt};
use keyring::Entry;
use rust_decimal::{Decimal, prelude::FromPrimitive};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{FromRow, Sqlite, Transaction};
use tauri::State;
use tokio::time::{Duration, timeout};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use url::Url;
use uuid::Uuid;

use crate::{
    database::AppState,
    errors::{AppError, CommandError, CommandResult},
};

const MT5_CONNECTOR_SOURCE: &str = include_str!("../../connectors/mt5_account_connector.py");
const KEYRING_SERVICE: &str = "com.personal-macro.app.ctrader";
const CTRADER_SCOPE: &str = "accounts";

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct BrokerConnectionView {
    pub id: String,
    pub local_account_id: String,
    pub local_account_name: String,
    pub platform: String,
    pub external_account_id: String,
    pub account_login: Option<String>,
    pub broker_name: Option<String>,
    pub server_name: Option<String>,
    pub environment: String,
    pub status: String,
    pub base_currency: Option<String>,
    pub balance_minor: Option<i64>,
    pub equity_minor: Option<i64>,
    pub status_message: Option<String>,
    pub last_sync_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mt5AccountSnapshot {
    pub login: String,
    pub server: String,
    pub name: Option<String>,
    pub company: Option<String>,
    pub currency: String,
    pub balance: Option<f64>,
    pub equity: Option<f64>,
    pub leverage: Option<i64>,
    pub trade_mode: Option<i64>,
    pub observed_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mt5DetectInput {
    pub terminal_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMt5AccountInput {
    pub terminal_path: Option<String>,
    pub name: Option<String>,
    pub default_risk_percent: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectedAccountResult {
    pub account_id: String,
    pub connection: BrokerConnectionView,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CTraderAuthorization {
    pub configured: bool,
    pub authorization_url: Option<String>,
    pub redirect_uri: Option<String>,
    pub message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CTraderCodeInput {
    pub code_or_redirect_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CTraderAccountCandidate {
    pub external_account_id: String,
    pub account_login: Option<String>,
    pub broker_name: Option<String>,
    pub environment: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CTraderCandidateResponse {
    pub session_id: String,
    pub accounts: Vec<CTraderAccountCandidate>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCTraderAccountInput {
    pub session_id: String,
    pub external_account_id: String,
    pub name: Option<String>,
    pub default_risk_percent: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredCTraderToken {
    access_token: String,
    refresh_token: String,
    expires_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CTraderTokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
    error_code: Option<String>,
    description: Option<String>,
}

#[derive(Debug)]
struct CTraderConfig {
    client_id: String,
    client_secret: String,
    redirect_uri: String,
}

#[derive(Debug)]
struct CTraderDetails {
    candidate: CTraderAccountCandidate,
    currency: String,
    balance_minor: i64,
}

#[derive(Deserialize)]
struct ConnectorResponse<T> {
    ok: bool,
    data: Option<T>,
    code: Option<String>,
    message: Option<String>,
}

#[tauri::command]
pub async fn list_broker_connections(
    state: State<'_, AppState>,
) -> CommandResult<Vec<BrokerConnectionView>> {
    load_connections(&state.db).await
}

#[tauri::command]
pub async fn detect_mt5_account(
    state: State<'_, AppState>,
    input: Mt5DetectInput,
) -> CommandResult<Mt5AccountSnapshot> {
    let app_state = state.inner().clone();
    tokio::task::spawn_blocking(move || read_mt5_snapshot(&app_state, input.terminal_path))
        .await
        .map_err(|_| command_error("MT5_CONNECTOR_ERROR", "Die MT5-Prüfung wurde abgebrochen."))?
}

#[tauri::command]
pub async fn create_account_from_mt5(
    state: State<'_, AppState>,
    input: CreateMt5AccountInput,
) -> CommandResult<ConnectedAccountResult> {
    validate_risk(input.default_risk_percent)?;
    let app_state = state.inner().clone();
    let terminal_path = input.terminal_path.clone();
    let snapshot =
        tokio::task::spawn_blocking(move || read_mt5_snapshot(&app_state, terminal_path))
            .await
            .map_err(|_| {
                command_error("MT5_CONNECTOR_ERROR", "Die MT5-Prüfung wurde abgebrochen.")
            })??;
    let external_id = format!("{}:{}", snapshot.server.to_lowercase(), snapshot.login);
    ensure_connection_available(&state.db, "mt5", &external_id, "local").await?;

    let broker = snapshot
        .company
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "MetaTrader 5".into());
    let account_name = clean_optional_name(input.name)
        .unwrap_or_else(|| format!("{} MT5 {}", broker, snapshot.login));
    let balance_minor = money_to_minor(snapshot.balance);
    let equity_minor = money_to_minor(snapshot.equity);
    let mut transaction = state.db.begin().await.map_err(AppError::from)?;
    let result = insert_connected_account(
        &mut transaction,
        &account_name,
        &broker,
        &snapshot.currency,
        input.default_risk_percent,
        "mt5",
        &external_id,
        Some(&snapshot.login),
        Some(&snapshot.server),
        "local",
        balance_minor,
        equity_minor,
        None,
        Some("Mit dem lokal angemeldeten MT5-Terminal verbunden."),
    )
    .await?;
    transaction.commit().await.map_err(AppError::from)?;
    load_connected_result(&state.db, &result.0, &result.1).await
}

#[tauri::command]
pub fn get_ctrader_authorization() -> CommandResult<CTraderAuthorization> {
    let Some(config) = load_ctrader_config()? else {
        return Ok(CTraderAuthorization {
            configured: false,
            authorization_url: None,
            redirect_uri: None,
            message: "Für cTrader fehlen CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET und CTRADER_REDIRECT_URI in .env.local.".into(),
        });
    };
    let mut url = Url::parse("https://id.ctrader.com/my/settings/openapi/grantingaccess/")
        .map_err(|_| {
            command_error(
                "CTRADER_CONFIG_ERROR",
                "Die cTrader-Anmeldeadresse ist ungültig.",
            )
        })?;
    url.query_pairs_mut()
        .append_pair("client_id", &config.client_id)
        .append_pair("redirect_uri", &config.redirect_uri)
        .append_pair("scope", CTRADER_SCOPE)
        .append_pair("product", "web");
    Ok(CTraderAuthorization {
        configured: true,
        authorization_url: Some(url.into()),
        redirect_uri: Some(config.redirect_uri),
        message: "cTrader wird mit reinem Lesezugriff geöffnet.".into(),
    })
}

#[tauri::command]
pub async fn exchange_ctrader_code(
    input: CTraderCodeInput,
) -> CommandResult<CTraderCandidateResponse> {
    let config = require_ctrader_config()?;
    let code = extract_authorization_code(&input.code_or_redirect_url)?;
    let token = exchange_authorization_code(&config, &code).await?;
    let accounts = fetch_ctrader_accounts(&config, &token.access_token).await?;
    if accounts.is_empty() {
        return Err(command_error(
            "CTRADER_NO_ACCOUNTS",
            "cTrader hat keine freigegebenen Trading-Konten geliefert.",
        ));
    }
    let session_id = Uuid::new_v4().to_string();
    store_token(&session_id, &token)?;
    Ok(CTraderCandidateResponse {
        session_id,
        accounts,
    })
}

#[tauri::command]
pub async fn create_account_from_ctrader(
    state: State<'_, AppState>,
    input: CreateCTraderAccountInput,
) -> CommandResult<ConnectedAccountResult> {
    validate_risk(input.default_risk_percent)?;
    validate_identifier(&input.session_id, "Die cTrader-Sitzung ist ungültig.")?;
    let config = require_ctrader_config()?;
    let mut token = load_token(&input.session_id)?;
    refresh_token_if_needed(&config, &input.session_id, &mut token).await?;
    let accounts = fetch_ctrader_accounts(&config, &token.access_token).await?;
    let candidate = accounts
        .into_iter()
        .find(|account| account.external_account_id == input.external_account_id)
        .ok_or_else(|| {
            command_error(
                "CTRADER_ACCOUNT_NOT_GRANTED",
                "Das ausgewählte cTrader-Konto ist nicht mehr freigegeben.",
            )
        })?;
    ensure_connection_available(
        &state.db,
        "ctrader",
        &candidate.external_account_id,
        &candidate.environment,
    )
    .await?;
    let details = fetch_ctrader_details(&config, &token.access_token, candidate).await?;
    let broker = details
        .candidate
        .broker_name
        .clone()
        .unwrap_or_else(|| "cTrader".into());
    let login = details
        .candidate
        .account_login
        .clone()
        .unwrap_or_else(|| details.candidate.external_account_id.clone());
    let account_name =
        clean_optional_name(input.name).unwrap_or_else(|| format!("{} cTrader {}", broker, login));
    let mut transaction = state.db.begin().await.map_err(AppError::from)?;
    let result = insert_connected_account(
        &mut transaction,
        &account_name,
        &broker,
        &details.currency,
        input.default_risk_percent,
        "ctrader",
        &details.candidate.external_account_id,
        details.candidate.account_login.as_deref(),
        None,
        &details.candidate.environment,
        Some(details.balance_minor),
        None,
        Some(&input.session_id),
        Some("Über cTrader Open API mit reinem Kontozugriff verbunden."),
    )
    .await?;
    transaction.commit().await.map_err(AppError::from)?;
    load_connected_result(&state.db, &result.0, &result.1).await
}

#[tauri::command]
pub async fn refresh_broker_connection(
    state: State<'_, AppState>,
    connection_id: String,
) -> CommandResult<BrokerConnectionView> {
    validate_identifier(&connection_id, "Die Broker-Verbindung ist ungültig.")?;
    let row = sqlx::query_as::<_, (String, String, String, Option<String>)>(
        "SELECT platform, external_account_id, environment, credential_ref FROM broker_account_connections WHERE id = ?",
    )
    .bind(&connection_id)
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)?
    .ok_or_else(|| command_error("NOT_FOUND", "Die Broker-Verbindung wurde nicht gefunden."))?;

    let refresh = if row.0 == "mt5" {
        refresh_mt5_connection(state.inner(), &connection_id, &row.1).await
    } else {
        let credential_ref = row.3.ok_or_else(|| {
            command_error(
                "CTRADER_REAUTHORIZE",
                "cTrader muss erneut autorisiert werden.",
            )
        })?;
        refresh_ctrader_connection(
            state.inner(),
            &connection_id,
            &row.1,
            &row.2,
            &credential_ref,
        )
        .await
    };
    if let Err(error) = &refresh {
        sqlx::query("UPDATE broker_account_connections SET status = 'action_required', status_message = ?, updated_at = ? WHERE id = ?")
            .bind(error.message.chars().take(300).collect::<String>())
            .bind(Utc::now().to_rfc3339())
            .bind(&connection_id)
            .execute(&state.db)
            .await
            .map_err(AppError::from)?;
    }
    refresh?;
    load_connection(&state.db, &connection_id).await
}

#[tauri::command]
pub async fn disconnect_broker_connection(
    state: State<'_, AppState>,
    connection_id: String,
) -> CommandResult<()> {
    let credential_ref: Option<String> =
        sqlx::query_scalar("SELECT credential_ref FROM broker_account_connections WHERE id = ?")
            .bind(&connection_id)
            .fetch_optional(&state.db)
            .await
            .map_err(AppError::from)?
            .flatten();
    sqlx::query("UPDATE broker_account_connections SET status = 'disconnected', credential_ref = NULL, status_message = 'Verbindung manuell getrennt.', updated_at = ? WHERE id = ?")
        .bind(Utc::now().to_rfc3339())
        .bind(&connection_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    if let Some(reference) = credential_ref {
        let _ = Entry::new(KEYRING_SERVICE, &reference).and_then(|entry| entry.delete_credential());
    }
    Ok(())
}

async fn refresh_mt5_connection(
    state: &AppState,
    connection_id: &str,
    expected_external_id: &str,
) -> CommandResult<()> {
    let app_state = state.clone();
    let snapshot = tokio::task::spawn_blocking(move || read_mt5_snapshot(&app_state, None))
        .await
        .map_err(|_| {
            command_error("MT5_CONNECTOR_ERROR", "Die MT5-Prüfung wurde abgebrochen.")
        })??;
    let actual_external_id = format!("{}:{}", snapshot.server.to_lowercase(), snapshot.login);
    if actual_external_id != expected_external_id {
        return Err(command_error(
            "MT5_ACCOUNT_CHANGED",
            "Im lokalen MT5-Terminal ist momentan ein anderes Konto angemeldet.",
        ));
    }
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE broker_account_connections SET status = 'connected', base_currency = ?, balance_minor = ?, equity_minor = ?, status_message = 'Lokales MT5-Terminal erreichbar.', last_sync_at = ?, updated_at = ? WHERE id = ?")
        .bind(snapshot.currency)
        .bind(money_to_minor(snapshot.balance))
        .bind(money_to_minor(snapshot.equity))
        .bind(&now)
        .bind(&now)
        .bind(connection_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(())
}

async fn refresh_ctrader_connection(
    state: &AppState,
    connection_id: &str,
    external_account_id: &str,
    environment: &str,
    credential_ref: &str,
) -> CommandResult<()> {
    let config = require_ctrader_config()?;
    let mut token = load_token(credential_ref)?;
    refresh_token_if_needed(&config, credential_ref, &mut token).await?;
    let accounts = fetch_ctrader_accounts(&config, &token.access_token).await?;
    let candidate = accounts
        .into_iter()
        .find(|candidate| {
            candidate.external_account_id == external_account_id
                && candidate.environment == environment
        })
        .ok_or_else(|| {
            command_error(
                "CTRADER_ACCOUNT_NOT_GRANTED",
                "Der cTrader-Zugriff wurde entzogen.",
            )
        })?;
    let details = fetch_ctrader_details(&config, &token.access_token, candidate).await?;
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE broker_account_connections SET status = 'connected', account_login = ?, broker_name = ?, base_currency = ?, balance_minor = ?, status_message = 'cTrader Open API erreichbar.', last_sync_at = ?, updated_at = ? WHERE id = ?")
        .bind(details.candidate.account_login)
        .bind(details.candidate.broker_name)
        .bind(details.currency)
        .bind(details.balance_minor)
        .bind(&now)
        .bind(&now)
        .bind(connection_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(())
}

fn read_mt5_snapshot(
    state: &AppState,
    terminal_path: Option<String>,
) -> CommandResult<Mt5AccountSnapshot> {
    let connector_path = state.paths.settings.join("mt5_account_connector.py");
    fs::write(&connector_path, MT5_CONNECTOR_SOURCE)
        .map_err(AppError::from)
        .map_err(CommandError::from)?;
    let request = serde_json::to_string(&json!({
        "terminalPath": terminal_path.as_deref().unwrap_or("").trim(),
    }))
    .map_err(|_| {
        command_error(
            "MT5_CONNECTOR_ERROR",
            "Die MT5-Anfrage konnte nicht vorbereitet werden.",
        )
    })?;
    let output = invoke_python("python", &[], &connector_path, &request)
        .or_else(|_| invoke_python("py", &["-3"], &connector_path, &request))?;
    let parsed: ConnectorResponse<Mt5AccountSnapshot> = serde_json::from_slice(&output.stdout)
        .map_err(|_| {
            command_error(
                "MT5_CONNECTOR_ERROR",
                "MT5 hat keine gültige Antwort geliefert.",
            )
        })?;
    if !parsed.ok {
        return Err(command_error(
            parsed.code.as_deref().unwrap_or("MT5_CONNECTOR_ERROR"),
            parsed
                .message
                .as_deref()
                .unwrap_or("Die MT5-Verbindung ist fehlgeschlagen."),
        ));
    }
    parsed
        .data
        .ok_or_else(|| command_error("MT5_CONNECTOR_ERROR", "MT5 hat keine Kontodaten geliefert."))
}

fn invoke_python(
    executable: &str,
    args: &[&str],
    connector_path: &std::path::Path,
    request: &str,
) -> CommandResult<std::process::Output> {
    let mut command = Command::new(executable);
    command
        .args(args)
        .arg(connector_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let mut child = command.spawn().map_err(|_| {
        command_error(
            "PYTHON_NOT_FOUND",
            "Python 3 wurde nicht gefunden. Es wird für die lokale MT5-Verbindung benötigt.",
        )
    })?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(request.as_bytes()).map_err(|_| {
            command_error(
                "MT5_CONNECTOR_ERROR",
                "Die Anfrage konnte nicht an MT5 gesendet werden.",
            )
        })?;
    }
    child.wait_with_output().map_err(|_| {
        command_error(
            "MT5_CONNECTOR_ERROR",
            "Die lokale MT5-Verbindung wurde unerwartet beendet.",
        )
    })
}

async fn fetch_ctrader_accounts(
    config: &CTraderConfig,
    access_token: &str,
) -> CommandResult<Vec<CTraderAccountCandidate>> {
    let mut socket = connect_ctrader_socket("live", config).await?;
    let response = send_ctrader_message(
        &mut socket,
        2149,
        json!({ "accessToken": access_token }),
        2150,
    )
    .await?;
    let rows = response
        .get("ctidTraderAccount")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(rows
        .iter()
        .filter_map(|row| {
            let external_account_id = json_string(row.get("ctidTraderAccountId")?)?;
            Some(CTraderAccountCandidate {
                external_account_id,
                account_login: row.get("traderLogin").and_then(json_string),
                broker_name: row
                    .get("brokerTitleShort")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                environment: if row.get("isLive").and_then(Value::as_bool).unwrap_or(false) {
                    "live".into()
                } else {
                    "demo".into()
                },
            })
        })
        .collect())
}

async fn fetch_ctrader_details(
    config: &CTraderConfig,
    access_token: &str,
    candidate: CTraderAccountCandidate,
) -> CommandResult<CTraderDetails> {
    let mut socket = connect_ctrader_socket(&candidate.environment, config).await?;
    let account_id = candidate.external_account_id.clone();
    send_ctrader_message(
        &mut socket,
        2102,
        json!({
            "ctidTraderAccountId": account_id,
            "accessToken": access_token,
        }),
        2103,
    )
    .await?;
    let trader_response = send_ctrader_message(
        &mut socket,
        2121,
        json!({ "ctidTraderAccountId": candidate.external_account_id }),
        2122,
    )
    .await?;
    let asset_response = send_ctrader_message(
        &mut socket,
        2112,
        json!({ "ctidTraderAccountId": candidate.external_account_id }),
        2113,
    )
    .await?;
    let trader = trader_response.get("trader").ok_or_else(|| {
        command_error(
            "CTRADER_RESPONSE_ERROR",
            "cTrader hat keine Kontodetails geliefert.",
        )
    })?;
    let deposit_asset_id = trader
        .get("depositAssetId")
        .and_then(json_string)
        .ok_or_else(|| {
            command_error("CTRADER_RESPONSE_ERROR", "Die cTrader-Kontowährung fehlt.")
        })?;
    let currency = asset_response
        .get("asset")
        .and_then(Value::as_array)
        .and_then(|assets| {
            assets.iter().find(|asset| {
                asset.get("assetId").and_then(json_string).as_deref()
                    == Some(deposit_asset_id.as_str())
            })
        })
        .and_then(|asset| asset.get("name"))
        .and_then(Value::as_str)
        .map(str::to_uppercase)
        .ok_or_else(|| {
            command_error(
                "CTRADER_RESPONSE_ERROR",
                "Die cTrader-Kontowährung konnte nicht aufgelöst werden.",
            )
        })?;
    let raw_balance = trader
        .get("balance")
        .and_then(json_i128)
        .ok_or_else(|| command_error("CTRADER_RESPONSE_ERROR", "Der cTrader-Kontostand fehlt."))?;
    let digits = trader
        .get("moneyDigits")
        .and_then(json_u32)
        .unwrap_or(2)
        .min(12);
    let balance_minor = scaled_money_to_minor(raw_balance, digits)?;
    Ok(CTraderDetails {
        candidate,
        currency,
        balance_minor,
    })
}

async fn connect_ctrader_socket(
    environment: &str,
    config: &CTraderConfig,
) -> CommandResult<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
> {
    let host = if environment == "demo" {
        "demo.ctraderapi.com"
    } else {
        "live.ctraderapi.com"
    };
    let (mut socket, _) = timeout(
        Duration::from_secs(12),
        connect_async(format!("wss://{host}:5036")),
    )
    .await
    .map_err(|_| {
        command_error(
            "CTRADER_TIMEOUT",
            "Die cTrader-Verbindung hat zu lange gedauert.",
        )
    })?
    .map_err(|_| {
        command_error(
            "CTRADER_CONNECTION_ERROR",
            "cTrader Open API ist momentan nicht erreichbar.",
        )
    })?;
    send_ctrader_message(
        &mut socket,
        2100,
        json!({
            "clientId": config.client_id,
            "clientSecret": config.client_secret,
        }),
        2101,
    )
    .await?;
    Ok(socket)
}

async fn send_ctrader_message(
    socket: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    payload_type: i64,
    payload: Value,
    expected_payload_type: i64,
) -> CommandResult<Value> {
    let request = json!({
        "clientMsgId": Uuid::new_v4().to_string(),
        "payloadType": payload_type,
        "payload": payload,
    });
    socket
        .send(Message::Text(request.to_string().into()))
        .await
        .map_err(|_| {
            command_error(
                "CTRADER_CONNECTION_ERROR",
                "Die Anfrage konnte nicht an cTrader gesendet werden.",
            )
        })?;
    let response = timeout(Duration::from_secs(12), async {
        while let Some(message) = socket.next().await {
            let message = message.map_err(|_| {
                command_error(
                    "CTRADER_CONNECTION_ERROR",
                    "Die cTrader-Verbindung wurde unterbrochen.",
                )
            })?;
            let text = match message {
                Message::Text(text) => text.to_string(),
                Message::Binary(bytes) => String::from_utf8(bytes.to_vec()).map_err(|_| {
                    command_error(
                        "CTRADER_RESPONSE_ERROR",
                        "cTrader hat eine ungültige Antwort geliefert.",
                    )
                })?,
                Message::Close(_) => {
                    return Err(command_error(
                        "CTRADER_CONNECTION_ERROR",
                        "cTrader hat die Verbindung beendet.",
                    ));
                }
                _ => continue,
            };
            let envelope: Value = serde_json::from_str(&text).map_err(|_| {
                command_error(
                    "CTRADER_RESPONSE_ERROR",
                    "cTrader hat eine ungültige Antwort geliefert.",
                )
            })?;
            let received_type = envelope
                .get("payloadType")
                .and_then(Value::as_i64)
                .unwrap_or_default();
            if received_type == 2142 {
                let payload = envelope.get("payload").cloned().unwrap_or_default();
                let code = payload
                    .get("errorCode")
                    .and_then(Value::as_str)
                    .unwrap_or("CTRADER_API_ERROR");
                let description = payload
                    .get("description")
                    .and_then(Value::as_str)
                    .unwrap_or("cTrader hat die Anfrage abgelehnt.");
                return Err(command_error(code, description));
            }
            if received_type == expected_payload_type {
                return Ok(envelope.get("payload").cloned().unwrap_or_default());
            }
        }
        Err(command_error(
            "CTRADER_CONNECTION_ERROR",
            "cTrader hat die Verbindung beendet.",
        ))
    })
    .await
    .map_err(|_| {
        command_error(
            "CTRADER_TIMEOUT",
            "cTrader hat nicht rechtzeitig geantwortet.",
        )
    })??;
    Ok(response)
}

async fn exchange_authorization_code(
    config: &CTraderConfig,
    code: &str,
) -> CommandResult<StoredCTraderToken> {
    request_ctrader_token(
        config,
        &[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", &config.redirect_uri),
        ],
    )
    .await
}

async fn request_ctrader_token(
    config: &CTraderConfig,
    extra: &[(&str, &str)],
) -> CommandResult<StoredCTraderToken> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|_| {
            command_error(
                "CTRADER_CONNECTION_ERROR",
                "Die sichere cTrader-Verbindung konnte nicht vorbereitet werden.",
            )
        })?;
    let mut query = vec![
        ("client_id", config.client_id.as_str()),
        ("client_secret", config.client_secret.as_str()),
    ];
    query.extend_from_slice(extra);
    let response = client
        .get("https://openapi.ctrader.com/apps/token")
        .query(&query)
        .send()
        .await
        .map_err(|_| {
            command_error(
                "CTRADER_CONNECTION_ERROR",
                "Der cTrader-Anmeldevorgang ist fehlgeschlagen.",
            )
        })?;
    let status = response.status();
    let parsed: CTraderTokenResponse = response.json().await.map_err(|_| {
        command_error(
            "CTRADER_RESPONSE_ERROR",
            "cTrader hat keine gültige Token-Antwort geliefert.",
        )
    })?;
    if !status.is_success() || parsed.error_code.is_some() {
        return Err(command_error(
            parsed.error_code.as_deref().unwrap_or("CTRADER_AUTH_ERROR"),
            parsed
                .description
                .as_deref()
                .unwrap_or("Die cTrader-Autorisierung wurde abgelehnt."),
        ));
    }
    let access_token = parsed.access_token.ok_or_else(|| {
        command_error(
            "CTRADER_AUTH_ERROR",
            "cTrader hat kein Zugriffstoken geliefert.",
        )
    })?;
    let refresh_token = parsed.refresh_token.ok_or_else(|| {
        command_error(
            "CTRADER_AUTH_ERROR",
            "cTrader hat kein Erneuerungstoken geliefert.",
        )
    })?;
    Ok(StoredCTraderToken {
        access_token,
        refresh_token,
        expires_at: Utc::now().timestamp() + parsed.expires_in.unwrap_or(2_628_000),
    })
}

async fn refresh_token_if_needed(
    config: &CTraderConfig,
    credential_ref: &str,
    token: &mut StoredCTraderToken,
) -> CommandResult<()> {
    if token.expires_at > Utc::now().timestamp() + 120 {
        return Ok(());
    }
    let refreshed = request_ctrader_token(
        config,
        &[
            ("grant_type", "refresh_token"),
            ("refresh_token", &token.refresh_token),
        ],
    )
    .await?;
    store_token(credential_ref, &refreshed)?;
    *token = refreshed;
    Ok(())
}

fn store_token(reference: &str, token: &StoredCTraderToken) -> CommandResult<()> {
    let serialized = serde_json::to_string(token).map_err(|_| {
        command_error(
            "CREDENTIAL_STORE_ERROR",
            "Das cTrader-Token konnte nicht geschützt werden.",
        )
    })?;
    Entry::new(KEYRING_SERVICE, reference)
        .and_then(|entry| entry.set_password(&serialized))
        .map_err(|_| {
            command_error(
                "CREDENTIAL_STORE_ERROR",
                "Das cTrader-Token konnte nicht im Windows-Anmeldedatenspeicher gesichert werden.",
            )
        })
}

fn load_token(reference: &str) -> CommandResult<StoredCTraderToken> {
    let serialized = Entry::new(KEYRING_SERVICE, reference)
        .and_then(|entry| entry.get_password())
        .map_err(|_| {
            command_error(
                "CTRADER_REAUTHORIZE",
                "Die geschützte cTrader-Autorisierung fehlt. Bitte verbinde das Konto erneut.",
            )
        })?;
    serde_json::from_str(&serialized).map_err(|_| {
        command_error(
            "CTRADER_REAUTHORIZE",
            "Die geschützte cTrader-Autorisierung ist ungültig.",
        )
    })
}

fn load_ctrader_config() -> CommandResult<Option<CTraderConfig>> {
    load_local_env();
    let client_id = std::env::var("CTRADER_CLIENT_ID")
        .unwrap_or_default()
        .trim()
        .to_string();
    let client_secret = std::env::var("CTRADER_CLIENT_SECRET")
        .unwrap_or_default()
        .trim()
        .to_string();
    let redirect_uri = std::env::var("CTRADER_REDIRECT_URI")
        .unwrap_or_default()
        .trim()
        .to_string();
    if client_id.is_empty() && client_secret.is_empty() && redirect_uri.is_empty() {
        return Ok(None);
    }
    if client_id.is_empty() || client_secret.is_empty() || redirect_uri.is_empty() {
        return Err(command_error(
            "CTRADER_CONFIG_ERROR",
            "Die cTrader-Konfiguration in .env.local ist unvollständig.",
        ));
    }
    let parsed = Url::parse(&redirect_uri).map_err(|_| {
        command_error(
            "CTRADER_CONFIG_ERROR",
            "CTRADER_REDIRECT_URI ist keine gültige URL.",
        )
    })?;
    if !matches!(parsed.scheme(), "https" | "http") {
        return Err(command_error(
            "CTRADER_CONFIG_ERROR",
            "CTRADER_REDIRECT_URI muss eine HTTP- oder HTTPS-Adresse sein.",
        ));
    }
    Ok(Some(CTraderConfig {
        client_id,
        client_secret,
        redirect_uri,
    }))
}

fn require_ctrader_config() -> CommandResult<CTraderConfig> {
    load_ctrader_config()?.ok_or_else(|| {
        command_error(
            "CTRADER_NOT_CONFIGURED",
            "cTrader Open API ist noch nicht in .env.local konfiguriert.",
        )
    })
}

fn load_local_env() {
    for candidate in [
        PathBuf::from(".env.local"),
        PathBuf::from("../.env.local"),
        PathBuf::from("../../.env.local"),
        PathBuf::from("../../../.env.local"),
    ] {
        if candidate.is_file() {
            let _ = dotenvy::from_path(candidate);
            break;
        }
    }
}

fn extract_authorization_code(value: &str) -> CommandResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 4_096 {
        return Err(CommandError::validation(
            "Bitte füge den cTrader-Autorisierungscode oder die vollständige Weiterleitungsadresse ein.",
        ));
    }
    if let Ok(url) = Url::parse(trimmed)
        && let Some((_, code)) = url.query_pairs().find(|(key, _)| key == "code")
    {
        return Ok(code.into_owned());
    }
    if trimmed
        .chars()
        .all(|char| char.is_ascii_alphanumeric() || matches!(char, '-' | '_' | '.'))
    {
        return Ok(trimmed.to_string());
    }
    Err(CommandError::validation(
        "Der cTrader-Autorisierungscode ist ungültig.",
    ))
}

async fn ensure_connection_available(
    db: &sqlx::SqlitePool,
    platform: &str,
    external_account_id: &str,
    environment: &str,
) -> CommandResult<()> {
    let existing: Option<String> = sqlx::query_scalar(
        "SELECT a.name FROM broker_account_connections c JOIN accounts a ON a.id = c.local_account_id WHERE c.platform = ? AND c.external_account_id = ? AND c.environment = ?",
    )
    .bind(platform)
    .bind(external_account_id)
    .bind(environment)
    .fetch_optional(db)
    .await
    .map_err(AppError::from)?;
    if let Some(name) = existing {
        return Err(command_error(
            "BROKER_ACCOUNT_ALREADY_CONNECTED",
            &format!("Dieses Broker-Konto ist bereits mit „{name}“ verbunden."),
        ));
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn insert_connected_account(
    transaction: &mut Transaction<'_, Sqlite>,
    account_name: &str,
    broker: &str,
    currency: &str,
    risk: f64,
    platform: &str,
    external_account_id: &str,
    account_login: Option<&str>,
    server_name: Option<&str>,
    environment: &str,
    balance_minor: Option<i64>,
    equity_minor: Option<i64>,
    credential_ref: Option<&str>,
    status_message: Option<&str>,
) -> CommandResult<(String, String)> {
    let currency = currency.trim().to_uppercase();
    if currency.len() != 3 || !currency.chars().all(|char| char.is_ascii_alphabetic()) {
        return Err(CommandError::validation(
            "Das Broker-Konto liefert keine gültige Basiswährung.",
        ));
    }
    let account_id = Uuid::new_v4().to_string();
    let connection_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO accounts (id, name, broker, account_type, base_currency, initial_balance_minor, default_risk_percent, created_at, updated_at) VALUES (?, ?, ?, 'connected', ?, 0, ?, ?, ?)")
        .bind(&account_id)
        .bind(account_name)
        .bind(broker)
        .bind(&currency)
        .bind(risk)
        .bind(&now)
        .bind(&now)
        .execute(&mut **transaction)
        .await
        .map_err(AppError::from)?;
    sqlx::query("INSERT INTO broker_account_connections (id, local_account_id, platform, external_account_id, account_login, broker_name, server_name, environment, access_scope, status, base_currency, balance_minor, equity_minor, credential_ref, status_message, last_sync_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'accounts', 'connected', ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&connection_id)
        .bind(&account_id)
        .bind(platform)
        .bind(external_account_id)
        .bind(account_login)
        .bind(broker)
        .bind(server_name)
        .bind(environment)
        .bind(&currency)
        .bind(balance_minor)
        .bind(equity_minor)
        .bind(credential_ref)
        .bind(status_message)
        .bind(&now)
        .bind(&now)
        .bind(&now)
        .execute(&mut **transaction)
        .await
        .map_err(AppError::from)?;
    Ok((account_id, connection_id))
}

async fn load_connected_result(
    db: &sqlx::SqlitePool,
    account_id: &str,
    connection_id: &str,
) -> CommandResult<ConnectedAccountResult> {
    Ok(ConnectedAccountResult {
        account_id: account_id.to_string(),
        connection: load_connection(db, connection_id).await?,
    })
}

async fn load_connection(
    db: &sqlx::SqlitePool,
    connection_id: &str,
) -> CommandResult<BrokerConnectionView> {
    sqlx::query_as::<_, BrokerConnectionView>(
        "SELECT c.id, c.local_account_id, a.name AS local_account_name, c.platform, c.external_account_id, c.account_login, c.broker_name, c.server_name, c.environment, c.status, c.base_currency, c.balance_minor, c.equity_minor, c.status_message, c.last_sync_at FROM broker_account_connections c JOIN accounts a ON a.id = c.local_account_id WHERE c.id = ?",
    )
    .bind(connection_id)
    .fetch_optional(db)
    .await
    .map_err(AppError::from)?
    .ok_or_else(|| command_error("NOT_FOUND", "Die Broker-Verbindung wurde nicht gefunden."))
}

async fn load_connections(db: &sqlx::SqlitePool) -> CommandResult<Vec<BrokerConnectionView>> {
    sqlx::query_as::<_, BrokerConnectionView>(
        "SELECT c.id, c.local_account_id, a.name AS local_account_name, c.platform, c.external_account_id, c.account_login, c.broker_name, c.server_name, c.environment, c.status, c.base_currency, c.balance_minor, c.equity_minor, c.status_message, c.last_sync_at FROM broker_account_connections c JOIN accounts a ON a.id = c.local_account_id WHERE a.is_archived = 0 ORDER BY a.name",
    )
    .fetch_all(db)
    .await
    .map_err(AppError::from)
    .map_err(Into::into)
}

fn validate_risk(value: f64) -> CommandResult<()> {
    if !value.is_finite() || !(0.01..=100.0).contains(&value) {
        return Err(CommandError::validation(
            "Das Standardrisiko muss zwischen 0,01 und 100 Prozent liegen.",
        ));
    }
    Ok(())
}

fn validate_identifier(value: &str, message: &str) -> CommandResult<()> {
    if value.is_empty()
        || value.len() > 100
        || !value
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || char == '-')
    {
        return Err(CommandError::validation(message));
    }
    Ok(())
}

fn clean_optional_name(value: Option<String>) -> Option<String> {
    value
        .map(|name| name.trim().chars().take(80).collect::<String>())
        .filter(|name| !name.is_empty())
}

fn money_to_minor(value: Option<f64>) -> Option<i64> {
    value
        .filter(|number| number.is_finite())
        .and_then(Decimal::from_f64)
        .and_then(|number| (number * Decimal::from(100)).round().try_into().ok())
}

fn scaled_money_to_minor(value: i128, digits: u32) -> CommandResult<i64> {
    let scale = 10_i128.checked_pow(digits).ok_or_else(|| {
        command_error(
            "CTRADER_RESPONSE_ERROR",
            "Die cTrader-Geldskalierung ist ungültig.",
        )
    })?;
    let minor = value
        .checked_mul(100)
        .and_then(|number| {
            if number >= 0 {
                number.checked_add(scale / 2)
            } else {
                number.checked_sub(scale / 2)
            }
        })
        .map(|number| number / scale)
        .and_then(|number| i64::try_from(number).ok())
        .ok_or_else(|| {
            command_error(
                "CTRADER_RESPONSE_ERROR",
                "Der cTrader-Kontostand liegt außerhalb des unterstützten Bereichs.",
            )
        })?;
    Ok(minor)
}

fn json_string(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::to_string)
        .or_else(|| value.as_i64().map(|number| number.to_string()))
        .or_else(|| value.as_u64().map(|number| number.to_string()))
}

fn json_i128(value: &Value) -> Option<i128> {
    value
        .as_i64()
        .map(i128::from)
        .or_else(|| value.as_u64().map(i128::from))
        .or_else(|| value.as_str()?.parse().ok())
}

fn json_u32(value: &Value) -> Option<u32> {
    value
        .as_u64()
        .and_then(|number| u32::try_from(number).ok())
        .or_else(|| value.as_str()?.parse().ok())
}

fn command_error(code: &str, message: &str) -> CommandError {
    CommandError {
        code: code.into(),
        message: message.chars().take(500).collect(),
        details: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_code_without_accepting_arbitrary_redirect_text() {
        assert_eq!(
            extract_authorization_code("https://localhost/callback?code=abc_123").unwrap(),
            "abc_123"
        );
        assert_eq!(extract_authorization_code("abc-123").unwrap(), "abc-123");
        assert!(extract_authorization_code("not a code").is_err());
    }

    #[test]
    fn ctrader_money_scaling_respects_provider_digits() {
        assert_eq!(scaled_money_to_minor(1_005_309_944, 8).unwrap(), 1_005);
        assert_eq!(scaled_money_to_minor(12_345, 2).unwrap(), 12_345);
        assert_eq!(scaled_money_to_minor(-12_345, 2).unwrap(), -12_345);
    }

    #[tokio::test]
    async fn connected_account_is_unique_and_uses_broker_balance() {
        let state = crate::database::initialize_headless().await.unwrap();
        let mut tx = state.db.begin().await.unwrap();
        let (account_id, connection_id) = insert_connected_account(
            &mut tx,
            "IC Markets MT5 123",
            "IC Markets",
            "EUR",
            1.0,
            "mt5",
            "icmarkets-live:123",
            Some("123"),
            Some("ICMarkets-Live"),
            "local",
            Some(100_000),
            Some(100_500),
            None,
            None,
        )
        .await
        .unwrap();
        tx.commit().await.unwrap();
        let result = load_connected_result(&state.db, &account_id, &connection_id)
            .await
            .unwrap();
        assert_eq!(result.connection.balance_minor, Some(100_000));
        assert_eq!(result.connection.equity_minor, Some(100_500));
        assert!(
            ensure_connection_available(&state.db, "mt5", "icmarkets-live:123", "local")
                .await
                .is_err()
        );
    }
}
