use std::{
    collections::HashSet,
    fs::File,
    io::{Cursor, Read},
    path::{Path, PathBuf},
    str::FromStr,
};

use calamine::{Data, Reader, Xlsx};
use chrono::{FixedOffset, LocalResult, NaiveDateTime, TimeZone, Utc};
use chrono_tz::Tz;
use regex::Regex;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use tauri::State;
use uuid::Uuid;

use super::metatrader_html::{
    MAX_FILE_BYTES, active_account, active_account_on_connection, classify_asset_class,
    command_error, decode_report, html_text, mask_account, parse_money, parse_positive_decimal,
    sanitize_active_content, sha256_hex, validate_symbol,
};
use crate::{
    database::AppState,
    errors::{CommandError, CommandResult},
};

const MAX_TABLES: usize = 64;
const MAX_ROWS: usize = 25_000;
const MAX_CELLS_PER_ROW: usize = 64;

#[derive(Debug)]
struct CTraderStatementError {
    code: &'static str,
    message: &'static str,
}

impl CTraderStatementError {
    fn new(code: &'static str, message: &'static str) -> Self {
        Self { code, message }
    }

    #[cfg(test)]
    fn code(&self) -> &'static str {
        self.code
    }

    fn command(self) -> CommandError {
        command_error(self.code, self.message)
    }
}

impl std::fmt::Display for CTraderStatementError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.message)
    }
}

impl std::error::Error for CTraderStatementError {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CTraderStatementIdentity {
    report_account: String,
    base_currency: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CTraderIgnoredCounts {
    open_positions: usize,
    orders: usize,
    transactions: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParsedCTraderTrade {
    source_trade_id: String,
    symbol: String,
    direction: String,
    quantity: String,
    entry_price: String,
    exit_price: String,
    opened_at: Option<String>,
    closed_at: String,
    display_timezone: String,
    gross_pnl_minor: Option<i64>,
    net_pnl_minor: i64,
    cost_breakdown_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParsedCTraderRow {
    row_number: usize,
    source_trade_id: Option<String>,
    trade: Option<ParsedCTraderTrade>,
    errors: Vec<String>,
}

#[derive(Debug, Clone)]
struct ParsedCTraderStatement {
    identity: CTraderStatementIdentity,
    source_timezone: String,
    format: String,
    rows: Vec<ParsedCTraderRow>,
    ignored: CTraderIgnoredCounts,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CTraderStatementPreviewInput {
    pub path: String,
    pub account_id: String,
    pub source_timezone: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CTraderStatementCommitInput {
    pub run_id: String,
    pub account_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CTraderStatementRowPreview {
    pub row_number: usize,
    pub status: String,
    pub source_trade_id: Option<String>,
    pub symbol: Option<String>,
    pub direction: Option<String>,
    pub opened_at: Option<String>,
    pub closed_at: Option<String>,
    pub net_pnl_minor: Option<i64>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CTraderStatementPreview {
    pub run_id: String,
    pub format: String,
    pub masked_source_account: String,
    pub base_currency: String,
    pub target_account_currency: String,
    pub currency_mismatch: bool,
    pub source_timezone: String,
    pub valid: usize,
    pub invalid: usize,
    pub duplicate: usize,
    pub conflict: usize,
    pub open_positions: usize,
    pub orders: usize,
    pub transactions: usize,
    pub can_commit: bool,
    pub rows: Vec<CTraderStatementRowPreview>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CTraderStatementCommitResult {
    pub run_id: String,
    pub inserted: usize,
    pub duplicate: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StagedCTraderSource {
    report_account_sha256: String,
    report_account_masked: String,
    base_currency: String,
    source_timezone: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StagedCTraderTrade {
    trade: ParsedCTraderTrade,
    payload_sha256: String,
}

#[derive(Clone, Copy)]
struct CTraderHeaderMap {
    symbol: usize,
    direction: usize,
    closed: usize,
    entry: usize,
    exit: usize,
    quantity: usize,
    net: usize,
    balance: Option<usize>,
}

impl CTraderHeaderMap {
    fn from_cells(cells: &[String]) -> Option<Self> {
        let normalized = cells
            .iter()
            .map(|cell| header_key(cell))
            .collect::<Vec<_>>();
        let find = |aliases: &[&str]| {
            normalized
                .iter()
                .position(|value| aliases.iter().any(|alias| value == alias))
        };
        let symbol = find(&["symbol"])?;
        let direction = find(&["openingdirection", "direction"])?;
        let closed = normalized
            .iter()
            .position(|value| value.starts_with("closingtime") || value.starts_with("closetime"))?;
        let entry = find(&["entryprice", "openingprice"])?;
        let exit = find(&["closingprice", "exitprice"])?;
        let quantity = find(&["closingquantity", "quantity", "volume"])?;
        let net = normalized.iter().position(|value| {
            value == "net"
                || value.starts_with("netusd")
                || value.starts_with("neteur")
                || value.starts_with("netgbp")
        })?;
        let balance = normalized
            .iter()
            .position(|value| value.starts_with("balance"));
        Some(Self {
            symbol,
            direction,
            closed,
            entry,
            exit,
            quantity,
            net,
            balance,
        })
    }

    fn max_index(self) -> usize {
        [
            self.symbol,
            self.direction,
            self.closed,
            self.entry,
            self.exit,
            self.quantity,
            self.net,
            self.balance.unwrap_or(0),
        ]
        .into_iter()
        .max()
        .unwrap_or(0)
    }
}

#[derive(Clone, Copy)]
enum StatementOffset {
    Fixed(FixedOffset),
    Named(Tz),
}

impl StatementOffset {
    fn label(self) -> String {
        match self {
            Self::Fixed(offset) => {
                let seconds = offset.local_minus_utc();
                let sign = if seconds < 0 { '-' } else { '+' };
                let absolute = seconds.unsigned_abs();
                format!(
                    "UTC{sign}{:02}:{:02}",
                    absolute / 3600,
                    (absolute % 3600) / 60
                )
            }
            Self::Named(timezone) => timezone.name().to_owned(),
        }
    }
}

#[tauri::command]
pub async fn preview_ctrader_statement(
    state: State<'_, AppState>,
    input: CTraderStatementPreviewInput,
) -> CommandResult<CTraderStatementPreview> {
    preview_ctrader_statement_core(
        &state.db,
        Path::new(&input.path),
        &input.account_id,
        &input.source_timezone,
    )
    .await
}

#[tauri::command]
pub async fn commit_ctrader_statement(
    state: State<'_, AppState>,
    input: CTraderStatementCommitInput,
) -> CommandResult<CTraderStatementCommitResult> {
    commit_ctrader_statement_core(&state.db, &input.run_id, &input.account_id).await
}

fn parse_ctrader_statement(
    bytes: &[u8],
    extension: &str,
    fallback_timezone: Tz,
) -> Result<ParsedCTraderStatement, CTraderStatementError> {
    match extension {
        "html" | "htm" => parse_ctrader_html(bytes, fallback_timezone),
        "xlsx" => parse_ctrader_xlsx(bytes, fallback_timezone),
        _ => Err(format_error("INVALID_FILE_EXTENSION")),
    }
}

fn parse_ctrader_html(
    bytes: &[u8],
    fallback_timezone: Tz,
) -> Result<ParsedCTraderStatement, CTraderStatementError> {
    let decoded = decode_report(bytes).map_err(|_| format_error("INVALID_ENCODING"))?;
    let inert =
        sanitize_active_content(&decoded).map_err(|_| format_error("CTRADER_STATEMENT_INVALID"))?;
    let table_re = regex(r"(?is)<table\b[^>]*>(.*?)</table\s*>")?;
    let row_re = regex(r"(?is)<tr\b[^>]*>(.*?)</tr\s*>")?;
    let cell_re = regex(r"(?is)<t[dh]\b[^>]*>(.*?)</t[dh]\s*>")?;
    let mut tables = Vec::new();
    for table in table_re.captures_iter(&inert) {
        if tables.len() >= MAX_TABLES {
            return Err(format_error("PARSER_LIMIT_EXCEEDED"));
        }
        let mut rows = Vec::new();
        for row in row_re.captures_iter(&table[1]) {
            if rows.len() >= MAX_ROWS {
                return Err(format_error("PARSER_LIMIT_EXCEEDED"));
            }
            let cells = cell_re
                .captures_iter(&row[1])
                .map(|cell| {
                    html_text(&cell[1]).map_err(|_| format_error("CTRADER_STATEMENT_INVALID"))
                })
                .collect::<Result<Vec<_>, _>>()?;
            if cells.len() > MAX_CELLS_PER_ROW {
                return Err(format_error("PARSER_LIMIT_EXCEEDED"));
            }
            if !cells.is_empty() {
                rows.push(cells);
            }
        }
        if !rows.is_empty() {
            tables.push(rows);
        }
    }
    if tables.is_empty() {
        return Err(format_error("CTRADER_HISTORY_NOT_FOUND"));
    }
    parse_ctrader_tables(&tables, fallback_timezone, "html")
}

fn parse_ctrader_xlsx(
    bytes: &[u8],
    fallback_timezone: Tz,
) -> Result<ParsedCTraderStatement, CTraderStatementError> {
    let mut workbook =
        Xlsx::new(Cursor::new(bytes)).map_err(|_| format_error("CTRADER_WORKBOOK_INVALID"))?;
    let sheet_names = workbook.sheet_names().to_vec();
    let mut tables = Vec::new();
    for sheet_name in sheet_names {
        let range = workbook
            .worksheet_range(&sheet_name)
            .map_err(|_| format_error("CTRADER_WORKBOOK_INVALID"))?;
        let rows = range
            .rows()
            .map(|row| row.iter().map(cell_text).collect::<Vec<_>>())
            .filter(|row| row.iter().any(|cell| !cell.trim().is_empty()))
            .collect::<Vec<_>>();
        if !rows.is_empty() {
            tables.push(rows);
        }
    }
    if tables.is_empty() {
        return Err(CTraderStatementError::new(
            "CTRADER_WORKBOOK_EMPTY",
            "Die ausgewählte cTrader-XLSX-Datei enthält keine Trade-Zeilen. Bitte den HTML-Kontoauszug verwenden.",
        ));
    }
    parse_ctrader_tables(&tables, fallback_timezone, "xlsx")
}

fn parse_ctrader_tables(
    tables: &[Vec<Vec<String>>],
    fallback_timezone: Tz,
    format: &str,
) -> Result<ParsedCTraderStatement, CTraderStatementError> {
    let all_rows = tables.iter().flatten().cloned().collect::<Vec<_>>();
    let identity = parse_identity(&all_rows)?;
    let (history_rows, header_index, header_map) = tables
        .iter()
        .find_map(|rows| {
            let section = rows
                .iter()
                .position(|cells| section_name(cells).as_deref() == Some("history"))?;
            let (offset, map) =
                rows.iter()
                    .enumerate()
                    .skip(section + 1)
                    .find_map(|(index, cells)| {
                        CTraderHeaderMap::from_cells(cells).map(|map| (index, map))
                    })?;
            Some((rows, offset, map))
        })
        .ok_or_else(|| format_error("CTRADER_HISTORY_NOT_FOUND"))?;
    let statement_offset = parse_statement_offset(
        history_rows
            .get(header_index)
            .and_then(|row| row.get(header_map.closed))
            .map(String::as_str)
            .unwrap_or(""),
        fallback_timezone,
    )?;
    let mut rows = Vec::new();
    let mut seen = HashSet::new();
    for (offset, cells) in history_rows.iter().skip(header_index + 1).enumerate() {
        if cells.iter().all(|cell| cell.trim().is_empty()) {
            continue;
        }
        if section_name(cells).is_some()
            || is_history_footer(cells, &header_map)
            || cells.len() <= header_map.max_index()
        {
            break;
        }
        let parsed = parse_ctrader_row(offset + 1, cells, &header_map, statement_offset);
        if let Some(source_trade_id) = parsed.source_trade_id.as_ref()
            && !seen.insert(source_trade_id.clone())
        {
            return Err(format_error("DUPLICATE_SOURCE_TRADE_ID"));
        }
        rows.push(parsed);
    }
    if rows.is_empty() {
        return Err(format_error("CTRADER_HISTORY_NOT_FOUND"));
    }
    Ok(ParsedCTraderStatement {
        identity,
        source_timezone: statement_offset.label(),
        format: format.to_owned(),
        rows,
        ignored: count_ignored(tables),
    })
}

fn is_history_footer(cells: &[String], map: &CTraderHeaderMap) -> bool {
    let label = cells
        .first()
        .map(|cell| header_key(cell))
        .unwrap_or_default();
    let is_total_label = matches!(label.as_str(), "totals" | "total" | "gesamt" | "summe");
    let trade_identity_is_empty = [
        map.symbol,
        map.direction,
        map.closed,
        map.entry,
        map.exit,
        map.quantity,
    ]
    .into_iter()
    .all(|index| cells.get(index).is_none_or(|cell| cell.trim().is_empty()));
    is_total_label && trade_identity_is_empty
}

fn parse_ctrader_row(
    row_number: usize,
    cells: &[String],
    map: &CTraderHeaderMap,
    statement_offset: StatementOffset,
) -> ParsedCTraderRow {
    let mut errors = Vec::new();
    let symbol =
        validate_symbol(&cells[map.symbol], &mut errors).map(|symbol| symbol.to_ascii_uppercase());
    let direction = match header_key(&cells[map.direction]).as_str() {
        "buy" | "long" => Some("long".to_owned()),
        "sell" | "short" => Some("short".to_owned()),
        _ => {
            errors.push("UNSUPPORTED_POSITION_TYPE".to_owned());
            None
        }
    };
    let closed_at = parse_ctrader_time(&cells[map.closed], statement_offset, &mut errors);
    let entry = parse_positive_decimal(
        &normalize_decimal(&cells[map.entry]),
        "INVALID_ENTRY_PRICE",
        &mut errors,
    );
    let exit = parse_positive_decimal(
        &normalize_decimal(&cells[map.exit]),
        "INVALID_EXIT_PRICE",
        &mut errors,
    );
    let quantity = parse_ctrader_quantity(&cells[map.quantity], &mut errors);
    let net = parse_money(
        &normalize_decimal(&cells[map.net]),
        "INVALID_NET_PNL",
        &mut errors,
    );
    let balance = map
        .balance
        .and_then(|index| cells.get(index))
        .map(|value| normalize_decimal(value))
        .unwrap_or_default();
    let source_trade_id = match (
        symbol.as_deref(),
        direction.as_deref(),
        closed_at.as_deref(),
        entry.as_ref(),
        exit.as_ref(),
        quantity.as_ref(),
        net,
    ) {
        (
            Some(symbol),
            Some(direction),
            Some(closed),
            Some(entry),
            Some(exit),
            Some(quantity),
            Some(net),
        ) => Some(sha256_hex(format!(
            "{symbol}|{direction}|{closed}|{}|{}|{}|{net}|{balance}",
            entry.normalize(),
            exit.normalize(),
            quantity.normalize(),
        ))),
        _ => None,
    };
    let trade = if errors.is_empty() {
        Some(ParsedCTraderTrade {
            source_trade_id: source_trade_id.clone().expect("validated source id"),
            symbol: symbol.expect("validated symbol"),
            direction: direction.expect("validated direction"),
            quantity: quantity
                .expect("validated quantity")
                .normalize()
                .to_string(),
            entry_price: entry.expect("validated entry").normalize().to_string(),
            exit_price: exit.expect("validated exit").normalize().to_string(),
            opened_at: None,
            closed_at: closed_at.expect("validated close time"),
            display_timezone: statement_offset.label(),
            gross_pnl_minor: None,
            net_pnl_minor: net.expect("validated net pnl"),
            cost_breakdown_available: false,
        })
    } else {
        None
    };
    ParsedCTraderRow {
        row_number,
        source_trade_id,
        trade,
        errors,
    }
}

fn parse_identity(rows: &[Vec<String>]) -> Result<CTraderStatementIdentity, CTraderStatementError> {
    let account = labeled_value(rows, "account")
        .filter(|value| {
            value.len() >= 3 && value.chars().all(|character| character.is_ascii_digit())
        })
        .ok_or_else(|| format_error("REPORT_IDENTITY_MISSING"))?;
    let currency = labeled_value(rows, "currency")
        .map(|value| value.to_ascii_uppercase())
        .filter(|value| {
            value.len() == 3
                && value
                    .chars()
                    .all(|character| character.is_ascii_alphabetic())
        })
        .ok_or_else(|| format_error("REPORT_CURRENCY_MISSING"))?;
    Ok(CTraderStatementIdentity {
        report_account: account,
        base_currency: currency,
    })
}

fn labeled_value(rows: &[Vec<String>], label: &str) -> Option<String> {
    rows.iter().find_map(|row| {
        row.iter().enumerate().find_map(|(index, cell)| {
            (header_key(cell) == label).then(|| {
                row.iter()
                    .skip(index + 1)
                    .map(|value| value.trim())
                    .find(|value| !value.is_empty())
                    .map(str::to_owned)
            })?
        })
    })
}

fn parse_statement_offset(
    header: &str,
    fallback_timezone: Tz,
) -> Result<StatementOffset, CTraderStatementError> {
    let captures = regex(r"(?i)UTC\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?")?.captures(header);
    if let Some(captures) = captures {
        let hours = captures[2]
            .parse::<i32>()
            .map_err(|_| format_error("INVALID_STATEMENT_TIMEZONE"))?;
        let minutes = captures
            .get(3)
            .map(|value| value.as_str().parse::<i32>())
            .transpose()
            .map_err(|_| format_error("INVALID_STATEMENT_TIMEZONE"))?
            .unwrap_or(0);
        if hours > 23 || minutes > 59 {
            return Err(format_error("INVALID_STATEMENT_TIMEZONE"));
        }
        let sign = if &captures[1] == "-" { -1 } else { 1 };
        let seconds = sign * (hours * 3600 + minutes * 60);
        return FixedOffset::east_opt(seconds)
            .map(StatementOffset::Fixed)
            .ok_or_else(|| format_error("INVALID_STATEMENT_TIMEZONE"));
    }
    Ok(StatementOffset::Named(fallback_timezone))
}

fn parse_ctrader_time(
    value: &str,
    offset: StatementOffset,
    errors: &mut Vec<String>,
) -> Option<String> {
    let value = value.trim();
    let formats = [
        "%d/%m/%Y %H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S%.f",
        "%d.%m.%Y %H:%M:%S%.f",
    ];
    let Some(local) = formats
        .iter()
        .find_map(|format| NaiveDateTime::parse_from_str(value, format).ok())
    else {
        errors.push("INVALID_CLOSE_TIME".to_owned());
        return None;
    };
    match offset {
        StatementOffset::Fixed(offset) => offset
            .from_local_datetime(&local)
            .single()
            .map(|value| value.with_timezone(&Utc).to_rfc3339()),
        StatementOffset::Named(timezone) => match timezone.from_local_datetime(&local) {
            LocalResult::Single(value) => Some(value.with_timezone(&Utc).to_rfc3339()),
            LocalResult::Ambiguous(_, _) => {
                errors.push("AMBIGUOUS_LOCAL_TIME".to_owned());
                None
            }
            LocalResult::None => {
                errors.push("NONEXISTENT_LOCAL_TIME".to_owned());
                None
            }
        },
    }
}

fn parse_ctrader_quantity(value: &str, errors: &mut Vec<String>) -> Option<Decimal> {
    let suffix = Regex::new(r"(?i)\s*(?:lots?|units?)\s*$").expect("static quantity regex");
    let normalized = normalize_decimal(&suffix.replace(value.trim(), ""));
    parse_positive_decimal(&normalized, "INVALID_VOLUME", errors)
}

fn normalize_decimal(value: &str) -> String {
    let compact = value.replace([' ', '\u{a0}'], "");
    if compact.contains(',') && !compact.contains('.') {
        compact.replace(',', ".")
    } else {
        compact.replace(',', "")
    }
}

fn count_ignored(tables: &[Vec<Vec<String>>]) -> CTraderIgnoredCounts {
    let mut counts = CTraderIgnoredCounts::default();
    for rows in tables {
        let Some(section) = rows.iter().find_map(|cells| section_name(cells)) else {
            continue;
        };
        let count = table_data_row_count(rows);
        match section.as_str() {
            "positions" => counts.open_positions += count,
            "orders" => counts.orders += count,
            "transactions" => counts.transactions += count,
            _ => {}
        }
    }
    counts
}

fn table_data_row_count(rows: &[Vec<String>]) -> usize {
    let header_index = rows
        .iter()
        .position(|row| row.iter().filter(|cell| !cell.trim().is_empty()).count() > 2)
        .unwrap_or(rows.len());
    rows.iter()
        .skip(header_index + 1)
        .filter(|row| {
            let text = row.join(" ").to_ascii_lowercase();
            row.iter().filter(|cell| !cell.trim().is_empty()).count() > 1
                && !text.contains("no orders")
                && !text.contains("keine orders")
        })
        .count()
}

fn section_name(cells: &[String]) -> Option<String> {
    let non_empty = cells
        .iter()
        .map(|cell| cell.trim())
        .filter(|cell| !cell.is_empty())
        .collect::<Vec<_>>();
    if non_empty.len() != 1 {
        return None;
    }
    match header_key(non_empty[0]).as_str() {
        "history" | "historie" => Some("history".to_owned()),
        "positions" | "positionen" => Some("positions".to_owned()),
        "orders" | "auftrage" => Some("orders".to_owned()),
        "transactions" | "transaktionen" => Some("transactions".to_owned()),
        "summary" | "zusammenfassung" => Some("summary".to_owned()),
        _ => None,
    }
}

fn header_key(value: &str) -> String {
    value
        .trim()
        .trim_end_matches(':')
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn cell_text(cell: &Data) -> String {
    cell.to_string().trim().to_owned()
}

fn regex(pattern: &str) -> Result<Regex, CTraderStatementError> {
    Regex::new(pattern).map_err(|_| format_error("PARSER_INTERNAL_ERROR"))
}

fn format_error(code: &'static str) -> CTraderStatementError {
    CTraderStatementError::new(
        code,
        "Das cTrader-Statement besitzt kein unterstütztes History-Format.",
    )
}

pub async fn preview_ctrader_statement_core(
    db: &SqlitePool,
    path: &Path,
    account_id: &str,
    fallback_timezone: &str,
) -> CommandResult<CTraderStatementPreview> {
    let account_id = account_id.trim();
    let fallback_timezone = Tz::from_str(fallback_timezone.trim()).map_err(|_| {
        command_error(
            "INVALID_TIMEZONE",
            "Die Fallback-Zeitzone muss eine gültige IANA-Zeitzone sein.",
        )
    })?;
    let account_currency = active_account(db, account_id).await?;
    let (canonical, extension) = validate_statement_path(path)?;
    let bytes = read_bounded_file(&canonical)?;
    let parsed = parse_ctrader_statement(&bytes, &extension, fallback_timezone)
        .map_err(CTraderStatementError::command)?;
    let currency_mismatch = !parsed
        .identity
        .base_currency
        .eq_ignore_ascii_case(&account_currency);

    let account_hash = sha256_hex(parsed.identity.report_account.trim().as_bytes());
    let masked = mask_account(&parsed.identity.report_account);
    let staged_source = StagedCTraderSource {
        report_account_sha256: account_hash,
        report_account_masked: masked.clone(),
        base_currency: parsed.identity.base_currency.clone(),
        source_timezone: parsed.source_timezone.clone(),
    };
    let source_id = validate_existing_source(db, account_id, &staged_source).await?;

    let run_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let mut valid = 0usize;
    let mut invalid = 0usize;
    let mut duplicate = 0usize;
    let mut conflict = 0usize;
    let mut staged = Vec::new();
    let mut previews = Vec::new();
    for row in &parsed.rows {
        let (status, normalized_json, errors) = if let Some(trade) = &row.trade {
            let payload_sha256 = payload_hash(trade)?;
            let status = if let Some(source_id) = source_id.as_deref() {
                match existing_link_hash(db, source_id, &trade.source_trade_id).await? {
                    Some(existing) if existing == payload_sha256 => "duplicate",
                    Some(_) => "conflict",
                    None => "valid",
                }
            } else {
                "valid"
            };
            match status {
                "valid" => valid += 1,
                "duplicate" => duplicate += 1,
                "conflict" => conflict += 1,
                _ => {}
            }
            let payload = StagedCTraderTrade {
                trade: trade.clone(),
                payload_sha256,
            };
            (
                status,
                Some(serde_json::to_string(&payload).map_err(json_error)?),
                Vec::new(),
            )
        } else {
            invalid += 1;
            ("invalid", None, row.errors.clone())
        };
        staged.push((
            row.row_number,
            status.to_owned(),
            normalized_json,
            errors.clone(),
        ));
        if previews.len() < 100 {
            previews.push(CTraderStatementRowPreview {
                row_number: row.row_number,
                status: status.to_owned(),
                source_trade_id: row.source_trade_id.clone(),
                symbol: row.trade.as_ref().map(|trade| trade.symbol.clone()),
                direction: row.trade.as_ref().map(|trade| trade.direction.clone()),
                opened_at: row.trade.as_ref().and_then(|trade| trade.opened_at.clone()),
                closed_at: row.trade.as_ref().map(|trade| trade.closed_at.clone()),
                net_pnl_minor: row.trade.as_ref().map(|trade| trade.net_pnl_minor),
                errors,
            });
        }
    }
    let report_json = serde_json::json!({
        "format": parsed.format,
        "ignored": parsed.ignored,
        "conflictRows": conflict,
        "missingFields": ["openedAt", "commission", "swap", "grossPnl"],
    });
    let mut tx = db.begin().await?;
    sqlx::query("INSERT INTO import_runs (id, source_type, source_filename, source_sha256, status, mapping_json, total_rows, valid_rows, invalid_rows, duplicate_rows, report_json, created_at, target_account_id, source_timezone) VALUES (?, 'ctrader_statement', ?, ?, 'preview', ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&run_id)
        .bind(format!("ctrader-statement.{extension}"))
        .bind(sha256_hex(&bytes))
        .bind(serde_json::to_string(&staged_source).map_err(json_error)?)
        .bind(parsed.rows.len() as i64)
        .bind(valid as i64)
        .bind(invalid as i64)
        .bind(duplicate as i64)
        .bind(report_json.to_string())
        .bind(&now)
        .bind(account_id)
        .bind(&parsed.source_timezone)
        .execute(&mut *tx)
        .await?;
    for (row_number, status, normalized_json, errors) in staged {
        sqlx::query("INSERT INTO import_rows (id, import_run_id, row_number, status, raw_json, normalized_json, errors_json) VALUES (?, ?, ?, ?, '{}', ?, ?)")
            .bind(Uuid::new_v4().to_string())
            .bind(&run_id)
            .bind(row_number as i64)
            .bind(status)
            .bind(normalized_json)
            .bind(serde_json::to_string(&errors).map_err(json_error)?)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;

    Ok(CTraderStatementPreview {
        run_id,
        format: parsed.format,
        masked_source_account: masked,
        base_currency: parsed.identity.base_currency,
        target_account_currency: account_currency,
        currency_mismatch,
        source_timezone: parsed.source_timezone,
        valid,
        invalid,
        duplicate,
        conflict,
        open_positions: parsed.ignored.open_positions,
        orders: parsed.ignored.orders,
        transactions: parsed.ignored.transactions,
        can_commit: invalid == 0 && conflict == 0,
        rows: previews,
    })
}

pub async fn commit_ctrader_statement_core(
    db: &SqlitePool,
    run_id: &str,
    account_id: &str,
) -> CommandResult<CTraderStatementCommitResult> {
    let mut connection = db.acquire().await?;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *connection)
        .await?;
    let result: CommandResult<CTraderStatementCommitResult> = async {
        let run = sqlx::query("SELECT status, target_account_id, mapping_json FROM import_runs WHERE id = ? AND source_type = 'ctrader_statement'")
            .bind(run_id.trim())
            .fetch_optional(&mut *connection)
            .await?
            .ok_or_else(|| command_error("IMPORT_RUN_NOT_FOUND", "Die cTrader-Importvorschau wurde nicht gefunden."))?;
        let status: String = run.try_get("status")?;
        let target_account_id: Option<String> = run.try_get("target_account_id")?;
        if status != "preview" {
            return Err(command_error(
                "IMPORT_RUN_NOT_PREVIEW",
                "Diese cTrader-Importvorschau kann nicht mehr übernommen werden.",
            ));
        }
        if target_account_id.as_deref() != Some(account_id.trim()) {
            return Err(command_error(
                "IMPORT_ACCOUNT_MISMATCH",
                "Die cTrader-Importvorschau gehört zu einem anderen Konto.",
            ));
        }
        let target_account_currency =
            active_account_on_connection(&mut connection, account_id.trim()).await?;
        let mapping_json: String = run.try_get("mapping_json")?;
        let source: StagedCTraderSource =
            serde_json::from_str(&mapping_json).map_err(json_error)?;
        let blocked: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM import_rows WHERE import_run_id = ? AND status IN ('invalid','conflict')")
            .bind(run_id.trim())
            .fetch_one(&mut *connection)
            .await?;
        if blocked > 0 {
            return Err(command_error(
                "IMPORT_NOT_COMMITTABLE",
                "Die cTrader-Vorschau enthält ungültige oder konfliktbehaftete Zeilen.",
            ));
        }
        let source_id = bind_source_on_commit(&mut connection, account_id.trim(), &source).await?;
        let rows = sqlx::query("SELECT status, normalized_json FROM import_rows WHERE import_run_id = ? ORDER BY row_number")
            .bind(run_id.trim())
            .fetch_all(&mut *connection)
            .await?;
        let mut inserted = 0usize;
        let mut duplicates = 0usize;
        let now = Utc::now().to_rfc3339();
        for row in rows {
            let row_status: String = row.try_get("status")?;
            let normalized_json: Option<String> = row.try_get("normalized_json")?;
            let staged: StagedCTraderTrade = serde_json::from_str(
                normalized_json.as_deref().unwrap_or(""),
            )
            .map_err(json_error)?;
            let computed_payload_hash = payload_hash(&staged.trade)?;
            if computed_payload_hash != staged.payload_sha256 {
                return Err(command_error(
                    "IMPORT_STAGING_HASH_MISMATCH",
                    "Die normalisierten cTrader-Importdaten wurden seit der Vorschau verändert.",
                ));
            }
            if row_status == "duplicate" {
                duplicates += 1;
                continue;
            }
            if let Some(existing) = existing_link_hash_on_connection(
                &mut connection,
                &source_id,
                &staged.trade.source_trade_id,
            )
            .await?
            {
                if existing == computed_payload_hash {
                    duplicates += 1;
                    continue;
                }
                return Err(command_error(
                    "IMPORT_PAYLOAD_CONFLICT",
                    "Eine cTrader-Quellzeile besitzt bereits abweichende Daten.",
                ));
            }
            let trade_id = Uuid::new_v4().to_string();
            let metadata = serde_json::json!({
                "platform": "ctrader",
                "sourceTradeId": staged.trade.source_trade_id,
                "sourceAccount": source.report_account_masked,
                "statementCurrency": source.base_currency,
                "targetAccountCurrency": target_account_currency,
                "importRunId": run_id,
                "openedAtAvailable": staged.trade.opened_at.is_some(),
                "costBreakdownAvailable": staged.trade.cost_breakdown_available,
                "statementProvidesNetPnl": true,
            });
            sqlx::query("INSERT INTO trades (id, account_id, status, instrument, asset_class, direction, broker_trade_id, opened_at, closed_at, display_timezone, actual_entry, actual_exit, quantity, gross_pnl_minor, fees_minor, commission_minor, swap_minor, net_pnl_minor, source, source_metadata_json, created_at, updated_at) VALUES (?, ?, 'closed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, 'ctrader_statement', ?, ?, ?)")
                .bind(&trade_id)
                .bind(account_id.trim())
                .bind(&staged.trade.symbol)
                .bind(classify_ctrader_asset_class(&staged.trade.symbol))
                .bind(&staged.trade.direction)
                .bind(&staged.trade.source_trade_id)
                .bind(&staged.trade.opened_at)
                .bind(&staged.trade.closed_at)
                .bind(&staged.trade.display_timezone)
                .bind(&staged.trade.entry_price)
                .bind(&staged.trade.exit_price)
                .bind(&staged.trade.quantity)
                .bind(staged.trade.gross_pnl_minor)
                .bind(staged.trade.net_pnl_minor)
                .bind(metadata.to_string())
                .bind(&now)
                .bind(&now)
                .execute(&mut *connection)
                .await?;
            sqlx::query("INSERT INTO ctrader_trade_links (source_id, source_trade_id, trade_id, payload_sha256, import_run_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
                .bind(&source_id)
                .bind(&staged.trade.source_trade_id)
                .bind(&trade_id)
                .bind(&computed_payload_hash)
                .bind(run_id.trim())
                .bind(&now)
                .execute(&mut *connection)
                .await?;
            inserted += 1;
        }
        sqlx::query("UPDATE import_runs SET status = 'committed', committed_at = ? WHERE id = ?")
            .bind(&now)
            .bind(run_id.trim())
            .execute(&mut *connection)
            .await?;
        Ok(CTraderStatementCommitResult {
            run_id: run_id.trim().to_owned(),
            inserted,
            duplicate: duplicates,
        })
    }
    .await;
    match result {
        Ok(result) => {
            sqlx::query("COMMIT").execute(&mut *connection).await?;
            Ok(result)
        }
        Err(error) => {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            Err(error)
        }
    }
}

fn validate_statement_path(path: &Path) -> CommandResult<(PathBuf, String)> {
    if path.as_os_str().is_empty() {
        return Err(command_error(
            "IMPORT_PATH_REQUIRED",
            "Eine cTrader-Statement-Datei ist erforderlich.",
        ));
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "html" | "htm" | "xlsx") {
        return Err(command_error(
            "INVALID_FILE_EXTENSION",
            "Es werden nur cTrader-Dateien mit .html, .htm oder .xlsx unterstützt.",
        ));
    }
    let canonical = path.canonicalize().map_err(|_| {
        command_error(
            "IMPORT_FILE_NOT_FOUND",
            "Die ausgewählte cTrader-Datei wurde nicht gefunden.",
        )
    })?;
    let metadata = canonical.metadata().map_err(|_| {
        command_error(
            "IMPORT_FILE_NOT_FOUND",
            "Die ausgewählte cTrader-Datei wurde nicht gefunden.",
        )
    })?;
    if !metadata.is_file() {
        return Err(command_error(
            "IMPORT_NOT_A_FILE",
            "Der ausgewählte Pfad ist keine Datei.",
        ));
    }
    if metadata.len() > MAX_FILE_BYTES as u64 {
        return Err(command_error(
            "FILE_TOO_LARGE",
            "Die cTrader-Datei ist größer als 16 MiB.",
        ));
    }
    Ok((canonical, extension))
}

fn read_bounded_file(path: &Path) -> CommandResult<Vec<u8>> {
    let file = File::open(path).map_err(|_| {
        command_error(
            "IMPORT_FILE_NOT_FOUND",
            "Die ausgewählte cTrader-Datei wurde nicht gefunden.",
        )
    })?;
    let mut bytes = Vec::new();
    file.take((MAX_FILE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| {
            command_error(
                "IMPORT_FILE_READ_FAILED",
                "Die cTrader-Datei konnte nicht gelesen werden.",
            )
        })?;
    if bytes.len() > MAX_FILE_BYTES {
        return Err(command_error(
            "FILE_TOO_LARGE",
            "Die cTrader-Datei ist größer als 16 MiB.",
        ));
    }
    Ok(bytes)
}

async fn validate_existing_source(
    db: &SqlitePool,
    account_id: &str,
    source: &StagedCTraderSource,
) -> CommandResult<Option<String>> {
    if let Some(row) = sqlx::query(
        "SELECT id FROM ctrader_import_sources WHERE account_id = ? AND report_account_sha256 = ?",
    )
    .bind(account_id)
    .bind(&source.report_account_sha256)
    .fetch_optional(db)
    .await?
    {
        return Ok(Some(row.try_get("id")?));
    }
    Ok(None)
}

async fn bind_source_on_commit(
    connection: &mut sqlx::pool::PoolConnection<sqlx::Sqlite>,
    account_id: &str,
    source: &StagedCTraderSource,
) -> CommandResult<String> {
    if let Some(row) = sqlx::query(
        "SELECT id FROM ctrader_import_sources WHERE account_id = ? AND report_account_sha256 = ?",
    )
    .bind(account_id)
    .bind(&source.report_account_sha256)
    .fetch_optional(&mut **connection)
    .await?
    {
        let id: String = row.try_get("id")?;
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE ctrader_import_sources SET report_account_masked = ?, base_currency = ?, source_timezone = ?, updated_at = ? WHERE id = ?")
            .bind(&source.report_account_masked)
            .bind(&source.base_currency)
            .bind(&source.source_timezone)
            .bind(&now)
            .bind(&id)
            .execute(&mut **connection)
            .await?;
        return Ok(id);
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO ctrader_import_sources (id, account_id, report_account_sha256, report_account_masked, base_currency, source_timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(account_id)
        .bind(&source.report_account_sha256)
        .bind(&source.report_account_masked)
        .bind(&source.base_currency)
        .bind(&source.source_timezone)
        .bind(&now)
        .bind(&now)
        .execute(&mut **connection)
        .await?;
    Ok(id)
}

async fn existing_link_hash(
    db: &SqlitePool,
    source_id: &str,
    source_trade_id: &str,
) -> CommandResult<Option<String>> {
    Ok(sqlx::query_scalar("SELECT payload_sha256 FROM ctrader_trade_links WHERE source_id = ? AND source_trade_id = ?")
        .bind(source_id)
        .bind(source_trade_id)
        .fetch_optional(db)
        .await?)
}

async fn existing_link_hash_on_connection(
    connection: &mut sqlx::pool::PoolConnection<sqlx::Sqlite>,
    source_id: &str,
    source_trade_id: &str,
) -> CommandResult<Option<String>> {
    Ok(sqlx::query_scalar("SELECT payload_sha256 FROM ctrader_trade_links WHERE source_id = ? AND source_trade_id = ?")
        .bind(source_id)
        .bind(source_trade_id)
        .fetch_optional(&mut **connection)
        .await?)
}

fn payload_hash(trade: &ParsedCTraderTrade) -> CommandResult<String> {
    Ok(sha256_hex(serde_json::to_vec(trade).map_err(json_error)?))
}

fn json_error(_: serde_json::Error) -> CommandError {
    command_error(
        "IMPORT_STAGING_INVALID",
        "Die normalisierten cTrader-Importdaten sind ungültig.",
    )
}

fn classify_ctrader_asset_class(symbol: &str) -> &'static str {
    let upper = symbol.trim().to_ascii_uppercase();
    if upper.starts_with("GOLD")
        || upper.starts_with("SILVER")
        || upper.starts_with("PLATINUM")
        || upper.starts_with("PALLADIUM")
    {
        "metal"
    } else {
        classify_asset_class(symbol)
    }
}

#[cfg(test)]
mod tests {
    use std::{fmt::Write as _, fs, io::Write, path::Path};

    use chrono_tz::Europe::Berlin;
    use tempfile::NamedTempFile;
    use zip::{ZipWriter, write::SimpleFileOptions};

    use super::*;

    fn statement(account: &str, currency: &str, net: &str) -> String {
        format!(
            r#"<!doctype html><html><body>
            <table><tr><td>Account Statement</td></tr></table>
            <table>
              <tr><td>Account :</td><td>{account}</td><td>15/08/2026 20:04:03.332, UTC +1</td></tr>
              <tr><td>Currency :</td><td>{currency}</td></tr>
            </table>
            <table>
              <tr><td colspan="13"><strong>History</strong></td></tr>
              <tr><td>Totals</td><td><strong>Symbol</strong></td><td><strong>Opening direction</strong></td><td><strong>Closing time (UTC+1)</strong></td><td><strong>Entry price</strong></td><td><strong>Closing price</strong></td><td><strong>Closing Quantity</strong></td><td><strong>Net {currency}</strong></td><td><strong>Balance {currency}</strong></td></tr>
              <tr><td></td><td><nobr>Gold</nobr></td><td><nobr>Sell</nobr></td><td><nobr>06/08/2026 06:42:09.869</nobr></td><td><nobr>4292.46</nobr></td><td><nobr>4263.99</nobr></td><td><nobr>0.09 Lots</nobr></td><td><nobr>{net}</nobr></td><td><nobr>50 255.69</nobr></td></tr>
              <tr><td>Totals</td><td></td><td></td><td></td><td></td><td></td><td></td><td><nobr>{net}</nobr></td><td><nobr>50 255.69</nobr></td></tr>
            </table>
            <table><tr><td>Positions</td></tr><tr><td>Totals</td><td>Symbol</td><td>Quantity</td></tr><tr><td></td><td>AUDUSD</td><td>0.40 Lots</td></tr></table>
            <table><tr><td>Orders</td></tr><tr><td>Totals</td><td>Direction</td><td>Symbol</td></tr><tr><td>- No orders -</td></tr></table>
            <table><tr><td>Transactions</td></tr><tr><td>Totals</td><td>ID</td><td>Time</td></tr><tr><td></td><td>TID1</td><td>05/08/2026 17:49:08</td></tr></table>
            </body></html>"#
        )
    }

    #[test]
    fn parses_ctrader_html_with_explicit_offset_and_missing_fields_preserved() {
        let html = statement("1234567", "USD", "255.69");
        let parsed = parse_ctrader_html(html.as_bytes(), Berlin).unwrap();

        assert_eq!(parsed.identity.base_currency, "USD");
        assert_eq!(parsed.source_timezone, "UTC+01:00");
        assert_eq!(parsed.rows.len(), 1);
        assert_eq!(parsed.ignored.open_positions, 1);
        assert_eq!(parsed.ignored.orders, 0);
        assert_eq!(parsed.ignored.transactions, 1);
        let trade = parsed.rows[0].trade.as_ref().unwrap();
        assert_eq!(trade.symbol, "GOLD");
        assert_eq!(trade.direction, "short");
        assert_eq!(trade.quantity, "0.09");
        assert_eq!(trade.entry_price, "4292.46");
        assert_eq!(trade.exit_price, "4263.99");
        assert_eq!(trade.closed_at, "2026-08-06T05:42:09.869+00:00");
        assert_eq!(trade.net_pnl_minor, 25_569);
        assert_eq!(trade.opened_at, None);
        assert_eq!(trade.gross_pnl_minor, None);
        assert!(!trade.cost_breakdown_available);
        assert_eq!(trade.source_trade_id.len(), 64);

        let repeated = parse_ctrader_html(html.as_bytes(), Berlin).unwrap();
        assert_eq!(
            repeated.rows[0].trade.as_ref().unwrap().source_trade_id,
            trade.source_trade_id
        );
    }

    #[test]
    fn rejects_non_ctrader_html_and_invalid_rows_without_inventing_zeroes() {
        assert_eq!(
            parse_ctrader_html(
                b"<html><table><tr><td>hello</td></tr></table></html>",
                Berlin
            )
            .unwrap_err()
            .code(),
            "REPORT_IDENTITY_MISSING"
        );
        let malformed = statement("1234567", "USD", "not-money")
            .replace("0.09 Lots", "0 Lots")
            .replace("06/08/2026 06:42:09.869", "not-a-date");
        let parsed = parse_ctrader_html(malformed.as_bytes(), Berlin).unwrap();
        assert!(parsed.rows[0].trade.is_none());
        assert_eq!(
            parsed.rows[0].errors,
            vec!["INVALID_CLOSE_TIME", "INVALID_VOLUME", "INVALID_NET_PNL"]
        );
    }

    #[test]
    fn parses_populated_ctrader_xlsx_and_rejects_empty_export_clearly() {
        let populated = tempfile::Builder::new().suffix(".xlsx").tempfile().unwrap();
        write_xlsx_fixture(
            populated.path(),
            &[
                vec!["Account :", "1234567"],
                vec!["Currency :", "USD"],
                vec!["History"],
                vec![
                    "Totals",
                    "Symbol",
                    "Opening direction",
                    "Closing time (UTC+1)",
                    "Entry price",
                    "Closing price",
                    "Closing Quantity",
                    "Net USD",
                    "Balance USD",
                ],
                vec![
                    "",
                    "Gold",
                    "Sell",
                    "06/08/2026 06:42:09.869",
                    "4292.46",
                    "4263.99",
                    "0.09 Lots",
                    "255.69",
                    "50 255.69",
                ],
            ],
        );
        let parsed = parse_ctrader_xlsx(&fs::read(populated.path()).unwrap(), Berlin).unwrap();
        assert_eq!(parsed.format, "xlsx");
        assert_eq!(parsed.rows.len(), 1);
        assert_eq!(parsed.rows[0].trade.as_ref().unwrap().net_pnl_minor, 25_569);

        let empty = tempfile::Builder::new().suffix(".xlsx").tempfile().unwrap();
        write_xlsx_fixture(empty.path(), &[]);
        assert_eq!(
            parse_ctrader_xlsx(&fs::read(empty.path()).unwrap(), Berlin)
                .unwrap_err()
                .code(),
            "CTRADER_WORKBOOK_EMPTY"
        );
    }

    #[tokio::test]
    async fn ctrader_preview_commit_is_account_safe_private_and_idempotent() {
        let state = crate::database::initialize_headless().await.unwrap();
        insert_account(&state.db, "account-a", "USD").await;
        insert_account(&state.db, "account-b", "USD").await;
        let file = write_html(&statement("1234567", "USD", "255.69"));

        let preview =
            preview_ctrader_statement_core(&state.db, file.path(), "account-a", "Europe/Berlin")
                .await
                .unwrap();
        assert_eq!(preview.valid, 1);
        assert_eq!(preview.masked_source_account, "••••4567");
        assert_eq!(preview.source_timezone, "UTC+01:00");
        assert!(preview.can_commit);
        let mapping: String =
            sqlx::query_scalar("SELECT mapping_json FROM import_runs WHERE id = ?")
                .bind(&preview.run_id)
                .fetch_one(&state.db)
                .await
                .unwrap();
        assert!(!mapping.contains("1234567"));
        assert_eq!(
            commit_ctrader_statement_core(&state.db, &preview.run_id, "account-b")
                .await
                .unwrap_err()
                .code,
            "IMPORT_ACCOUNT_MISMATCH"
        );
        let committed = commit_ctrader_statement_core(&state.db, &preview.run_id, "account-a")
            .await
            .unwrap();
        assert_eq!(committed.inserted, 1);
        let trade: (Option<String>, String, i64, Option<i64>, String) = sqlx::query_as(
            "SELECT opened_at, closed_at, net_pnl_minor, gross_pnl_minor, source FROM trades WHERE account_id = 'account-a'",
        )
        .fetch_one(&state.db)
        .await
        .unwrap();
        assert_eq!(trade.0, None);
        assert_eq!(trade.1, "2026-08-06T05:42:09.869+00:00");
        assert_eq!(trade.2, 25_569);
        assert_eq!(trade.3, None);
        assert_eq!(trade.4, "ctrader_statement");

        let duplicate =
            preview_ctrader_statement_core(&state.db, file.path(), "account-a", "Europe/Berlin")
                .await
                .unwrap();
        assert_eq!((duplicate.valid, duplicate.duplicate), (0, 1));
        let duplicate_commit =
            commit_ctrader_statement_core(&state.db, &duplicate.run_id, "account-a")
                .await
                .unwrap();
        assert_eq!(
            (duplicate_commit.inserted, duplicate_commit.duplicate),
            (0, 1)
        );
    }

    #[tokio::test]
    async fn accepts_any_report_account_and_currency_for_the_selected_target() {
        let state = crate::database::initialize_headless().await.unwrap();
        insert_account(&state.db, "target-eur", "EUR").await;
        insert_account(&state.db, "target-usd", "USD").await;
        let first_report = write_html(&statement("1234567", "USD", "255.69"));

        let eur_preview = preview_ctrader_statement_core(
            &state.db,
            first_report.path(),
            "target-eur",
            "Europe/Berlin",
        )
        .await
        .unwrap();
        assert!(eur_preview.currency_mismatch);
        assert_eq!(eur_preview.base_currency, "USD");
        assert_eq!(eur_preview.target_account_currency, "EUR");
        assert_eq!(
            commit_ctrader_statement_core(&state.db, &eur_preview.run_id, "target-eur")
                .await
                .unwrap()
                .inserted,
            1
        );

        let usd_preview = preview_ctrader_statement_core(
            &state.db,
            first_report.path(),
            "target-usd",
            "Europe/Berlin",
        )
        .await
        .unwrap();
        assert!(!usd_preview.currency_mismatch);
        assert_eq!(
            commit_ctrader_statement_core(&state.db, &usd_preview.run_id, "target-usd")
                .await
                .unwrap()
                .inserted,
            1
        );

        let second_report = write_html(&statement("7654321", "GBP", "100.00"));
        let second_preview = preview_ctrader_statement_core(
            &state.db,
            second_report.path(),
            "target-eur",
            "Europe/Berlin",
        )
        .await
        .unwrap();
        assert!(second_preview.currency_mismatch);
        assert_eq!(
            commit_ctrader_statement_core(&state.db, &second_preview.run_id, "target-eur")
                .await
                .unwrap()
                .inserted,
            1
        );

        let target_trade_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM trades WHERE account_id = 'target-eur'")
                .fetch_one(&state.db)
                .await
                .unwrap();
        assert_eq!(target_trade_count, 2);
    }

    #[test]
    #[ignore]
    fn validates_supplied_ctrader_files_without_persisting_personal_data() {
        let html = fs::read(std::env::var("CTRADER_HTML_STATEMENT_PATH").unwrap()).unwrap();
        let parsed = parse_ctrader_html(&html, Berlin).unwrap();
        assert!(!parsed.rows.is_empty());
        assert!(parsed.rows.iter().all(|row| row.trade.is_some()));
        let xlsx = fs::read(std::env::var("CTRADER_XLSX_STATEMENT_PATH").unwrap()).unwrap();
        assert_eq!(
            parse_ctrader_xlsx(&xlsx, Berlin).unwrap_err().code(),
            "CTRADER_WORKBOOK_EMPTY"
        );
    }

    fn write_html(html: &str) -> NamedTempFile {
        let file = tempfile::Builder::new().suffix(".htm").tempfile().unwrap();
        fs::write(file.path(), html).unwrap();
        file
    }

    async fn insert_account(db: &SqlitePool, id: &str, currency: &str) {
        sqlx::query("INSERT INTO accounts (id, name, base_currency, created_at, updated_at) VALUES (?, ?, ?, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')")
            .bind(id)
            .bind(id)
            .bind(currency)
            .execute(db)
            .await
            .unwrap();
    }

    fn xml_escape(value: &str) -> String {
        value
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&apos;")
    }

    fn excel_column(mut index: usize) -> String {
        let mut output = String::new();
        loop {
            output.insert(0, (b'A' + (index % 26) as u8) as char);
            if index < 26 {
                break;
            }
            index = index / 26 - 1;
        }
        output
    }

    fn write_xlsx_fixture(path: &Path, rows: &[Vec<&str>]) {
        let file = fs::File::create(path).unwrap();
        let mut archive = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        let parts = [
            (
                "[Content_Types].xml",
                r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>"#
                    .to_owned(),
            ),
            (
                "_rels/.rels",
                r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"#
                    .to_owned(),
            ),
            (
                "xl/workbook.xml",
                r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Trades" sheetId="1" r:id="rId1"/></sheets>
</workbook>"#
                    .to_owned(),
            ),
            (
                "xl/_rels/workbook.xml.rels",
                r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>"#
                    .to_owned(),
            ),
        ];
        for (name, contents) in parts {
            archive.start_file(name, options).unwrap();
            archive.write_all(contents.as_bytes()).unwrap();
        }
        let mut sheet = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>"#,
        );
        for (row_index, row) in rows.iter().enumerate() {
            write!(&mut sheet, "<row r=\"{}\">", row_index + 1).unwrap();
            for (column_index, value) in row.iter().enumerate() {
                let reference = format!("{}{}", excel_column(column_index), row_index + 1);
                write!(
                    &mut sheet,
                    "<c r=\"{reference}\" t=\"inlineStr\"><is><t>{}</t></is></c>",
                    xml_escape(value)
                )
                .unwrap();
            }
            sheet.push_str("</row>");
        }
        sheet.push_str("</sheetData></worksheet>");
        archive
            .start_file("xl/worksheets/sheet1.xml", options)
            .unwrap();
        archive.write_all(sheet.as_bytes()).unwrap();
        archive.finish().unwrap();
    }
}
