export type TradeStatus =
  | "draft"
  | "planned"
  | "open"
  | "closed"
  | "cancelled"
  | "archived"
  | "trashed";

export type TradeDirection = "long" | "short";

export interface Account {
  id: string;
  name: string;
  broker?: string | null;
  accountType: string;
  baseCurrency: string;
  initialBalanceMinor: number;
  currentBalanceMinor: number;
  brokerBalanceMinor?: number | null;
  brokerEquityMinor?: number | null;
  brokerSyncedAt?: string | null;
  brokerLogin?: string | null;
  brokerServer?: string | null;
  defaultRiskPercent: number;
  isArchived: boolean;
}

export interface AccountInput {
  id?: string;
  name: string;
  broker?: string;
  accountType: string;
  baseCurrency: string;
  initialBalanceMinor: number;
  defaultRiskPercent: number;
}

export interface AccountCashflow {
  id: string;
  accountId: string;
  occurredAt: string;
  amountMinor: number;
  kind: "deposit" | "withdrawal" | "adjustment";
  note?: string | null;
  createdAt: string;
}

export interface TaxonomyItem {
  id: string;
  name: string;
  color: string;
}

export interface EmotionItem extends TaxonomyItem {
  valence: "positive" | "neutral" | "negative";
}

export interface MistakeItem extends TaxonomyItem {
  category: string;
  severityDefault: number;
}

export interface BootstrapData {
  accounts: Account[];
  strategies: TaxonomyItem[];
  setups: TaxonomyItem[];
  tags: TaxonomyItem[];
  emotions: EmotionItem[];
  mistakes: MistakeItem[];
  databasePath: string;
  appDataPath: string;
  calculationVersion: string;
}

export interface TradeFilter {
  search?: string;
  accountIds?: string[];
  setupIds?: string[];
  instruments?: string[];
  directions?: TradeDirection[];
  statuses?: TradeStatus[];
  dateFrom?: string;
  dateTo?: string;
  minProcessScore?: number;
  hasRuleViolation?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
}

export interface TradeSummary {
  id: string;
  status: TradeStatus;
  instrument: string;
  assetClass: string;
  direction: TradeDirection;
  accountName?: string | null;
  setupName?: string | null;
  session?: string | null;
  timeframe?: string | null;
  openedAt?: string | null;
  closedAt?: string | null;
  actualEntry?: string | null;
  actualExit?: string | null;
  quantity?: string | null;
  netPnlMinor?: number | null;
  calculatedR?: string | null;
  processScore?: number | null;
  followedPlan?: boolean | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TradeDetail {
  id: string;
  accountId?: string | null;
  strategyId?: string | null;
  setupId?: string | null;
  status: TradeStatus;
  instrument: string;
  assetClass: string;
  direction: TradeDirection;
  session?: string | null;
  timeframe?: string | null;
  openedAt?: string | null;
  closedAt?: string | null;
  displayTimezone: string;
  plannedEntry?: string | null;
  actualEntry?: string | null;
  initialStopLoss?: string | null;
  actualExit?: string | null;
  takeProfit?: string | null;
  quantity?: string | null;
  plannedRiskMinor?: number | null;
  grossPnlMinor?: number | null;
  feesMinor: number;
  commissionMinor: number;
  swapMinor: number;
  netPnlMinor?: number | null;
  calculatedR?: string | null;
  rOverride?: string | null;
  rOverrideReason?: string | null;
  maeR?: string | null;
  mfeR?: string | null;
  followedPlan?: boolean | null;
  followedRiskRules?: boolean | null;
  followedEntryRules?: boolean | null;
  followedExitRules?: boolean | null;
  impulseTrade?: boolean | null;
  processScore?: number | null;
  executionScore?: number | null;
  setupQuality?: number | null;
  confidenceBefore?: number | null;
  focusBefore?: number | null;
  stressBefore?: number | null;
  energyBefore?: number | null;
  satisfactionAfter?: number | null;
  reviewedAt?: string | null;
  thesisHtml?: string | null;
  executionNotesHtml?: string | null;
  reviewNotesHtml?: string | null;
  lessonsHtml?: string | null;
  sourceMetadataJson?: string;
  createdAt: string;
  updatedAt: string;
}

export type TradeInput = Omit<
  TradeDetail,
  "id" | "calculatedR" | "createdAt" | "updatedAt"
> & { id?: string };

export interface PagedTrades {
  items: TradeSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DeletedTrade {
  id: string;
  instrument: string;
  direction: TradeDirection;
  deletedAt?: string | null;
  netPnlMinor?: number | null;
}

export interface TradeLeg {
  id?: string;
  legType: "entry" | "exit";
  occurredAt: string;
  price: string;
  quantity: string;
  feesMinor?: number;
  note?: string | null;
  sortOrder?: number;
}

export interface TradeChecklistItem {
  id?: string;
  label?: string;
  labelSnapshot?: string;
  category?: string | null;
  categorySnapshot?: string | null;
  isRequired?: boolean;
  isChecked?: boolean | null;
  note?: string | null;
  sortOrder?: number;
}

export interface TradeEmotion {
  emotionId: string;
  name?: string;
  color?: string;
  phase: "before" | "during" | "after";
  intensity: number;
  note?: string | null;
}

export interface CustomField {
  id: string;
  entityType: string;
  name: string;
  fieldType: "text" | "number" | "boolean" | "date" | "select" | "multiselect";
  optionsJson: string;
  isRequired: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type CustomFieldInput = Omit<
  CustomField,
  "id" | "createdAt" | "updatedAt"
> & { id?: string };

export interface TradeContext {
  legs: TradeLeg[];
  tags: TaxonomyItem[];
  checklistItems: TradeChecklistItem[];
  emotions: TradeEmotion[];
  customValues: Array<{ customFieldId: string; valueJson: string }>;
}

export interface TradeContextInput {
  tradeId: string;
  tagIds: string[];
  legs: TradeLeg[];
  checklistItems: TradeChecklistItem[];
  emotions: TradeEmotion[];
  customValues: Array<{ customFieldId: string; valueJson: string }>;
}

export interface SavedView {
  id: string;
  name: string;
  scope: string;
  stateJson: string;
  createdAt: string;
  updatedAt: string;
}

export type SavedViewInput = Pick<SavedView, "name" | "scope" | "stateJson"> & {
  id?: string;
};

export interface MetricValue {
  value?: number | null;
  formattedSpecial?: string | null;
  unit: string;
  n: number;
  status: "available" | "unavailable" | "special";
  reasonCode?: string | null;
}

export interface EquityPoint {
  id: string;
  date: string;
  cumulativePnlMinor: number;
}

export interface DrawdownPoint {
  date: string;
  drawdownMinor: number;
}

export interface DashboardMetrics {
  calculationVersion: string;
  totalTrades: number;
  wins: number;
  losses: number;
  breakEven: number;
  netPnlMinor: number;
  grossProfitMinor: number;
  grossLossMinor: number;
  winRate: MetricValue;
  lossRate: MetricValue;
  profitFactor: MetricValue;
  payoffRatio: MetricValue;
  expectancyMinor: MetricValue;
  averageWinnerMinor: MetricValue;
  averageLoserMinor: MetricValue;
  totalR: MetricValue;
  averageR: MetricValue;
  medianR: MetricValue;
  averageWinR: MetricValue;
  averageLossR: MetricValue;
  rStandardDeviation: MetricValue;
  systemQualityNumber: MetricValue;
  averageProcessScore: MetricValue;
  averageExecutionScore: MetricValue;
  averageSetupQuality: MetricValue;
  planAdherence: MetricValue;
  riskAdherence: MetricValue;
  entryAdherence: MetricValue;
  exitAdherence: MetricValue;
  reviewCompletion: MetricValue;
  averageHoldingMinutes: MetricValue;
  averagePlannedRiskMinor: MetricValue;
  recoveryFactor: MetricValue;
  profitableDaysRate: MetricValue;
  bestDayConcentration: MetricValue;
  totalCostsMinor: number;
  maxPlannedRiskMinor?: number | null;
  largestWinnerMinor?: number | null;
  largestLoserMinor?: number | null;
  maxWinStreak: number;
  maxLossStreak: number;
  equityCurve: EquityPoint[];
  drawdownCurve: DrawdownPoint[];
  maxDrawdownMinor: number;
  currentDrawdownMinor: number;
  averageDrawdownMinor: MetricValue;
}

export interface CalendarDay {
  date: string;
  netPnlMinor: number;
  totalR: number;
  trades: number;
  wins: number;
  losses: number;
}

export interface GroupPerformance {
  key: string;
  label: string;
  trades: number;
  wins: number;
  netPnlMinor: number;
  totalR: number;
  averageR?: number | null;
  winRate?: number | null;
}

export interface DashboardResponse {
  metrics: DashboardMetrics;
  calendar: CalendarDay[];
  setupPerformance: GroupPerformance[];
  weekdayPerformance: GroupPerformance[];
  sessionPerformance: GroupPerformance[];
  timeframePerformance: GroupPerformance[];
  instrumentPerformance: GroupPerformance[];
  directionPerformance: GroupPerformance[];
  accountPerformance: GroupPerformance[];
  assetClassPerformance: GroupPerformance[];
  generatedAt: string;
  filter: TradeFilter;
}

export interface CommandError {
  code: string;
  message: string;
  details?: unknown;
}

export type FundamentalEvaluationStatus =
  | "scored"
  | "neutral"
  | "missingActual"
  | "missingForecast"
  | "releaseMismatch"
  | "unitMismatch"
  | "transformationMismatch"
  | "futureRelease"
  | "yieldSmaUnavailable"
  | "unmapped";

export interface FundamentalIndicatorView {
  key: string;
  label: string;
  factor: "growth" | "inflation" | "rates" | "labor";
  direction: -1 | 1;
  sourceIndicatorKey?: string | null;
  sourceLabel?: string | null;
  actualText?: string | null;
  forecastText?: string | null;
  previousText?: string | null;
  surpriseText?: string | null;
  score: -1 | 0 | 1;
  status: FundamentalEvaluationStatus;
  reasonCodes: string[];
  releasedAt?: string | null;
  pendingNewerReleaseAt?: string | null;
  unit?: string | null;
  frequency?: string | null;
  sourceUrl?: string | null;
}

export interface FundamentalCurrencyView {
  currency: string;
  economicGrowthScore: number;
  inflationScore: number;
  ratesScore: number;
  jobsMarketScore: number;
  fundamentalsScore: number;
  economicGrowthBias: "Bullish" | "Neutral" | "Bearish";
  inflationBias: "Bullish" | "Neutral" | "Bearish";
  ratesBias: "Bullish" | "Neutral" | "Bearish";
  jobsMarketBias: "Bullish" | "Neutral" | "Bearish";
  fundamentalsBias: "Bullish" | "Neutral" | "Bearish";
  indicators: FundamentalIndicatorView[];
}

export interface FundamentalPairCellView {
  key: string;
  label: string;
  factor: "growth" | "inflation" | "rates" | "labor";
  baseScore: -1 | 0 | 1;
  quoteScore: -1 | 0 | 1;
  score: -2 | -1 | 0 | 1 | 2;
  available: boolean;
  baseAvailable: boolean;
  quoteAvailable: boolean;
  baseReleasedAt?: string | null;
  quoteReleasedAt?: string | null;
  baseFrequency?: string | null;
  quoteFrequency?: string | null;
  reasonCodes: string[];
}

export interface FundamentalPairView {
  base: string;
  quote: string;
  fundamentalScore: number;
  biasLabel:
    "Sehr Bullish" | "Bullish" | "Neutral" | "Bearish" | "Sehr Bearish";
  cells: FundamentalPairCellView[];
}

export interface MacroFundamentalsDashboard {
  asOf: string;
  snapshotId?: string | null;
  currencies: FundamentalCurrencyView[];
  pairs: FundamentalPairView[];
}

export interface EodhdSyncRun {
  id: string;
  triggerKind: "startup" | "scheduled" | "manual";
  status: "running" | "complete" | "partial" | "failed" | "skipped";
  startedAt: string;
  completedAt?: string | null;
  countriesRequested: number;
  eventsSeen: number;
  eventsUpdated: number;
  mappingCandidates: number;
  snapshotUpdated: boolean;
  errorMessage?: string | null;
}

export interface EodhdFeedStatus {
  configured: boolean;
  running: boolean;
  lastRun?: EodhdSyncRun | null;
  pendingJobs: number;
  nextDueAt?: string | null;
  pendingMappingReviews: number;
  lastSuccessAt?: string | null;
}

export interface EodhdMappingCandidate {
  id: string;
  currency: string;
  providerType: string;
  comparison?: string | null;
  proposedCanonicalKey?: string | null;
  confidence: number;
  runnerUpCanonicalKey?: string | null;
  runnerUpConfidence?: number | null;
  status: "pending" | "approved" | "ignored";
  createdAt: string;
  reviewedAt?: string | null;
}

export interface EodhdSyncResult {
  run: EodhdSyncRun;
  snapshot: MacroFundamentalsDashboard;
}

export type PutCallSentiment =
  "bullish" | "neutral" | "bearish" | "unavailable";

export type PutCallSourceOrientation = "direct" | "inverse";

export interface PutCallAsset {
  symbol: string;
  label: string;
  sourceSymbol: string;
  sourceOrientation: PutCallSourceOrientation;
}

export interface PutCallPoint {
  tradeDate: string;
  rawRatio: number;
  ma5: number;
  callNotionalUsd: number;
  putNotionalUsd: number;
}

export interface PutCallThresholds {
  bullish: number;
  bearish: number;
  sampleSize: number;
}

export interface PutCallDashboard {
  assets: PutCallAsset[];
  selectedAsset: PutCallAsset;
  points: PutCallPoint[];
  thresholds?: PutCallThresholds | null;
  latestValue?: number | null;
  sentiment: PutCallSentiment;
  calibrationSampleSize: number;
  lastSuccessfulSyncAt?: string | null;
  lastTradeDate?: string | null;
  lastRunStatus?: "success" | "failed" | null;
  lastRunMessage?: string | null;
  nativeOnly: boolean;
}

export interface PutCallSyncResult {
  tradeDate: string;
  storedAssets: number;
  lastSyncedAt: string;
}

export interface CotSignalComponent {
  key: "positioning" | "flow_4w" | "persistence_13w";
  label: string;
  value?: number | null;
  percentile?: number | null;
  signal?: -1 | 0 | 1 | null;
}

export interface CotAssessment {
  scoringVersion: string;
  status: "available" | "limited_history" | "stale" | "unavailable";
  quality: "high" | "limited" | "unavailable";
  biasSignal?: -1 | 0 | 1 | null;
  biasLabel: string;
  crowdingStatus: string;
  reportDate?: string | null;
  reasonCodes: string[];
  why: string[];
  components: CotSignalComponent[];
}

export interface CotContractView {
  symbol: string;
  displayName: string;
  assetClass: string;
  reportFamily: "legacy" | "tff" | "disaggregated";
  traderGroup: string;
  currency?: string | null;
  reportDate?: string | null;
  longPositions?: number | null;
  shortPositions?: number | null;
  longChange?: number | null;
  shortChange?: number | null;
  openInterest?: number | null;
  netPositions?: number | null;
  netChange?: number | null;
  netPositionPctOi?: number | null;
  netChangePctOi?: number | null;
  openInterestChange?: number | null;
  longShare?: number | null;
  shortShare?: number | null;
  weeklyLongShareChange?: number | null;
  positionPercentile?: number | null;
  changePercentile?: number | null;
  positionSignal?: -1 | 0 | 1 | null;
  changeSignal?: -1 | 0 | 1 | null;
  persistenceSignal?: -1 | 0 | 1 | null;
  latestChangeSignal?: -1 | 0 | 1 | null;
  assessment: CotAssessment;
}

export interface CotCurrencySignal {
  currency: string;
  reportDate: string;
  positionSignal: -1 | 0 | 1;
  changeSignal: -1 | 0 | 1;
  persistenceSignal: -1 | 0 | 1;
  confirmedSignal: -1 | 0 | 1;
  score: number;
}

export interface CotPairScore {
  base: string;
  quote: string;
  positionScore?: number | null;
  changeScore?: number | null;
  persistenceScore?: number | null;
  confirmedScore?: number | null;
  reportDate?: string | null;
  reasonCode?: string | null;
  rawScore: number;
  coverage: number;
  biasLabel: string;
}

export interface CotDashboard {
  sourceUrl: string;
  lastSyncedAt?: string | null;
  contracts: CotContractView[];
  currencies: CotCurrencySignal[];
  pairs: CotPairScore[];
}

export interface CotSyncResult {
  imported: number;
  lastSyncedAt: string;
}

export interface CotDetailInput {
  symbol: string;
  participantGroup?: string;
  lookbackWeeks?: number;
}
export interface CotBrokerLinkInput {
  symbol: string;
  brokerSymbol: string;
}
export interface CotSeriesPoint {
  reportDate: string;
  longPositions: number;
  shortPositions: number;
  netPositions: number;
  netPositionPctOi: number;
  longShare: number;
  weeklyLongShareChange?: number | null;
  openInterest: number;
  zScore?: number | null;
  percentile?: number | null;
  cotIndex?: number | null;
  flow4w?: number | null;
  persistence13w?: number | null;
  brokerPrice?: number | null;
}

export interface CotOutcomeWindow {
  weeks: number;
  sampleSize: number;
  medianReturn?: number | null;
  hitRate?: number | null;
}

export interface CotHistoricalOutcomes {
  status: "available" | "unavailable" | "insufficient_sample";
  reason: string;
  windows: CotOutcomeWindow[];
}
export interface CotGroupSummary {
  participantGroup: string;
  netPositions?: number | null;
  netPositionPctOi?: number | null;
  longShare?: number | null;
  zScore?: number | null;
  percentile?: number | null;
}
export interface CotAssetDetail {
  symbol: string;
  displayName: string;
  assetClass: string;
  reportFamily: string;
  participantGroup: string;
  lookbackWeeks: number;
  sampleSize: number;
  zScore?: number | null;
  percentile?: number | null;
  cotIndex?: number | null;
  netPositions?: number | null;
  netPositionPctOi?: number | null;
  netChange?: number | null;
  longShare?: number | null;
  weeklyLongShareChange?: number | null;
  brokerSymbol?: string | null;
  assessment: CotAssessment;
  historicalOutcomes: CotHistoricalOutcomes;
  groups: CotGroupSummary[];
  series: CotSeriesPoint[];
}

export interface PolicyRateInput {
  currency: string;
  centralBank: string;
  currentRate?: string;
  currentRateLow?: string;
  currentRateHigh?: string;
  expectedRate?: string;
  actualRate?: string;
  rateDefinition?: string;
  officialSourceUrl?: string;
  officialPublishedAt?: string;
  expectedSourceUrl?: string;
  expectedObservedAt?: string;
  expectedForDecisionAt?: string;
  nextDecisionAt?: string;
  providerSnapshotAt?: string;
  qualityStatus:
    "provider_confirmed" | "official_confirmed" | "stale" | "unverified";
  weight: string;
}

export interface PolicyRateEvaluation extends PolicyRateInput {
  expectedDeltaBps?: string | null;
  expectedStance?: -1 | 0 | 1 | null;
  decisionSurpriseBps?: string | null;
  decisionSurprise?: -1 | 0 | 1 | null;
  availabilityStatus: "available" | "unavailable";
}

export interface UsdRelativeEvaluation {
  foreignPressureBps?: string | null;
  relativeStanceBps?: string | null;
  relativeSignal?: -1 | 0 | 1 | null;
  coveredCentralBanks: number;
  requiredCentralBanks: number;
  hikeCount: number;
  holdCount: number;
  cutCount: number;
  availabilityStatus: "available" | "unavailable" | "insufficient_coverage";
}

export interface PolicyRateDashboard {
  snapshotAt?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  rates: PolicyRateEvaluation[];
  usdRelative: UsdRelativeEvaluation;
  automation?: PolicyRateAutomationStatus;
}

export interface PolicyRateAutomationStatus {
  enabled: boolean;
  lastAttemptAt?: string | null;
  lastSuccessAt?: string | null;
  lastStatus?:
    | "running"
    | "complete"
    | "success"
    | "partial"
    | "failed"
    | "skipped"
    | null;
  errorMessage?: string | null;
  coveredCurrencies: number;
  expectedCurrencies: number;
  refreshIntervalHours: number;
  nextRefreshAt?: string | null;
}

export interface SeasonalityItem {
  asset: string;
  symbol: string;
  horizon: string;
  sampleStart?: string;
  sampleEnd?: string;
  averageReturn?: string;
  positiveRatio?: string;
  samples?: number;
  signal?: -1 | 0 | 1;
  curve: number[];
}

export interface SeasonalityDashboard {
  snapshotAt?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  items: SeasonalityItem[];
  assets: SeasonalityAssetSummary[];
  collectionStatus?: "running" | "complete" | "partial" | "failed" | null;
  collectionError?: string | null;
  dataVersion: string;
}

export interface SeasonalityCurvePoint {
  week: number;
  mean?: number | null;
  p25?: number | null;
  p75?: number | null;
}
export interface SeasonalityPeriodMetric {
  period: string;
  averageReturn?: number | null;
  medianReturn?: number | null;
  positiveRatio?: number | null;
  samples: number;
}
export interface SeasonalityForwardMetric {
  label: string;
  tradingDays: number;
  averageReturn?: number | null;
  medianReturn?: number | null;
  positiveRatio?: number | null;
  volatility?: number | null;
  samples: number;
}
export interface SeasonalitySimilarYear {
  year: number;
  correlation?: number | null;
  finalReturn?: number | null;
}
export interface SeasonalityAssetSummary {
  symbol: string;
  category: string;
  description?: string | null;
  completeYears: number;
  qualityStatus: string;
  expectedFourWeekReturn?: number | null;
  fourWeekHitRate?: number | null;
  heatmapSignal?: -1 | 0 | 1 | null;
  calculatedAt: string;
  dataSource: string;
  dataSourceUrl?: string | null;
  nativeTimezone?: string | null;
  missingDays: number;
}
export interface SeasonalityAssetDetail extends SeasonalityAssetSummary {
  baseCurrency?: string | null;
  quoteCurrency?: string | null;
  historyStart?: string | null;
  historyEnd?: string | null;
  qualityReason: string;
  annualCurve: SeasonalityCurvePoint[];
  months: SeasonalityPeriodMetric[];
  quarters: SeasonalityPeriodMetric[];
  forwardReturns: SeasonalityForwardMetric[];
  similarYears: SeasonalitySimilarYear[];
}
export interface SeasonalityForexPair {
  base: string;
  quote: string;
  symbol: string;
  signal: -1 | 1;
  quality: number;
}

export interface SeasonalityYearFilter {
  startYear?: number;
  endYear?: number;
  cycleYears?: number;
  cycleAnchorYear?: number;
  endingDigits: number[];
  includeYears: number[];
  excludeYears: number[];
}
export interface SeasonalityAnalysisInput {
  symbol: string;
  referenceDate?: string;
  yearFilter: SeasonalityYearFilter;
  windowStart?: string;
  windowTradingDays?: number;
}
export interface SeasonalityDailyCurvePoint {
  day: number;
  mean?: number | null;
  smoothedMean?: number | null;
  samples: number;
  median?: number | null;
  p25?: number | null;
  p75?: number | null;
}
export interface SeasonalityTrendSegment {
  startDay: number;
  endDay: number;
  phase: "rising" | "falling" | "neutral";
}
export interface SeasonalityWindowMetric {
  startDate: string;
  tradingDays: number;
  averageReturn?: number | null;
  medianReturn?: number | null;
  positiveRatio?: number | null;
  negativeRatio?: number | null;
  volatility?: number | null;
  p10?: number | null;
  p90?: number | null;
  samples: number;
  years: number[];
  yearReturns: SeasonalityYearReturn[];
  direction?: -1 | 1 | null;
  wilsonLowerBound?: number | null;
  qualityStatus: "available" | "exploratory";
}
export interface SeasonalityYearReturn {
  year: number;
  returnValue: number;
}
export interface SeasonalityAnalysis {
  symbol: string;
  category: string;
  description?: string | null;
  calculatedAt: string;
  historyStart?: string | null;
  historyEnd?: string | null;
  selectedYears: number[];
  qualityStatus: "available" | "exploratory";
  qualityReason: string;
  referenceDate: string;
  annualCurve: SeasonalityDailyCurvePoint[];
  trendSegments: SeasonalityTrendSegment[];
  months: SeasonalityPeriodMetric[];
  quarters: SeasonalityPeriodMetric[];
  forwardReturns: SeasonalityForwardMetric[];
  selectedWindow: SeasonalityWindowMetric;
  bullishWindows: SeasonalityWindowMetric[];
  bearishWindows: SeasonalityWindowMetric[];
  heatmap: SeasonalityHeatmapCell[];
  dataSource: string;
  dataSourceUrl?: string | null;
  nativeTimezone?: string | null;
  missingDays: number;
}
export interface SeasonalityHeatmapCell {
  startDate: string;
  tradingDays: number;
  score?: number | null;
  medianReturn?: number | null;
  wilsonLowerBound?: number | null;
  samples: number;
  direction?: -1 | 1 | null;
}
export interface SeasonalityScreenerRow {
  symbol: string;
  category: string;
  description?: string | null;
  completeYears: number;
  qualityStatus: "available" | "exploratory";
  bullishWindow?: SeasonalityWindowMetric | null;
  bearishWindow?: SeasonalityWindowMetric | null;
  calculatedAt: string;
  dataSource: string;
  missingDays: number;
}

export interface SeasonalityImport {
  sourceName: string;
  sourceUrl?: string;
  snapshotAt?: string;
  items: SeasonalityItem[];
}

export interface ReviewRecord {
  id: string;
  reviewType: "daily" | "weekly" | "monthly";
  periodStart: string;
  periodEnd: string;
  status: "draft" | "completed";
  metricSnapshotJson: string;
  winsHtml?: string | null;
  challengesHtml?: string | null;
  lessonsHtml?: string | null;
  actionsHtml?: string | null;
  processRating?: number | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewInput {
  id?: string;
  reviewType: ReviewRecord["reviewType"];
  periodStart: string;
  periodEnd: string;
  status: ReviewRecord["status"];
  metricSnapshot: unknown;
  winsHtml?: string;
  challengesHtml?: string;
  lessonsHtml?: string;
  actionsHtml?: string;
  processRating?: number;
}

export interface GoalRecord {
  id: string;
  name: string;
  description?: string | null;
  metricKey: string;
  targetValue: string;
  unit: string;
  direction: "at_least" | "at_most" | "exactly";
  startsAt: string;
  endsAt?: string | null;
  status: "active" | "completed" | "paused" | "archived";
  latestValue?: string | null;
  updatedAt: string;
}

export type GoalInput = Omit<GoalRecord, "id" | "latestValue" | "updatedAt"> & {
  id?: string;
};

export interface PlaybookSetup {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  strategyName?: string | null;
  versionId?: string | null;
  version?: number | null;
  rulesJson?: string | null;
  checklistJson?: string | null;
  examplesJson?: string | null;
  notesHtml?: string | null;
  tradeCount: number;
}

export interface MistakeAnalytics {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  countermeasure?: string | null;
  color: string;
  occurrences: number;
  estimatedCostMinor: number;
  averageSeverity?: number | null;
}

export interface TradeMistakeRecord {
  mistakeId: string;
  name: string;
  severity: number;
  estimatedCostMinor?: number | null;
  note?: string | null;
}

export interface MediaRecord {
  id: string;
  relativePath: string;
  thumbnailRelativePath?: string | null;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  width?: number | null;
  height?: number | null;
  capturedAt?: string | null;
  createdAt: string;
  tradeCount: number;
  absolutePath: string;
}

export interface MediaAnnotationRecord {
  id: string;
  mediaId: string;
  annotationJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExportResult {
  path: string;
  format: "csv" | "json";
  recordCount: number;
  sha256: string;
}

export interface BackupRecord {
  path: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

export interface RestorePreview {
  valid: boolean;
  createdAt?: string | null;
  appVersion?: string | null;
  fileCount: number;
  totalSizeBytes: number;
  issues: string[];
}

export interface RestoreStageResult {
  staged: boolean;
  restartRequired: boolean;
  safetyCopyPath: string;
  fileCount: number;
}

export interface LegacyPreview {
  valid: boolean;
  path: string;
  tradeCount: number;
  issues: string[];
}

export interface LegacyImportResult {
  imported: number;
  skipped: number;
}

export type MarketTimeframe =
  "M1" | "M5" | "M15" | "M30" | "H1" | "H4" | "D1" | "W1";

export interface MarketStatus {
  connected: boolean;
  provider: string;
  accountLogin?: string | null;
  accountServer?: string | null;
  accountName?: string | null;
  accountCompany?: string | null;
  accountCurrency?: string | null;
  balance?: number | null;
  equity?: number | null;
  lastUpdate: string;
  code?: string | null;
  message?: string | null;
}

export interface Mt5Account {
  id: string;
  provider: string;
  server: string;
  login: string;
  accountName?: string | null;
  company?: string | null;
  currency?: string | null;
  leverage?: number | null;
  localAccountId?: string | null;
  localAccountName?: string | null;
  lastSeenAt: string;
  lastSyncAt?: string | null;
  isConnected: boolean;
  balanceMinor?: number | null;
  equityMinor?: number | null;
  marginMinor?: number | null;
  freeMarginMinor?: number | null;
  snapshotAt?: string | null;
}

export interface Mt5AccountsResponse {
  accounts: Mt5Account[];
  automationIntervalSeconds: number;
}

export interface Mt5SyncResult {
  status: "complete" | "unmapped" | "disconnected";
  accountId?: string | null;
  dealsSeen: number;
  dealsInserted: number;
  tradesUpdated: number;
  message: string;
}

export interface MarketSymbol {
  symbol: string;
  description?: string | null;
  path?: string | null;
  category: string;
  visible: boolean;
  digits?: number | null;
  baseCurrency?: string | null;
  quoteCurrency?: string | null;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
  volumeKind: "tick" | "real" | "unavailable";
}

export interface MarketQuote {
  symbol: string;
  bid?: number | null;
  ask?: number | null;
  time?: string | null;
}
