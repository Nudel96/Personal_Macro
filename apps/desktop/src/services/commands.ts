import type { AtlasFiscalResponse } from "../types/domain";
import type {
  MyfxbookConnection,
  MyfxbookLogin,
  MyfxbookPreview,
  MyfxbookSummary,
} from "../types/domain";
import { invoke } from "@tauri-apps/api/core";
import { isPrivateWeb } from "./runtime-mode";
import {
  privateWebCall,
  privateWebTradeScreenshotUpload,
} from "./private-web-client";

import type {
  GovernmentBondsDashboard,
  GovernmentBondDetail,
  BondDetailInput,
  BondSyncJob,
  AtlasCatalog,
  AtlasValuationResponse,
  AtlasDemographyResponse,
  AtlasEnergyResponse,
  AtlasCreditResponse,
  AtlasHousingRatiosResponse,
  AtlasEducationResponse,
  AtlasPropertyResponse,
  AtlasCapacityResponse,
  AtlasHistoryResponse,
  AtlasMarketResponse,
  AtlasSeriesInput,
  AtlasSeriesResponse,
  AtlasSyncJob,
  BootstrapData,
  Account,
  AccountJournal,
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
  CentralBankSummaryResult,
  SeasonalityDashboard,
  SeasonalityAssetDetail,
  SeasonalityForexPair,
  SeasonalityAnalysis,
  SeasonalityAnalysisInput,
  SeasonalityScreenerRow,
  SeasonalityScreenerInput,
  SeasonalityOpportunityInput,
  SeasonalityOpportunityResponse,
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
  TradeScreenshotInput,
  TradeScreenshotAnalysis,
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
} from "../types/domain";

import type {
  AtlasNotebookCreateInput,
  AtlasNotebookEntry,
  AtlasNotebookSummary,
  AtlasNotebookUpdateInput,
  AtlasSavedContext,
} from "../features/world-atlas/atlas-notebook-types";

export const isTauri = () => "__TAURI_INTERNALS__" in window;
// Hosted mode stays on the real backend even before authentication succeeds.
// It must never select the local preview after a session or network failure.
export const usesCommandBackend = () => isTauri() || isPrivateWeb();
const myfxbookDesktopRequired = <T>(): Promise<T> =>
  Promise.reject({
    code: "DESKTOP_REQUIRED",
    message: "Myfxbook kann nur in der Desktop-App sicher verbunden werden.",
  });
const atlasPersonalDesktopRequired = () =>
  Promise.reject({
    code: "DESKTOP_REQUIRED",
    message:
      "Persönliche Atlasansichten werden in der Desktop-App zusammen mit dem Journal gesichert.",
  });

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
    return isPrivateWeb()
      ? await privateWebCall<T>(command, args)
      : await invoke<T>(command, args);
  } catch (error) {
    throw normalizeError(error);
  }
}

export const api = {
  cloudBackups: (): Promise<
    import("../types/cloud-transfer").CloudBackupRecord[]
  > => call("list_cloud_backups"),
  createCloudBackup: (): Promise<
    import("../types/cloud-transfer").CloudBackupRecord
  > => call("create_cloud_backup"),
  cloudBackup: (
    id: string,
  ): Promise<import("../types/cloud-transfer").CloudTransferSnapshot> =>
    call("get_cloud_backup", { id }),
  restoreCloudBackup: (
    id: string,
    confirmation: string,
  ): Promise<{ safetyBackupId: string }> =>
    call("restore_cloud_backup", { input: { id, confirmation } }),
  importTradesBatch: (
    accountId: string,
    trades: TradeInput[],
  ): Promise<{ imported: number }> =>
    call("import_trades_batch", { input: { accountId, trades } }),
  learningProgress: (): Promise<unknown> => call("get_learning_progress"),
  saveLearningProgress: (input: {
    version: number;
    known: string[];
    saved: string[];
    notes: Record<string, string>;
    last: { lesson: string; step: number } | null;
  }): Promise<void> => call("save_learning_progress", { input }),
  weatherForecast: (
    assetId: string,
  ): Promise<import("../types/domain").WeatherEnvelope> =>
    usesCommandBackend()
      ? call("get_weather_forecast", { input: { assetId } })
      : import("./weather-browser").then((m) =>
          m.browserWeatherForecast(assetId),
        ),
  governmentBonds: (): Promise<GovernmentBondsDashboard> =>
    usesCommandBackend()
      ? call("get_government_bonds")
      : import("./government-bonds-browser").then((m) =>
          m.browserGovernmentBonds(),
        ),
  governmentBondDetail: (
    input: BondDetailInput,
  ): Promise<GovernmentBondDetail> =>
    usesCommandBackend()
      ? call("get_government_bond_detail", { input })
      : import("./government-bonds-browser").then((m) =>
          m.browserGovernmentBondDetail(input),
        ),
  syncGovernmentBonds: (
    countryId: string | null = null,
  ): Promise<BondSyncJob> =>
    usesCommandBackend()
      ? call("sync_government_bonds", { countryId })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Staatsanleihe-Renditen werden in der Desktop-App geladen.",
        } satisfies CommandError),
  governmentBondSync: (): Promise<BondSyncJob | null> =>
    usesCommandBackend()
      ? call("get_government_bond_sync")
      : Promise.resolve(null),
  cancelGovernmentBondSync: (jobId: string): Promise<void> =>
    usesCommandBackend()
      ? call("cancel_government_bond_sync", { jobId })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Im Browser läuft kein Anleiheabruf.",
        } satisfies CommandError),
  atlasNotebook: (trashed = false): Promise<AtlasNotebookSummary[]> =>
    usesCommandBackend()
      ? call("list_atlas_notebook", { trashed })
      : atlasPersonalDesktopRequired(),
  atlasNotebookEntry: (id: string): Promise<AtlasNotebookEntry> =>
    usesCommandBackend()
      ? call("get_atlas_notebook_entry", { id })
      : atlasPersonalDesktopRequired(),
  createAtlasNotebookEntry: (
    input: AtlasNotebookCreateInput,
  ): Promise<AtlasNotebookEntry> =>
    usesCommandBackend()
      ? call("create_atlas_notebook_entry", { input })
      : atlasPersonalDesktopRequired(),
  updateAtlasNotebookEntry: (
    input: AtlasNotebookUpdateInput,
  ): Promise<AtlasNotebookEntry> =>
    usesCommandBackend()
      ? call("update_atlas_notebook_entry", { input })
      : atlasPersonalDesktopRequired(),
  trashAtlasNotebookEntry: (
    id: string,
    revision: number,
    trashed: boolean,
  ): Promise<AtlasNotebookEntry> =>
    usesCommandBackend()
      ? call("trash_atlas_notebook_entry", { id, revision, trashed })
      : atlasPersonalDesktopRequired(),
  atlasLastContext: (): Promise<AtlasSavedContext | null> =>
    usesCommandBackend()
      ? call("get_atlas_last_context")
      : atlasPersonalDesktopRequired(),
  saveAtlasLastContext: (context: AtlasSavedContext): Promise<void> =>
    usesCommandBackend()
      ? call("save_atlas_last_context", { context })
      : atlasPersonalDesktopRequired(),
  atlasValuation: (datasetId: string): Promise<AtlasValuationResponse> =>
    usesCommandBackend()
      ? call("get_atlas_valuation", { datasetId })
      : import("./atlas-browser").then((module) =>
          module.browserAtlasValuation(datasetId),
        ),
  syncAtlasValuation: (datasetId: string): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_valuation", { datasetId })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Bewertungstabellen werden in der Desktop-App geladen.",
        } satisfies CommandError),
  cancelAtlasValuation: (jobId: string): Promise<void> =>
    usesCommandBackend()
      ? call("cancel_atlas_valuation", { jobId })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Im Browser läuft kein nativer Bewertungsabruf.",
        } satisfies CommandError),
  syncAtlasStatisticsBatch: (seriesIds: string[]): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_statistics_batch", { seriesIds })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Länderstatistiken werden in der Desktop-App geladen.",
        } satisfies CommandError),
  cancelAtlasStatisticsBatch: (jobId: string): Promise<void> =>
    usesCommandBackend()
      ? call("cancel_atlas_statistics_batch", { jobId })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Im Browser läuft kein nativer Statistikabruf.",
        } satisfies CommandError),
  atlasEnergy: (geographyId: string): Promise<AtlasEnergyResponse> =>
    usesCommandBackend()
      ? call("get_atlas_energy", { geographyId })
      : import("./atlas-browser").then((module) =>
          module.browserAtlasEnergy(geographyId),
        ),
  atlasHousingRatios: (
    geographyId: string,
  ): Promise<AtlasHousingRatiosResponse> =>
    usesCommandBackend()
      ? call("get_atlas_housing_ratios", { geographyId })
      : import("./atlas-browser").then((module) =>
          module.browserAtlasHousingRatios(geographyId),
        ),
  atlasEducation: (geographyId: string): Promise<AtlasEducationResponse> =>
    usesCommandBackend()
      ? call("get_atlas_education", { geographyId })
      : import("./atlas-browser").then((module) =>
          module.browserAtlasEducation(geographyId),
        ),
  atlasAgriculture: (
    geographyId: string,
  ): Promise<
    import("../features/world-atlas/atlas-agriculture").AtlasAgricultureResponse
  > =>
    usesCommandBackend()
      ? call("get_atlas_agriculture", { geographyId })
      : import("./atlas-browser").then((module) =>
          module.browserAtlasAgriculture(geographyId),
        ),
  syncAtlasAgriculture: (): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_agriculture")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "FAO-Produktionsdaten werden in der Desktop-App geladen.",
        } satisfies CommandError),
  syncAtlasEducation: (): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_education")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "UNESCO-Bildungsdaten werden in der Desktop-App geladen.",
        } satisfies CommandError),
  syncAtlasHousingRatios: (): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_housing_ratios")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "OECD-Wohnvergleiche werden in der Desktop-App geladen.",
        } satisfies CommandError),
  atlasProperty: (geographyId: string): Promise<AtlasPropertyResponse> =>
    usesCommandBackend()
      ? call("get_atlas_property", { geographyId })
      : import("./atlas-browser").then((module) =>
          module.browserAtlasProperty(geographyId),
        ),
  syncAtlasProperty: (): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_property")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "BIS-Immobiliendaten werden in der Desktop-App geladen.",
        } satisfies CommandError),
  atlasCredit: (geographyId: string): Promise<AtlasCreditResponse> =>
    usesCommandBackend()
      ? call("get_atlas_credit", { geographyId })
      : import("./atlas-browser").then((module) =>
          module.browserAtlasCredit(geographyId),
        ),
  atlasCommodities: (): Promise<
    import("../features/world-atlas/atlas-commodities").AtlasCommodityResponse
  > =>
    usesCommandBackend()
      ? call("get_atlas_commodities")
      : import("./atlas-browser").then((m) => m.browserAtlasCommodities()),
  syncAtlasCommodities: (): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_commodities")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Rohstoffpreise werden in der Desktop-App geladen.",
        } satisfies CommandError),
  atlasLabor: (
    geographyId: string,
  ): Promise<
    import("../features/world-atlas/atlas-labor").AtlasLaborResponse
  > =>
    usesCommandBackend()
      ? call("get_atlas_labor", { geographyId })
      : import("./atlas-browser").then((m) => m.browserAtlasLabor(geographyId)),
  atlasPublicSource: (
    sourceId: string,
    geographyId: string,
  ): Promise<
    import("../features/world-atlas/atlas-public").AtlasPublicResponse
  > =>
    usesCommandBackend()
      ? call("get_atlas_public_source", { sourceId, geographyId })
      : import("./atlas-browser").then((m) =>
          m.browserAtlasPublicSource(sourceId, geographyId),
        ),
  syncAtlasPublicSource: (sourceId: string): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_public_source", { sourceId })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "Die öffentlichen Quellenwerte werden in der Desktop-App geladen.",
        } satisfies CommandError),
  atlasFindex: (
    geographyId: string,
  ): Promise<
    import("../features/world-atlas/atlas-findex").AtlasFindexResponse
  > =>
    usesCommandBackend()
      ? call("get_atlas_findex", { geographyId })
      : import("./atlas-browser").then((m) =>
          m.browserAtlasFindex(geographyId),
        ),
  syncAtlasFindex: (): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_findex")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Findex-Erhebungen werden in der Desktop-App geladen.",
        } satisfies CommandError),
  syncAtlasLabor: (): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_labor")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "ILO-Beschäftigungsdaten werden in der Desktop-App geladen.",
        } satisfies CommandError),
  atlasInnovation: (
    geographyId: string,
  ): Promise<
    import("../features/world-atlas/atlas-innovation").AtlasInnovationResponse
  > =>
    usesCommandBackend()
      ? call("get_atlas_innovation", { geographyId })
      : import("./atlas-browser").then((m) =>
          m.browserAtlasInnovation(geographyId),
        ),
  syncAtlasInnovation: (): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_innovation")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "WIPO-Technologiedaten werden in der Desktop-App geladen.",
        } satisfies CommandError),
  atlasHealth: (
    geographyId: string,
  ): Promise<
    import("../features/world-atlas/atlas-health").AtlasHealthResponse
  > =>
    usesCommandBackend()
      ? call("get_atlas_health", { geographyId })
      : import("./atlas-browser").then((m) =>
          m.browserAtlasHealth(geographyId),
        ),
  syncAtlasHealth: (): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_health")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "WHO-Gesundheitsdaten werden in der Desktop-App geladen.",
        } satisfies CommandError),
  atlasDebt: (
    geographyId: string,
  ): Promise<import("../features/world-atlas/atlas-debt").AtlasDebtResponse> =>
    usesCommandBackend()
      ? call("get_atlas_debt", { geographyId })
      : import("./atlas-browser").then((m) => m.browserAtlasDebt(geographyId)),
  syncAtlasDebt: (): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_debt")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "BIS-Schuldenbilder werden in der Desktop-App geladen.",
        } satisfies CommandError),
  atlasFiscal: (geographyId: string): Promise<AtlasFiscalResponse> =>
    usesCommandBackend()
      ? call("get_atlas_fiscal", { geographyId })
      : import("./atlas-browser").then((m) =>
          m.browserAtlasFiscal(geographyId),
        ),
  atlasHouseholds: (
    geographyId: string,
  ): Promise<
    import("../features/world-atlas/atlas-households").AtlasHouseholdsResponse
  > =>
    usesCommandBackend()
      ? call("get_atlas_households", { geographyId })
      : import("./atlas-browser").then((m) =>
          m.browserAtlasHouseholds(geographyId),
        ),
  syncAtlasHouseholds: (): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_households")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "UN-Haushaltsdaten werden in der Desktop-App geladen.",
        } satisfies CommandError),
  syncAtlasFiscal: (): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_fiscal")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "IMF-Staatsfinanzen werden in der Desktop-App geladen.",
        } satisfies CommandError),
  atlasMacrohistory: (
    geographyId: string,
  ): Promise<
    import("../features/world-atlas/atlas-macrohistory").AtlasMacrohistoryResponse
  > =>
    usesCommandBackend()
      ? call("get_atlas_macrohistory", { geographyId })
      : import("./atlas-browser").then((module) =>
          module.browserAtlasMacrohistory(geographyId),
        ),
  syncAtlasMacrohistory: (): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_macrohistory")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Historische JST-Daten werden in der Desktop-App geladen.",
        } satisfies CommandError),
  syncAtlasCredit: (): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_credit")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "BIS-Kreditdaten werden in der Desktop-App geladen.",
        } satisfies CommandError),
  atlasCapacity: (geographyId: string): Promise<AtlasCapacityResponse> =>
    usesCommandBackend()
      ? call("get_atlas_capacity", { geographyId })
      : import("./atlas-browser").then((module) =>
          module.browserAtlasCapacity(geographyId),
        ),
  syncAtlasCapacity: (): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_capacity")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "IRENA-Anlagendaten werden in der Desktop-App geladen.",
        } satisfies CommandError),
  syncAtlasEnergy: (): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_energy")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "Stromdaten werden in der Desktop-App geladen und lokal gespeichert.",
        } satisfies CommandError),
  syncAtlasMarketBatch: (proxyIds: string[]): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_market_batch", { proxyIds })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Marktgeschichten werden in der Desktop-App geladen.",
        } satisfies CommandError),
  cancelAtlasMarketBatch: (jobId: string): Promise<void> =>
    usesCommandBackend()
      ? call("cancel_atlas_market_batch", { jobId })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Im Browser läuft kein nativer Markt-Abruf.",
        } satisfies CommandError),
  atlasHistory: (geographyId: string): Promise<AtlasHistoryResponse> =>
    usesCommandBackend()
      ? call("get_atlas_history", { geographyId })
      : import("./atlas-browser").then((module) =>
          module.browserAtlasHistory(geographyId),
        ),
  syncAtlasHistory: (): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_history")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "Historische Daten werden in der Desktop-App geladen und lokal gespeichert.",
        } satisfies CommandError),
  atlasDemography: (geographyId: string): Promise<AtlasDemographyResponse> =>
    usesCommandBackend()
      ? call("get_atlas_demography", { geographyId })
      : import("./atlas-browser").then((module) =>
          module.browserAtlasDemography(geographyId),
        ),
  syncAtlasDemography: (): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_demography")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "UN-Demografiedaten werden in der Desktop-App geladen und lokal gespeichert.",
        } satisfies CommandError),
  atlasMarket: (proxyId: string): Promise<AtlasMarketResponse> =>
    usesCommandBackend()
      ? call("get_atlas_market", { proxyId })
      : import("./atlas-browser").then((module) =>
          module.browserAtlasMarket(proxyId),
        ),
  syncAtlasMarket: (proxyId: string): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_market", { proxyId })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "Marktgeschichten werden über die vorhandene EODHD-Konfiguration in der Desktop-App geladen.",
        } satisfies CommandError),
  atlasCatalog: (): Promise<AtlasCatalog> =>
    usesCommandBackend()
      ? call("get_atlas_catalog")
      : import("../features/world-atlas/atlas-catalog").then(
          (module) => module.atlasCatalog,
        ),
  atlasSeries: (input: AtlasSeriesInput): Promise<AtlasSeriesResponse> =>
    usesCommandBackend()
      ? call("get_atlas_series", { input })
      : import("./atlas-browser").then((module) =>
          module.browserAtlasSeries(input),
        ),
  syncAtlasSeries: (seriesId: string): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_series", { seriesId })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "Öffentliche Atlas-Daten werden in der Desktop-App geladen und lokal gespeichert.",
        } satisfies CommandError),
  atlasSyncStatus: (jobId?: string): Promise<AtlasSyncJob | null> =>
    usesCommandBackend()
      ? call("get_atlas_sync_status", { jobId })
      : Promise.resolve(null),
  syncAtlasLibrary: (includeMarkets = false): Promise<AtlasSyncJob> =>
    usesCommandBackend()
      ? call("sync_atlas_library", { includeMarkets })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "Der Atlas-Datenbestand wird in der Desktop-App lokal ergänzt.",
        } satisfies CommandError),
  cancelAtlasLibrary: (jobId: string): Promise<void> =>
    usesCommandBackend()
      ? call("cancel_atlas_library", { jobId })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Der Abruf läuft nur in der Desktop-App.",
        } satisfies CommandError),
  bootstrap: (): Promise<BootstrapData> =>
    usesCommandBackend()
      ? call("get_bootstrap_data")
      : import("./accounts-browser").then((module) =>
          module.browserAccountBootstrap(),
        ),
  accountJournal: (accountId: string): Promise<AccountJournal> =>
    usesCommandBackend()
      ? call("get_account_journal", { accountId })
      : Promise.resolve().then(() =>
          import("./accounts-browser").then((module) =>
            module.browserAccountJournal(accountId),
          ),
        ),
  saveAccount: (input: AccountInput): Promise<Account> =>
    usesCommandBackend()
      ? call("save_account", { input })
      : Promise.resolve().then(() =>
          import("./accounts-browser").then((module) =>
            module.browserSaveAccount(input),
          ),
        ),
  archiveAccount: (id: string): Promise<void> =>
    usesCommandBackend()
      ? call("archive_account", { id })
      : Promise.resolve().then(() =>
          import("./accounts-browser").then((module) =>
            module.browserArchiveAccount(id),
          ),
        ),
  brokerConnections: (): Promise<BrokerConnection[]> =>
    usesCommandBackend()
      ? call("list_broker_connections")
      : Promise.resolve([]),
  detectMt5Account: (terminalPath?: string): Promise<Mt5AccountSnapshot> =>
    usesCommandBackend()
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
    usesCommandBackend()
      ? call("create_account_from_mt5", { input })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Die lokale MT5-Verbindung benötigt die Desktop-App.",
        } satisfies CommandError),
  cTraderAuthorization: (): Promise<CTraderAuthorization> =>
    usesCommandBackend()
      ? call("get_ctrader_authorization")
      : Promise.resolve({
          configured: false,
          message: "Die cTrader-Verbindung benötigt die Desktop-App.",
        }),
  exchangeCTraderCode: (
    codeOrRedirectUrl: string,
  ): Promise<CTraderCandidateResponse> =>
    usesCommandBackend()
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
    usesCommandBackend()
      ? call("create_account_from_ctrader", { input })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Die cTrader-Verbindung benötigt die Desktop-App.",
        } satisfies CommandError),
  refreshBrokerConnection: (connectionId: string): Promise<BrokerConnection> =>
    usesCommandBackend()
      ? call("refresh_broker_connection", { connectionId })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "Broker-Verbindungen werden nur in der Desktop-App aktualisiert.",
        } satisfies CommandError),
  disconnectBrokerConnection: (connectionId: string): Promise<void> =>
    usesCommandBackend()
      ? call("disconnect_broker_connection", { connectionId })
      : Promise.resolve(),
  accountCashflows: (accountId: string): Promise<AccountCashflow[]> =>
    usesCommandBackend()
      ? call("list_account_cashflows", { accountId })
      : Promise.resolve().then(() =>
          import("./accounts-browser").then((module) =>
            module.browserAccountCashflows(accountId),
          ),
        ),
  myfxbookConnections: (): Promise<MyfxbookConnection[]> =>
    usesCommandBackend() ? call("myfxbook_connections") : Promise.resolve([]),
  providerAutomationStatus: (): Promise<
    import("../types/provider-automation").ProviderAutomationStatus
  > => call("get_provider_automation_status"),
  myfxbookLogin: (input: {
    email: string;
    password: string;
  }): Promise<MyfxbookLogin> =>
    usesCommandBackend()
      ? call("myfxbook_login", { input })
      : myfxbookDesktopRequired(),
  myfxbookPreview: (input: {
    authorizationId: string;
    accountId: string;
    externalId: string;
    brokerTimezone: string;
  }): Promise<MyfxbookPreview> =>
    usesCommandBackend()
      ? call("myfxbook_preview", { input })
      : myfxbookDesktopRequired(),
  myfxbookActivate: (previewId: string): Promise<MyfxbookSummary> =>
    usesCommandBackend()
      ? call("myfxbook_activate", { previewId })
      : myfxbookDesktopRequired(),
  myfxbookSync: (accountId: string): Promise<MyfxbookSummary> =>
    usesCommandBackend()
      ? call("myfxbook_sync", { accountId })
      : myfxbookDesktopRequired(),
  myfxbookSetEnabled: (accountId: string, enabled: boolean): Promise<void> =>
    usesCommandBackend()
      ? call("myfxbook_set_enabled", { accountId, enabled })
      : myfxbookDesktopRequired(),
  myfxbookDisconnect: (accountId: string): Promise<void> =>
    usesCommandBackend()
      ? call("myfxbook_disconnect", { accountId })
      : myfxbookDesktopRequired(),
  addAccountCashflow: (
    input: Omit<AccountCashflow, "id" | "createdAt">,
  ): Promise<AccountCashflow> =>
    usesCommandBackend()
      ? call("add_account_cashflow", { input })
      : Promise.resolve().then(() =>
          import("./accounts-browser").then((module) =>
            module.browserAddAccountCashflow(input),
          ),
        ),
  listTrades: (
    accountId: string,
    filter: Omit<TradeFilter, "accountIds"> = {},
  ): Promise<PagedTrades> =>
    usesCommandBackend()
      ? call("list_trades", { accountId, filter })
      : import("./browser-adapter").then((module) =>
          module.browserListTrades({ ...filter, accountIds: [accountId] }),
        ),
  getTrade: (accountId: string, id: string): Promise<TradeDetail> =>
    usesCommandBackend()
      ? call("get_trade", { accountId, id })
      : import("./browser-adapter").then((module) =>
          module.browserGetTrade(accountId, id),
        ),
  createTrade: (input: TradeInput): Promise<TradeDetail> =>
    usesCommandBackend()
      ? call("create_trade", { input })
      : import("./browser-adapter").then((module) =>
          module.browserCreateTrade(input),
        ),
  analyzeTradeScreenshot: (
    input: TradeScreenshotInput,
  ): Promise<TradeScreenshotAnalysis> =>
    isTauri()
      ? call("analyze_trade_screenshot", { input })
      : import("./screenshot-browser").then((module) =>
          module.analyzeBrowserScreenshot(input),
        ),
  createTradeWithScreenshot: (
    input: TradeInput,
    screenshot: TradeScreenshotInput,
  ): Promise<TradeDetail> =>
    isPrivateWeb()
      ? import("./screenshot-browser").then((module) =>
          privateWebTradeScreenshotUpload(
            module.screenshotFile(screenshot),
            input,
          ),
        )
      : isTauri()
        ? call("create_trade_with_screenshot", { input, screenshot })
        : Promise.reject({
            code: "DESKTOP_REQUIRED",
            message:
              "Screenshots werden in der Windows-Desktop-App am Trade gespeichert.",
          } satisfies CommandError),
  updateTrade: (
    accountId: string,
    id: string,
    input: TradeInput,
  ): Promise<TradeDetail> =>
    usesCommandBackend()
      ? call("update_trade", { id, input: { ...input, accountId } })
      : import("./browser-adapter").then((module) =>
          module.browserUpdateTrade(accountId, id, input),
        ),
  trashTrade: (accountId: string, id: string): Promise<void> =>
    usesCommandBackend()
      ? call("trash_trade", { accountId, id })
      : import("./browser-adapter").then((module) =>
          module.browserTrashTrade(accountId, id),
        ),
  deletedTrades: (accountId: string): Promise<DeletedTrade[]> =>
    usesCommandBackend()
      ? call("list_deleted_trades", { accountId })
      : import("./browser-adapter").then((module) =>
          module.browserListDeletedTrades(accountId),
        ),
  restoreTrade: (accountId: string, id: string): Promise<TradeDetail> =>
    usesCommandBackend()
      ? call("restore_trade", { accountId, id })
      : import("./browser-adapter").then((module) =>
          module.browserRestoreTrade(accountId, id),
        ),
  duplicateTrade: (accountId: string, id: string): Promise<TradeDetail> =>
    usesCommandBackend()
      ? call("duplicate_trade", { accountId, id })
      : (async () => {
          const trade = await import("./browser-adapter").then((module) =>
            module.browserGetTrade(accountId, id),
          );
          const duplicated = await import("./browser-adapter").then((module) =>
            module.browserCreateTrade({
              ...trade,
              accountId,
              id: undefined,
              status: "draft",
              openedAt: null,
              closedAt: null,
            }),
          );
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
    usesCommandBackend()
      ? call("get_trade_context", { accountId, tradeId })
      : import("./workspace-browser").then((module) =>
          module.getBrowserTradeContext(accountId, tradeId),
        ),
  saveTradeContext: (
    accountId: string,
    input: TradeContextInput,
  ): Promise<TradeContext> =>
    usesCommandBackend()
      ? call("save_trade_context", { accountId, input })
      : import("./workspace-browser").then((module) =>
          module.saveBrowserTradeContext(accountId, input),
        ),
  savedViews: (scope: string): Promise<SavedView[]> =>
    usesCommandBackend()
      ? call("list_saved_views", { scope })
      : import("./workspace-browser").then((module) =>
          module.listBrowserSavedViews(scope),
        ),
  saveSavedView: (input: SavedViewInput): Promise<SavedView> =>
    usesCommandBackend()
      ? call("save_saved_view", { input })
      : import("./workspace-browser").then((module) =>
          module.saveBrowserSavedView(input),
        ),
  deleteSavedView: (id: string): Promise<void> =>
    usesCommandBackend()
      ? call("delete_saved_view", { id })
      : import("./workspace-browser").then((module) =>
          module.deleteBrowserSavedView(id),
        ),
  customFields: (entityType = "trade"): Promise<CustomField[]> =>
    usesCommandBackend()
      ? call("list_custom_fields", { entityType })
      : import("./workspace-browser").then((module) =>
          module.listBrowserCustomFields(entityType),
        ),
  saveCustomField: (input: CustomFieldInput): Promise<CustomField> =>
    usesCommandBackend()
      ? call("save_custom_field", { input })
      : import("./workspace-browser").then((module) =>
          module.saveBrowserCustomField(input),
        ),
  deleteCustomField: (id: string): Promise<void> =>
    usesCommandBackend()
      ? call("delete_custom_field", { id })
      : import("./workspace-browser").then((module) =>
          module.deleteBrowserCustomField(id),
        ),
  dashboard: (
    accountId: string,
    filter: Omit<TradeFilter, "accountIds"> = {},
  ): Promise<DashboardResponse> =>
    usesCommandBackend()
      ? call("calculate_dashboard", { accountId, filter })
      : import("./browser-adapter").then((module) =>
          module.browserDashboard({ ...filter, accountIds: [accountId] }),
        ),
  calendar: (
    accountId: string,
    filter: Omit<TradeFilter, "accountIds"> = {},
  ): Promise<CalendarDay[]> =>
    usesCommandBackend()
      ? call("calculate_calendar", { accountId, filter })
      : import("./browser-adapter")
          .then((module) =>
            module.browserDashboard({ ...filter, accountIds: [accountId] }),
          )
          .then((dashboard) => dashboard.calendar),
  macroFundamentalsDashboard: (): Promise<MacroFundamentalsDashboard> =>
    usesCommandBackend()
      ? call("get_eodhd_fundamentals_dashboard")
      : Promise.reject({
          message: "Der EODHD-Datenfeed benötigt die Desktop-App.",
        }),
  pairTechnicalSignals: (): Promise<PairTechnicalDashboard> =>
    usesCommandBackend()
      ? call("get_pair_technical_signals")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "4H-/Daily- und Seasonality-Signale benötigen die lokale Desktop-Datenbank.",
        } satisfies CommandError),
  refreshPairTechnicalSignals: (): Promise<PairTechnicalDashboard> =>
    usesCommandBackend()
      ? call("refresh_pair_technical_signals")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "MT5-Kursdaten können nur in der Desktop-App aktualisiert werden.",
        } satisfies CommandError),
  setMt5TechnicalTerminal: (terminalPath: string | null): Promise<void> =>
    isTauri()
      ? call("set_mt5_technical_terminal", { terminalPath })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "Die MT5-Verbindung wird in der lokalen Desktop-App eingerichtet.",
        } satisfies CommandError),
  audChinaCpiRegime: (
    input: AudChinaCpiRegimeInput,
  ): Promise<AudChinaCpiRegimeResponse> =>
    usesCommandBackend()
      ? call("get_aud_china_cpi_regime", { input })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "Die China-CPI-/AUD-Regimeanalyse benötigt die lokale Desktop-Datenbank.",
        } satisfies CommandError),
  refreshAudChinaCpiRegime: (
    input: AudChinaCpiRegimeInput,
  ): Promise<AudChinaCpiRegimeResponse> =>
    usesCommandBackend()
      ? call("refresh_aud_china_cpi_regime", { input })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "China-CPI und AUDUSD können nur in der Desktop-App über EODHD aktualisiert werden.",
        } satisfies CommandError),
  eodhdIndicatorHistory: (
    input: EodhdIndicatorHistoryInput,
  ): Promise<EodhdIndicatorHistory> =>
    usesCommandBackend()
      ? call("get_eodhd_indicator_history", { input })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "Historische EODHD-Wirtschaftsdaten benötigen die Desktop-App.",
        } satisfies CommandError),
  economicCalendar: (
    input: EconomicCalendarInput,
  ): Promise<EconomicCalendarResponse> =>
    usesCommandBackend()
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
    usesCommandBackend()
      ? call("sync_eodhd_indicator_history", { input })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "Historische EODHD-Wirtschaftsdaten können nur in der Desktop-App aktualisiert werden.",
        } satisfies CommandError),
  eodhdFeedStatus: (): Promise<EodhdFeedStatus> =>
    usesCommandBackend()
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
    usesCommandBackend()
      ? call("sync_eodhd_now")
      : Promise.reject({
          message:
            "Der EODHD-Datenfeed ist in der Browser-Vorschau nicht verfügbar.",
        }),
  eodhdMappingCandidates: (): Promise<EodhdMappingCandidate[]> =>
    usesCommandBackend()
      ? call("list_eodhd_mapping_candidates")
      : Promise.resolve([]),
  reviewEodhdMappingCandidate: (input: {
    id: string;
    action: "approve" | "ignore";
    canonicalKey?: string | null;
  }): Promise<EodhdMappingCandidate> =>
    usesCommandBackend()
      ? call("review_eodhd_mapping_candidate", input)
      : Promise.reject({
          message:
            "EODHD-Zuordnungen können nur in der Desktop-App bearbeitet werden.",
        }),
  cotDashboard: (): Promise<CotDashboard> =>
    usesCommandBackend()
      ? call("get_cot_dashboard")
      : Promise.resolve({
          sourceUrl: "https://www.cftc.gov/MarketReports/CommitmentsofTraders/",
          lastSyncedAt: null,
          contracts: [],
          currencies: [],
          pairs: [],
        }),
  cotAssetDetail: (
    input: CotDetailInput,
    generation?: string,
  ): Promise<CotAssetDetail> =>
    usesCommandBackend()
      ? call("get_cot_asset_detail", {
          input,
          ...(isPrivateWeb() ? { generation } : {}),
        })
      : Promise.reject({
          message: "COT-Detaildaten benötigen die Desktop-App.",
        }),
  linkCotBrokerSymbol: (input: CotBrokerLinkInput): Promise<void> =>
    usesCommandBackend()
      ? call("link_cot_broker_symbol", { input })
      : Promise.reject({
          message: "COT-Zuordnungen benÃ¶tigen die Desktop-App.",
        }),
  syncCot: (): Promise<CotSyncResult> =>
    usesCommandBackend()
      ? call("sync_cot_data")
      : Promise.reject({
          message: "COT-Daten werden nur in der Desktop-App abgerufen.",
        }),
  policyRates: (): Promise<PolicyRateDashboard> =>
    usesCommandBackend()
      ? call("get_policy_rates")
      : Promise.resolve(
          JSON.parse(
            localStorage.getItem("personal-macro:browser-rates:v1") ??
              '{"rates":[],"usdRelative":{"coveredCentralBanks":0,"requiredCentralBanks":4,"hikeCount":0,"holdCount":0,"cutCount":0,"availabilityStatus":"unavailable"},"automation":{"enabled":false,"coveredCurrencies":0,"expectedCurrencies":9,"refreshIntervalHours":6}}',
          ),
        ),
  syncPolicyRates: (): Promise<PolicyRateDashboard> =>
    usesCommandBackend()
      ? call("sync_policy_rates")
      : Promise.reject({
          message:
            "Die automatische Leitzins-Aktualisierung benötigt die Desktop-App.",
        }),
  centralBankReports: (): Promise<CentralBankReportDashboard> =>
    usesCommandBackend()
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
  centralBankReportReadMarkers: (): Promise<
    { id: string; readAt: string }[]
  > =>
    isPrivateWeb()
      ? call("list_central_bank_report_reads")
      : Promise.resolve([]),
  centralBankReport: (
    id: string,
    generation?: string,
  ): Promise<CentralBankReportDetail> =>
    usesCommandBackend()
      ? call("get_central_bank_report", {
          id,
          ...(isPrivateWeb() ? { generation } : {}),
        })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "Zentralbankberichte können nur in der Desktop-App gelesen werden.",
        } satisfies CommandError),
  openCentralBankReportFile: (id: string): Promise<void> =>
    usesCommandBackend()
      ? call("open_central_bank_report_file", { id })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Lokale Zentralbankberichte benötigen die Desktop-App.",
        } satisfies CommandError),
  syncCentralBankReports: (): Promise<CentralBankSyncResult> =>
    usesCommandBackend()
      ? call("sync_central_bank_reports")
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Der automatische Berichtsabruf benötigt die Desktop-App.",
        } satisfies CommandError),
  markCentralBankReportRead: (id: string): Promise<void> =>
    usesCommandBackend()
      ? call("mark_central_bank_report_read", { id })
      : Promise.resolve(),
  summarizeCentralBankReports: (
    id?: string,
  ): Promise<CentralBankSummaryResult> =>
    usesCommandBackend()
      ? call("summarize_central_bank_reports", { id: id ?? null })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Deutsche Zentralbank-Briefings benötigen die Desktop-App.",
        } satisfies CommandError),
  seasonality: (): Promise<SeasonalityDashboard> =>
    usesCommandBackend()
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
  seasonalityAssetDetail: (
    symbol: string,
    generation?: string,
  ): Promise<SeasonalityAssetDetail> =>
    usesCommandBackend()
      ? call("get_seasonality_asset_detail", {
          symbol,
          ...(isPrivateWeb() ? { generation } : {}),
        })
      : Promise.reject({
          message: "EODHD-Seasonality benötigt die Desktop-App.",
        }),
  analyzeSeasonality: (
    input: SeasonalityAnalysisInput,
    generation?: string,
  ): Promise<SeasonalityAnalysis> =>
    usesCommandBackend()
      ? call("analyze_seasonality", {
          input,
          ...(isPrivateWeb() ? { generation } : {}),
        })
      : Promise.reject({
          message:
            "Die interaktive Seasonality-Analyse benÃ¶tigt die Desktop-App.",
        }),
  seasonalityScreener: (
    input?: SeasonalityScreenerInput,
  ): Promise<SeasonalityScreenerRow[]> =>
    usesCommandBackend()
      ? call("get_seasonality_screener", input ? { input } : undefined)
      : Promise.reject({
          message: "Der Seasonality-Screener benÃ¶tigt die Desktop-App.",
        }),
  seasonalityScreenerBatch: (input: {
    generation: string;
    cursor: number;
    limit: number;
    screenerInput?: SeasonalityScreenerInput;
  }): Promise<{
    generation: string;
    rows: SeasonalityScreenerRow[];
    nextCursor: number | null;
    total: number;
    completed: number;
  }> => call("get_seasonality_screener_batch", input),
  seasonalityOpportunitiesBatch: (input: {
    generation: string;
    cursor: number;
    limit: number;
    input: SeasonalityOpportunityInput;
  }): Promise<{
    generation: string;
    result: SeasonalityOpportunityResponse;
    nextCursor: number | null;
    total: number;
    completed: number;
  }> => call("get_seasonality_opportunities_batch", input),
  seasonalityOpportunities: (
    input: SeasonalityOpportunityInput,
  ): Promise<SeasonalityOpportunityResponse> =>
    usesCommandBackend()
      ? call("get_seasonality_opportunities", { input })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message:
            "Die Fenstersuche benötigt die lokal gespeicherten Tageskurse in der Desktop-App.",
        } satisfies CommandError),
  refreshSeasonality: (): Promise<SeasonalityDashboard> =>
    usesCommandBackend()
      ? call("refresh_seasonality_data")
      : Promise.reject({
          message:
            "Die EODHD-Seasonality-Aktualisierung benötigt die Desktop-App.",
        }),
  seasonalityForexPairs: (): Promise<SeasonalityForexPair[]> =>
    usesCommandBackend()
      ? call("get_seasonality_forex_pairs")
      : Promise.resolve([]),
  reviews: (accountId: string): Promise<ReviewRecord[]> =>
    usesCommandBackend()
      ? call("list_reviews", { accountId })
      : import("./workspace-browser").then((module) =>
          module.listBrowserReviews(accountId),
        ),
  saveReview: (input: ReviewInput): Promise<ReviewRecord> =>
    usesCommandBackend()
      ? call("save_review", { input })
      : import("./workspace-browser").then((module) =>
          module.saveBrowserReview(input),
        ),
  goals: (): Promise<GoalRecord[]> =>
    usesCommandBackend()
      ? call("list_goals")
      : import("./workspace-browser").then((module) =>
          module.listBrowserGoals(),
        ),
  saveGoal: (input: GoalInput): Promise<GoalRecord> =>
    usesCommandBackend()
      ? call("save_goal", { input })
      : import("./workspace-browser").then((module) =>
          module.saveBrowserGoal(input),
        ),
  recordGoalProgress: (
    goalId: string,
    value: string,
    note?: string,
  ): Promise<void> =>
    usesCommandBackend()
      ? call("record_goal_progress", { input: { goalId, value, note } })
      : import("./workspace-browser").then((module) =>
          module.recordBrowserGoalProgress(goalId, value),
        ),
  playbook: (accountId?: string): Promise<PlaybookSetup[]> =>
    usesCommandBackend()
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
    usesCommandBackend()
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
    usesCommandBackend()
      ? call("create_setup", { input })
      : import("./workspace-browser").then((module) =>
          module.createBrowserSetup(input),
        ),
  createTag: (input: {
    name: string;
    color?: string;
  }): Promise<TaxonomyItem> =>
    usesCommandBackend()
      ? call("create_tag", { input })
      : Promise.resolve().then(async () => {
          const tag = {
            id: crypto.randomUUID(),
            name: input.name.trim(),
            color: input.color ?? "#64748b",
          };
          const { browserBootstrap } = await import("./browser-adapter");
          browserBootstrap.tags.push(tag);
          return tag;
        }),
  mistakeAnalytics: (accountId: string): Promise<MistakeAnalytics[]> =>
    usesCommandBackend()
      ? call("get_mistake_analytics", { accountId })
      : import("./workspace-browser").then((module) =>
          module.browserMistakes(accountId),
        ),
  tradeMistakes: (
    accountId: string,
    tradeId: string,
  ): Promise<TradeMistakeRecord[]> =>
    usesCommandBackend()
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
    usesCommandBackend()
      ? call("assign_trade_mistake", { accountId, input })
      : import("./workspace-browser").then((module) =>
          module.assignBrowserTradeMistake(accountId, input),
        ),
  media: (): Promise<MediaRecord[]> =>
    usesCommandBackend()
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
    if (usesCommandBackend())
      return call("list_trade_media", { accountId, tradeId });
    await import("./browser-adapter").then((module) =>
      module.browserGetTrade(accountId, tradeId),
    );
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
    usesCommandBackend()
      ? call("attach_trade_media", {
          accountId,
          tradeId,
          mediaId,
          slot,
          caption,
        })
      : import("./browser-adapter")
          .then((module) => module.browserGetTrade(accountId, tradeId))
          .then(() => {
            const key = `personal-macro:browser-trade-media:${tradeId}`;
            const ids = JSON.parse(
              localStorage.getItem(key) ?? "[]",
            ) as string[];
            if (!ids.includes(mediaId)) ids.push(mediaId);
            localStorage.setItem(key, JSON.stringify(ids));
          }),
  detachTradeMedia: (
    accountId: string,
    tradeId: string,
    mediaId: string,
  ): Promise<void> =>
    usesCommandBackend()
      ? call("detach_trade_media", { accountId, tradeId, mediaId })
      : import("./browser-adapter")
          .then((module) => module.browserGetTrade(accountId, tradeId))
          .then(() => {
            const key = `personal-macro:browser-trade-media:${tradeId}`;
            const ids = JSON.parse(
              localStorage.getItem(key) ?? "[]",
            ) as string[];
            localStorage.setItem(
              key,
              JSON.stringify(ids.filter((id) => id !== mediaId)),
            );
          }),
  uploadMedia: (file: File): Promise<MediaRecord> => {
    if (!isPrivateWeb())
      return Promise.reject({
        code: "WEB_CAPABILITY_UNAVAILABLE",
        message:
          "Der private Upload ist nur in der privaten Browser-Version verfügbar.",
      });
    return import("./private-web-client").then((module) =>
      module.privateWebMediaUpload(file),
    );
  },
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
    usesCommandBackend()
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
    usesCommandBackend()
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
    usesCommandBackend()
      ? call("get_settings")
      : Promise.resolve({
          settings: JSON.parse(
            localStorage.getItem("personal-macro:browser-settings:v1") ?? "{}",
          ),
        }),
  updateSetting: (key: string, value: unknown): Promise<void> =>
    usesCommandBackend()
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
    if (usesCommandBackend())
      return call("export_trades", { accountId, format });
    const trades = await import("./browser-adapter").then((module) =>
      module.browserListTrades({
        accountIds: [accountId],
        pageSize: 250,
      }),
    );
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
    usesCommandBackend() ? call("list_backups") : Promise.resolve([]),
  createBackup: (): Promise<BackupRecord> =>
    usesCommandBackend()
      ? call("create_backup")
      : Promise.reject({
          message: "Backups werden in der installierten Desktop-App erstellt.",
        }),
  resetJournal: (confirmation: string): Promise<JournalResetResult> =>
    usesCommandBackend()
      ? call("reset_journal", { confirmation })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Der Journal-Reset benötigt die Desktop-App.",
        } satisfies CommandError),
  previewMetaTraderHtml: (
    input: MetaTraderHtmlPreviewInput,
  ): Promise<MetaTraderHtmlPreview> =>
    usesCommandBackend()
      ? call("preview_metatrader_html", { input })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Der MetaTrader-HTML-Import benötigt die Desktop-App.",
        } satisfies CommandError),
  commitMetaTraderHtml: (
    input: MetaTraderHtmlCommitInput,
  ): Promise<MetaTraderHtmlCommitResult> =>
    usesCommandBackend()
      ? call("commit_metatrader_html", { input })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Der MetaTrader-HTML-Import benötigt die Desktop-App.",
        } satisfies CommandError),
  previewCTraderStatement: (
    input: CTraderStatementPreviewInput,
  ): Promise<CTraderStatementPreview> =>
    usesCommandBackend()
      ? call("preview_ctrader_statement", { input })
      : Promise.reject({
          code: "DESKTOP_REQUIRED",
          message: "Der cTrader-Statement-Import benötigt die Desktop-App.",
        } satisfies CommandError),
  commitCTraderStatement: (
    input: CTraderStatementCommitInput,
  ): Promise<CTraderStatementCommitResult> =>
    usesCommandBackend()
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
