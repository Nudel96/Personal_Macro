import type {
  BootstrapData,
  CalendarDay,
  DashboardMetrics,
  DashboardResponse,
  DeletedTrade,
  GroupPerformance,
  MetricValue,
  PagedTrades,
  TradeDetail,
  TradeFilter,
  TradeInput,
  TradeSummary,
} from "../types/domain";
import { uid } from "../lib/utils";

const TRADES_KEY = "personal-macro:browser-trades:v1";

const setups = [
  { id: "setup-breakout", name: "Breakout", color: "#22c55e" },
  { id: "setup-trend", name: "Trend Continuation", color: "#3b82f6" },
  { id: "setup-sr", name: "S/R Rejection", color: "#8b5cf6" },
  { id: "setup-range", name: "Range", color: "#f59e0b" },
];

export const browserBootstrap: BootstrapData = {
  accounts: [],
  strategies: [],
  setups,
  tags: [],
  emotions: [
    { id: "calm", name: "Ruhig", valence: "positive", color: "#22c55e" },
    {
      id: "focused",
      name: "Fokussiert",
      valence: "positive",
      color: "#3b82f6",
    },
    { id: "fear", name: "Ängstlich", valence: "negative", color: "#f59e0b" },
  ],
  mistakes: [
    {
      id: "fomo",
      name: "FOMO-Einstieg",
      category: "entry",
      color: "#ef4444",
      severityDefault: 2,
    },
    {
      id: "stop",
      name: "Stop verschoben",
      category: "risk",
      color: "#ef4444",
      severityDefault: 3,
    },
  ],
  databasePath: "Browser-Vorschau (localStorage)",
  appDataPath: "Browser-Vorschau",
  calculationVersion: "journal-metrics-v1",
};

function loadTrades(): TradeDetail[] {
  try {
    return JSON.parse(
      localStorage.getItem(TRADES_KEY) ?? "[]",
    ) as TradeDetail[];
  } catch {
    return [];
  }
}

function saveTrades(trades: TradeDetail[]) {
  localStorage.setItem(TRADES_KEY, JSON.stringify(trades));
}

function accountError(code: "ACCOUNT_REQUIRED" | "ACCOUNT_NOT_FOUND") {
  return {
    code,
    message:
      code === "ACCOUNT_REQUIRED"
        ? "Wähle zuerst ein aktives Tradingkonto aus."
        : "Das ausgewählte Tradingkonto wurde nicht gefunden.",
  };
}

export function requireBrowserAccount(accountId: string) {
  const normalized = accountId.trim();
  if (!normalized) throw accountError("ACCOUNT_REQUIRED");
  if (
    !browserBootstrap.accounts.some(
      (account) => account.id === normalized && !account.isArchived,
    )
  ) {
    throw accountError("ACCOUNT_NOT_FOUND");
  }
  return normalized;
}

export function browserAccountTrades(accountId: string): TradeDetail[] {
  const scopedAccountId = requireBrowserAccount(accountId);
  return loadTrades()
    .filter(
      (trade) =>
        trade.accountId === scopedAccountId && trade.status !== "trashed",
    )
    .map((trade) => structuredClone(trade));
}

function requireBrowserScope(filter: TradeFilter) {
  const accountIds = filter.accountIds ?? [];
  if (accountIds.length !== 1) throw accountError("ACCOUNT_REQUIRED");
  return requireBrowserAccount(accountIds[0] ?? "");
}

function summary(trade: TradeDetail): TradeSummary {
  const account = browserBootstrap.accounts.find(
    (item) => item.id === trade.accountId,
  );
  const setup = browserBootstrap.setups.find(
    (item) => item.id === trade.setupId,
  );
  return {
    id: trade.id,
    status: trade.status,
    instrument: trade.instrument,
    assetClass: trade.assetClass,
    direction: trade.direction,
    accountName: account?.name,
    setupName: setup?.name,
    session: trade.session,
    timeframe: trade.timeframe,
    openedAt: trade.openedAt,
    closedAt: trade.closedAt,
    actualEntry: trade.actualEntry,
    actualExit: trade.actualExit,
    quantity: trade.quantity,
    netPnlMinor: trade.netPnlMinor,
    calculatedR: trade.calculatedR,
    processScore: trade.processScore,
    followedPlan: trade.followedPlan,
    reviewedAt: trade.reviewedAt,
    createdAt: trade.createdAt,
    updatedAt: trade.updatedAt,
  };
}

function normalizeTrade(
  input: TradeInput,
  previous?: TradeDetail,
): TradeDetail {
  const now = new Date().toISOString();
  const fees = input.feesMinor ?? 0;
  const commission = input.commissionMinor ?? 0;
  const swap = input.swapMinor ?? 0;
  const netPnl =
    input.netPnlMinor ??
    (input.grossPnlMinor == null
      ? undefined
      : input.grossPnlMinor - fees - commission - swap);
  const calculatedR =
    netPnl != null &&
    input.plannedRiskMinor != null &&
    input.plannedRiskMinor > 0
      ? (netPnl / input.plannedRiskMinor)
          .toFixed(4)
          .replace(/0+$/, "")
          .replace(/\.$/, "")
      : undefined;
  return {
    ...input,
    id: previous?.id ?? input.id ?? uid(),
    instrument: input.instrument.trim().toUpperCase(),
    feesMinor: fees,
    commissionMinor: commission,
    swapMinor: swap,
    netPnlMinor: netPnl,
    calculatedR,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
}

export async function browserCreateTrade(input: TradeInput) {
  const accountId = requireBrowserAccount(input.accountId);
  const trades = loadTrades();
  const trade = normalizeTrade({ ...input, accountId });
  trades.unshift(trade);
  saveTrades(trades);
  return trade;
}

export async function browserUpdateTrade(
  accountId: string,
  id: string,
  input: TradeInput,
) {
  const scopedAccountId = requireBrowserAccount(accountId);
  const trades = loadTrades();
  const index = trades.findIndex(
    (item) => item.id === id && item.accountId === scopedAccountId,
  );
  if (index < 0)
    throw { code: "NOT_FOUND", message: "Trade wurde nicht gefunden." };
  const trade = normalizeTrade(
    { ...input, accountId: scopedAccountId },
    trades[index],
  );
  trades[index] = trade;
  saveTrades(trades);
  return trade;
}

export async function browserGetTrade(accountId: string, id: string) {
  const scopedAccountId = requireBrowserAccount(accountId);
  const trade = loadTrades().find(
    (item) =>
      item.id === id &&
      item.accountId === scopedAccountId &&
      item.status !== "trashed",
  );
  if (!trade)
    throw { code: "NOT_FOUND", message: "Trade wurde nicht gefunden." };
  return trade;
}

export async function browserTrashTrade(accountId: string, id: string) {
  const scopedAccountId = requireBrowserAccount(accountId);
  const trades = loadTrades();
  const trade = trades.find(
    (item) => item.id === id && item.accountId === scopedAccountId,
  );
  if (!trade)
    throw { code: "NOT_FOUND", message: "Trade wurde nicht gefunden." };
  trade.status = "trashed";
  trade.updatedAt = new Date().toISOString();
  saveTrades(trades);
}

export async function browserListDeletedTrades(
  accountId: string,
): Promise<DeletedTrade[]> {
  const scopedAccountId = requireBrowserAccount(accountId);
  return loadTrades()
    .filter(
      (trade) =>
        trade.status === "trashed" && trade.accountId === scopedAccountId,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((trade) => ({
      id: trade.id,
      instrument: trade.instrument,
      direction: trade.direction,
      deletedAt: trade.updatedAt,
      netPnlMinor: trade.netPnlMinor,
    }));
}

export async function browserRestoreTrade(accountId: string, id: string) {
  const scopedAccountId = requireBrowserAccount(accountId);
  const trades = loadTrades();
  const trade = trades.find(
    (item) =>
      item.id === id &&
      item.accountId === scopedAccountId &&
      item.status === "trashed",
  );
  if (!trade)
    throw {
      code: "NOT_FOUND",
      message: "Trade wurde im Papierkorb nicht gefunden.",
    };
  trade.status = trade.closedAt ? "closed" : trade.openedAt ? "open" : "draft";
  trade.updatedAt = new Date().toISOString();
  saveTrades(trades);
  return trade;
}

function filteredTrades(filter: TradeFilter = {}) {
  const search = filter.search?.trim().toLowerCase();
  return loadTrades().filter((trade) => {
    if (trade.status === "trashed") return false;
    if (
      search &&
      !`${trade.instrument} ${trade.session ?? ""}`
        .toLowerCase()
        .includes(search)
    )
      return false;
    if (filter.statuses?.length && !filter.statuses.includes(trade.status))
      return false;
    if (
      filter.directions?.length &&
      !filter.directions.includes(trade.direction)
    )
      return false;
    if (
      filter.accountIds?.length &&
      (!trade.accountId || !filter.accountIds.includes(trade.accountId))
    )
      return false;
    if (
      filter.setupIds?.length &&
      (!trade.setupId || !filter.setupIds.includes(trade.setupId))
    )
      return false;
    const date = trade.closedAt ?? trade.openedAt ?? trade.createdAt;
    if (filter.dateFrom && date < filter.dateFrom) return false;
    if (filter.dateTo && date > filter.dateTo) return false;
    return true;
  });
}

export async function browserListTrades(
  filter: TradeFilter = {},
): Promise<PagedTrades> {
  const accountId = requireBrowserScope(filter);
  const scopedFilter = { ...filter, accountIds: [accountId] };
  const trades = filteredTrades(scopedFilter).sort((a, b) =>
    (b.closedAt ?? b.openedAt ?? b.createdAt).localeCompare(
      a.closedAt ?? a.openedAt ?? a.createdAt,
    ),
  );
  const page = Math.max(1, scopedFilter.page ?? 1);
  const pageSize = Math.min(250, Math.max(1, scopedFilter.pageSize ?? 50));
  return {
    items: trades.slice((page - 1) * pageSize, page * pageSize).map(summary),
    total: trades.length,
    page,
    pageSize,
    totalPages: trades.length ? Math.ceil(trades.length / pageSize) : 0,
  };
}

function metric(
  value: number | undefined,
  unit: string,
  n: number,
  reasonCode?: string,
): MetricValue {
  return value == null
    ? { value: null, unit, n: 0, status: "unavailable", reasonCode }
    : { value, unit, n, status: "available" };
}

function calculateMetrics(trades: TradeDetail[]): DashboardMetrics {
  const closed = trades
    .filter(
      (trade) =>
        trade.status === "closed" &&
        trade.closedAt &&
        trade.netPnlMinor != null,
    )
    .sort((a, b) =>
      `${a.closedAt}${a.id}`.localeCompare(`${b.closedAt}${b.id}`),
    );
  const pnl = closed.map((trade) => trade.netPnlMinor ?? 0);
  const wins = pnl.filter((value) => value > 0).length;
  const losses = pnl.filter((value) => value < 0).length;
  const grossProfit = pnl.reduce((sum, value) => sum + Math.max(0, value), 0);
  const grossLoss = pnl.reduce((sum, value) => sum + Math.min(0, value), 0);
  const netPnl = pnl.reduce((sum, value) => sum + value, 0);
  const rValues = closed
    .map((trade) => Number(trade.calculatedR))
    .filter(Number.isFinite);
  const process = closed
    .map((trade) => trade.processScore)
    .filter((value): value is number => value != null);
  const plan = closed
    .map((trade) => trade.followedPlan)
    .filter((value): value is boolean => value != null);
  const execution = closed
    .map((trade) => trade.executionScore)
    .filter((value): value is number => value != null);
  const setupQuality = closed
    .map((trade) => trade.setupQuality)
    .filter((value): value is number => value != null);
  const winners = pnl.filter((value) => value > 0);
  const losers = pnl.filter((value) => value < 0);
  const winningR = rValues.filter((value) => value > 0);
  const losingR = rValues.filter((value) => value < 0);
  const sortedR = [...rValues].sort((a, b) => a - b);
  const rMean = rValues.length
    ? rValues.reduce((sum, value) => sum + value, 0) / rValues.length
    : undefined;
  const rDeviation =
    rValues.length > 1 && rMean != null
      ? Math.sqrt(
          rValues.reduce((sum, value) => sum + (value - rMean) ** 2, 0) /
            (rValues.length - 1),
        )
      : undefined;
  const risks = closed
    .map((trade) => trade.plannedRiskMinor)
    .filter((value): value is number => value != null && value > 0);
  const holding = closed.flatMap((trade) =>
    trade.openedAt && trade.closedAt
      ? [
          Math.max(
            0,
            new Date(trade.closedAt).getTime() -
              new Date(trade.openedAt).getTime(),
          ) / 60_000,
        ]
      : [],
  );
  const totalCosts = closed.reduce(
    (sum, trade) =>
      sum + trade.feesMinor + trade.commissionMinor + trade.swapMinor,
    0,
  );
  const dayPnl = new Map<string, number>();
  closed.forEach((trade) =>
    dayPnl.set(
      trade.closedAt!.slice(0, 10),
      (dayPnl.get(trade.closedAt!.slice(0, 10)) ?? 0) +
        (trade.netPnlMinor ?? 0),
    ),
  );
  const average = (values: number[]) =>
    values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : undefined;
  const adherence = (values: Array<boolean | null | undefined>) => {
    const known = values.filter((value): value is boolean => value != null);
    return metric(
      known.length ? known.filter(Boolean).length / known.length : undefined,
      "ratio",
      known.length,
      "NO_EVALUATIONS",
    );
  };
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let currentWins = 0;
  let currentLosses = 0;
  let maxWins = 0;
  let maxLosses = 0;
  const equityCurve = closed.map((trade) => {
    const value = trade.netPnlMinor ?? 0;
    cumulative += value;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
    if (value > 0) {
      currentWins += 1;
      currentLosses = 0;
      maxWins = Math.max(maxWins, currentWins);
    } else if (value < 0) {
      currentLosses += 1;
      currentWins = 0;
      maxLosses = Math.max(maxLosses, currentLosses);
    } else {
      currentWins = 0;
      currentLosses = 0;
    }
    return {
      id: trade.id,
      date: trade.closedAt ?? trade.updatedAt,
      cumulativePnlMinor: cumulative,
    };
  });
  let curvePeak = 0;
  const drawdownCurve = equityCurve.map((point) => {
    curvePeak = Math.max(curvePeak, point.cumulativePnlMinor);
    return {
      date: point.date,
      drawdownMinor: curvePeak - point.cumulativePnlMinor,
    };
  });
  return {
    calculationVersion: "journal-metrics-v1",
    totalTrades: closed.length,
    wins,
    losses,
    breakEven: closed.length - wins - losses,
    netPnlMinor: netPnl,
    grossProfitMinor: grossProfit,
    grossLossMinor: grossLoss,
    winRate: metric(
      closed.length ? wins / closed.length : undefined,
      "ratio",
      closed.length,
      "NO_CLOSED_TRADES",
    ),
    lossRate: metric(
      closed.length ? losses / closed.length : undefined,
      "ratio",
      closed.length,
      "NO_CLOSED_TRADES",
    ),
    profitFactor:
      grossLoss < 0
        ? metric(grossProfit / Math.abs(grossLoss), "ratio", closed.length)
        : grossProfit > 0
          ? {
              value: null,
              formattedSpecial: "∞",
              unit: "ratio",
              n: closed.length,
              status: "special",
              reasonCode: "NO_LOSS_TRADES",
            }
          : metric(undefined, "ratio", 0, "NO_LOSS_TRADES"),
    payoffRatio: metric(
      winners.length && losers.length
        ? average(winners)! / Math.abs(average(losers)!)
        : undefined,
      "ratio",
      Math.min(winners.length, losers.length),
      "WIN_AND_LOSS_TRADES_REQUIRED",
    ),
    expectancyMinor: metric(
      closed.length ? netPnl / closed.length : undefined,
      "minor_currency",
      closed.length,
      "NO_CLOSED_TRADES",
    ),
    averageWinnerMinor: metric(
      average(winners),
      "minor_currency",
      winners.length,
      "NO_WIN_TRADES",
    ),
    averageLoserMinor: metric(
      average(losers),
      "minor_currency",
      losers.length,
      "NO_LOSS_TRADES",
    ),
    totalR: metric(
      rValues.length
        ? rValues.reduce((sum, value) => sum + value, 0)
        : undefined,
      "r",
      rValues.length,
      "NO_VALID_INITIAL_RISK",
    ),
    averageR: metric(
      rValues.length
        ? rValues.reduce((sum, value) => sum + value, 0) / rValues.length
        : undefined,
      "r",
      rValues.length,
      "NO_VALID_INITIAL_RISK",
    ),
    medianR: metric(
      sortedR.length
        ? sortedR.length % 2
          ? sortedR[Math.floor(sortedR.length / 2)]
          : (sortedR[sortedR.length / 2 - 1] + sortedR[sortedR.length / 2]) / 2
        : undefined,
      "r",
      sortedR.length,
      "NO_VALID_INITIAL_RISK",
    ),
    averageWinR: metric(
      average(winningR),
      "r",
      winningR.length,
      "NO_WIN_R_VALUES",
    ),
    averageLossR: metric(
      average(losingR),
      "r",
      losingR.length,
      "NO_LOSS_R_VALUES",
    ),
    rStandardDeviation: metric(
      rDeviation,
      "r",
      rValues.length,
      "AT_LEAST_TWO_R_VALUES_REQUIRED",
    ),
    systemQualityNumber: metric(
      rValues.length >= 30 && rMean != null && rDeviation
        ? (rMean / rDeviation) * Math.sqrt(rValues.length)
        : undefined,
      "ratio",
      rValues.length,
      "AT_LEAST_30_R_VALUES_REQUIRED",
    ),
    averageProcessScore: metric(
      process.length
        ? process.reduce((sum, value) => sum + value, 0) / process.length
        : undefined,
      "score_10",
      process.length,
      "NO_PROCESS_RATINGS",
    ),
    averageExecutionScore: metric(
      average(execution),
      "score_10",
      execution.length,
      "NO_EXECUTION_RATINGS",
    ),
    averageSetupQuality: metric(
      average(setupQuality),
      "score_10",
      setupQuality.length,
      "NO_SETUP_RATINGS",
    ),
    planAdherence: metric(
      plan.length ? plan.filter(Boolean).length / plan.length : undefined,
      "ratio",
      plan.length,
      "NO_PLAN_EVALUATIONS",
    ),
    riskAdherence: adherence(closed.map((trade) => trade.followedRiskRules)),
    entryAdherence: adherence(closed.map((trade) => trade.followedEntryRules)),
    exitAdherence: adherence(closed.map((trade) => trade.followedExitRules)),
    reviewCompletion: metric(
      closed.length
        ? closed.filter((trade) => trade.reviewedAt).length / closed.length
        : undefined,
      "ratio",
      closed.length,
      "NO_CLOSED_TRADES",
    ),
    averageHoldingMinutes: metric(
      average(holding),
      "minutes",
      holding.length,
      "NO_VALID_HOLDING_PERIODS",
    ),
    averagePlannedRiskMinor: metric(
      average(risks),
      "minor_currency",
      risks.length,
      "NO_PLANNED_RISK_VALUES",
    ),
    recoveryFactor: metric(
      maxDrawdown > 0 ? netPnl / maxDrawdown : undefined,
      "ratio",
      closed.length,
      "NO_DRAWDOWN",
    ),
    profitableDaysRate: metric(
      dayPnl.size
        ? [...dayPnl.values()].filter((value) => value > 0).length / dayPnl.size
        : undefined,
      "ratio",
      dayPnl.size,
      "NO_TRADING_DAYS",
    ),
    bestDayConcentration: metric(
      netPnl > 0 ? Math.max(0, ...dayPnl.values()) / netPnl : undefined,
      "ratio",
      dayPnl.size,
      "POSITIVE_NET_PNL_REQUIRED",
    ),
    totalCostsMinor: totalCosts,
    maxPlannedRiskMinor: risks.length ? Math.max(...risks) : null,
    largestWinnerMinor: pnl
      .filter((value) => value > 0)
      .sort((a, b) => b - a)[0],
    largestLoserMinor: pnl
      .filter((value) => value < 0)
      .sort((a, b) => a - b)[0],
    maxWinStreak: maxWins,
    maxLossStreak: maxLosses,
    equityCurve,
    drawdownCurve,
    maxDrawdownMinor: maxDrawdown,
    currentDrawdownMinor:
      drawdownCurve[drawdownCurve.length - 1]?.drawdownMinor ?? 0,
    averageDrawdownMinor: metric(
      average(drawdownCurve.map((point) => point.drawdownMinor)),
      "minor_currency",
      drawdownCurve.length,
      "NO_CLOSED_TRADES",
    ),
  };
}

function groupPerformance(
  trades: TradeDetail[],
  group:
    | "setup"
    | "weekday"
    | "session"
    | "timeframe"
    | "instrument"
    | "direction"
    | "account"
    | "assetClass",
): GroupPerformance[] {
  const buckets = new Map<string, TradeDetail[]>();
  const weekdays = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  for (const trade of trades.filter(
    (item) => item.status === "closed" && item.netPnlMinor != null,
  )) {
    const key =
      group === "setup"
        ? (trade.setupId ?? "unassigned")
        : group === "weekday"
          ? String(new Date(trade.closedAt ?? trade.updatedAt).getDay())
          : group === "session"
            ? (trade.session ?? "Unbekannt")
            : group === "timeframe"
              ? (trade.timeframe ?? "Unbekannt")
              : group === "instrument"
                ? trade.instrument
                : group === "direction"
                  ? trade.direction
                  : group === "account"
                    ? (trade.accountId ?? "unassigned")
                    : trade.assetClass;
    const values = buckets.get(key) ?? [];
    values.push(trade);
    buckets.set(key, values);
  }
  return [...buckets.entries()].map(([key, values]) => {
    const net = values.reduce(
      (sum, trade) => sum + (trade.netPnlMinor ?? 0),
      0,
    );
    const rs = values
      .map((trade) => Number(trade.calculatedR))
      .filter(Number.isFinite);
    const wins = values.filter((trade) => (trade.netPnlMinor ?? 0) > 0).length;
    return {
      key,
      label:
        group === "setup"
          ? (setups.find((item) => item.id === key)?.name ?? "Ohne Setup")
          : group === "weekday"
            ? weekdays[Number(key)]
            : group === "account"
              ? (browserBootstrap.accounts.find((item) => item.id === key)
                  ?.name ?? "Ohne Konto")
              : group === "direction"
                ? key === "long"
                  ? "Long"
                  : "Short"
                : key,
      trades: values.length,
      wins,
      netPnlMinor: net,
      totalR: rs.reduce((sum, value) => sum + value, 0),
      averageR: rs.length
        ? rs.reduce((sum, value) => sum + value, 0) / rs.length
        : null,
      winRate: values.length ? wins / values.length : null,
    };
  });
}

export async function browserDashboard(
  filter: TradeFilter = {},
): Promise<DashboardResponse> {
  const accountId = requireBrowserScope(filter);
  const scopedFilter = { ...filter, accountIds: [accountId] };
  const trades = filteredTrades(scopedFilter);
  const dayMap = new Map<string, CalendarDay>();
  for (const trade of trades.filter(
    (item) =>
      item.status === "closed" && item.closedAt && item.netPnlMinor != null,
  )) {
    const date = trade.closedAt!.slice(0, 10);
    const day = dayMap.get(date) ?? {
      date,
      netPnlMinor: 0,
      totalR: 0,
      trades: 0,
      wins: 0,
      losses: 0,
    };
    day.netPnlMinor += trade.netPnlMinor ?? 0;
    day.totalR += Number(trade.calculatedR) || 0;
    day.trades += 1;
    day.wins += (trade.netPnlMinor ?? 0) > 0 ? 1 : 0;
    day.losses += (trade.netPnlMinor ?? 0) < 0 ? 1 : 0;
    dayMap.set(date, day);
  }
  return {
    metrics: calculateMetrics(trades),
    calendar: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    setupPerformance: groupPerformance(trades, "setup"),
    weekdayPerformance: groupPerformance(trades, "weekday"),
    sessionPerformance: groupPerformance(trades, "session"),
    timeframePerformance: groupPerformance(trades, "timeframe"),
    instrumentPerformance: groupPerformance(trades, "instrument"),
    directionPerformance: groupPerformance(trades, "direction"),
    accountPerformance: groupPerformance(trades, "account"),
    assetClassPerformance: groupPerformance(trades, "assetClass"),
    generatedAt: new Date().toISOString(),
    filter: scopedFilter,
  };
}
