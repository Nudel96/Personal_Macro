import type { TradeInput } from "../../types/domain";
type ImportRow = Record<string, unknown>;

function read(row: ImportRow, ...keys: string[]) {
  const found = keys.find((key) => row[key] != null && row[key] !== "");
  return found ? String(row[found]).trim() : undefined;
}
function minor(value?: string) {
  if (!value) return undefined;
  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".")
    : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : undefined;
}
export function mapImportRow(
  row: ImportRow,
  accountId: string,
): TradeInput | null {
  const instrument = read(row, "instrument", "Instrument", "Symbol", "symbol");
  if (!instrument) return null;
  const directionRaw = read(
    row,
    "direction",
    "Direction",
    "Richtung",
  )?.toLowerCase();
  const direction =
    directionRaw?.includes("short") || directionRaw === "sell"
      ? "short"
      : "long";
  const statusRaw = read(row, "status", "Status")?.toLowerCase();
  const status =
    statusRaw === "planned" ||
    statusRaw === "cancelled" ||
    statusRaw === "archived"
      ? statusRaw
      : statusRaw === "open" || statusRaw === "offen"
        ? "open"
        : statusRaw === "draft" || statusRaw === "entwurf"
          ? "draft"
          : "closed";
  const openedAt = read(row, "opened_at", "openedAt", "Einstieg", "Open Time");
  const closedAt = read(row, "closed_at", "closedAt", "Ausstieg", "Close Time");
  return {
    accountId,
    strategyId: undefined,
    setupId: undefined,
    status,
    instrument,
    assetClass: read(row, "asset_class", "assetClass") ?? "forex",
    direction,
    session: read(row, "session", "Session"),
    timeframe: read(row, "timeframe", "Timeframe"),
    openedAt: openedAt ? new Date(openedAt).toISOString() : undefined,
    closedAt:
      status === "closed"
        ? closedAt
          ? new Date(closedAt).toISOString()
          : new Date().toISOString()
        : undefined,
    displayTimezone: "Europe/Berlin",
    plannedEntry: read(row, "planned_entry", "plannedEntry"),
    actualEntry: read(row, "actual_entry", "actualEntry", "Entry"),
    initialStopLoss: read(row, "initial_stop_loss", "initialStopLoss", "Stop"),
    actualExit: read(row, "actual_exit", "actualExit", "Exit"),
    takeProfit: read(row, "take_profit", "takeProfit"),
    quantity: read(row, "quantity", "size", "Größe"),
    plannedRiskMinor:
      read(row, "plannedRiskMinor") != null
        ? Number(row.plannedRiskMinor)
        : minor(read(row, "planned_risk", "plannedRisk", "Risiko")),
    grossPnlMinor:
      read(row, "grossPnlMinor") != null
        ? Number(row.grossPnlMinor)
        : minor(read(row, "gross_pnl", "grossPnl")),
    feesMinor:
      read(row, "feesMinor") != null
        ? Number(row.feesMinor)
        : (minor(read(row, "fees", "Gebühren")) ?? 0),
    commissionMinor:
      read(row, "commissionMinor") != null
        ? Number(row.commissionMinor)
        : (minor(read(row, "commission", "Kommission")) ?? 0),
    swapMinor:
      read(row, "swapMinor") != null
        ? Number(row.swapMinor)
        : (minor(read(row, "swap", "Swap")) ?? 0),
    netPnlMinor:
      read(row, "netPnlMinor") != null
        ? Number(row.netPnlMinor)
        : minor(read(row, "net_pnl", "netPnl", "P&L", "pnl")),
    rOverride: undefined,
    rOverrideReason: undefined,
    maeR: read(row, "mae_r", "maeR"),
    mfeR: read(row, "mfe_r", "mfeR"),
    followedPlan: undefined,
    followedRiskRules: undefined,
    followedEntryRules: undefined,
    followedExitRules: undefined,
    impulseTrade: undefined,
    processScore: undefined,
    executionScore: undefined,
    setupQuality: undefined,
    confidenceBefore: undefined,
    focusBefore: undefined,
    stressBefore: undefined,
    energyBefore: undefined,
    satisfactionAfter: undefined,
    reviewedAt: undefined,
    thesisHtml: read(row, "thesis", "These"),
    executionNotesHtml: undefined,
    reviewNotesHtml: read(row, "review", "Notizen"),
    lessonsHtml: undefined,
  };
}
