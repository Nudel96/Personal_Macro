mod commands;
mod database;
mod domain;
mod errors;
mod metrics;
mod repositories;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_target(false)
        .without_time()
        .try_init()
        .ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let state = tauri::async_runtime::block_on(database::initialize(&handle))
                .map_err(|error| -> Box<dyn std::error::Error> { Box::new(error) })?;
            let scheduler_state = state.clone();
            app.manage(state);
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(8)).await;
                loop {
                    if let Err(error) = commands::scheduled_cot_sync(&scheduler_state).await {
                        tracing::warn!(error = %error, "Automatische COT-Aktualisierung fehlgeschlagen");
                    }
                    if let Err(error) = commands::scheduled_seasonality_sync(&scheduler_state).await {
                        tracing::warn!(error = ?error, "Automatische Seasonality-Aktualisierung fehlgeschlagen");
                    }
                    if let Err(error) = commands::scheduled_eodhd_sync(&scheduler_state).await {
                        tracing::warn!(error = %error, "Automatische EODHD-Aktualisierung fehlgeschlagen");
                    }
                    if let Err(error) = commands::scheduled_technical_signal_sync(&scheduler_state).await {
                        tracing::warn!(error = ?error, "Automatische Technicals-Aktualisierung fehlgeschlagen");
                    }
                    if let Err(error) = commands::scheduled_central_bank_report_sync(&scheduler_state).await {
                        tracing::warn!(error = ?error, "Automatische Zentralbankbericht-Aktualisierung fehlgeschlagen");
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_bootstrap_data,
            commands::get_settings,
            commands::update_setting,
            commands::create_strategy,
            commands::create_setup,
            commands::create_tag,
            commands::save_account,
            commands::archive_account,
            commands::list_broker_connections,
            commands::detect_mt5_account,
            commands::create_account_from_mt5,
            commands::get_ctrader_authorization,
            commands::exchange_ctrader_code,
            commands::create_account_from_ctrader,
            commands::refresh_broker_connection,
            commands::disconnect_broker_connection,
            commands::list_account_cashflows,
            commands::add_account_cashflow,
            commands::create_trade,
            commands::update_trade,
            commands::get_trade,
            commands::list_trades,
            commands::duplicate_trade,
            commands::trash_trade,
            commands::restore_trade,
            commands::list_deleted_trades,
            commands::get_trade_context,
            commands::save_trade_context,
            commands::list_saved_views,
            commands::save_saved_view,
            commands::delete_saved_view,
            commands::list_custom_fields,
            commands::save_custom_field,
            commands::delete_custom_field,
            commands::calculate_dashboard,
            commands::calculate_calendar,
            commands::get_eodhd_fundamentals_dashboard,
            commands::get_eodhd_indicator_history,
            commands::get_economic_calendar,
            commands::sync_eodhd_indicator_history,
            commands::get_aud_china_cpi_regime,
            commands::refresh_aud_china_cpi_regime,
            commands::get_eodhd_feed_status,
            commands::sync_eodhd_now,
            commands::list_eodhd_mapping_candidates,
            commands::review_eodhd_mapping_candidate,
            commands::get_cot_dashboard,
            commands::get_cot_asset_detail,
            commands::link_cot_broker_symbol,
            commands::sync_cot_data,
            commands::get_put_call_dashboard,
            commands::sync_put_call_data,
            commands::import_put_call_pdf,
            commands::import_put_call_xlsx,
            commands::get_policy_rates,
            commands::sync_policy_rates,
            commands::get_central_bank_reports,
            commands::get_central_bank_report,
            commands::open_central_bank_report_file,
            commands::sync_central_bank_reports,
            commands::mark_central_bank_report_read,
            commands::get_seasonality,
            commands::get_seasonality_asset_detail,
            commands::analyze_seasonality,
            commands::get_seasonality_screener,
            commands::get_seasonality_forex_pairs,
            commands::refresh_seasonality_data,
            commands::get_pair_technical_signals,
            commands::refresh_pair_technical_signals,
            commands::list_reviews,
            commands::save_review,
            commands::list_goals,
            commands::save_goal,
            commands::record_goal_progress,
            commands::list_playbook,
            commands::create_setup_version,
            commands::get_mistake_analytics,
            commands::assign_trade_mistake,
            commands::list_trade_mistakes,
            commands::list_media,
            commands::list_trade_media,
            commands::attach_trade_media,
            commands::detach_trade_media,
            commands::import_media_file,
            commands::get_media_annotation,
            commands::save_media_annotation,
            commands::export_trades,
            commands::create_backup,
            commands::reset_journal,
            commands::list_backups,
            commands::preview_backup,
            commands::stage_backup_restore,
            commands::preview_metatrader_html,
            commands::commit_metatrader_html,
            commands::preview_ctrader_statement,
            commands::commit_ctrader_statement,
            commands::preview_legacy_database,
            commands::import_legacy_database,
        ])
        .run(tauri::generate_context!())
        .expect("Personal Macro konnte nicht gestartet werden");
}
