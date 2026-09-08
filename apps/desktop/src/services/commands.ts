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
import {
  browserPutCallDashboard,
  browserSyncPutCall,
} from "./put-call-browser";
import type {
  BootstrapData,
  Account,
  AccountInput,
  AccountCashflow,
  BrokerConnection,
  ConnectedAccountResult,
  CTraderAuthorization,
  CTraderCandidateResponse,
  Mt5AccountSnapshot,
  CommandError,
  DashboardResponse,
  DeletedTrade,
  EodhdFeedStatus,
  EodhdIndicatorHistory,
  EodhdIndicatorHistoryInput,
  AudChinaCpiRegimeInput,
  AudChinaCpiRegimeResponse,
  EconomicCalendarInput,
  EconomicCalendarResponse,
  EodhdMappingCandidate,
  EodhdSyncResult,
  MacroFundamentalsDashboard,
  PairTechnicalDashboard,
  CotDashboard,
  CotAssetDetail,
  CotDetailInput,
  CotBrokerLinkInput,
  CotSyncResult,
  PolicyRateDashboard,
  CentralBankReportDashboard,
  CentralBankReportDetail,
  CentralBankSyncResult,
  SeasonalityDashboard,
  SeasonalityAssetDetail,
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
  CalendarDay,
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
  JournalResetResult,
  CTraderStatementCommitInput,
  CTraderStatementCommitResult,
  CTraderStatementPreview,
  CTraderStatementPreviewInput,
  MetaTraderHtmlCommitInput,
  MetaTraderHtmlCommitResult,
  MetaTraderHtmlPreview,
  MetaTraderHtmlPreviewInput,
  PutCallDashboard,
  PutCallBatchImportResult,
  PutCallSyncResult,
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
  bootstrap: (): Promise<BootstrapData> =>
    isTauri()
      ? call("get_bootstrap_data")
      : Promise.resolve(structuredClone(browserBootstrap)),
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
  brokerConnections: (): Promise<BrokerConnection[]> =>
    isTauri() ? call("list_broker_connections") : Promise.resolve([]),
  detectMt5Account: (terminalPath?: string): Promise<Mt5AccountSnapshot> =>
    isTauri()
      ? call("detect_mt5_account", { input: { terminalPath } })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Die lokale MT5-Verbindung benötigt die Desktop-App.",
        } satisfies CommandError),
  createAccountFromMt5: (input: {
    terminalPath?: string;
    name?: string;
    defaultRiskPercent: number;
  }): Promise<ConnectedAccountResult> =>
    isTauri()
      ? call("create_account_from_mt5", { input })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Die lokale MT5-Verbindung benötigt die Desktop-App.",
        } satisfies CommandError),
  cTraderAuthorization: (): Promise<CTraderAuthorization> =>
    isTauri()
      ? call("get_ctrader_authorization")
      : Promise.resolve({
          configured: false,
          message: "Die cTrader-Verbindung benötigt die Desktop-App.",
        }),
  exchangeCTraderCode: (
    codeOrRedirectUrl: string,
  ): Promise<CTraderCandidateResponse> =>
    isTauri()
      ? call("exchange_ctrader_code", { input: { codeOrRedirectUrl } })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Die cTrader-Verbindung benötigt die Desktop-App.",
        } satisfies CommandError),
  createAccountFromCTrader: (input: {
    sessionId: string;
    externalAccountId: string;
    name?: string;
    defaultRiskPercent: number;
  }): Promise<ConnectedAccountResult> =>
    isTauri()
      ? call("create_account_from_ctrader", { input })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Die cTrader-Verbindung benötigt die Desktop-App.",
        } satisfies CommandError),
  refreshBrokerConnection: (connectionId: string): Promise<BrokerConnection> =>
    isTauri()
      ? call("refresh_broker_connection", { connectionId })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "Broker-Verbindungen werden nur in der Desktop-App aktualisiert.",
        } satisfies CommandError),
  disconnectBrokerConnection: (connectionId: string): Promise<void> =>
    isTauri()
      ? call("disconnect_broker_connection", { connectionId })
      : Promise.resolve(),
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
  listTrades: (
    accountId: string,
    filter: Omit<TradeFilter, "accountIds"> = {},
  ): Promise<PagedTrades> =>
    isTauri()
      ? call("list_trades", { accountId, filter })
      : browserListTrades({ ...filter, accountIds: [accountId] }),
  getTrade: (accountId: string, id: string): Promise<TradeDetail> =>
    isTauri()
      ? call("get_trade", { accountId, id })
      : browserGetTrade(accountId, id),
  createTrade: (input: TradeInput): Promise<TradeDetail> =>
    isTauri() ? call("create_trade", { input }) : browserCreateTrade(input),
  updateTrade: (
    accountId: string,
    id: string,
    input: TradeInput,
  ): Promise<TradeDetail> =>
    isTauri()
      ? call("update_trade", { id, input: { ...input, accountId } })
      : browserUpdateTrade(accountId, id, input),
  trashTrade: (accountId: string, id: string): Promise<void> =>
    isTauri()
      ? call("trash_trade", { accountId, id })
      : browserTrashTrade(accountId, id),
  deletedTrades: (accountId: string): Promise<DeletedTrade[]> =>
    isTauri()
      ? call("list_deleted_trades", { accountId })
      : browserListDeletedTrades(accountId),
  restoreTrade: (accountId: string, id: string): Promise<TradeDetail> =>
    isTauri()
      ? call("restore_trade", { accountId, id })
      : browserRestoreTrade(accountId, id),
  duplicateTrade: (accountId: string, id: string): Promise<TradeDetail> =>
    isTauri()
      ? call("duplicate_trade", { accountId, id })
      : (async () => {
          const trade = await browserGetTrade(accountId, id);
          const duplicated = await browserCreateTrade({
            ...trade,
            accountId,
            id: undefined,
            status: "draft",
            openedAt: null,
            closedAt: null,
          });
          const workspace = await import("./workspace-browser");
          const context = await workspace.getBrowserTradeContext(accountId, id);
          await workspace.saveBrowserTradeContext(accountId, {
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
  tradeContext: (accountId: string, tradeId: string): Promise<TradeContext> =>
    isTauri()
      ? call("get_trade_context", { accountId, tradeId })
      : import("./workspace-browser").then((module) =>
          module.getBrowserTradeContext(accountId, tradeId),
        ),
  saveTradeContext: (
    accountId: string,
    input: TradeContextInput,
  ): Promise<TradeContext> =>
    isTauri()
      ? call("save_trade_context", { accountId, input })
      : import("./workspace-browser").then((module) =>
          module.saveBrowserTradeContext(accountId, input),
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
  dashboard: (
    accountId: string,
    filter: Omit<TradeFilter, "accountIds"> = {},
  ): Promise<DashboardResponse> =>
    isTauri()
      ? call("calculate_dashboard", { accountId, filter })
      : browserDashboard({ ...filter, accountIds: [accountId] }),
  calendar: (
    accountId: string,
    filter: Omit<TradeFilter, "accountIds"> = {},
  ): Promise<CalendarDay[]> =>
    isTauri()
      ? call("calculate_calendar", { accountId, filter })
      : browserDashboard({ ...filter, accountIds: [accountId] }).then(
          (dashboard) => dashboard.calendar,
        ),
  macroFundamentalsDashboard: (): Promise<MacroFundamentalsDashboard> =>
    isTauri()
      ? call("get_eodhd_fundamentals_dashboard")
      : Promise.reject({
          message: "Der EODHD-Datenfeed benötigt die Desktop-App.",
        }),
  pairTechnicalSignals: (): Promise<PairTechnicalDashboard> =>
    isTauri()
      ? call("get_pair_technical_signals")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "4H-/Daily- und Seasonality-Signale benötigen die lokale Desktop-Datenbank.",
        } satisfies CommandError),
  refreshPairTechnicalSignals: (): Promise<PairTechnicalDashboard> =>
    isTauri()
      ? call("refresh_pair_technical_signals")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "EODHD-Intraday-Daten können nur in der Desktop-App aktualisiert werden.",
        } satisfies CommandError),
  audChinaCpiRegime: (
    input: AudChinaCpiRegimeInput,
  ): Promise<AudChinaCpiRegimeResponse> =>
    isTauri()
      ? call("get_aud_china_cpi_regime", { input })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "Die China-CPI-/AUD-Regimeanalyse benötigt die lokale Desktop-Datenbank.",
        } satisfies CommandError),
  refreshAudChinaCpiRegime: (
    input: AudChinaCpiRegimeInput,
  ): Promise<AudChinaCpiRegimeResponse> =>
    isTauri()
      ? call("refresh_aud_china_cpi_regime", { input })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "China-CPI und AUDUSD können nur in der Desktop-App über EODHD aktualisiert werden.",
        } satisfies CommandError),
  eodhdIndicatorHistory: (
    input: EodhdIndicatorHistoryInput,
  ): Promise<EodhdIndicatorHistory> =>
    isTauri()
      ? call("get_eodhd_indicator_history", { input })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "Historische EODHD-Wirtschaftsdaten benötigen die Desktop-App.",
        } satisfies CommandError),
  economicCalendar: (
    input: EconomicCalendarInput,
  ): Promise<EconomicCalendarResponse> =>
    isTauri()
      ? call("get_economic_calendar", { input })
      : Promise.resolve({
          asOf: new Date().toISOString(),
          from: new Date().toISOString(),
          to: new Date().toISOString(),
          sourceName: "EODHD Economic Events API",
          sourceUrl: "https://eodhd.com/api/economic-events",
          events: [],
        }),
  syncEodhdIndicatorHistory: (
    input: EodhdIndicatorHistoryInput,
  ): Promise<EodhdIndicatorHistory> =>
    isTauri()
      ? call("sync_eodhd_indicator_history", { input })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "Historische EODHD-Wirtschaftsdaten können nur in der Desktop-App aktualisiert werden.",
        } satisfies CommandError),
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
  putCallDashboard: (assetSymbol = "EURUSD"): Promise<PutCallDashboard> =>
    isTauri()
      ? call("get_put_call_dashboard", { assetSymbol })
      : browserPutCallDashboard(assetSymbol),
  syncPutCall: (): Promise<PutCallSyncResult> =>
    isTauri() ? call("sync_put_call_data") : browserSyncPutCall(),
  importPutCallPdf: (path: string): Promise<PutCallSyncResult> =>
    isTauri()
      ? call("import_put_call_pdf", { path })
      : Promise.reject({
          message: "CME-PDFs können nur in der Desktop-App importiert werden.",
        }),
  importPutCallXlsx: (paths: string[]): Promise<PutCallBatchImportResult> =>
    isTauri()
      ? call("import_put_call_xlsx", { paths })
      : Promise.reject({
          message:
            "CME-XLSX-Dateien können nur in der Desktop-App importiert werden.",
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
  centralBankReports: (): Promise<CentralBankReportDashboard> =>
    isTauri()
      ? call("get_central_bank_reports")
      : Promise.resolve({
          reports: [],
          sources: [],
          automation: {
            enabled: false,
            refreshIntervalMinutes: 15,
            openaiConfigured: false,
            summaryModel: "gpt-5-mini",
          },
        }),
  centralBankReport: (id: string): Promise<CentralBankReportDetail> =>
    isTauri()
      ? call("get_central_bank_report", { id })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "Zentralbankberichte können nur in der Desktop-App gelesen werden.",
        } satisfies CommandError),
  openCentralBankReportFile: (id: string): Promise<void> =>
    isTauri()
      ? call("open_central_bank_report_file", { id })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Lokale Zentralbankberichte benötigen die Desktop-App.",
        } satisfies CommandError),
  syncCentralBankReports: (): Promise<CentralBankSyncResult> =>
    isTauri()
      ? call("sync_central_bank_reports")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Der automatische Berichtsabruf benötigt die Desktop-App.",
        } satisfies CommandError),
  markCentralBankReportRead: (id: string): Promise<void> =>
    isTauri()
      ? call("mark_central_bank_report_read", { id })
      : Promise.resolve(),
  seasonality: (): Promise<SeasonalityDashboard> =>
    isTauri()
      ? call("get_seasonality")
      : Promise.resolve(
          JSON.parse(
            localStorage.getItem("personal-macro:browser-seasonality:v1") ??
              '{"items":[],"assets":[],"collectionStatus":null,"collectionError":null,"dataVersion":"browser"}',
          ),
        ).then((output: Partial<SeasonalityDashboard>) => ({
          ...output,
          items: output.items ?? [],
          assets: output.assets ?? [],
          collectionCompleted: output.collectionCompleted ?? 0,
          collectionTotal: output.collectionTotal ?? 0,
          lastSyncedAt: output.lastSyncedAt,
          dataVersion: output.dataVersion ?? "browser",
        })),
  seasonalityAssetDetail: (symbol: string): Promise<SeasonalityAssetDetail> =>
    isTauri()
      ? call("get_seasonality_asset_detail", { symbol })
      : Promise.reject({
          message: "EODHD-Seasonality benötigt die Desktop-App.",
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
  refreshSeasonality: (): Promise<SeasonalityDashboard> =>
    isTauri()
      ? call("refresh_seasonality_data")
      : Promise.reject({
          message:
            "Die EODHD-Seasonality-Aktualisierung benötigt die Desktop-App.",
        }),
  seasonalityForexPairs: (): Promise<SeasonalityForexPair[]> =>
    isTauri() ? call("get_seasonality_forex_pairs") : Promise.resolve([]),
  reviews: (accountId: string): Promise<ReviewRecord[]> =>
    isTauri()
      ? call("list_reviews", { accountId })
      : import("./workspace-browser").then((module) =>
          module.listBrowserReviews(accountId),
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
  playbook: (accountId?: string): Promise<PlaybookSetup[]> =>
    isTauri()
      ? call("list_playbook", { accountId })
      : import("./workspace-browser").then((module) =>
          module.listBrowserPlaybook(accountId),
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
  mistakeAnalytics: (accountId: string): Promise<MistakeAnalytics[]> =>
    isTauri()
      ? call("get_mistake_analytics", { accountId })
      : import("./workspace-browser").then((module) =>
          module.browserMistakes(accountId),
        ),
  tradeMistakes: (
    accountId: string,
    tradeId: string,
  ): Promise<TradeMistakeRecord[]> =>
    isTauri()
      ? call("list_trade_mistakes", { accountId, tradeId })
      : import("./workspace-browser").then((module) =>
          module.listBrowserTradeMistakes(accountId, tradeId),
        ),
  assignTradeMistake: (
    accountId: string,
    input: {
      tradeId: string;
      mistakeId: string;
      severity: number;
      estimatedCostMinor?: number;
      note?: string;
    },
  ): Promise<void> =>
    isTauri()
      ? call("assign_trade_mistake", { accountId, input })
      : import("./workspace-browser").then((module) =>
          module.assignBrowserTradeMistake(accountId, input),
        ),
  media: (): Promise<MediaRecord[]> =>
    isTauri()
      ? call("list_media")
      : Promise.resolve(
          JSON.parse(
            localStorage.getItem("personal-macro:browser-media:v1") ?? "[]",
          ),
        ),
  tradeMedia: async (
    accountId: string,
    tradeId: string,
  ): Promise<MediaRecord[]> => {
    if (isTauri()) return call("list_trade_media", { accountId, tradeId });
    await browserGetTrade(accountId, tradeId);
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
    accountId: string,
    tradeId: string,
    mediaId: string,
    slot = "other",
    caption?: string,
  ): Promise<void> =>
    isTauri()
      ? call("attach_trade_media", {
          accountId,
          tradeId,
          mediaId,
          slot,
          caption,
        })
      : browserGetTrade(accountId, tradeId).then(() => {
          const key = `personal-macro:browser-trade-media:${tradeId}`;
          const ids = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
          if (!ids.includes(mediaId)) ids.push(mediaId);
          localStorage.setItem(key, JSON.stringify(ids));
        }),
  detachTradeMedia: (
    accountId: string,
    tradeId: string,
    mediaId: string,
  ): Promise<void> =>
    isTauri()
      ? call("detach_trade_media", { accountId, tradeId, mediaId })
      : browserGetTrade(accountId, tradeId).then(() => {
          const key = `personal-macro:browser-trade-media:${tradeId}`;
          const ids = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
          localStorage.setItem(
            key,
            JSON.stringify(ids.filter((id) => id !== mediaId)),
          );
        }),
  importMediaPath: (
    sourcePath: string,
    accountId?: string,
    tradeId?: string,
  ): Promise<MediaRecord> =>
    call("import_media_file", {
      accountId,
      input: { sourcePath, tradeId },
    }),
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
  exportTrades: async (
    accountId: string,
    format: "csv" | "json",
  ): Promise<ExportResult> => {
    if (isTauri()) return call("export_trades", { accountId, format });
    const trades = await browserListTrades({
      accountIds: [accountId],
      pageSize: 250,
    });
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
  resetJournal: (confirmation: string): Promise<JournalResetResult> =>
    isTauri()
      ? call("reset_journal", { confirmation })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Der Journal-Reset benötigt die Desktop-App.",
        } satisfies CommandError),
  previewMetaTraderHtml: (
    input: MetaTraderHtmlPreviewInput,
  ): Promise<MetaTraderHtmlPreview> =>
    isTauri()
      ? call("preview_metatrader_html", { input })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Der MetaTrader-HTML-Import benötigt die Desktop-App.",
        } satisfies CommandError),
  commitMetaTraderHtml: (
    input: MetaTraderHtmlCommitInput,
  ): Promise<MetaTraderHtmlCommitResult> =>
    isTauri()
      ? call("commit_metatrader_html", { input })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Der MetaTrader-HTML-Import benötigt die Desktop-App.",
        } satisfies CommandError),
  previewCTraderStatement: (
    input: CTraderStatementPreviewInput,
  ): Promise<CTraderStatementPreview> =>
    isTauri()
      ? call("preview_ctrader_statement", { input })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Der cTrader-Statement-Import benötigt die Desktop-App.",
        } satisfies CommandError),
  commitCTraderStatement: (
    input: CTraderStatementCommitInput,
  ): Promise<CTraderStatementCommitResult> =>
    isTauri()
      ? call("commit_ctrader_statement", { input })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Der cTrader-Statement-Import benötigt die Desktop-App.",
        } satisfies CommandError),
  previewBackup: (path: string): Promise<RestorePreview> =>
    call("preview_backup", { path }),
  stageBackupRestore: (path: string): Promise<RestoreStageResult> =>
    call("stage_backup_restore", { path }),
  previewLegacyDatabase: (path: string): Promise<LegacyPreview> =>
    call("preview_legacy_database", { path }),
  importLegacyDatabase: (path: string): Promise<LegacyImportResult> =>
    call("import_legacy_database", { path }),
};
