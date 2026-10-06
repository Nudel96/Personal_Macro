//! Native calculations over a verified immutable shard. No provider requests,
//! scheduler, migrations, AppData discovery, or local journal initialization.
use serde_json::Value;

use super::cache::{ArtifactKind, LoadedShard};
use crate::{
    commands,
    database::{AppPaths, AppState},
    errors::{CommandError, CommandResult},
    runtime::State,
};

pub const COMMANDS: &[&str] = &[
    "get_policy_rates",
    "get_seasonality",
    "get_seasonality_asset_detail",
    "analyze_seasonality",
];

/// Reject malformed or excessive inputs before the server downloads a shard.
pub fn validate(command: &str, args: &Value) -> CommandResult<()> {
    if super::macro_readers::COMMANDS.contains(&command) {
        return super::macro_readers::validate(command, args);
    }
    if super::atlas_readers::COMMANDS.contains(&command) {
        return super::atlas_readers::validate(command, args);
    }
    if matches!(
        command,
        "get_central_bank_reports" | "get_central_bank_report"
    ) {
        return super::report_readers::validate(command, args);
    }
    if command == "get_seasonality_forex_pairs" {
        return keys(args, &["generation"]);
    }
    match command {
        "get_policy_rates" | "get_seasonality" => keys(args, &["generation"]),
        "get_seasonality_asset_detail" => {
            keys(args, &["generation", "symbol"])?;
            validate_symbol(&argument::<String>(args, "symbol")?)
        }
        "analyze_seasonality" => analysis_input(args).map(|_| ()),
        _ => Err(error(
            "NOT_SUPPORTED",
            "Diese Marktdatenansicht ist noch nicht verfügbar.",
        )),
    }
}

fn analysis_input(args: &Value) -> CommandResult<commands::SeasonalityAnalysisInput> {
    keys(args, &["generation", "input"])?;
    let input = args.get("input").ok_or_else(invalid)?;
    keys(
        input,
        &[
            "symbol",
            "referenceDate",
            "yearFilter",
            "windowStart",
            "windowTradingDays",
        ],
    )?;
    if let Some(filter) = input.get("yearFilter") {
        keys(
            filter,
            &[
                "startYear",
                "endYear",
                "cycleYears",
                "cycleAnchorYear",
                "endingDigits",
                "includeYears",
                "excludeYears",
            ],
        )?;
        for name in ["endingDigits", "includeYears", "excludeYears"] {
            if filter
                .get(name)
                .and_then(Value::as_array)
                .is_some_and(|items| items.len() > 500)
            {
                return Err(invalid());
            }
        }
    }
    let input: commands::SeasonalityAnalysisInput = argument(args, "input")?;
    validate_symbol(&input.symbol)?;
    let filter = &input.year_filter;
    if [filter.start_year, filter.end_year, filter.cycle_anchor_year]
        .into_iter()
        .flatten()
        .chain(filter.include_years.iter().copied())
        .chain(filter.exclude_years.iter().copied())
        .any(|year| !(1..=9999).contains(&year))
        || filter.ending_digits.iter().any(|digit| *digit > 9)
    {
        return Err(invalid());
    }
    // cycle_years is u8; native 0/1 (no cycle filter) semantics remain intact.
    Ok(input)
}

/// The caller resolves and pins a trusted generation before entering this
/// function. Only the supplied shard is read; it remains leased until return.
pub async fn read(command: &str, args: &Value, shard: &LoadedShard) -> CommandResult<Value> {
    validate(command, args)?;
    if super::macro_readers::COMMANDS.contains(&command) {
        return super::macro_readers::read(command, args, shard).await;
    }
    if super::atlas_readers::COMMANDS.contains(&command) {
        return super::atlas_readers::read(command, args, shard).await;
    }
    if matches!(
        command,
        "get_central_bank_reports" | "get_central_bank_report"
    ) {
        return super::report_readers::read(command, args, shard).await;
    }
    if command == "get_seasonality_forex_pairs" {
        return super::seasonality_extended::forex_pairs(shard).await;
    }
    let kind = match command {
        "get_policy_rates" => ArtifactKind::Rates,
        "get_seasonality" => ArtifactKind::SeasonalityIndex,
        "get_seasonality_asset_detail" | "analyze_seasonality" => ArtifactKind::SeasonalitySymbol,
        _ => {
            return Err(error(
                "NOT_SUPPORTED",
                "Diese Marktdatenansicht ist noch nicht verfügbar.",
            ));
        }
    };
    if shard.artifact.kind != kind {
        return Err(error(
            "MARKET_DATA_UNAVAILABLE",
            "Das passende Marktdatenpaket ist nicht verfügbar.",
        ));
    }
    let state = read_state(shard);
    let result = match command {
        "get_policy_rates" => {
            keys(args, &["generation"])?;
            let mut dashboard = commands::get_policy_rates(State::new(&state))
                .await
                .map_err(safe_error)?;
            dashboard.automation.enabled = false;
            dashboard.automation.next_refresh_at = None;
            dashboard.automation.error_message = None;
            dashboard.automation.last_status = safe_status(dashboard.automation.last_status);
            serde_json::to_value(dashboard)
        }
        "get_seasonality" => {
            keys(args, &["generation"])?;
            let mut dashboard = commands::get_seasonality(State::new(&state))
                .await
                .map_err(safe_error)?;
            dashboard.collection_error = None;
            dashboard.collection_status = safe_status(dashboard.collection_status);
            serde_json::to_value(dashboard)
        }
        "get_seasonality_asset_detail" => {
            keys(args, &["generation", "symbol"])?;
            let symbol = argument::<String>(args, "symbol")?;
            validate_symbol(&symbol)?;
            serde_json::to_value(
                commands::get_seasonality_asset_detail(State::new(&state), symbol)
                    .await
                    .map_err(safe_error)?,
            )
        }
        "analyze_seasonality" => {
            let input = analysis_input(args)?;
            serde_json::to_value(
                commands::analyze_seasonality(State::new(&state), input)
                    .await
                    .map_err(safe_error)?,
            )
        }
        _ => unreachable!(),
    };
    result.map_err(|_| {
        error(
            "MARKET_DATA_UNAVAILABLE",
            "Die Marktdaten konnten nicht aufbereitet werden.",
        )
    })
}

fn read_state(shard: &LoadedShard) -> AppState {
    // These four audited native readers use only db. The explicit disposable
    // paths satisfy AppState without creating directories or opening a journal.
    let root = shard.directory().to_owned();
    AppState {
        db: shard.pool().clone(),
        paths: AppPaths {
            database: root.join("data.sqlite"),
            media: root.join("unused-media"),
            exports: root.join("unused-exports"),
            backups: root.join("unused-backups"),
            logs: root.join("unused-logs"),
            settings: root.join("unused-settings"),
            central_bank_reports: root.join("unused-central-bank-reports"),
            root,
        },
    }
}

fn safe_status(value: Option<String>) -> Option<String> {
    value.and_then(|status| match status.as_str() {
        "complete" | "partial" | "failed" | "cancelled" => Some(status),
        "running" => Some("failed".into()),
        _ => None,
    })
}

fn safe_error(value: CommandError) -> CommandError {
    // Validation messages on these native read paths are static German text.
    // Discard internal details and redact every other native failure.
    if value.code == "VALIDATION_ERROR" {
        CommandError::validation(value.message)
    } else {
        error(
            "MARKET_DATA_UNAVAILABLE",
            "Die gespeicherten Marktdaten konnten nicht gelesen werden.",
        )
    }
}

fn error(code: &str, message: &str) -> CommandError {
    CommandError {
        code: code.into(),
        message: message.into(),
        details: None,
    }
}

fn invalid() -> CommandError {
    CommandError::validation("Die Auswahl für diese Marktdatenansicht ist ungültig.")
}

fn keys(value: &Value, allowed: &[&str]) -> CommandResult<()> {
    let object = value.as_object().ok_or_else(invalid)?;
    if object.keys().any(|name| !allowed.contains(&name.as_str())) {
        return Err(invalid());
    }
    Ok(())
}

fn argument<T: serde::de::DeserializeOwned>(value: &Value, name: &str) -> CommandResult<T> {
    serde_json::from_value(value.get(name).cloned().ok_or_else(invalid)?).map_err(|_| invalid())
}

fn validate_symbol(value: &str) -> CommandResult<()> {
    if value.len() > 128 || value.chars().any(char::is_control) {
        return Err(invalid());
    }
    Ok(())
}
