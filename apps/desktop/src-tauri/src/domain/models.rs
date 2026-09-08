use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub name: String,
    pub broker: Option<String>,
    pub account_type: String,
    pub base_currency: String,
    pub initial_balance_minor: i64,
    pub current_balance_minor: i64,
    pub default_risk_percent: f64,
    pub is_archived: bool,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TaxonomyItem {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EmotionItem {
    pub id: String,
    pub name: String,
    pub valence: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MistakeItem {
    pub id: String,
    pub name: String,
    pub category: String,
    pub color: String,
    pub severity_default: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapData {
    pub accounts: Vec<Account>,
    pub strategies: Vec<TaxonomyItem>,
    pub setups: Vec<TaxonomyItem>,
    pub tags: Vec<TaxonomyItem>,
    pub emotions: Vec<EmotionItem>,
    pub mistakes: Vec<MistakeItem>,
    pub database_path: String,
    pub app_data_path: String,
    pub calculation_version: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TradeFilter {
    pub search: Option<String>,
    pub account_ids: Option<Vec<String>>,
    pub setup_ids: Option<Vec<String>>,
    pub instruments: Option<Vec<String>>,
    pub directions: Option<Vec<String>>,
    pub statuses: Option<Vec<String>>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub min_process_score: Option<i64>,
    pub has_rule_violation: Option<bool>,
    pub page: Option<u32>,
    pub page_size: Option<u32>,
    pub sort_by: Option<String>,
    pub sort_direction: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TradeSummary {
    pub id: String,
    pub status: String,
    pub instrument: String,
    pub asset_class: String,
    pub direction: String,
    pub account_name: Option<String>,
    pub setup_name: Option<String>,
    pub session: Option<String>,
    pub timeframe: Option<String>,
    pub opened_at: Option<String>,
    pub closed_at: Option<String>,
    pub actual_entry: Option<String>,
    pub actual_exit: Option<String>,
    pub quantity: Option<String>,
    pub net_pnl_minor: Option<i64>,
    pub calculated_r: Option<String>,
    pub process_score: Option<i64>,
    pub followed_plan: Option<bool>,
    pub reviewed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TradeDetail {
    pub id: String,
    pub account_id: Option<String>,
    pub strategy_id: Option<String>,
    pub setup_id: Option<String>,
    pub status: String,
    pub instrument: String,
    pub asset_class: String,
    pub direction: String,
    pub session: Option<String>,
    pub timeframe: Option<String>,
    pub opened_at: Option<String>,
    pub closed_at: Option<String>,
    pub display_timezone: String,
    pub planned_entry: Option<String>,
    pub actual_entry: Option<String>,
    pub initial_stop_loss: Option<String>,
    pub actual_exit: Option<String>,
    pub take_profit: Option<String>,
    pub quantity: Option<String>,
    pub planned_risk_minor: Option<i64>,
    pub gross_pnl_minor: Option<i64>,
    pub fees_minor: i64,
    pub commission_minor: i64,
    pub swap_minor: i64,
    pub net_pnl_minor: Option<i64>,
    pub calculated_r: Option<String>,
    pub r_override: Option<String>,
    pub r_override_reason: Option<String>,
    pub mae_r: Option<String>,
    pub mfe_r: Option<String>,
    pub followed_plan: Option<bool>,
    pub followed_risk_rules: Option<bool>,
    pub followed_entry_rules: Option<bool>,
    pub followed_exit_rules: Option<bool>,
    pub impulse_trade: Option<bool>,
    pub process_score: Option<i64>,
    pub execution_score: Option<i64>,
    pub setup_quality: Option<i64>,
    pub confidence_before: Option<i64>,
    pub focus_before: Option<i64>,
    pub stress_before: Option<i64>,
    pub energy_before: Option<i64>,
    pub satisfaction_after: Option<i64>,
    pub reviewed_at: Option<String>,
    pub thesis_html: Option<String>,
    pub execution_notes_html: Option<String>,
    pub review_notes_html: Option<String>,
    pub lessons_html: Option<String>,
    pub source_metadata_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeInput {
    pub id: Option<String>,
    pub account_id: String,
    pub strategy_id: Option<String>,
    pub setup_id: Option<String>,
    pub status: Option<String>,
    pub instrument: String,
    pub asset_class: Option<String>,
    pub direction: String,
    pub session: Option<String>,
    pub timeframe: Option<String>,
    pub opened_at: Option<String>,
    pub closed_at: Option<String>,
    pub display_timezone: Option<String>,
    pub planned_entry: Option<String>,
    pub actual_entry: Option<String>,
    pub initial_stop_loss: Option<String>,
    pub actual_exit: Option<String>,
    pub take_profit: Option<String>,
    pub quantity: Option<String>,
    pub planned_risk_minor: Option<i64>,
    pub gross_pnl_minor: Option<i64>,
    pub fees_minor: Option<i64>,
    pub commission_minor: Option<i64>,
    pub swap_minor: Option<i64>,
    pub net_pnl_minor: Option<i64>,
    pub r_override: Option<String>,
    pub r_override_reason: Option<String>,
    pub mae_r: Option<String>,
    pub mfe_r: Option<String>,
    pub followed_plan: Option<bool>,
    pub followed_risk_rules: Option<bool>,
    pub followed_entry_rules: Option<bool>,
    pub followed_exit_rules: Option<bool>,
    pub impulse_trade: Option<bool>,
    pub process_score: Option<i64>,
    pub execution_score: Option<i64>,
    pub setup_quality: Option<i64>,
    pub confidence_before: Option<i64>,
    pub focus_before: Option<i64>,
    pub stress_before: Option<i64>,
    pub energy_before: Option<i64>,
    pub satisfaction_after: Option<i64>,
    pub reviewed_at: Option<String>,
    pub thesis_html: Option<String>,
    pub execution_notes_html: Option<String>,
    pub review_notes_html: Option<String>,
    pub lessons_html: Option<String>,
    pub source_metadata_json: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PagedTrades {
    pub items: Vec<TradeSummary>,
    pub total: i64,
    pub page: u32,
    pub page_size: u32,
    pub total_pages: u32,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CalendarDay {
    pub date: String,
    pub net_pnl_minor: i64,
    pub total_r: f64,
    pub trades: i64,
    pub wins: i64,
    pub losses: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedEntityInput {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub strategy_id: Option<String>,
}
