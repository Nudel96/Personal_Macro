import { supportsPrivateWebCommand } from "../services/private-web-client";
import { isPrivateWeb } from "../services/runtime-mode";
import { PRIVATE_MARKET_COMMANDS } from "../services/private-market-commands";

const accountCommands = [
  "get_bootstrap_data",
  "get_account_journal",
  "save_account",
  "archive_account",
  "list_account_cashflows",
  "add_account_cashflow",
] as const;

const mediaCommands = [
  "list_media",
  "list_trade_media",
  "attach_trade_media",
  "detach_trade_media",
  "get_media_annotation",
  "save_media_annotation",
  "upload_private_media",
] as const;

// A route is enabled only when its complete editing workflow is available.
// Journal workflows remain mandatory independently of optional market snapshots.
export const PRIVATE_ROUTE_COMMANDS: Readonly<
  Record<string, readonly string[]>
> = {
  "/": ["calculate_dashboard", "list_trades", "list_reviews"],
  "/trades": [
    "list_trades",
    "get_trade",
    "create_trade",
    "update_trade",
    "trash_trade",
    "restore_trade",
    "duplicate_trade",
    "list_deleted_trades",
    "get_trade_context",
    "save_trade_context",
    "list_saved_views",
    "save_saved_view",
    "delete_saved_view",
    "list_custom_fields",
    "list_trade_mistakes",
    "assign_trade_mistake",
    ...mediaCommands,
  ],
  "/calendar": ["calculate_calendar", "calculate_dashboard"],
  "/analytics": ["calculate_dashboard"],
  "/reviews": ["list_reviews", "save_review", "calculate_dashboard"],
  "/playbook": ["list_playbook", "create_setup", "create_setup_version"],
  "/mistakes": ["get_mistake_analytics"],
  "/media": mediaCommands,
  "/goals": ["list_goals", "save_goal", "record_goal_progress"],
  "/settings": [
    ...accountCommands,
    "get_settings",
    "update_setting",
    "create_strategy",
    "create_tag",
    "list_custom_fields",
    "save_custom_field",
    "delete_custom_field",
  ],
};

// The shell contains trade capture and shared account controls. Validate their
// commands with all enabled journal pages before importing any workspace state.
export const PRIVATE_WORKSPACE_COMMANDS: readonly string[] = [
  ...new Set(Object.values(PRIVATE_ROUTE_COMMANDS).flat()),
];

// Optional snapshot pages and static learning content do not become prerequisites
// for the journal. The private session boundary still guards the whole workspace.
export const PRIVATE_OPTIONAL_ROUTE_COMMANDS: Readonly<
  Record<string, readonly string[]>
> = {
  // Static learning content needs no provider or personal cloud command.
  "/learning": [],
  "/import-export": [
    "list_trades",
    "import_trades_batch",
    "list_cloud_backups",
    "create_cloud_backup",
    "get_cloud_backup",
    "restore_cloud_backup",
  ],
  "/weather": ["get_weather_forecast"],
  "/macro": [
    "get_eodhd_fundamentals_dashboard",
    "get_eodhd_feed_status",
    "list_eodhd_mapping_candidates",
    "get_cot_dashboard",
    "get_pair_technical_signals",
  ],
  "/cot": ["get_cot_dashboard", "get_cot_asset_detail"],
  "/economic-data": [
    "get_eodhd_fundamentals_dashboard",
    "get_eodhd_indicator_history",
    "get_eodhd_feed_status",
  ],
  "/economic-calendar": ["get_economic_calendar", "get_eodhd_feed_status"],
  "/regime-insights": ["get_aud_china_cpi_regime"],
  "/government-bonds": ["get_government_bonds", "get_government_bond_detail"],
  "/central-bank-reports": [
    "get_central_bank_reports",
    "get_central_bank_report",
    "list_central_bank_report_reads",
    "mark_central_bank_report_read",
  ],
  "/world-atlas": [
    ...[...PRIVATE_MARKET_COMMANDS].filter((command) =>
      command.startsWith("get_atlas_"),
    ),
    "list_atlas_notebook",
    "get_atlas_notebook_entry",
    "create_atlas_notebook_entry",
    "update_atlas_notebook_entry",
    "trash_atlas_notebook_entry",
    "get_atlas_last_context",
    "save_atlas_last_context",
  ],
  "/rates": ["get_policy_rates"],
  "/seasonality": [
    "get_seasonality",
    "get_seasonality_asset_detail",
    "analyze_seasonality",
  ],
};

export function canUseWorkspaceRoute(path: string): boolean {
  if (!isPrivateWeb()) return true;
  const commands =
    PRIVATE_ROUTE_COMMANDS[path] ?? PRIVATE_OPTIONAL_ROUTE_COMMANDS[path];
  return Boolean(commands && commands.every(supportsPrivateWebCommand));
}
