//! Explicit HTTP allowlist. Never expose the native invoke registry wholesale.
use crate::{commands, database::AppState, errors::CommandError, runtime::State};
use serde::{Serialize, de::DeserializeOwned};
use serde_json::{Value, json};

type Result<T> = std::result::Result<T, CommandError>;

fn argument<T: DeserializeOwned>(args: &Value, key: &str) -> Result<T> {
    serde_json::from_value(args.get(key).cloned().unwrap_or(Value::Null))
        .map_err(|_| CommandError::validation("Die Eingabe ist unvollständig oder ungültig."))
}

fn encoded(value: impl Serialize) -> Result<Value> {
    serde_json::to_value(value)
        .map_err(|_| CommandError::validation("Die Antwort konnte nicht übertragen werden."))
}

macro_rules! allowed_commands {
    ($( $name:ident, $write:literal, [$($arg:literal),*]; )*) => {
        pub const COMMANDS: &[(&str, bool)] = &[
            ("get_bootstrap_data", false), ("get_settings", false), ("update_setting", true),
            ("get_weather_forecast", false),
            $((stringify!($name), $write),)*
        ];

        pub async fn dispatch(app: &AppState, name: &str, args: &Value) -> Result<Value> {
            match name {
                "get_weather_forecast" => encoded(commands::get_weather_forecast(argument(args, "input")?).await?),
                "get_bootstrap_data" => {
                    let mut data = commands::get_bootstrap_data(State::new(app)).await?;
                    data.database_path.clear();
                    data.app_data_path.clear();
                    encoded(data)
                }
                "get_settings" => {
                    let mut data = commands::get_settings(State::new(app)).await?;
                    data.settings.retain(|key, _| safe_setting(key));
                    encoded(data)
                }
                "update_setting" => {
                    let input: commands::SettingInput = argument(args, "input")?;
                    if !safe_setting(&input.key) || !input.value.is_object()
                        || input.value.to_string().len() > 16_384 {
                        return Err(CommandError::validation("Diese Einstellung kann im Browser nicht geändert werden."));
                    }
                    commands::update_setting(State::new(app), input).await?;
                    Ok(json!(null))
                }
                $(stringify!($name) => encoded(commands::$name(State::new(app), $(argument(args, $arg)?),*).await?),)*
                _ => Err(CommandError { code: "COMMAND_UNAVAILABLE".into(), message: "Diese Funktion ist im privaten Browser noch nicht verfügbar.".into(), details: None }),
            }
        }
    }
}

fn safe_setting(key: &str) -> bool {
    matches!(key, "appearance" | "analytics")
}

allowed_commands! {
    get_account_journal, false, ["accountId"];
    save_account, true, ["input"];
    archive_account, true, ["id"];
    list_account_cashflows, false, ["accountId"];
    add_account_cashflow, true, ["input"];
    create_strategy, true, ["input"];
    create_setup, true, ["input"];
    create_tag, true, ["input"];
    list_trades, false, ["accountId", "filter"];
    get_trade, false, ["id", "accountId"];
    create_trade, true, ["input"];
    update_trade, true, ["id", "input"];
    trash_trade, true, ["id", "accountId"];
    restore_trade, true, ["id", "accountId"];
    duplicate_trade, true, ["id", "accountId"];
    list_deleted_trades, false, ["accountId"];
    get_trade_context, false, ["accountId", "tradeId"];
    save_trade_context, true, ["accountId", "input"];
    calculate_dashboard, false, ["accountId", "filter"];
    calculate_calendar, false, ["accountId", "filter"];
    list_saved_views, false, ["scope"];
    save_saved_view, true, ["input"];
    delete_saved_view, true, ["id"];
    list_custom_fields, false, ["entityType"];
    save_custom_field, true, ["input"];
    delete_custom_field, true, ["id"];
    list_reviews, false, ["accountId"];
    save_review, true, ["input"];
    list_goals, false, [];
    save_goal, true, ["input"];
    record_goal_progress, true, ["input"];
    list_playbook, false, ["accountId"];
    create_setup_version, true, ["input"];
    get_mistake_analytics, false, ["accountId"];
    list_trade_mistakes, false, ["accountId", "tradeId"];
    assign_trade_mistake, true, ["accountId", "input"];
}
