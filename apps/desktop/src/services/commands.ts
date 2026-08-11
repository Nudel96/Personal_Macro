import { invoke } from "@tauri-apps/api/core";
import {
  browserBootstrap,
  browserCreateTrade,
  browserDashboard,
  browserGetTrade,
  browserListTrades,
  browserListDeletedTrades,
  browserRestoreTrade,
  browserTrashTrade,
  browserUpdateTrade,
} from "./browser-adapter";
import type {
  BootstrapData,
  Account,
  AccountInput,
  AccountCashflow,
  CommandError,
  DashboardResponse,
  DeletedTrade,
  EodhdFeedStatus,
  EodhdMappingCandidate,
  EodhdSyncResult,
  MacroFundamentalsDashboard,
  CotDashboard,
  CotAssetDetail,
  CotDetailInput,
  CotBrokerLinkInput,
  CotSyncResult,
  PolicyRateDashboard,
  SeasonalityDashboard,
  SeasonalityAssetDetail,
  SeasonalityImport,
  SeasonalityForexPair,
  SeasonalityAnalysis,
  SeasonalityAnalysisInput,
  SeasonalityScreenerRow,
  GoalInput,
  GoalRecord,
  MistakeAnalytics,
  PlaybookSetup,
  ReviewInput,
  ReviewRecord,
  MediaRecord,
  MediaAnnotationRecord,
  BackupRecord,
  ExportResult,
  RestorePreview,
  RestoreStageResult,
  LegacyPreview,
  LegacyImportResult,
  PagedTrades,
  TradeDetail,
  TradeFilter,
  TradeInput,
  TradeMistakeRecord,
  TaxonomyItem,
  TradeContext,
  TradeContextInput,
  SavedView,
  SavedViewInput,
  CustomField,
  CustomFieldInput,
  Candle,
  MarketQuote,
  MarketStatus,
  MarketSymbol,
  MarketTimeframe,
  Mt5Account,
  Mt5AccountsResponse,
  Mt5SyncResult,
} from "../types/domain";

export const isTauri = () => "__TAURI_INTERNALS__" in window;

function normalizeError(error: unknown): CommandError {
  if (typeof error === "object" && error && "message" in error) {
    return {
      code: "code" in error ? String(error.code) : "UNKNOWN_ERROR",
      message: String(error.message),
      details: "details" in error ? error.details : undefined,
    };
  }
  return { code: "UNKNOWN_ERROR", message: String(error) };
}

async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw normalizeError(error);
  }
}

export const api = {
  marketStatus: (): Promise<MarketStatus> =>
    isTauri()
      ? call("get_market_status")
      : Promise.resolve({
          connected: false,
          provider: "BlackBull MT5",
          lastUpdate: new Date().toISOString(),
          code: "DESKTOP_REQUIRED",
          message:
            "Der BlackBull-Livechart ist nur in der Desktop-App verfügbar.",
        }),
  marketSymbols: (): Promise<MarketSymbol[]> =>
    isTauri()
      ? call("list_market_symbols")
      : Promise.reject({ message: "MT5-Symbole benötigen die Desktop-App." }),
  marketCandles: (
    symbol: string,
    timeframe: MarketTimeframe,
    limit = 1500,
  ): Promise<Candle[]> =>
    isTauri()
      ? call("get_market_candles", { input: { symbol, timeframe, limit } })
      : Promise.reject({ message: "MT5-Kerzen benötigen die Desktop-App." }),
  marketQuote: (symbol: string): Promise<MarketQuote> =>
    isTauri()
      ? call("get_market_quote", { symbol })
      : Promise.reject({ message: "MT5-Kurse benötigen die Desktop-App." }),
  mt5Accounts: (): Promise<Mt5AccountsResponse> =>
    isTauri()
      ? call("get_mt5_accounts")
      : Promise.resolve({ accounts: [], automationIntervalSeconds: 10 }),
  linkMt5Account: (
    mt5AccountId: string,
    localAccountId: string,
  ): Promise<Mt5Account> =>
    isTauri()
      ? call("link_mt5_account", {
          input: { mt5AccountId, localAccountId },
        })
      : Promise.reject({ message: "MT5-Konten benötigen die Desktop-App." }),
  unlinkMt5Account: (mt5AccountId: string): Promise<void> =>
    isTauri()
      ? call("unlink_mt5_account", { mt5AccountId })
      : Promise.reject({ message: "MT5-Konten benötigen die Desktop-App." }),
  syncMt5Now: (): Promise<Mt5SyncResult> =>
    isTauri()
      ? call("sync_mt5_now")
      : Promise.reject({
          message: "MT5-Synchronisierung benötigt die Desktop-App.",
        }),
  bootstrap: (): Promise<BootstrapData> =>
    isTauri() ? call("get_bootstrap_data") : Promise.resolve(browserBootstrap),
  saveAccount: (input: AccountInput): Promise<Account> =>
    isTauri()
      ? call("save_account", { input })
      : Promise.resolve().then(() => {
          const current = browserBootstrap.accounts.find(
            (account) => account.id === input.id,
          );
          const account: Account = {
            ...input,
            id: input.id ?? crypto.randomUUID(),
            currentBalanceMinor:
              current?.currentBalanceMinor ?? input.initialBalanceMinor,
            isArchived: false,
          };
          if (current) Object.assign(current, account);
          else browserBootstrap.accounts.push(account);
          return account;
        }),
  archiveAccount: (id: string): Promise<void> =>
    isTauri()
      ? call("archive_account", { id })
      : Promise.resolve().then(() => {
          const account = browserBootstrap.accounts.find(
            (item) => item.id === id,
          );
          if (account) account.isArchived = true;
        }),
  accountCashflows: (accountId: string): Promise<AccountCashflow[]> =>
    isTauri()
      ? call("list_account_cashflows", { accountId })
      : Promise.resolve(
          JSON.parse(
            localStorage.getItem(
              `personal-macro:browser-cashflows:${accountId}`,
            ) ?? "[]",
          ),
        ),
  addAccountCashflow: (
    input: Omit<AccountCashflow, "id" | "createdAt">,
  ): Promise<AccountCashflow> =>
    isTauri()
      ? call("add_account_cashflow", { input })
      : Promise.resolve().then(() => {
          const row = {
            ...input,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
          };
          const rows = JSON.parse(
            localStorage.getItem(
              `personal-macro:browser-cashflows:${input.accountId}`,
            ) ?? "[]",
          ) as AccountCashflow[];
          rows.unshift(row);
          localStorage.setItem(
            `personal-macro:browser-cashflows:${input.accountId}`,
            JSON.stringify(rows),
          );
          return row;
        }),
  listTrades: (filter: TradeFilter = {}): Promise<PagedTrades> =>
    isTauri() ? call("list_trades", { filter }) : browserListTrades(filter),
  getTrade: (id: string): Promise<TradeDetail> =>
    isTauri() ? call("get_trade", { id }) : browserGetTrade(id),
  createTrade: (input: TradeInput): Promise<TradeDetail> =>
    isTauri() ? call("create_trade", { input }) : browserCreateTrade(input),
  updateTrade: (id: string, input: TradeInput): Promise<TradeDetail> =>
    isTauri()
      ? call("update_trade", { id, input })
      : browserUpdateTrade(id, input),
  trashTrade: (id: string): Promise<void> =>
    isTauri() ? call("trash_trade", { id }) : browserTrashTrade(id),
  deletedTrades: (): Promise<DeletedTrade[]> =>
    isTauri() ? call("list_deleted_trades") : browserListDeletedTrades(),
  restoreTrade: (id: string): Promise<TradeDetail> =>
    isTauri() ? call("restore_trade", { id }) : browserRestoreTrade(id),
  duplicateTrade: (id: string): Promise<TradeDetail> =>
    isTauri()
      ? call("duplicate_trade", { id })
      : (async () => {
          const trade = await browserGetTrade(id);
          const duplicated = await browserCreateTrade({
            ...trade,
            id: undefined,
            status: "draft",
            openedAt: null,
            closedAt: null,
          });
          const workspace = await import("./workspace-browser");
          const context = await workspace.getBrowserTradeContext(id);
          await workspace.saveBrowserTradeContext({
            tradeId: duplicated.id,
            tagIds: context.tags.map((tag) => tag.id),
            legs: [],
            checklistItems: context.checklistItems.map((item) => ({
              ...item,
              label: item.label ?? item.labelSnapshot ?? "",
              isChecked: null,
            })),
            emotions: [],
            customValues: context.customValues,
          });
          return duplicated;
        })(),
  tradeContext: (tradeId: string): Promise<TradeContext> =>
    isTauri()
      ? call("get_trade_context", { tradeId })
      : import("./workspace-browser").then((module) =>
          module.getBrowserTradeContext(tradeId),
        ),
  saveTradeContext: (input: TradeContextInput): Promise<TradeContext> =>
    isTauri()
      ? call("save_trade_context", { input })
      : import("./workspace-browser").then((module) =>
          module.saveBrowserTradeContext(input),
        ),
  savedViews: (scope: string): Promise<SavedView[]> =>
    isTauri()
      ? call("list_saved_views", { scope })
      : import("./workspace-browser").then((module) =>
          module.listBrowserSavedViews(scope),
        ),
  saveSavedView: (input: SavedViewInput): Promise<SavedView> =>
    isTauri()
      ? call("save_saved_view", { input })
      : import("./workspace-browser").then((module) =>
          module.saveBrowserSavedView(input),
        ),
  deleteSavedView: (id: string): Promise<void> =>
    isTauri()
      ? call("delete_saved_view", { id })
      : import("./workspace-browser").then((module) =>
          module.deleteBrowserSavedView(id),
        ),
  customFields: (entityType = "trade"): Promise<CustomField[]> =>
    isTauri()
      ? call("list_custom_fields", { entityType })
      : import("./workspace-browser").then((module) =>
          module.listBrowserCustomFields(entityType),
        ),
  saveCustomField: (input: CustomFieldInput): Promise<CustomField> =>
    isTauri()
      ? call("save_custom_field", { input })
      : import("./workspace-browser").then((module) =>
          module.saveBrowserCustomField(input),
        ),
  deleteCustomField: (id: string): Promise<void> =>
    isTauri()
      ? call("delete_custom_field", { id })
      : import("./workspace-browser").then((module) =>
          module.deleteBrowserCustomField(id),
        ),
  dashboard: (filter: TradeFilter = {}): Promise<DashboardResponse> =>
    isTauri()
      ? call("calculate_dashboard", { filter })
      : browserDashboard(filter),
  macroFundamentalsDashboard: (): Promise<MacroFundamentalsDashboard> =>
    isTauri()
      ? call("get_eodhd_fundamentals_dashboard")
      : Promise.reject({
          message: "Der EODHD-Datenfeed benötigt die Desktop-App.",
        }),
  eodhdFeedStatus: (): Promise<EodhdFeedStatus> =>
    isTauri()
      ? call("get_eodhd_feed_status")
      : Promise.resolve({
          configured: false,
          running: false,
          lastRun: null,
          pendingJobs: 0,
          nextDueAt: null,
          pendingMappingReviews: 0,
          lastSuccessAt: null,
        }),
  syncEodhdNow: (): Promise<EodhdSyncResult> =>
    isTauri()
      ? call("sync_eodhd_now")
      : Promise.reject({
          message:
            "Der EODHD-Datenfeed ist in der Browser-Vorschau nicht verfügbar.",
        }),
  eodhdMappingCandidates: (): Promise<EodhdMappingCandidate[]> =>
    isTauri() ? call("list_eodhd_mapping_candidates") : Promise.resolve([]),
  reviewEodhdMappingCandidate: (input: {
    id: string;
    action: "approve" | "ignore";
    canonicalKey?: string | null;
  }): Promise<EodhdMappingCandidate> =>
    isTauri()
      ? call("review_eodhd_mapping_candidate", input)
      : Promise.reject({
          message:
            "EODHD-Zuordnungen können nur in der Desktop-App bearbeitet werden.",
        }),
  cotDashboard: (): Promise<CotDashboard> =>
    isTauri()
      ? call("get_cot_dashboard")
      : Promise.resolve({
          sourceUrl: "https://www.cftc.gov/MarketReports/CommitmentsofTraders/",
          lastSyncedAt: null,
          contracts: [],
          currencies: [],
          pairs: [],
        }),
  cotAssetDetail: (input: CotDetailInput): Promise<CotAssetDetail> =>
    isTauri()
      ? call("get_cot_asset_detail", { input })
      : Promise.reject({
          message: "COT-Detaildaten benÃ¶tigen die Desktop-App.",
        }),
  linkCotBrokerSymbol: (input: CotBrokerLinkInput): Promise<void> =>
    isTauri()
      ? call("link_cot_broker_symbol", { input })
      : Promise.reject({
          message: "COT-Zuordnungen benÃ¶tigen die Desktop-App.",
        }),
  syncCot: (): Promise<CotSyncResult> =>
    isTauri()
      ? call("sync_cot_data")
      : Promise.reject({
          message: "COT-Daten werden nur in der Desktop-App abgerufen.",
        }),
  policyRates: (): Promise<PolicyRateDashboard> =>
    isTauri()
      ? call("get_policy_rates")
      : Promise.resolve(
          JSON.parse(
            localStorage.getItem("personal-macro:browser-rates:v1") ??
              '{"rates":[],"usdRelative":{"coveredCentralBanks":0,"requiredCentralBanks":4,"hikeCount":0,"holdCount":0,"cutCount":0,"availabilityStatus":"unavailable"},"automation":{"enabled":false,"coveredCurrencies":0,"expectedCurrencies":9,"refreshIntervalHours":6}}',
          ),
        ),
  syncPolicyRates: (): Promise<PolicyRateDashboard> =>
    isTauri()
      ? call("sync_policy_rates")
      : Promise.reject({
          message:
            "Die automatische Leitzins-Aktualisierung benötigt die Desktop-App.",
        }),
  seasonality: (): Promise<SeasonalityDashboard> =>
    isTauri()
      ? call("get_seasonality")
      : Promise.resolve(
          JSON.parse(
            localStorage.getItem("personal-macro:browser-seasonality:v1") ??
              '{"items":[],"assets":[],"collectionStatus":null,"collectionError":null,"dataVersion":"browser"}',
          ),
        ),
  seasonalityAssetDetail: (symbol: string): Promise<SeasonalityAssetDetail> =>
    isTauri()
      ? call("get_seasonality_asset_detail", { symbol })
      : Promise.reject({
          message: "BlackBull-Seasonality benÃ¶tigt die Desktop-App.",
        }),
  analyzeSeasonality: (
    input: SeasonalityAnalysisInput,
  ): Promise<SeasonalityAnalysis> =>
    isTauri()
      ? call("analyze_seasonality", { input })
      : Promise.reject({
          message:
            "Die interaktive Seasonality-Analyse benÃ¶tigt die Desktop-App.",
        }),
  seasonalityScreener: (): Promise<SeasonalityScreenerRow[]> =>
    isTauri()
      ? call("get_seasonality_screener")
      : Promise.reject({
          message: "Der Seasonality-Screener benÃ¶tigt die Desktop-App.",
        }),
  seasonalityForexPairs: (): Promise<SeasonalityForexPair[]> =>
    isTauri() ? call("get_seasonality_forex_pairs") : Promise.resolve([]),
  importSeasonality: (
    input: SeasonalityImport,
  ): Promise<SeasonalityDashboard> =>
    isTauri()
      ? call("import_seasonality", { input })
      : Promise.resolve({
          snapshotAt: input.snapshotAt ?? new Date().toISOString(),
          sourceName: input.sourceName,
          sourceUrl: input.sourceUrl,
          items: input.items,
          assets: [],
          dataVersion: "browser-import",
        }).then((output) => {
          localStorage.setItem(
            "personal-macro:browser-seasonality:v1",
            JSON.stringify(output),
          );
          return output;
        }),
  reviews: (): Promise<ReviewRecord[]> =>
    isTauri()
      ? call("list_reviews")
      : import("./workspace-browser").then((module) =>
          module.listBrowserReviews(),
        ),
  saveReview: (input: ReviewInput): Promise<ReviewRecord> =>
    isTauri()
      ? call("save_review", { input })
      : import("./workspace-browser").then((module) =>
          module.saveBrowserReview(input),
        ),
  goals: (): Promise<GoalRecord[]> =>
    isTauri()
      ? call("list_goals")
      : import("./workspace-browser").then((module) =>
          module.listBrowserGoals(),
        ),
  saveGoal: (input: GoalInput): Promise<GoalRecord> =>
    isTauri()
      ? call("save_goal", { input })
      : import("./workspace-browser").then((module) =>
          module.saveBrowserGoal(input),
        ),
  recordGoalProgress: (
    goalId: string,
    value: string,
    note?: string,
  ): Promise<void> =>
    isTauri()
      ? call("record_goal_progress", { input: { goalId, value, note } })
      : import("./workspace-browser").then((module) =>
          module.recordBrowserGoalProgress(goalId, value),
        ),
  playbook: (): Promise<PlaybookSetup[]> =>
    isTauri()
      ? call("list_playbook")
      : import("./workspace-browser").then((module) =>
          module.listBrowserPlaybook(),
        ),
  createSetupVersion: (input: {
    setupId: string;
    rules: unknown;
    checklist: unknown;
    examples: unknown;
    notesHtml?: string;
  }): Promise<void> =>
    isTauri()
      ? call("create_setup_version", { input })
      : import("./workspace-browser").then((module) =>
          module.saveBrowserSetupVersion(input.setupId, input),
        ),
  createSetup: (input: {
    name: string;
    description?: string;
    color?: string;
    strategyId?: string;
  }): Promise<TaxonomyItem> =>
    isTauri()
      ? call("create_setup", { input })
      : import("./workspace-browser").then((module) =>
          module.createBrowserSetup(input),
        ),
  createTag: (input: {
    name: string;
    color?: string;
  }): Promise<TaxonomyItem> =>
    isTauri()
      ? call("create_tag", { input })
      : Promise.resolve().then(() => {
          const tag = {
            id: crypto.randomUUID(),
            name: input.name.trim(),
            color: input.color ?? "#64748b",
          };
          browserBootstrap.tags.push(tag);
          return tag;
        }),
  mistakeAnalytics: (): Promise<MistakeAnalytics[]> =>
    isTauri()
      ? call("get_mistake_analytics")
      : import("./workspace-browser").then((module) =>
          module.browserMistakes(),
        ),
  tradeMistakes: (tradeId: string): Promise<TradeMistakeRecord[]> =>
    isTauri()
      ? call("list_trade_mistakes", { tradeId })
      : import("./workspace-browser").then((module) =>
          module.listBrowserTradeMistakes(tradeId),
        ),
  assignTradeMistake: (input: {
    tradeId: string;
    mistakeId: string;
    severity: number;
    estimatedCostMinor?: number;
    note?: string;
  }): Promise<void> =>
    isTauri()
      ? call("assign_trade_mistake", { input })
      : import("./workspace-browser").then((module) =>
          module.assignBrowserTradeMistake(input),
        ),
  media: (): Promise<MediaRecord[]> =>
    isTauri()
      ? call("list_media")
      : Promise.resolve(
          JSON.parse(
            localStorage.getItem("personal-macro:browser-media:v1") ?? "[]",
          ),
        ),
  tradeMedia: async (tradeId: string): Promise<MediaRecord[]> => {
    if (isTauri()) return call("list_trade_media", { tradeId });
    const ids = JSON.parse(
      localStorage.getItem(`personal-macro:browser-trade-media:${tradeId}`) ??
        "[]",
    ) as string[];
    const rows = JSON.parse(
      localStorage.getItem("personal-macro:browser-media:v1") ?? "[]",
    ) as MediaRecord[];
    return rows.filter((row) => ids.includes(row.id));
  },
  attachTradeMedia: (
    tradeId: string,
    mediaId: string,
    slot = "other",
    caption?: string,
  ): Promise<void> =>
    isTauri()
      ? call("attach_trade_media", { tradeId, mediaId, slot, caption })
      : Promise.resolve().then(() => {
          const key = `personal-macro:browser-trade-media:${tradeId}`;
          const ids = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
          if (!ids.includes(mediaId)) ids.push(mediaId);
          localStorage.setItem(key, JSON.stringify(ids));
        }),
  detachTradeMedia: (tradeId: string, mediaId: string): Promise<void> =>
    isTauri()
      ? call("detach_trade_media", { tradeId, mediaId })
      : Promise.resolve().then(() => {
          const key = `personal-macro:browser-trade-media:${tradeId}`;
          const ids = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
          localStorage.setItem(
            key,
            JSON.stringify(ids.filter((id) => id !== mediaId)),
          );
        }),
  importMediaPath: (sourcePath: string): Promise<MediaRecord> =>
    call("import_media_file", { input: { sourcePath } }),
  mediaAnnotation: (mediaId: string): Promise<MediaAnnotationRecord | null> =>
    isTauri()
      ? call("get_media_annotation", { mediaId })
      : Promise.resolve(
          JSON.parse(
            localStorage.getItem(
              `personal-macro:browser-annotation:${mediaId}`,
            ) ?? "null",
          ),
        ),
  saveMediaAnnotation: (
    mediaId: string,
    annotation: unknown,
  ): Promise<MediaAnnotationRecord> =>
    isTauri()
      ? call("save_media_annotation", { input: { mediaId, annotation } })
      : Promise.resolve().then(() => {
          const now = new Date().toISOString();
          const record = {
            id: mediaId,
            mediaId,
            annotationJson: JSON.stringify(annotation),
            createdAt: now,
            updatedAt: now,
          };
          localStorage.setItem(
            `personal-macro:browser-annotation:${mediaId}`,
            JSON.stringify(record),
          );
          return record;
        }),
  settings: (): Promise<{ settings: Record<string, unknown> }> =>
    isTauri()
      ? call("get_settings")
      : Promise.resolve({
          settings: JSON.parse(
            localStorage.getItem("personal-macro:browser-settings:v1") ?? "{}",
          ),
        }),
  updateSetting: (key: string, value: unknown): Promise<void> =>
    isTauri()
      ? call("update_setting", { input: { key, value } })
      : Promise.resolve().then(() => {
          const settings = JSON.parse(
            localStorage.getItem("personal-macro:browser-settings:v1") ?? "{}",
          ) as Record<string, unknown>;
          settings[key] = value;
          localStorage.setItem(
            "personal-macro:browser-settings:v1",
            JSON.stringify(settings),
          );
        }),
  exportTrades: async (format: "csv" | "json"): Promise<ExportResult> => {
    if (isTauri()) return call("export_trades", { format });
    const trades = await browserListTrades({ pageSize: 250 });
    const contents =
      format === "json"
        ? JSON.stringify(trades.items, null, 2)
        : [
            "instrument;direction;status;opened_at;closed_at;net_pnl_minor;calculated_r",
            ...trades.items.map((trade) =>
              [
                trade.instrument,
                trade.direction,
                trade.status,
                trade.openedAt ?? "",
                trade.closedAt ?? "",
                trade.netPnlMinor ?? "",
                trade.calculatedR ?? "",
              ].join(";"),
            ),
          ].join("\n");
    const blob = new Blob([contents], {
      type: format === "json" ? "application/json" : "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `personal-macro-trades.${format}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 2_000);
    return {
      path: anchor.download,
      format,
      recordCount: trades.total,
      sha256: "browser-download",
    };
  },
  backups: (): Promise<BackupRecord[]> =>
    isTauri() ? call("list_backups") : Promise.resolve([]),
  createBackup: (): Promise<BackupRecord> =>
    isTauri()
      ? call("create_backup")
      : Promise.reject({
          message: "Backups werden in der installierten Desktop-App erstellt.",
        }),
  previewBackup: (path: string): Promise<RestorePreview> =>
    call("preview_backup", { path }),
  stageBackupRestore: (path: string): Promise<RestoreStageResult> =>
    call("stage_backup_restore", { path }),
  previewLegacyDatabase: (path: string): Promise<LegacyPreview> =>
    call("preview_legacy_database", { path }),
  importLegacyDatabase: (path: string): Promise<LegacyImportResult> =>
    call("import_legacy_database", { path }),
};
