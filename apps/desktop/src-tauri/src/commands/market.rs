use std::{
    fs,
    process::{Command, Stdio},
};

use chrono::Utc;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use tauri::State;

use crate::{
    database::AppState,
    errors::{AppError, CommandError, CommandResult},
};

const CONNECTOR_SOURCE: &str = include_str!("../../connectors/blackbull_mt5_connector.py");
const MAX_CANDLES: u16 = 5_000;
const MAX_HISTORY_CANDLES: u32 = 50_000;

pub trait MarketDataProvider {
    fn status(&self) -> Result<MarketStatus, CommandError>;
    fn symbols(&self) -> Result<Vec<MarketSymbol>, CommandError>;
    fn candles(&self, input: &MarketCandlesInput) -> Result<Vec<Candle>, CommandError>;
    fn quote(&self, symbol: &str) -> Result<MarketQuote, CommandError>;
}

pub struct BlackBullMt5Provider<'a> {
    state: &'a AppState,
}

impl<'a> BlackBullMt5Provider<'a> {
    fn new(state: &'a AppState) -> Self {
        Self { state }
    }

    fn request<T: DeserializeOwned>(&self, request: Value) -> Result<T, CommandError> {
        run_connector(self.state, request)
    }
}

impl MarketDataProvider for BlackBullMt5Provider<'_> {
    fn status(&self) -> Result<MarketStatus, CommandError> {
        self.request(json!({ "action": "status" }))
    }

    fn symbols(&self) -> Result<Vec<MarketSymbol>, CommandError> {
        self.request(json!({ "action": "symbols" }))
    }

    fn candles(&self, input: &MarketCandlesInput) -> Result<Vec<Candle>, CommandError> {
        self.request(json!({
            "action": "candles",
            "symbol": input.symbol.trim(),
            "timeframe": input.timeframe,
            "limit": input.limit.unwrap_or(1500).min(MAX_CANDLES),
            "startPos": input.start_pos.unwrap_or(0).min(MAX_HISTORY_CANDLES),
        }))
    }

    fn quote(&self, symbol: &str) -> Result<MarketQuote, CommandError> {
        self.request(json!({ "action": "quote", "symbol": symbol.trim() }))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketStatus {
    pub connected: bool,
    pub provider: String,
    pub account_login: Option<String>,
    pub account_server: Option<String>,
    pub account_name: Option<String>,
    pub account_company: Option<String>,
    pub account_currency: Option<String>,
    pub balance: Option<f64>,
    pub equity: Option<f64>,
    pub last_update: String,
    pub code: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketSymbol {
    pub symbol: String,
    pub description: Option<String>,
    pub path: Option<String>,
    pub category: String,
    pub visible: bool,
    pub digits: Option<i32>,
    pub base_currency: Option<String>,
    pub quote_currency: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Candle {
    pub time: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: Option<i64>,
    pub volume_kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketQuote {
    pub symbol: String,
    pub bid: Option<f64>,
    pub ask: Option<f64>,
    pub time: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketCandlesInput {
    pub symbol: String,
    pub timeframe: String,
    pub limit: Option<u16>,
    #[serde(default)]
    pub start_pos: Option<u32>,
}

#[derive(Deserialize)]
struct ConnectorResponse<T> {
    ok: bool,
    data: Option<T>,
    code: Option<String>,
    message: Option<String>,
}

#[tauri::command]
pub fn get_market_status(state: State<'_, AppState>) -> CommandResult<MarketStatus> {
    match market_status(&state) {
        Ok(status) => Ok(status),
        Err(error) => Ok(MarketStatus {
            connected: false,
            provider: "BlackBull MT5".into(),
            account_login: None,
            account_server: None,
            account_name: None,
            account_company: None,
            account_currency: None,
            balance: None,
            equity: None,
            last_update: Utc::now().to_rfc3339(),
            code: Some(error.code),
            message: Some(error.message),
        }),
    }
}

pub(crate) fn market_status(state: &AppState) -> Result<MarketStatus, CommandError> {
    BlackBullMt5Provider::new(state).status()
}

#[tauri::command]
pub fn list_market_symbols(state: State<'_, AppState>) -> CommandResult<Vec<MarketSymbol>> {
    market_symbols(&state)
}

pub fn market_symbols(state: &AppState) -> Result<Vec<MarketSymbol>, CommandError> {
    BlackBullMt5Provider::new(state).symbols()
}

#[tauri::command]
pub fn get_market_candles(
    state: State<'_, AppState>,
    input: MarketCandlesInput,
) -> CommandResult<Vec<Candle>> {
    market_candles(&state, &input)
}

pub fn market_candles(
    state: &AppState,
    input: &MarketCandlesInput,
) -> Result<Vec<Candle>, CommandError> {
    validate_candle_input(input)?;
    let mut candles = BlackBullMt5Provider::new(state).candles(input)?;
    candles.sort_by_key(|candle| candle.time);
    candles.dedup_by_key(|candle| candle.time);
    Ok(candles)
}

pub fn market_history(
    state: &AppState,
    symbol: &str,
    timeframe: &str,
) -> Result<Vec<Candle>, CommandError> {
    let mut all = Vec::new();
    let mut start_pos = 0_u32;
    loop {
        let page = market_candles(
            state,
            &MarketCandlesInput {
                symbol: symbol.into(),
                timeframe: timeframe.into(),
                limit: Some(MAX_CANDLES),
                start_pos: Some(start_pos),
            },
        )?;
        let page_len = page.len();
        all.extend(page);
        if page_len < usize::from(MAX_CANDLES)
            || start_pos + u32::from(MAX_CANDLES) >= MAX_HISTORY_CANDLES
        {
            break;
        }
        start_pos += u32::from(MAX_CANDLES);
    }
    all.sort_by_key(|candle| candle.time);
    all.dedup_by_key(|candle| candle.time);
    Ok(all)
}

#[tauri::command]
pub fn get_market_quote(state: State<'_, AppState>, symbol: String) -> CommandResult<MarketQuote> {
    if symbol.trim().is_empty() {
        return Err(CommandError::validation(
            "Bitte wähle ein BlackBull-Symbol aus.",
        ));
    }
    BlackBullMt5Provider::new(&state).quote(&symbol)
}

fn validate_candle_input(input: &MarketCandlesInput) -> CommandResult<()> {
    if input.symbol.trim().is_empty() {
        return Err(CommandError::validation(
            "Bitte wähle ein BlackBull-Symbol aus.",
        ));
    }
    if !matches!(
        input.timeframe.as_str(),
        "M1" | "M5" | "M15" | "M30" | "H1" | "H4" | "D1" | "W1"
    ) {
        return Err(CommandError::validation(
            "Der Zeitrahmen wird nicht unterstützt.",
        ));
    }
    Ok(())
}

pub(crate) fn run_connector<T: DeserializeOwned>(
    state: &AppState,
    request: Value,
) -> Result<T, CommandError> {
    let connector_path = state.paths.settings.join("blackbull_mt5_connector.py");
    fs::write(&connector_path, CONNECTOR_SOURCE)
        .map_err(AppError::from)
        .map_err(CommandError::from)?;
    let request_json = serde_json::to_string(&request).map_err(|_| {
        connector_error(
            "MARKET_REQUEST_ERROR",
            "Die Marktanfrage konnte nicht vorbereitet werden.",
        )
    })?;

    let output = invoke_python("python", &[], &connector_path, &request_json)
        .or_else(|_| invoke_python("py", &["-3"], &connector_path, &request_json))?;
    let parsed: ConnectorResponse<T> = serde_json::from_slice(&output.stdout).map_err(|_| {
        connector_error(
            "MT5_CONNECTOR_ERROR",
            "Der lokale MT5-Connector hat keine gültige Antwort geliefert.",
        )
    })?;
    if !parsed.ok {
        return Err(connector_error(
            parsed.code.as_deref().unwrap_or("MT5_CONNECTOR_ERROR"),
            parsed
                .message
                .as_deref()
                .unwrap_or("Die BlackBull-MT5-Verbindung konnte nicht hergestellt werden."),
        ));
    }
    parsed.data.ok_or_else(|| {
        connector_error(
            "MT5_CONNECTOR_ERROR",
            "Der MT5-Connector hat keine Daten geliefert.",
        )
    })
}

fn invoke_python(
    executable: &str,
    args: &[&str],
    connector_path: &std::path::Path,
    request: &str,
) -> Result<std::process::Output, CommandError> {
    let mut command = Command::new(executable);
    command
        .args(args)
        .arg(connector_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    // Der Connector wird für den kontrollierten Live-Abruf regelmäßig als
    // Kurzprozess gestartet. Ohne dieses Flag erstellt Windows dabei für jeden
    // Python-Aufruf ein sichtbares Konsolenfenster.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command.spawn().map_err(|_| {
        connector_error(
            "PYTHON_NOT_FOUND",
            "Python wurde nicht gefunden. Installiere Python 3 und das Paket MetaTrader5.",
        )
    })?;
    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        stdin.write_all(request.as_bytes()).map_err(|_| {
            connector_error(
                "MT5_CONNECTOR_ERROR",
                "Die Marktanfrage konnte nicht an den MT5-Connector gesendet werden.",
            )
        })?;
    }
    child.wait_with_output().map_err(|_| {
        connector_error(
            "MT5_CONNECTOR_ERROR",
            "Der MT5-Connector konnte nicht abgeschlossen werden.",
        )
    })
}

fn connector_error(code: &str, message: &str) -> CommandError {
    CommandError {
        code: code.into(),
        message: message.into(),
        details: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_supported_timeframes() {
        assert!(
            validate_candle_input(&MarketCandlesInput {
                symbol: "EURUSD".into(),
                timeframe: "H1".into(),
                limit: Some(1500),
                start_pos: None,
            })
            .is_ok()
        );
        assert!(
            validate_candle_input(&MarketCandlesInput {
                symbol: "EURUSD".into(),
                timeframe: "H2".into(),
                limit: None,
                start_pos: None,
            })
            .is_err()
        );
    }

    #[test]
    fn sorts_and_deduplicates_candles_by_utc_timestamp() {
        let mut candles = vec![
            Candle {
                time: 2,
                open: 1.0,
                high: 1.0,
                low: 1.0,
                close: 1.0,
                volume: Some(1),
                volume_kind: "tick".into(),
            },
            Candle {
                time: 1,
                open: 1.0,
                high: 1.0,
                low: 1.0,
                close: 1.0,
                volume: Some(1),
                volume_kind: "tick".into(),
            },
            Candle {
                time: 2,
                open: 2.0,
                high: 2.0,
                low: 2.0,
                close: 2.0,
                volume: Some(2),
                volume_kind: "tick".into(),
            },
        ];
        candles.sort_by_key(|candle| candle.time);
        candles.dedup_by_key(|candle| candle.time);
        assert_eq!(candles.len(), 2);
        assert_eq!(candles[0].time, 1);
    }
}
