//! Read-only access to audited Macro/CFTC/OHLC snapshots. Desktop scoring and
//! source definitions remain canonical; cloud reads never refresh a provider.
use chrono::{DateTime, Utc};
use serde_json::{Value, json};

use super::cache::{ArtifactKind, LoadedShard};
use crate::{
    commands,
    database::{AppPaths, AppState},
    errors::{CommandError, CommandResult},
    runtime::State,
};

pub const COMMANDS: &[&str] = &[
    "get_eodhd_fundamentals_dashboard",
    "get_eodhd_indicator_history",
    "get_economic_calendar",
    "get_eodhd_feed_status",
    "list_eodhd_mapping_candidates",
    "get_cot_dashboard",
    "get_cot_asset_detail",
    "get_pair_technical_signals",
    "get_aud_china_cpi_regime",
];

pub fn artifact(command: &str, args: &Value) -> CommandResult<(ArtifactKind, String)> {
    validate(command, args)?;
    Ok(match command {
        "get_cot_dashboard" | "get_cot_asset_detail" => (ArtifactKind::Cot, "cftc:legacy".into()),
        "get_pair_technical_signals" => (ArtifactKind::Technicals, "eodhd:technicals".into()),
        "get_aud_china_cpi_regime" => (ArtifactKind::Regime, "eodhd:aud-china-cpi".into()),
        _ => (ArtifactKind::Macro, "eodhd:macro".into()),
    })
}

pub fn validate(command: &str, args: &Value) -> CommandResult<()> {
    if !COMMANDS.contains(&command) {
        return Err(invalid());
    }
    match command {
        "get_eodhd_indicator_history" => {
            keys(args, &["generation", "input"])?;
            let input = args.get("input").ok_or_else(invalid)?;
            keys(input, &["currency", "canonicalKey", "months"])?;
            text(input, "currency", 3)?;
            text(input, "canonicalKey", 80)?;
            let _: commands::EodhdIndicatorHistoryInput = argument(args, "input")?;
            if !matches!(
                input["months"].as_u64(),
                Some(12 | 24 | 36 | 60 | 120 | 240)
            ) {
                return Err(invalid());
            }
        }
        "get_economic_calendar" => {
            keys(args, &["generation", "input"])?;
            let input = args.get("input").ok_or_else(invalid)?;
            keys(input, &["range", "timezoneOffsetMinutes", "timezone"])?;
            text(input, "range", 32)?;
            if input.get("timezone").is_some_and(|v| !v.is_null()) {
                text(input, "timezone", 100)?;
            }
            let _: commands::EconomicCalendarInput = argument(args, "input")?;
        }
        "get_cot_asset_detail" => {
            keys(args, &["generation", "input"])?;
            let input = args.get("input").ok_or_else(invalid)?;
            keys(input, &["symbol", "lookbackWeeks", "participantGroup"])?;
            text(input, "symbol", 64)?;
            if input.get("participantGroup").is_some_and(|v| !v.is_null()) {
                text(input, "participantGroup", 64)?;
            }
            let _: commands::CotDetailInput = argument(args, "input")?;
            if let Some(value) = input.get("lookbackWeeks").filter(|v| !v.is_null())
                && !matches!(value.as_u64(), Some(0 | 52 | 156 | 260 | 520 | 780))
            {
                return Err(invalid());
            }
        }
        "get_aud_china_cpi_regime" => {
            keys(args, &["generation", "input"])?;
            let input = args.get("input").ok_or_else(invalid)?;
            keys(input, &["timeframe"])?;
            if !matches!(input["timeframe"].as_str(), Some("D1" | "W1")) {
                return Err(invalid());
            }
        }
        _ => keys(args, &["generation"])?,
    }
    Ok(())
}

pub async fn read(command: &str, args: &Value, shard: &LoadedShard) -> CommandResult<Value> {
    let (kind, key) = artifact(command, args)?;
    if shard.artifact.kind != kind || shard.artifact.key != key {
        return Err(unavailable());
    }
    let root = shard.directory().to_owned();
    let state = AppState {
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
    };
    read_state(command, args, &state).await
}

async fn read_state(command: &str, args: &Value, state: &AppState) -> CommandResult<Value> {
    read_state_at(command, args, state, Utc::now()).await
}

async fn read_state_at(
    command: &str,
    args: &Value,
    state: &AppState,
    now: DateTime<Utc>,
) -> CommandResult<Value> {
    let result = match command {
        "get_eodhd_fundamentals_dashboard" => serde_json::to_value(
            commands::load_fundamental_dashboard_readonly_at(state, now)
                .await
                .map_err(|_| unavailable())?,
        ),
        "get_eodhd_indicator_history" => serde_json::to_value(
            commands::load_indicator_history_at(state, argument(args, "input")?, now)
                .await
                .map_err(|error| safe_error(error.into()))?,
        ),
        "get_economic_calendar" => serde_json::to_value(
            commands::get_economic_calendar(State::new(state), argument(args, "input")?)
                .await
                .map_err(safe_error)?,
        ),
        "get_eodhd_feed_status" => {
            // A desktop scheduler state is never presented as a cloud job. This
            // query deliberately avoids API-key discovery and raw provider errors.
            let last: Option<String> = sqlx::query_scalar("SELECT MAX(completed_at) FROM eodhd_sync_runs WHERE status IN ('complete','partial')")
                .fetch_one(&state.db).await.map_err(|_| unavailable())?;
            let pending: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM eodhd_mapping_candidates WHERE status='pending'",
            )
            .fetch_one(&state.db)
            .await
            .map_err(|_| unavailable())?;
            return Ok(json!({"configured":false,"running":false,"lastRun":null,
                "pendingJobs":0,"nextDueAt":null,"pendingMappingReviews":pending,"lastSuccessAt":last}));
        }
        "list_eodhd_mapping_candidates" => serde_json::to_value(
            commands::list_eodhd_mapping_candidates(State::new(state))
                .await
                .map_err(safe_error)?,
        ),
        "get_cot_dashboard" => serde_json::to_value(
            commands::cot_dashboard_readonly(state)
                .await
                .map_err(|_| unavailable())?,
        ),
        "get_cot_asset_detail" => serde_json::to_value(
            commands::cot_asset_detail_readonly(state, argument(args, "input")?)
                .await
                .map_err(safe_error)?,
        ),
        "get_pair_technical_signals" => serde_json::to_value(
            commands::get_pair_technical_signals(State::new(state))
                .await
                .map_err(safe_error)?,
        ),
        "get_aud_china_cpi_regime" => serde_json::to_value(
            commands::get_aud_china_cpi_regime(State::new(state), argument(args, "input")?)
                .await
                .map_err(safe_error)?,
        ),
        _ => return Err(invalid()),
    };
    result.map_err(|_| unavailable())
}

fn unavailable() -> CommandError {
    CommandError {
        code: "MARKET_DATA_UNAVAILABLE".into(),
        message: "Die gespeicherten Marktdaten konnten nicht gelesen werden.".into(),
        details: None,
    }
}
fn invalid() -> CommandError {
    CommandError::validation("Die Auswahl für diese Marktdatenansicht ist ungültig.")
}
fn safe_error(error: CommandError) -> CommandError {
    if error.code == "VALIDATION_ERROR" {
        invalid()
    } else {
        unavailable()
    }
}
fn keys(value: &Value, allowed: &[&str]) -> CommandResult<()> {
    let object = value.as_object().ok_or_else(invalid)?;
    if object.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(invalid());
    }
    Ok(())
}
fn text(value: &Value, key: &str, max: usize) -> CommandResult<()> {
    let value = value.get(key).and_then(Value::as_str).ok_or_else(invalid)?;
    if value.is_empty() || value.len() > max || value.chars().any(char::is_control) {
        return Err(invalid());
    }
    Ok(())
}
fn argument<T: serde::de::DeserializeOwned>(value: &Value, name: &str) -> CommandResult<T> {
    serde_json::from_value(value.get(name).cloned().ok_or_else(invalid)?).map_err(|_| invalid())
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn macro_fixture() -> (tempfile::TempDir, AppState) {
        let db = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        let schemas: Value = serde_json::from_str(include_str!("macro_schema.json")).unwrap();
        for spec in schemas["macro"]["tables"].as_object().unwrap().values() {
            sqlx::raw_sql(spec["ddl"].as_str().unwrap())
                .execute(&db)
                .await
                .unwrap();
        }
        let temporary = tempfile::tempdir().unwrap();
        let paths = AppPaths::from_root(temporary.path().join("unused-macro-fixture")).unwrap();
        (temporary, AppState { db, paths })
    }

    async fn insert_gdp_observation(
        state: &AppState,
        currency: &str,
        score: i64,
        released_at: &str,
    ) {
        let actual = (2 + score).to_string();
        sqlx::query("INSERT INTO eodhd_indicator_profiles(currency,canonical_key,target_label,factor,direction,unit,freshness_days,expected_comparison,expected_frequency,enabled) VALUES(?,'gdp','GDP','growth',1,'%',30,'YoY','monthly',1)")
            .bind(currency).execute(&state.db).await.unwrap();
        sqlx::query("INSERT INTO eodhd_indicator_series(id,currency,canonical_key,provider_type,comparison,priority,unit,frequency,enabled) VALUES(?,?,'gdp','GDP','YoY',1,'%','monthly',1)")
            .bind(currency).bind(currency).execute(&state.db).await.unwrap();
        sqlx::query("INSERT INTO eodhd_events(id,country,currency,provider_type,comparison,period,released_at,actual_value,forecast_value,previous_value,frequency,canonical_key,mapping_status,source_url,updated_at) VALUES(?,'Synthetic country',?,'GDP','YoY','2026-08',?,?,'2','1','monthly','gdp','mapped','https://eodhd.com/api/economic-events','2026-09-02T12:00:00Z')")
            .bind(currency).bind(currency).bind(released_at).bind(&actual).execute(&state.db).await.unwrap();
        sqlx::query("INSERT INTO eodhd_fundamental_evaluations(snapshot_id,currency,canonical_key,source_label,actual_text,forecast_text,previous_text,surprise_text,score,evaluation_status,reason_codes_json,released_at,frequency,source_url,unit) VALUES('snapshot',?,'gdp','GDP',?,'2','1',?,?,?,'[]',?,'monthly','https://eodhd.com/api/economic-events','%')")
            .bind(currency).bind(actual).bind(score.to_string()).bind(score)
            .bind(if score == 0 { "neutral" } else { "scored" }).bind(released_at)
            .execute(&state.db).await.unwrap();
    }

    fn currency<'a>(dashboard: &'a Value, code: &str) -> &'a Value {
        dashboard["currencies"]
            .as_array()
            .unwrap()
            .iter()
            .find(|value| value["currency"] == code)
            .unwrap()
    }

    fn gdp(currency: &Value) -> &Value {
        currency["indicators"]
            .as_array()
            .unwrap()
            .iter()
            .find(|value| value["key"] == "gdp")
            .unwrap()
    }

    fn pair<'a>(dashboard: &'a Value, base: &str, quote: &str) -> &'a Value {
        dashboard["pairs"]
            .as_array()
            .unwrap()
            .iter()
            .find(|value| value["base"] == base && value["quote"] == quote)
            .unwrap()
    }

    #[tokio::test]
    async fn macro_cloud_freshness_expires_before_aggregation_without_losing_raw_data() {
        let (_temporary, state) = macro_fixture().await;
        sqlx::query(
            "INSERT INTO eodhd_fundamental_snapshots VALUES('snapshot','2026-09-02T12:00:00Z')",
        )
        .execute(&state.db)
        .await
        .unwrap();
        insert_gdp_observation(&state, "EUR", 1, "2026-08-26T12:00:00Z").await;
        insert_gdp_observation(&state, "CHF", 0, "2026-08-26T12:00:00Z").await;
        insert_gdp_observation(&state, "USD", -1, "2026-09-01T12:00:00Z").await;
        sqlx::query("PRAGMA query_only=ON")
            .execute(&state.db)
            .await
            .unwrap();

        // Desktop freshness uses '<', so a release is still available exactly
        // at its boundary. One second later its own signal must expire.
        let boundary = DateTime::parse_from_rfc3339("2026-09-25T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let before = read_state_at(
            "get_eodhd_fundamentals_dashboard",
            &json!({}),
            &state,
            boundary,
        )
        .await
        .unwrap();
        assert_eq!(gdp(currency(&before, "EUR"))["status"], "scored");
        assert_eq!(gdp(currency(&before, "CHF"))["status"], "neutral");
        assert_eq!(pair(&before, "EUR", "USD")["fundamentalScore"], 2);
        assert_eq!(pair(&before, "USD", "EUR")["fundamentalScore"], -2);

        let after_time = boundary + chrono::Duration::seconds(1);
        let after = read_state_at(
            "get_eodhd_fundamentals_dashboard",
            &json!({}),
            &state,
            after_time,
        )
        .await
        .unwrap();
        for code in ["EUR", "CHF"] {
            let value = gdp(currency(&after, code));
            assert_eq!(value["status"], "unmapped");
            assert_eq!(value["score"], 0);
            assert_eq!(value["reasonCodes"], json!(["stale_release"]));
            assert_eq!(currency(&after, code)["fundamentalsScore"], 0);
            for field in [
                "actualText",
                "forecastText",
                "previousText",
                "surpriseText",
                "releasedAt",
                "sourceUrl",
                "sourceLabel",
            ] {
                assert_eq!(value[field], gdp(currency(&before, code))[field]);
            }
        }
        assert_eq!(gdp(currency(&after, "USD"))["status"], "scored");
        assert_eq!(currency(&after, "USD")["fundamentalsScore"], -1);
        assert_eq!(after["asOf"], "2026-09-02T12:00:00Z");
        // Preserve the existing desktop contract: an unavailable counterpart
        // is numerically zero, while the still-fresh side retains its signal.
        // The incomplete cell remains explicitly unavailable. See the review
        // note for the pre-existing discrepancy with AGENTS.md section 10.4.
        for (base, quote, expected_score) in [("EUR", "USD", 1), ("USD", "EUR", -1)] {
            let value = pair(&after, base, quote);
            assert_eq!(value["fundamentalScore"], expected_score);
            let cell = value["cells"]
                .as_array()
                .unwrap()
                .iter()
                .find(|value| value["key"] == "gdp")
                .unwrap();
            assert_eq!(cell["available"], false);
            assert_eq!(cell["score"], expected_score);
            assert_eq!(cell["baseAvailable"], base == "USD");
            assert_eq!(cell["quoteAvailable"], quote == "USD");
            assert_eq!(cell["baseScore"], if base == "USD" { -1 } else { 0 });
            assert_eq!(cell["quoteScore"], if quote == "USD" { -1 } else { 0 });
        }

        let history = read_state_at(
            "get_eodhd_indicator_history",
            &json!({"input":{"currency":"EUR","canonicalKey":"gdp","months":12}}),
            &state,
            after_time,
        )
        .await
        .unwrap();
        assert_eq!(history["to"], after_time.to_rfc3339());
        assert_eq!(history["freshnessDays"], 30);
        assert_eq!(history["points"][0]["actualText"], "3");
        assert_eq!(history["points"][0]["forecastText"], "2");
        let stored: (i64, String) = sqlx::query_as("SELECT score,evaluation_status FROM eodhd_fundamental_evaluations WHERE currency='EUR'")
            .fetch_one(&state.db).await.unwrap();
        assert_eq!(stored, (1, "scored".into()));
        assert!(
            sqlx::query("DELETE FROM eodhd_events")
                .execute(&state.db)
                .await
                .is_err()
        );
        state.db.close().await;
    }

    #[tokio::test]
    async fn macro_cloud_feed_counts_only_pending_mapping_reviews() {
        let (_temporary, state) = macro_fixture().await;
        for (id, status) in [
            ("pending-1", "pending"),
            ("pending-2", "pending"),
            ("accepted", "accepted"),
            ("rejected", "rejected"),
        ] {
            sqlx::query("INSERT INTO eodhd_mapping_candidates(id,currency,provider_type,proposed_canonical_key,confidence,status,created_at) VALUES(?,'EUR','GDP','gdp',50,?,'2026-09-01T12:00:00Z')")
                .bind(id).bind(status).execute(&state.db).await.unwrap();
        }
        sqlx::query("INSERT INTO eodhd_sync_runs VALUES('2026-09-01T12:00:00Z','complete'),('2026-09-02T12:00:00Z','partial')")
            .execute(&state.db).await.unwrap();
        sqlx::query("PRAGMA query_only=ON")
            .execute(&state.db)
            .await
            .unwrap();
        let feed = read_state("get_eodhd_feed_status", &json!({}), &state)
            .await
            .unwrap();
        assert_eq!(feed["pendingMappingReviews"], 2);
        assert_eq!(feed["lastSuccessAt"], "2026-09-02T12:00:00Z");
        assert_eq!(feed["configured"], false);
        assert_eq!(feed["running"], false);
        assert_eq!(feed["pendingJobs"], 0);
        let candidates = read_state("list_eodhd_mapping_candidates", &json!({}), &state)
            .await
            .unwrap();
        assert_eq!(
            candidates
                .as_array()
                .unwrap()
                .iter()
                .filter(|candidate| candidate["status"] == "pending")
                .count(),
            2
        );
        state.db.close().await;
    }

    #[test]
    fn input_validation_rejects_unbounded_or_mutating_commands() {
        assert!(validate("sync_cot_data", &json!({})).is_err());
        assert!(
            validate(
                "get_cot_asset_detail",
                &json!({"input":{"symbol":"EUR","lookbackWeeks":999999}})
            )
            .is_err()
        );
        assert!(
            validate(
                "get_eodhd_indicator_history",
                &json!({"input":{"currency":"USD","canonicalKey":"gdp","months":999999}})
            )
            .is_err()
        );
        assert!(
            validate(
                "get_aud_china_cpi_regime",
                &json!({"input":{"timeframe":"H1"}})
            )
            .is_err()
        );
        assert!(validate("get_cot_dashboard", &json!({"path":"C:/private"})).is_err());
        assert!(validate("get_economic_calendar", &json!({"input":{"range":"currentWeek","timezoneOffsetMinutes":-120,"timezone":"Europe/Berlin"}})).is_ok());
    }

    #[tokio::test]
    async fn macro_and_cot_reads_work_without_write_access_or_personal_tables() {
        let db = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        let schemas: Value = serde_json::from_str(include_str!("macro_schema.json")).unwrap();
        for kind in ["macro", "cot"] {
            for spec in schemas[kind]["tables"].as_object().unwrap().values() {
                sqlx::raw_sql(spec["ddl"].as_str().unwrap())
                    .execute(&db)
                    .await
                    .unwrap();
            }
        }
        // A present COT contract exercises assessment without requiring the
        // cot_evaluations write table or personal cot_broker_links table.
        sqlx::query("INSERT INTO cot_contracts VALUES('contract','EUR','Euro FX','Forex','099741','EUR',1,1)").execute(&db).await.unwrap();
        sqlx::query("PRAGMA query_only=ON")
            .execute(&db)
            .await
            .unwrap();
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().join("unused-macro-readonly-test");
        let state = AppState {
            db: db.clone(),
            paths: AppPaths::from_root(root).unwrap(),
        };
        let dashboard = read_state("get_eodhd_fundamentals_dashboard", &json!({}), &state)
            .await
            .unwrap();
        assert_eq!(dashboard["currencies"].as_array().unwrap().len(), 9);
        let cot = read_state("get_cot_dashboard", &json!({}), &state)
            .await
            .unwrap();
        assert_eq!(cot["contracts"].as_array().unwrap().len(), 1);
        let detail = read_state(
            "get_cot_asset_detail",
            &json!({"input":{"symbol":"EUR","lookbackWeeks":52}}),
            &state,
        )
        .await
        .unwrap();
        assert_eq!(detail["symbol"], "EUR");
        assert!(
            sqlx::query("DELETE FROM cot_contracts")
                .execute(&db)
                .await
                .is_err()
        );
        db.close().await;
    }
}
